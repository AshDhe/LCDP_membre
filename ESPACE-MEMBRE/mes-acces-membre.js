/* MES ACCÈS : filtres contextuels sur la liste de réservations existante.
   Le Worker reste l'autorité métier. Aucun droit n'est calculé ici.
   Chargé après planning-membre.js pour préserver les actions historiques. */
(() => {
  'use strict';

  const config = window.SITE_CONFIG || {};
  const selecteurs = Object.freeze({
    racine: '#lcdp-planning-calendrier-slot',
    liste: '[data-lcdp-liste-card-list]',
    commandes: '[data-lcdp-liste-card-commande]',
    card: '[data-lcdp-box-card-reservation-membre]',
    onglet: '[data-lcdp-planning-periode]',
    parc: '[data-lcdp-card-reservation-parc]',
    departement: '[data-lcdp-card-reservation-departement]'
  });

  const etat = {
    parc: '',
    recues: false,
    envoyees: false,
    statsParFlux: new Map(),
    statsDisponibles: false,
    statsErreur: false,
    liste: null,
    filtres: null,
    observateurListe: null,
    observationInstallation: null,
    raf: null,
    chargementStats: null
  };

  function endpointInvitations() {
    const url = config.workerInviterMembreUrl || config.WORKER_INVITER_MEMBRE_URL ||
      (typeof config.apiUrl === 'function' ? config.apiUrl('inviter-membre-api') : '');
    return String(url || '').replace(/\/+$/, '');
  }

  async function actualiserStatsInvitations() {
    if (etat.chargementStats) return etat.chargementStats;
    const base = endpointInvitations();
    if (!base) {
      etat.statsDisponibles = false;
      etat.statsErreur = true;
      demanderRendu();
      return;
    }
    etat.chargementStats = (async () => {
      try {
        const reponse = await fetch(base + '/reservations-invitables', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'application/json' }
        });
        const data = await reponse.json().catch(() => null);
        if (!reponse.ok || !data || (data.ok !== true && data.success !== true) || !Array.isArray(data.reservations)) {
          throw new Error('Statuts des invitations indisponibles.');
        }
        const parFlux = new Map();
        for (const reservation of data.reservations) {
          const idflux = String(reservation?.idflux || '').trim();
          if (!idflux) continue;
          const stats = reservation?.invitationStats || reservation?.invitationsStats || {};
          const nombre = Number(stats.in ?? stats.actifs ?? stats.invites ?? 0);
          parFlux.set(idflux, Number.isFinite(nombre) && nombre > 0 ? nombre : 0);
        }
        etat.statsParFlux = parFlux;
        etat.statsDisponibles = true;
        etat.statsErreur = false;
      } catch (erreur) {
        console.warn('[MES ACCÈS] Impossible de vérifier les invitations envoyées :', erreur);
        etat.statsDisponibles = false;
        etat.statsErreur = true;
      } finally {
        etat.chargementStats = null;
        demanderRendu();
      }
    })();
    return etat.chargementStats;
  }

  function creerFiltres() {
    const racine = document.createElement('section');
    racine.className = 'lcdp-box-liste-card__tools lcdp-mes-acces-filtres';
    racine.setAttribute('aria-label', 'Filtrer les accès à venir');
    racine.innerHTML = `
      <div class="lcdp-mes-acces-filtres__ligne" style="display:flex; flex-wrap:wrap; align-items:center; gap:12px">
        <label class="lcdp-mes-acces-filtres__parc" style="display:flex; flex-direction:column; gap:4px; flex:1 1 180px">
          Parc
          <select data-mes-acces-parc aria-label="Filtrer par parc">
            <option value="">Tous les parcs</option>
          </select>
        </label>
        <div class="lcdp-mes-acces-filtres__types" role="group" aria-label="Type d'accès" style="display:flex; flex-wrap:wrap; gap:8px">
          <button type="button" class="lcdp-button lcdp-button-mini lcdp-button-secondary lcdp-mes-acces-filtres__chip" data-mes-acces-recues aria-pressed="false">INVT reçues</button>
          <button type="button" class="lcdp-button lcdp-button-mini lcdp-button-secondary lcdp-mes-acces-filtres__chip" data-mes-acces-envoyees aria-pressed="false" disabled>Invitations envoyées</button>
        </div>
        <button type="button" class="lcdp-button lcdp-button-mini lcdp-button-secondary lcdp-mes-acces-filtres__effacer" data-mes-acces-effacer disabled>Effacer les filtres</button>
      </div>
      <p class="lcdp-mes-acces-filtres__info" data-mes-acces-info role="status" aria-live="polite"></p>
      <p class="lcdp-mes-acces-filtres__avertissement" data-mes-acces-avertissement role="status"></p>`;

    const select = racine.querySelector('[data-mes-acces-parc]');
    select.style.minHeight = '40px';
    select.style.maxWidth = '100%';
    select.addEventListener('change', (event) => {
      etat.parc = event.currentTarget.value;
      demanderRendu();
    });
    racine.querySelector('[data-mes-acces-recues]').addEventListener('click', () => {
      etat.recues = !etat.recues;
      demanderRendu();
    });
    racine.querySelector('[data-mes-acces-envoyees]').addEventListener('click', () => {
      if (!etat.statsDisponibles) return;
      etat.envoyees = !etat.envoyees;
      demanderRendu();
    });
    racine.querySelector('[data-mes-acces-effacer]').addEventListener('click', () => {
      etat.parc = '';
      etat.recues = false;
      etat.envoyees = false;
      demanderRendu();
    });
    return racine;
  }

  function periodeEstAvenir() {
    const bouton = document.querySelector(`${selecteurs.onglet}[data-lcdp-planning-periode="avenir"]`);
    return !bouton || bouton.getAttribute('aria-pressed') === 'true';
  }

  function identiteParc(card) {
    const nom = String(card.querySelector(selecteurs.parc)?.textContent || '').trim();
    const departement = String(card.querySelector(selecteurs.departement)?.textContent || '').trim();
    const id = String(card.querySelector('[data-action="adresse"]')?.dataset.idparc || '').trim();
    return {
      cle: id ? `id:${id}` : `nom:${nom}|${departement}`,
      libelle: [nom || 'Parc', departement].filter(Boolean).join(' ')
    };
  }

  function cartes() {
    if (!etat.liste) return [];
    return Array.from(etat.liste.children).filter((element) => element.matches(selecteurs.card));
  }

  function synchroniserParcs(listeCartes) {
    const menu = etat.filtres.querySelector('[data-mes-acces-parc]');
    const options = new Map();
    for (const card of listeCartes) {
      const parc = identiteParc(card);
      if (parc.libelle && !options.has(parc.cle)) options.set(parc.cle, parc.libelle);
    }
    const sorted = [...options.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr', { sensitivity: 'base' }));
    const signature = JSON.stringify(sorted);
    if (menu.dataset.optionsSignature !== signature) {
      const fragment = document.createDocumentFragment();
      fragment.appendChild(new Option('Tous les parcs', ''));
      for (const [value, label] of sorted) fragment.appendChild(new Option(label, value));
      menu.replaceChildren(fragment);
      menu.dataset.optionsSignature = signature;
    }
    if (etat.parc && !options.has(etat.parc)) etat.parc = '';
    menu.value = etat.parc;
  }

  function afficherFiltres() {
    if (!etat.filtres || !etat.liste) return;
    const avenir = periodeEstAvenir();
    etat.filtres.hidden = !avenir;
    const listeCartes = cartes();
    const messageVide = document.querySelector('[data-mes-acces-vide]');
    if (!avenir) {
      for (const card of listeCartes) {
        card.hidden = false;
        card.style.display = '';
      }
      if (messageVide) messageVide.hidden = true;
      return;
    }

    synchroniserParcs(listeCartes);
    let visibles = 0;
    for (const card of listeCartes) {
      const parc = identiteParc(card);
      const recues = card.classList.contains('lcdp-box-card-reservation-membre--invitation');
      const idflux = String(card.dataset.idflux || '').trim();
      const envoyees = etat.statsDisponibles && !recues && (etat.statsParFlux.get(idflux) || 0) > 0;
      const typeChoisi = !etat.recues && !etat.envoyees ||
        (etat.recues && recues) || (etat.envoyees && envoyees);
      const garder = (!etat.parc || parc.cle === etat.parc) && typeChoisi;
      card.hidden = !garder;
      // Les cards partagées ont "display: grid" : hidden seul ne suffit pas.
      card.style.display = garder ? '' : 'none';
      if (garder) visibles += 1;
    }

    const boutonRecues = etat.filtres.querySelector('[data-mes-acces-recues]');
    const boutonEnvoyees = etat.filtres.querySelector('[data-mes-acces-envoyees]');
    const effacer = etat.filtres.querySelector('[data-mes-acces-effacer]');
    const info = etat.filtres.querySelector('[data-mes-acces-info]');
    const avertissement = etat.filtres.querySelector('[data-mes-acces-avertissement]');
    const filtreActif = Boolean(etat.parc || etat.recues || etat.envoyees);
    boutonRecues.setAttribute('aria-pressed', String(etat.recues));
    boutonEnvoyees.setAttribute('aria-pressed', String(etat.envoyees));
    boutonRecues.classList.toggle('lcdp-button-primary', etat.recues);
    boutonRecues.classList.toggle('lcdp-button-secondary', !etat.recues);
    boutonEnvoyees.classList.toggle('lcdp-button-primary', etat.envoyees);
    boutonEnvoyees.classList.toggle('lcdp-button-secondary', !etat.envoyees);
    boutonEnvoyees.disabled = !etat.statsDisponibles;
    effacer.disabled = !filtreActif;
    info.textContent = `${visibles} accès affiché${visibles > 1 ? 's' : ''}${filtreActif ? ' avec les filtres sélectionnés' : ' à venir'}.`;
    avertissement.textContent = etat.statsErreur ? 'Le filtre « Invitations envoyées » est momentanément indisponible.' : '';

    if (messageVide) {
      messageVide.hidden = !(filtreActif && listeCartes.length > 0 && visibles === 0);
    }
  }

  function demanderRendu() {
    if (etat.raf !== null) return;
    etat.raf = window.requestAnimationFrame(() => {
      etat.raf = null;
      afficherFiltres();
    });
  }

  function verrouillerVueListe(parent) {
    // Les commandes et classes existantes sont conservées, sans CSS supplémentaire.
    const affichage = parent.querySelector('[data-lcdp-planning-affichage]');
    if (affichage) {
      affichage.hidden = true;
      affichage.style.display = 'none';
      const groupe = affichage.closest('[data-lcdp-commande-bar-actions]');
      if (groupe) groupe.style.gridTemplateColumns = 'minmax(0,1fr)';
    }
    const calendrier = parent.querySelector('[data-lcdp-box-calendrier-mois]');
    if (calendrier) {
      calendrier.hidden = true;
      calendrier.style.display = 'none';
    }
  }

  function installer() {
    const parent = document.querySelector(selecteurs.racine);
    if (!parent) return false;
    const liste = parent.querySelector(selecteurs.liste);
    const commandes = parent.querySelector(selecteurs.commandes);
    if (!liste || !commandes) return false;
    verrouillerVueListe(parent);

    if (!etat.filtres) etat.filtres = creerFiltres();
    if (etat.filtres.parentElement !== commandes) commandes.appendChild(etat.filtres);
    if (etat.liste !== liste) {
      etat.liste = liste;
      if (etat.observateurListe) etat.observateurListe.disconnect();
      etat.observateurListe = new MutationObserver((mutations) => {
        verrouillerVueListe(parent);
        const estNouvelleListe = mutations.some((m) => m.target === liste && m.type === 'childList');
        const invitationModifiee = mutations.some((m) =>
          m.type === 'childList' && m.target.nodeType === 1 &&
          (m.target.matches?.('[data-action="invitation"]') ||
           m.target.closest?.('[data-action="invitation"]'))
        );
        if (estNouvelleListe) demanderRendu();
        if (invitationModifiee) void actualiserStatsInvitations();
      });
      etat.observateurListe.observe(liste, { childList: true, subtree: true });
    }
    if (!parent.querySelector('[data-mes-acces-vide]')) {
      const vide = document.createElement('p');
      vide.className = 'lcdp-mes-acces-vide';
      vide.dataset.mesAccesVide = '';
      vide.textContent = 'Aucun accès ne correspond aux filtres sélectionnés.';
      vide.hidden = true;
      liste.insertAdjacentElement('afterend', vide);
    }
    demanderRendu();
    return true;
  }

  function demarrer() {
    const racine = document.querySelector(selecteurs.racine);
    if (!racine) return;
    if (!installer()) {
      etat.observationInstallation = new MutationObserver(() => {
        if (installer()) {
          etat.observationInstallation.disconnect();
          etat.observationInstallation = null;
        }
      });
      etat.observationInstallation.observe(racine, { childList: true, subtree: true });
    }
    // Les périodes restent pilotées par le composant existant.
    document.addEventListener('click', (event) => {
      if (event.target.closest(selecteurs.onglet)) demanderRendu();
    });
    // Le moteur historique peut remplacer sa liste pendant le chargement.
    // Retrouver alors les mêmes filtres sur la nouvelle liste.
    const observateurRacine = new MutationObserver(() => {
      const suivante = racine.querySelector(selecteurs.liste);
      if (suivante && suivante !== etat.liste) installer();
    });
    observateurRacine.observe(racine, {childList:true,subtree:true});
    void actualiserStatsInvitations();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer, { once: true });
  } else {
    demarrer();
  }
})();

/* Affichage de secours autonome : le moteur historique peut s'arrêter
   si un de ses anciens fragments calendrier est absent. La consultation
   en liste ne doit pas dépendre du calendrier. */
(() => {
  'use strict';
  const cfg = window.SITE_CONFIG || {};
  const racine = document.getElementById('lcdp-planning-calendrier-slot');
  if (!racine) return;
  let secours = null;
  let demarrage = false;
  let period = 'avenir';
  let reservations = [];
  let statsParFlux = new Map();
  let fichierCard = null;
  const formatDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const formatHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

  function endpoint(cle, ancien, defaut) {
    return String(cfg[cle] || cfg[ancien] || (typeof cfg.apiUrl === 'function' ? cfg.apiUrl(defaut) : '') || '').replace(/\/+$/, '');
  }
  const planningApi = endpoint('workerPlanningMembreUrl','WORKER_PLANNING_MEMBRE_URL','planning-membre-api');
  const invitationsApi = endpoint('workerInviterMembreUrl','WORKER_INVITER_MEMBRE_URL','inviter-membre-api');
  const indexApi = endpoint('workerIndexMembreUrl','WORKER_INDEX_MEMBRE_URL','index-membre-api');
  function urlObjet(chemin) {
    if (typeof window.LCDP_urlObjet === 'function') return window.LCDP_urlObjet(chemin);
    const b = cfg.objetBaseUrl || cfg.OBJET_BASE || (String(cfg.publicBaseUrl || cfg.PUBLIC_BASE || '').replace(/\/+$/, '') + '/OBJET');
    return String(b).replace(/\/+$/, '') + '/' + chemin.replace(/^\/+/, '');
  }
  function vrai(x) { return x === true || x === 'true' || x === 1 || x === '1'; }
  function dateDebut(r) { const n = Date.parse(String(r.datebookd || '')); return Number.isFinite(n) ? n : NaN; }
  function estAnnulee(r) { return String(r.statut || '').toLowerCase() === 'cancd'; }
  function parmiPeriode(r) {
    const debut = dateDebut(r);
    if (!Number.isFinite(debut)) return false;
    return period === 'avenir' ? !estAnnulee(r) && debut >= Date.now() : estAnnulee(r) || debut < Date.now();
  }
  function requete(api, route, options) {
    if (!api) return Promise.reject(new Error('Service non configuré.'));
    return fetch(api + route, {credentials:'include',cache:'no-store',headers:{Accept:'application/json', ...(options?.body ? {'Content-Type':'application/json'} : {})}, ...options}).then(async (r) => {
      if (r.status === 401) {
        const url = typeof window.LCDP_urlPublic === 'function' ? window.LCDP_urlPublic('/ESPACE-PUBLIC/connexion-membre.html') : '/ESPACE-PUBLIC/connexion-membre.html';
        window.location.assign(url);
        throw new Error('Session expirée.');
      }
      const data = await r.json().catch(() => null);
      if (!r.ok || !data || (data.ok !== true && data.success !== true)) throw new Error(String(data?.message || data?.error || 'Erreur de chargement.'));
      return data;
    });
  }
  function faire(n, cls, contenu) {
    const e = document.createElement(n);
    if (cls) e.className = cls;
    if (contenu !== undefined) e.textContent = contenu;
    return e;
  }
  function bouton(label, active, change) {
    const b = faire('button','lcdp-button lcdp-button-mini ' + (active ? 'lcdp-button-primary' : 'lcdp-button-secondary'), label);
    b.type = 'button'; b.setAttribute('aria-pressed', String(active)); b.addEventListener('click',e=>{e.stopPropagation();change(e)}); return b;
  }
  function parcInfo(r) {
    const p = r.parc || {};
    return {nom:String(p.nom || p.nomparc || r.nomparc || '').trim(),dptmt:String(p.dptmt || p.departement || r.dptmt || '').trim(),id:String(p.idparc || r.idparc || '').trim(),p};
  }
  function imageParc(info) {
    const n = info.nom.replace(/^parc\s+(?:de|du|des)\s+/i,'').trim().replace(/[ -]/g,'_');
    let dep = info.dptmt.toUpperCase().match(/(?:2A|2B|\d{1,3})/);
    dep = dep ? dep[0] : '';
    if (/^\d$/.test(dep)) dep = '0' + dep;
    return n && dep ? urlObjet('/IMAG/PARC/' + encodeURIComponent(dep) + '/' + encodeURIComponent(n) + '/card1.webp') : '';
  }
  function montrer(message, titre) {
    const slot = document.getElementById('lcdp-lightbox-slot');
    if (!slot) { window.alert(message); return; }
    const fond = faire('div','lcdp-box-workflow-reservation lcdp-workflow-reservation-box');
    fond.setAttribute('role','dialog');fond.setAttribute('aria-modal','true');fond.setAttribute('aria-label',titre || 'Informations');
    const bloc = faire('div','lcdp-box-liste-card lcdp-box-liste-card--encadree');
    bloc.append(faire('h2','lcdp-box-liste-card__title',titre || 'Informations'),faire('p','lcdp-box-liste-card__message',message));
    const fermer = bouton('Fermer',false,() => slot.replaceChildren());
    bloc.append(fermer);fond.append(bloc);slot.replaceChildren(fond);fermer.focus();
    fond.addEventListener('click',e=>{if(e.target===fond)slot.replaceChildren()});
    const echap = (e)=>{if(e.key==='Escape'){slot.replaceChildren();document.removeEventListener('keydown',echap)}};
    document.addEventListener('keydown',echap);
  }
  function carte(r) {
    const info = parcInfo(r);
    const card = fichierCard ? fichierCard.cloneNode(true) : faire('article','lcdp-box-card-reservation-membre');
    card.dataset.idflux = String(r.idflux || '');
    card.dataset.lcdpBoxCardReservationMembre = '';
    card.classList.add('lcdp-box-card-reservation-membre--liste');
    if (!fichierCard) {
      const media=faire('div','lcdp-box-card-reservation-membre__media');media.dataset.lcdpCardReservationMedia='';
      const img=document.createElement('img');img.className='lcdp-box-card-reservation-membre__image';img.dataset.lcdpCardReservationImage='';img.alt='';media.append(img);
      const corps=faire('div','lcdp-box-card-reservation-membre__body');
      const detail=faire('div','lcdp-box-card-reservation-membre__content');
      const ligneDate=faire('div','lcdp-box-card-reservation-membre__date');
      const d=faire('span','lcdp-box-card-reservation-membre__date-label');d.dataset.lcdpCardReservationDate='';
      const h=faire('span','lcdp-box-card-reservation-membre__hour');h.dataset.lcdpCardReservationHeure='';ligneDate.append(d,h);
      const lineParc=faire('div','lcdp-box-card-reservation-membre__place-line');
      const p=faire('span','lcdp-box-card-reservation-membre__park');p.dataset.lcdpCardReservationParc='';
      const dep=faire('span','lcdp-box-card-reservation-membre__department');dep.dataset.lcdpCardReservationDepartement='';lineParc.append(p,dep);
      const actions=faire('div','lcdp-box-card-reservation-membre__actions');
      detail.append(ligneDate,lineParc);corps.append(detail,actions);card.append(media,corps);
    }
    const q = s => card.querySelector(s);
    const nom = info.nom || 'Parc';
    const date = new Date(dateDebut(r));
    if(q('[data-lcdp-card-reservation-date]')) q('[data-lcdp-card-reservation-date]').textContent = formatDate.format(date);
    if(q('[data-lcdp-card-reservation-heure]')) q('[data-lcdp-card-reservation-heure]').textContent = formatHeure.format(date);
    if(q('[data-lcdp-card-reservation-parc]')) q('[data-lcdp-card-reservation-parc]').textContent = 'Parc de ' + nom;
    if(q('[data-lcdp-card-reservation-departement]')) q('[data-lcdp-card-reservation-departement]').textContent=info.dptmt ? '('+info.dptmt+')' : '';
    const url=imageParc(info), img=q('[data-lcdp-card-reservation-image]'), media=q('[data-lcdp-card-reservation-media]');
    if(img && media){if(url){img.src=url;img.alt='Parc de '+nom;media.hidden=false;card.classList.add('lcdp-box-card-reservation-membre--avec-image');img.onerror=()=>{media.hidden=true;card.classList.remove('lcdp-box-card-reservation-membre--avec-image')};}else{media.hidden=true;}}
    if(vrai(r.invitation))card.classList.add('lcdp-box-card-reservation-membre--invitation');
    if(period==='passe')card.classList.add('lcdp-box-card-reservation-membre--passe');
    const actions=q('.lcdp-box-card-reservation-membre__actions') || card;
    actions.replaceChildren();
    const boutonAcces = bouton('Accès',true,()=>{
      const p=info.p, adresse=[p.adresse1,p.adresse2,p.adresse3,p.entreeparc].map(x=>String(x||'').trim()).filter(Boolean).join('\n');
      montrer(adresse || 'Adresse du parc non renseignée.','Accès — parc de '+nom);
    });
    boutonAcces.dataset.action='adresse';actions.append(boutonAcces);
    const indic = vrai(r.invitation) ? 'Invit’' : (Number(statsParFlux.get(String(r.idflux||'')) || 0)>0 ? 'Invité(s)' : 'Inviter');
    const boutonInvit = bouton(indic,false,()=>invitation(r).catch(e=>montrer(e.message)));
    boutonInvit.dataset.action='invitation';actions.append(boutonInvit);
    if(period==='avenir'){
      const a = bouton(vrai(r.invitation)?'Annuler l’invite':'Annuler la réservation',false,()=>annuler(r).catch(e=>montrer(e.message)));
      a.dataset.action='annuler';actions.append(a);
    }else if(estAnnulee(r)){
      actions.append(faire('span','lcdp-box-card-reservation-membre__invitation-badge','Annulée'));
    }
    return card;
  }
  async function charger() {
    const msg=secours.querySelector('[data-lcdp-liste-card-message]');
    msg.hidden=false;msg.textContent='Chargement de vos accès…';
    try{
      const d=await requete(planningApi,'/mes-reservations');
      if(!Array.isArray(d.reservations))throw new Error('Liste de réservations absente.');
      reservations=d.reservations;
      if(invitationsApi){
        try{const i=await requete(invitationsApi,'/reservations-invitables');statsParFlux=new Map((i.reservations||[]).map(r=>[String(r.idflux||''), Number(r.invitationStats?.in||0)]));}
        catch(e){console.warn('[MES ACCÈS] Statuts des invités indisponibles',e)}
      }
      if (!secours?.isConnected) return;
      msg.hidden=true;
      render();
    }catch(e){if(!secours?.isConnected)return;msg.textContent=e.message||'Impossible de charger vos accès.';msg.dataset.lcdpMessageType='erreur';}
  }
  function render(){
    if(!secours?.isConnected)return;
    const boutons=secours.querySelectorAll('[data-lcdp-planning-periode]');
    boutons.forEach(b=>{const selected=b.dataset.lcdpPlanningPeriode===period;b.classList.toggle('lcdp-button-primary',selected);b.classList.toggle('lcdp-button-secondary',!selected);b.setAttribute('aria-pressed',String(selected))});
    const filtered=reservations.filter(parmiPeriode).sort((a,b)=>period==='avenir'?dateDebut(a)-dateDebut(b):dateDebut(b)-dateDebut(a));
    const liste=secours.querySelector('[data-lcdp-liste-card-list]');
    if(!liste)return;
    if(!filtered.length){const m=faire('p','lcdp-box-liste-card__message',period==='avenir'?'Vous n’avez aucun accès à venir.':'Vous n’avez aucun accès passé.');liste.replaceChildren(m)}
    else{liste.replaceChildren(...filtered.map(carte))}
  }
  async function annuler(r){
    if(!window.confirm(vrai(r.invitation)?'Voulez-vous vraiment annuler cette invite ?':'Voulez-vous vraiment annuler cette réservation ?'))return;
    await requete(planningApi,'/annuler-reservation',{method:'POST',body:JSON.stringify({idflux:r.idflux})});
    await charger();montrer(vrai(r.invitation)?'Votre invite est annulée.':'Votre réservation est annulée.','Annulation');
  }
  async function invitation(r){
    if(vrai(r.invitation)){
      const parrain=r.parrainInvitation || r.parrain || {};
      montrer('Invitation par : '+String(parrain.affichage||parrain.alias||parrain.prenom||parrain.prenommembre||'Parrain non renseigné'),'Invitation reçue');return;
    }
    const n=Number(statsParFlux.get(String(r.idflux||''))||0);
    if(n>0){
      const i=await requete(invitationsApi,'/invites?idflux='+encodeURIComponent(r.idflux));
      const liste=Array.isArray(i.invites)?i.invites:[];
      montrer(liste.length ? liste.map(p=>String(p.alias||p.email||p.prenom||'Invité')).join('\n') : 'Aucun invité actif.', 'Mes invités');return;
    }
    const email=window.prompt('Adresse e-mail de la personne à inviter :');
    if(email===null)return;
    const adresse=String(email).trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)){montrer('Adresse e-mail invalide.','Invitation');return;}
    await requete(invitationsApi,'/inviter-reservation',{method:'POST',body:JSON.stringify({idflux:r.idflux,emails:[adresse]})});
    await charger();montrer('Invitation envoyée.','Invitation');
  }
  function listeHistoriquePrete(){
    const liste=racine.querySelector('[data-lcdp-liste-card-list]');
    // La structure seule ne suffit pas : l'ancien moteur peut avoir échoué
    // après avoir créé une liste vide.
    return Boolean(liste && Array.from(liste.children).some(enfant =>
      enfant.matches('[data-lcdp-box-card-reservation-membre], .lcdp-box-liste-card__message')));
  }
  async function monter(){
    if(demarrage)return;demarrage=true;
    try{
      const rep=await fetch(urlObjet('/BOX/04-box-card-reservation-membre.html'),{cache:'no-cache'});
      if(rep.ok){const tpl=document.createElement('template');tpl.innerHTML=(await rep.text()).trim();fichierCard=tpl.content.querySelector('[data-lcdp-box-card-reservation-membre]');}
    }catch(e){console.warn('[MES ACCÈS] Card historique indisponible',e)}
    // Priorité absolue aux fragments BOX communs déjà déployés.
    async function fragmentBox(nom,selecteur){
      try{
        const reponse=await fetch(urlObjet('/BOX/'+nom),{cache:'no-cache'});
        if(!reponse.ok)return null;
        const fragment=document.createElement('template');fragment.innerHTML=(await reponse.text()).trim();
        return fragment.content.querySelector(selecteur);
      }catch{return null;}
    }
    const wrap=(await fragmentBox('04-box-liste-card.html','[data-lcdp-box-liste-card]')) ||
      faire('section','lcdp-box-liste-card');
    wrap.classList.add('lcdp-box-liste-card--planning-membre','lcdp-box-liste-card--mode-liste','lcdp-box-liste-card--encadree');
    wrap.dataset.lcdpBoxListeCard='';
    let header=wrap.querySelector('.lcdp-box-liste-card__header');
    if(!header){header=faire('div','lcdp-box-liste-card__header');wrap.prepend(header);}
    const heading=wrap.querySelector('[data-lcdp-liste-card-title]');
    if(heading){heading.textContent='';heading.hidden=true;heading.parentElement.hidden=true;}
    let commande=wrap.querySelector('[data-lcdp-liste-card-commande]');
    if(!commande){commande=faire('div','lcdp-box-liste-card__commande');commande.dataset.lcdpListeCardCommande='';header.append(commande);}
    const bar=(await fragmentBox('04-box-commande-bar.html','[data-lcdp-box-commande-bar]')) ||
      faire('div','lcdp-box-commande-bar');
    bar.dataset.lcdpBoxCommandeBar='';
    let actions=bar.querySelector('[data-lcdp-commande-bar-actions]');
    if(!actions){actions=faire('div','lcdp-box-commande-bar__actions');actions.dataset.lcdpCommandeBarActions='';bar.append(actions);}
    const tabs=faire('div','lcdp-planning-membre-periode-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Période des accès');
    for(const [id,label] of [['avenir','À venir'],['passe','Passés']]){
      const b=bouton(label,id===period,()=>{period=id;render()});b.classList.add('lcdp-planning-membre-periode-button');b.dataset.lcdpPlanningPeriode=id;tabs.append(b);
    }
    actions.replaceChildren(tabs);commande.replaceChildren(bar);
    let message=wrap.querySelector('[data-lcdp-liste-card-message]');
    if(!message){message=faire('p','lcdp-box-liste-card__message');message.dataset.lcdpListeCardMessage='';wrap.append(message);}
    message.textContent='Chargement de vos accès…';message.hidden=false;
    let liste=wrap.querySelector('[data-lcdp-liste-card-list]');
    if(!liste){liste=faire('div','lcdp-box-liste-card__list');liste.dataset.lcdpListeCardList='';wrap.append(liste);}
    racine.replaceChildren(wrap);secours=wrap;
    // Vérifier le statut auprès du Worker, sans s'appuyer sur un cookie.
    if(indexApi){
      requete(indexApi,'/index').then(data=>{
        const element=document.getElementById('mention-statut-membre');
        if(element)element.textContent=vrai(data.abonne)?'MEMBRE ABONNÉ':'MEMBRE INVITÉ';
      }).catch(()=>{
        const element=document.getElementById('mention-statut-membre');
        if(element && element.textContent.includes('Chargement'))element.textContent='Statut membre indisponible';
      });
    }
    await charger();
  }
  function lancement(){
    // MES ACCÈS est une vue liste autonome : aucun calendrier à initialiser.
    void monter().catch(error => {
      console.error('[MES ACCÈS] Initialisation de la liste impossible :', error);
      const message = racine.querySelector('[data-lcdp-liste-card-message]');
      if (message) {
        message.hidden = false;
        message.textContent = 'Impossible de préparer la liste des accès. Veuillez réessayer.';
        message.dataset.lcdpMessageType = 'erreur';
      }
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',lancement,{once:true});
  else lancement();
})();


/* Bandeau et footer : composants de l'espace membre, indépendants de la liste. */
(() => {
  'use strict';
  const cfg = window.SITE_CONFIG || {};
  const urlMembre = chemin => typeof window.LCDP_urlMembre === 'function'
    ? window.LCDP_urlMembre(chemin)
    : String(cfg.membreBaseUrl || cfg.MEMBRE_BASE || cfg.siteBase || '').replace(/\/+$/, '') + '/' + chemin.replace(/^\/+/, '');
  const urlPublic = chemin => typeof window.LCDP_urlPublic === 'function'
    ? window.LCDP_urlPublic(chemin)
    : String(cfg.publicBaseUrl || cfg.PUBLIC_BASE || '').replace(/\/+$/, '') + '/' + chemin.replace(/^\/+/, '');
  const urlObjet = chemin => typeof window.LCDP_urlObjet === 'function'
    ? window.LCDP_urlObjet(chemin)
    : String(cfg.objetBaseUrl || cfg.OBJET_BASE || '').replace(/\/+$/, '') + '/' + chemin.replace(/^\/+/, '');
  async function fragment(url) {
    const response = await fetch(url, {credentials:'omit',cache:'no-cache'});
    if(!response.ok) throw new Error('Composant indisponible : ' + url);
    const tpl=document.createElement('template');tpl.innerHTML=(await response.text()).trim();
    return tpl.content.cloneNode(true);
  }
  function routes(root) {
    root.querySelectorAll('[data-site-href]').forEach(el => {
      const chemin=el.dataset.siteHref || '';
      el.setAttribute('href', el.dataset.space==='membre' ? urlMembre(chemin) : urlPublic(chemin));
    });
    root.querySelectorAll('[data-site-src]').forEach(el => {
      el.setAttribute('src', urlObjet((el.dataset.siteSrc || '').replace(/^\/?OBJET\/?/,'/')));
    });
  }
  async function menu() {
    const slot=document.getElementById('lcdp-bandeau-slot');if(!slot)return;
    slot.replaceChildren(await fragment(urlMembre('/ESPACE-MEMBRE/box-bandeau-nav-membre.html')));
    routes(slot);
    await new Promise((resolve,reject)=>{
      if(typeof window.LCDP_initialiserMenuBurgerMembre==='function'){resolve();return;}
      const script=document.createElement('script');script.src=urlMembre('/ESPACE-MEMBRE/box-menu-burger-membre.js');
      script.onload=resolve;script.onerror=()=>reject(new Error('Menu membre indisponible'));document.body.append(script);
    });
    if(typeof window.LCDP_initialiserMenuBurgerMembre==='function'){
      let abonne=false;
      const api=String(cfg.workerIndexMembreUrl || cfg.WORKER_INDEX_MEMBRE_URL ||
        (typeof cfg.apiUrl==='function' ? cfg.apiUrl('index-membre-api') : '') || '').replace(/\/+$/,'');
      if(api) {
        try { const res=await fetch(api+'/index',{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});
          const data=await res.json();if(res.ok&&(data.ok===true||data.success===true))abonne=data.abonne===true||data.abonne==='true'; }
        catch(error){console.warn('[MES ACCÈS] Statut du menu indisponible',error);}
      }
      await window.LCDP_initialiserMenuBurgerMembre({etatMembre:{abonne}});
    }
  }
  async function footer() {
    const slot=document.getElementById('lcdp-footer-slot');if(!slot)return;
    slot.replaceChildren(await fragment(urlObjet('/BOX/02-box-footer.html')));
    routes(slot);
  }
  function lancer() {
    void menu().catch(e=>console.error('[MES ACCÈS] Bandeau :',e));
    void footer().catch(e=>console.error('[MES ACCÈS] Footer :',e));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',lancer,{once:true});
  else lancer();
})();
