/* MES ACCÈS — vue liste/diaporama sur la structure membre déjà validée.
   Les données, droits, annulations et notifications restent du ressort des Workers.
   Aucun calendrier, aucune carte et aucun nouveau composant CSS. */
(() => {
  'use strict';

  const config = window.SITE_CONFIG || {};
  const root = document.getElementById('lcdp-mes-acces-conteneur');
  if (!root) return;

  const ui = {
    liste: document.getElementById('lcdp-mes-acces-liste'),
    message: document.getElementById('lcdp-mes-acces-message'),
    resultat: document.getElementById('lcdp-mes-acces-resultat'),
    filtres: document.getElementById('lcdp-mes-acces-filtres'),
    date: document.getElementById('lcdp-mes-acces-date'),
    parc: document.getElementById('lcdp-mes-acces-parc'),
    departement: document.getElementById('lcdp-mes-acces-departement'),
    recues: document.getElementById('lcdp-mes-acces-recues'),
    envoyees: document.getElementById('lcdp-mes-acces-envoyees'),
    effacer: document.getElementById('lcdp-mes-acces-effacer'),
    compteurRecues: document.getElementById('lcdp-mes-acces-compteur-recues'),
    compteurEnvoyees: document.getElementById('lcdp-mes-acces-compteur-envoyees'),
    onglets: Array.from(root.querySelectorAll('[data-lcdp-periode]')),
    planning: document.getElementById('lcdp-mes-acces-planning'),
    listeConteneur: document.getElementById('lcdp-mes-acces-liste-conteneur')
  };
  if (!ui.liste || !ui.message || !ui.filtres || ui.onglets.length !== 3 || !ui.planning || !ui.listeConteneur) return;

  const etat = {
    periode: 'avenir',
    reservations: [],
    calendrier: null,
    modeleJour: null,
    moisPlanning: (() => {
      const now = new Date();
      return {annee:now.getFullYear(),mois:now.getMonth()+1};
    })(),
    filtre: { date: '', parc: '', departement: '', recues: false, envoyees: false },
    donneesInvitations: new Map(),
    disponibiliteStats: false,
    erreurStats: false,
    cardModele: null,
    reservationsChargees: false,
    annulationEnCours: false
  };

  function endpoint(cle, ancienne, service) {
    const value = config[cle] || config[ancienne] ||
      (typeof config.apiUrl === 'function' ? config.apiUrl(service) : '');
    return String(value || '').replace(/\/+$/, '');
  }
  const planningApi = endpoint('workerPlanningMembreUrl', 'WORKER_PLANNING_MEMBRE_URL', 'planning-membre-api');
  const invitationsApi = endpoint('workerInviterMembreUrl', 'WORKER_INVITER_MEMBRE_URL', 'inviter-membre-api');
  const indexApi = endpoint('workerIndexMembreUrl', 'WORKER_INDEX_MEMBRE_URL', 'index-membre-api');

  async function afficherStatutMembre() {
    const mention = document.getElementById('mention-statut-membre');
    if (!mention || !indexApi) return;
    try {
      const resultat = await getJson(indexApi + '/index');
      mention.textContent = vrai(resultat.abonne) ? 'MEMBRE ABONNÉ' : 'MEMBRE INVITÉ';
      mention.hidden = false;
    } catch (err) {
      console.warn('[MES ACCÈS] Statut non vérifiable :',err);
      mention.hidden = true;
    }
  }

  function dateValide(r) {
    const timestamp = Date.parse(String(r?.datebookd || ''));
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  function dateIsoParis(value) {
    const timestamp = typeof value === 'number' ? value : dateValide(value);
    if (timestamp === null || !Number.isFinite(timestamp)) return '';
    const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(timestamp));
    const valeurs = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return [valeurs.year, valeurs.month, valeurs.day].join('-');
  }
  function formatDate(value) {
    const timestamp = dateValide(value);
    if (timestamp === null) return 'Date indisponible';
    return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(timestamp));
  }
  function formatHeure(value) {
    const timestamp = dateValide(value);
    if (timestamp === null) return '';
    return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp)).replace(':', ' h ');
  }
  function vrai(value) {
    return value === true || value === 1 || value === 'true' || value === '1';
  }
  function nomParc(r) {
    const p = r.parc || {};
    return String(p.nom || p.nomparc || r.nomparc || 'Parc').trim();
  }
  function departement(r) {
    const p = r.parc || {};
    return String(p.dptmt || p.departement || r.dptmt || '').trim();
  }
  function idParc(r) {
    return String(r.parc?.idparc || r.idparc || nomParc(r) + '|' + departement(r));
  }
  function statutAnnule(r) {
    return String(r?.statut || '').toLowerCase() === 'cancd';
  }
  function estPasse(r) {
    const d = dateValide(r);
    return statutAnnule(r) || (d !== null && d <= Date.now());
  }
  function estRecue(r) {
    return vrai(r?.invitation);
  }
  function statsActifs(r) {
    const stat = etat.donneesInvitations.get(String(r?.idflux || '')) ||
      r.invitationStats || r.invitationsStats || {};
    const n = Number(stat.in ?? stat.actifs ?? stat.invites ?? 0);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  function estEnvoyee(r) {
    return !estRecue(r) && statsActifs(r) > 0;
  }
  function nomDossier(nom) {
    // La convention image du planning V5 : sans « Parc de », sans accents, en majuscules.
    return String(nom || '')
      .trim()
      .replace(/^parc\s+d[’']\s*/i, '')
      .replace(/^parc\s+(?:de|du|des)\s+/i, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
  function codeDepartement(raw) {
    const s = String(raw || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    const corse = s.match(/\b2[AB]\b/);
    if (corse) return corse[0];
    const d = s.match(/\d{1,3}/);
    return d ? d[0].padStart(2, '0') : '';
  }
  function photoParc(r) {
    const n = nomDossier(nomParc(r));
    const d = codeDepartement(departement(r));
    if (!n || !d) return '';
    const chemin = '/IMAG/PARC/' + d + '/' + encodeURIComponent(n) + '/card1.webp';
    if (typeof window.LCDP_urlObjet === 'function') return window.LCDP_urlObjet(chemin);
    const base = String(config.objetBaseUrl || '').replace(/\/+$/, '');
    return base ? base + chemin : '';
  }
  function textEl(tag, classe, texte) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    el.textContent = String(texte ?? '');
    return el;
  }
  function msg(value, erreur = false) {
    ui.message.hidden = false;
    ui.message.textContent = value;
    ui.message.dataset.lcdpMessageType = erreur ? 'erreur' : 'information';
  }
  function masqueMsg() {
    ui.message.hidden = true;
    ui.message.textContent = '';
  }
  async function getJson(url, options = {}) {
    if (!url) throw new Error('Service non configuré.');
    const r = await fetch(url, {
      method: options.method || 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {Accept: 'application/json', ...(options.body ? {'Content-Type': 'application/json'} : {})},
      ...(options.body ? {body: JSON.stringify(options.body)} : {})
    });
    if (r.status === 401) {
      const cible = typeof window.LCDP_urlPublic === 'function'
        ? window.LCDP_urlPublic('/ESPACE-PUBLIC/connexion-membre.html?source=planning-membre')
        : '../ESPACE-PUBLIC/connexion-membre.html?source=planning-membre';
      window.location.assign(cible);
      throw new Error('Session expirée. Reconnectez-vous.');
    }
    const data = await r.json().catch(() => null);
    if (!r.ok || !data || (data.ok !== true && data.success !== true)) {
      throw new Error(String(data?.message || data?.error || 'Opération indisponible.'));
    }
    return data;
  }

  function periodeReservations() {
    return etat.reservations.filter(r => etat.periode === 'avenir' ? !estPasse(r) : estPasse(r))
      .sort((a, b) => etat.periode === 'avenir'
        ? dateValide(a) - dateValide(b)
        : dateValide(b) - dateValide(a));
  }
  function toutesFutures() {
    return etat.reservations.filter(r => !estPasse(r));
  }
  function optionsSelect(el, entries, firstLabel, selection) {
    const frag = document.createDocumentFragment();
    frag.appendChild(new Option(firstLabel, ''));
    for (const [value, label] of entries) frag.appendChild(new Option(label, value));
    el.replaceChildren(frag);
    el.value = entries.some(e => e[0] === selection) ? selection : '';
    return el.value;
  }
  function synchroniserFiltres() {
    const futures = toutesFutures();
    const parcs = new Map();
    const dpts = new Map();
    for (const r of futures) {
      const id = idParc(r);
      const dep = departement(r);
      if (!parcs.has(id)) parcs.set(id, [nomParc(r), dep].filter(Boolean).join(' — '));
      if (dep && !dpts.has(dep)) dpts.set(dep, dep);
    }
    etat.filtre.parc = optionsSelect(ui.parc,
      Array.from(parcs).sort((a,b) => a[1].localeCompare(b[1], 'fr')),
      'Tous les parcs', etat.filtre.parc);
    etat.filtre.departement = optionsSelect(ui.departement,
      Array.from(dpts).sort((a,b) => a[0].localeCompare(b[0], 'fr')),
      'Tous les départements', etat.filtre.departement);
  }
  function actifsFiltres() {
    return Boolean(etat.filtre.date || etat.filtre.parc || etat.filtre.departement || etat.filtre.recues || etat.filtre.envoyees);
  }
  function passeFiltres(r) {
    const f = etat.filtre;
    if (f.date && dateIsoParis(r) !== f.date) return false;
    if (f.parc && idParc(r) !== f.parc) return false;
    if (f.departement && departement(r) !== f.departement) return false;
    if ((f.recues || f.envoyees) && !((f.recues && estRecue(r)) || (f.envoyees && estEnvoyee(r)))) return false;
    return true;
  }
  function majOngletsEtFiltres() {
    // Même compteur que la maquette : valeurs réelles des réservations chargées.
    for (const b of ui.onglets) {
      if (b.dataset.lcdpPeriode === 'avenir') {
        b.textContent = 'À venir (' + toutesFutures().length + ')';
      } else if (b.dataset.lcdpPeriode === 'passe') {
        b.textContent = 'Passé (' + etat.reservations.filter(estPasse).length + ')';
      }
    }
    for (const b of ui.onglets) {
      const actif = b.dataset.lcdpPeriode === etat.periode;
      b.setAttribute('aria-selected', String(actif));
      b.setAttribute('aria-pressed', String(actif));
      b.classList.toggle('lcdp-button-primary', actif);
      b.classList.toggle('lcdp-button-secondary', !actif);
    }
    const avenir = etat.periode === 'avenir';
    const planning = etat.periode === 'planning';
    ui.filtres.hidden = !avenir;
    ui.planning.hidden = !planning;
    ui.listeConteneur.hidden = planning;
    ui.resultat.hidden = planning;
    if (planning) ui.message.hidden = true;
    ui.filtres.setAttribute('aria-disabled', String(!avenir));
    ui.filtres.querySelectorAll('input, select, button').forEach(el => {
      if (el === ui.envoyees) el.disabled = !avenir || !etat.disponibiliteStats;
      else if (el === ui.effacer) el.disabled = !avenir || !actifsFiltres();
      else el.disabled = !avenir;
    });
    // Compteurs calculés sur les réservations réellement chargées, jamais fictifs.
    if (ui.compteurRecues) {
      ui.compteurRecues.textContent = String(toutesFutures().filter(estRecue).length);
    }
    if (ui.compteurEnvoyees) {
      if (etat.disponibiliteStats) {
        ui.compteurEnvoyees.textContent = String(
          toutesFutures().filter(r => !estRecue(r)).reduce((total,r)=>total+statsActifs(r),0)
        );
        ui.compteurEnvoyees.hidden = false;
      } else {
        ui.compteurEnvoyees.hidden = true;
      }
    }
    ui.recues.setAttribute('aria-pressed', String(etat.filtre.recues));
    ui.envoyees.setAttribute('aria-pressed', String(etat.filtre.envoyees));
    ui.recues.classList.toggle('lcdp-button-primary', etat.filtre.recues);
    ui.recues.classList.toggle('lcdp-button-secondary', !etat.filtre.recues);
    ui.envoyees.classList.toggle('lcdp-button-primary', etat.filtre.envoyees);
    ui.envoyees.classList.toggle('lcdp-button-secondary', !etat.filtre.envoyees);
  }

  function imageErreur(img) {
    img.hidden = true;
    // Une règle CSS de classe peut contredire display:none du seul attribut hidden.
    img.style.display = 'none';
    // Le nom, la date et le verso restent visibles quand le parc n'a pas d'image.
    img.alt = '';
  }

  // Les mêmes balises que HTMLBASE/04-card-parc-diaporama.html et son CSS.
  function creerCarte(r) {
    const article = etat.cardModele.cloneNode(true);
    const recto = article.querySelector('[data-lcdp-diaporama-retourner]');
    const fermer = article.querySelector('[data-lcdp-diaporama-fermer]');
    const img = article.querySelector('[data-lcdp-diaporama-image]');
    const nom = article.querySelector('[data-lcdp-diaporama-nom]');
    const titre = article.querySelector('[data-lcdp-diaporama-nom-dos]');
    const actions = article.querySelector('[data-lcdp-diaporama-actions]');
    const description = article.querySelector('[data-lcdp-diaporama-description]');
    const verso = article.querySelector('[data-lcdp-diaporama-dos]');
    article.dataset.idflux = String(r.idflux || '');
    // Le nom est déjà celui enregistré dans public.parcs : ne pas ajouter « Parc de ».
    const lieu = nomParc(r);
    const dat = formatDate(r);
    const h = formatHeure(r);
    const dept = departement(r);
    const labelType = statutAnnule(r) ? 'Accès annulé' : estRecue(r) ? 'Invitation reçue' : estEnvoyee(r) ? 'Avec invités' : 'Réservation';

    img.alt = lieu;
    img.addEventListener('error', () => imageErreur(img), {once: true});
    const photo = photoParc(r);
    if (photo) img.src = photo;
    else imageErreur(img);
    nom.textContent = lieu + ' · ' + dat + (h ? ' à ' + h : '');
    titre.textContent = lieu;
    recto.setAttribute('aria-label', 'Détails de votre accès au ' + lieu + ', le ' + dat);
    description.textContent = dat + (h ? ' à ' + h : '');
    if (estRecue(r)) {
      const rond = document.createElement('span');
      rond.title = 'Invitation reçue';
      rond.setAttribute('aria-label', 'Invitation reçue');
      rond.style.cssText = 'display:inline-block;width:1em;height:1em;border-radius:50%;background:#e78db3;vertical-align:middle;margin-right:6px';
      description.prepend(rond);
    }

    const ajouterBouton = (libelle, action, style='lcdp-button-secondary') => {
      const b = textEl('button', 'lcdp-button lcdp-box-card-parc__action ' + style, libelle);
      b.type = 'button';
      b.addEventListener('click', action);
      actions.appendChild(b);
    };

    if (etat.periode === 'avenir' && !statutAnnule(r)) {
      const annuler = textEl('button', 'lcdp-button lcdp-box-card-parc__action lcdp-button-secondary', 'Annuler');
      annuler.type = 'button';
      annuler.addEventListener('click', () => void demanderAnnulation(r));
      actions.appendChild(annuler);
      if (!estRecue(r)) {
        const nombre = etat.disponibiliteStats ? statsActifs(r) : null;
        const inviter = textEl('button', 'lcdp-button lcdp-box-card-parc__action lcdp-button-secondary', '');
        inviter.type = 'button';
        const icone = document.createElement('span');
        icone.setAttribute('aria-hidden', 'true');
        icone.style.cssText = 'display:inline-flex;vertical-align:middle;margin-right:6px';
        icone.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>';
        inviter.append(icone, document.createTextNode('Invités '));
        const compteur = textEl('span', '', nombre === null ? '…' : nombre === 0 ? '-' : String(nombre));
        compteur.style.cssText = 'border-radius:999px;background:rgba(75,99,51,.1);padding:1px 6px;font-size:.85em';
        inviter.appendChild(compteur);
        inviter.addEventListener('click', () => void montrerInvites(r));
        actions.appendChild(inviter);
      }
    }
    function retourner(ouvert) {
      article.classList.toggle('is-retourne', ouvert);
      recto.setAttribute('aria-expanded', String(ouvert));
      verso.setAttribute('aria-hidden', String(!ouvert));
      fermer.tabIndex = ouvert ? 0 : -1;
      actions.querySelectorAll('button').forEach(b => { b.tabIndex = ouvert ? 0 : -1; });
      if (ouvert) fermer.focus({preventScroll: true});
      else recto.focus({preventScroll: true});
    }
    recto.addEventListener('click', () => retourner(true));
    fermer.addEventListener('click', () => retourner(false));
    retournerSansFocus();
    function retournerSansFocus() {
      article.classList.remove('is-retourne');
      recto.setAttribute('aria-expanded', 'false');
      verso.setAttribute('aria-hidden', 'true');
      fermer.tabIndex = -1;
      actions.querySelectorAll('button').forEach(b => {b.tabIndex = -1;});
    }
    return article;
  }

  // Le même composant 04-calendrier-mois que PLANIFIER (sans parc).
  // La seule différence est la source des traits : accès personnels du membre.
  async function initialiserCalendrierPersonnel() {
    if (etat.calendrier) return;
    async function fragment(chemin) {
      const url = window.LCDP_urlObjet?.(chemin);
      if (!url) throw new Error('URL des composants indisponible.');
      const r=await fetch(url,{cache:'no-store'});
      if (!r.ok) throw new Error('Impossible de charger le composant '+chemin);
      const t=document.createElement('template');
      t.innerHTML=await r.text();
      return t.content;
    }
    const [fCal,fJour]=await Promise.all([
      fragment('/HTMLBASE/04-calendrier-mois.html'),
      fragment('/HTMLBASE/04-card-jour-in-calendrier-mois.html')
    ]);
    const cal=fCal.querySelector('[data-lcdp-box-calendrier-mois]');
    const jour=fJour.querySelector('[data-lcdp-card-jour-mois]');
    if (!cal || !jour) throw new Error('Structure du calendrier indisponible.');
    cal.removeAttribute('role');
    cal.removeAttribute('aria-modal');
    cal.classList.add('lcdp-box-calendrier-mois--inline');
    cal.querySelector('.lcdp-box-calendrier-mois__header')?.remove();
    cal.querySelector('[data-lcdp-calendrier-mois-close]')?.remove();
    const grid=cal.querySelector('[data-lcdp-calendrier-mois-grid]');
    if (!grid) throw new Error('Grille calendrier absente.');
    const legende=document.createElement('div');
    legende.className='lcdp-box-legende lcdp-planifier-legende-planning';
    legende.setAttribute('aria-label','Légende des accès');
    const ligne=document.createElement('div');
    ligne.className='lcdp-box-legende__ligne';
    for (const [label,classe] of [
      ['accès planifié dans un parc','lcdp-box-legende__carre--bleu-fonce'],
      ['invitation reçue pour un parc','lcdp-box-legende__carre--bleu-clair']
    ]) {
      const item=document.createElement('span');
      item.className='lcdp-box-legende__item';
      const square=document.createElement('span');
      square.className='lcdp-box-legende__carre '+classe;
      square.setAttribute('aria-hidden','true');
      const texte=document.createElement('span');
      texte.className='lcdp-box-legende__libelle';
      texte.textContent=label;
      item.append(square,texte);
      ligne.appendChild(item);
    }
    const contenuLegende=document.createElement('div');
    contenuLegende.className='lcdp-box-legende__contenu';
    contenuLegende.append(ligne);
    legende.append(contenuLegende);
    cal.querySelector('.lcdp-box-calendrier-mois__body')?.append(legende);
    ui.planning.querySelector('#lcdp-planifier-calendrier-slot').replaceChildren(cal);
    etat.calendrier=cal;
    etat.modeleJour=jour;
    const deplacer=delta=>{
      const d=new Date(etat.moisPlanning.annee,etat.moisPlanning.mois-1+delta,1);
      etat.moisPlanning={annee:d.getFullYear(),mois:d.getMonth()+1};
      afficherCalendrierPersonnel();
    };
    cal.querySelector('[data-lcdp-calendrier-mois-prev]')?.addEventListener('click',()=>deplacer(-1));
    cal.querySelector('[data-lcdp-calendrier-mois-next]')?.addEventListener('click',()=>deplacer(1));
  }

  function afficherCalendrierPersonnel() {
    const cal=etat.calendrier,jourModele=etat.modeleJour;
    if(!cal || !jourModele)return;
    const {annee,mois}=etat.moisPlanning;
    const month=new Date(annee,mois-1,1);
    cal.querySelector('[data-lcdp-calendrier-mois-current]').textContent=
      new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(month).replace(/^./,c=>c.toUpperCase());
    const grid=cal.querySelector('[data-lcdp-calendrier-mois-grid]');
    grid.replaceChildren();
    const offset=(month.getDay()+6)%7;
    const count=new Date(annee,mois,0).getDate();
    const aujourdHui=dateIsoParis(Date.now());
    const reservations=new Map();
    for(const r of etat.reservations) {
      if(statutAnnule(r) || estPasse(r)) continue;
      const date=dateIsoParis(r),plage=String(r.plagebookd||'');
      if(!/^plage[1-5]$/.test(plage)) continue;
      if(!reservations.has(date))reservations.set(date,new Map());
      const cases=reservations.get(date);
      if(!cases.has(plage))cases.set(plage,{personnel:false,invitation:false,parcs:new Set()});
      const slot=cases.get(plage);
      if(estRecue(r))slot.invitation=true;else slot.personnel=true;
      const parc=nomParc(r),dep=departement(r);
      if(parc && parc!=='Parc')slot.parcs.add(parc+(dep?' ('+dep+')':''));
    }
    for(let n=0;n<offset;n++) {
      const vide=jourModele.cloneNode(true);
      vide.classList.add('lcdp-box-card-jour-in-calendrier-mois--empty');
      vide.disabled=true;
      vide.setAttribute('aria-hidden','true');
      grid.append(vide);
    }
    for(let n=1;n<=count;n++){
      const date=annee+'-'+String(mois).padStart(2,'0')+'-'+String(n).padStart(2,'0');
      const card=jourModele.cloneNode(true);
      card.classList.add('lcdp-box-card-jour-in-calendrier-mois--planning-lecture','lcdp-planifier-jour--sans-parc');
      card.dataset.date=date;
      card.querySelector('[data-lcdp-card-jour-mois-number]').textContent=String(n);
      if(date<aujourdHui){
        card.classList.add('lcdp-box-card-jour-in-calendrier-mois--past');
        card.disabled=true;
      } else if (date===aujourdHui) {
        card.classList.add('lcdp-box-card-jour-in-calendrier-mois--today');
      }
      const textes=[],cases=reservations.get(date);
      for(let p=1;p<=5;p++){
        const plage='plage'+p,trait=card.querySelector('[data-lcdp-card-jour-mois-slot="'+plage+'"]');
        trait.hidden=true;
        const res=cases?.get(plage);
        if(!res)continue;
        trait.hidden=false;
        trait.classList.add(res.personnel&&res.invitation
          ? 'lcdp-planifier-plage--acces-et-invitation'
          : res.invitation?'lcdp-planifier-plage--invitation-recue'
          : 'lcdp-planifier-plage--acces-personnel');
        textes.push('plage '+p+': '+(res.invitation?'invitation reçue':'accès planifié')
          +(res.parcs.size?' · '+[...res.parcs].join(', '):''));
      }
      card.title=date+(textes.length?' · '+textes.join(' · '):' · aucun accès');
      card.setAttribute('aria-label',card.title);
      card.tabIndex=-1; // Le calendrier est en lecture seule.
      grid.append(card);
    }
  }

  function afficher() {
    majOngletsEtFiltres();
    if (etat.periode==='planning') {
      if(etat.calendrier)afficherCalendrierPersonnel();
      else initialiserCalendrierPersonnel()
        .then(afficherCalendrierPersonnel)
        .catch(err=>{
          ui.message.hidden=false;
          ui.message.textContent=err.message||'Calendrier indisponible.';
        });
      return;
    }
    const periode=periodeReservations();
    const visibles=etat.periode==='avenir'?periode.filter(passeFiltres):periode;
    const fragment=document.createDocumentFragment();
    visibles.forEach(r=>fragment.appendChild(creerCarte(r)));
    ui.liste.replaceChildren(fragment);
    ui.resultat.textContent=visibles.length+' accès affiché'+(visibles.length>1?'s':'');
    if(etat.erreurStats && etat.periode==='avenir'){
      ui.resultat.textContent+=' · Le filtre « Invitations envoyées » est indisponible.';
    }
    if(!visibles.length){
      msg(periode.length>0 && etat.periode==='avenir' && actifsFiltres()
        ? 'Aucun accès ne correspond aux filtres sélectionnés.'
        : etat.periode==='avenir'?'Vous n’avez aucun accès à venir.':'Vous n’avez aucun accès passé.');
    } else masqueMsg();
  }

  async function afficherInformationMesAcces(message, titre = "Information", profil = "information") {
    const urlObjet = chemin => typeof window.LCDP_urlObjet === "function"
      ? window.LCDP_urlObjet(chemin)
      : String(config.objetBaseUrl || config.OBJET_BASE || "https://lacleduparc.fr/OBJET").replace(/\/+$/, "") + chemin;
    const css = urlObjet("/CSSBASE/lcdp-lightbox-convergence.css");
    if (![...document.querySelectorAll('link[rel="stylesheet"]')].some(lien => lien.href === css)) {
      const lien = document.createElement("link");
      lien.rel = "stylesheet";
      lien.href = css;
      document.head.appendChild(lien);
    }
    const erreur = profil === "erreur";
    const reponse = await fetch(urlObjet(erreur ? "/HTMLBASE/02-dialogue-reference-erreur.html" : "/HTMLBASE/02-dialogue-reference-information.html"), { cache: "no-cache" });
    if (!reponse.ok) throw new Error("Dialogue de référence indisponible.");
    const modele = document.createElement("template");
    modele.innerHTML = (await reponse.text()).trim();
    const conteneur = document.createElement("div");
    conteneur.appendChild(modele.content.cloneNode(true));
    document.body.appendChild(conteneur);
    try {
      const dialogue = conteneur.querySelector(erreur ? '[data-lcdp-dialogue-reference="erreur"]' : '[data-lcdp-dialogue-reference="information"]');
      const elementTitre = conteneur.querySelector("[data-lcdp-dialogue-titre]");
      const texte = conteneur.querySelector("[data-lcdp-dialogue-message]");
      const bouton = conteneur.querySelector(erreur ? '[data-lcdp-dialogue-action="fermer"]' : '[data-lcdp-dialogue-action="compris"]');
      if (!dialogue || !elementTitre || !texte || !bouton) throw new Error("Dialogue de référence incomplet.");

      elementTitre.textContent = titre;
      texte.textContent = String(message || "");
      bouton.textContent = "Fermer";
      return await new Promise(resolve => {
        bouton.addEventListener("click", () => {
          conteneur.remove();
          resolve();
        }, { once: true });
        bouton.focus();
      });
    } catch (erreur) {
      conteneur.remove();
      throw erreur;
    }
  }

  async function afficherErreurMesAcces(message) {
    try {
      await afficherInformationMesAcces(message, "Erreur", "erreur");
    } catch (erreur) {
      console.error("Dialogue ERREUR Mes accès indisponible :", erreur);
      window.alert(message);
    }
  }
  async function montrerParrain(r) {
    const parrain = r.parrainInvitation || r.parrain || {};
    const alias = String(parrain.affichage || parrain.alias || parrain.aliasmembre || '').trim();
    const prenom = String(parrain.prenommembre || parrain.prenom || '').trim();
    const nom = String(parrain.nommembre || parrain.nom || '').trim();
    const identite = alias || [prenom, nom ? nom[0].toUpperCase() + '.' : ''].filter(Boolean).join(' ');
    await afficherInformationMesAcces('Invitation par : ' + (identite || 'Information indisponible'), 'Invitation reçue');
  }
  async function montrerInvites(r) {
    if (!invitationsApi) {
      return afficherInformationMesAcces("Le service des invitations est indisponible.", "Information");
    }
    let overlay = null;
    let main = null;
    let contenuInitial = null;
    let defilements = [];
    const restaurerVue = () => {
      if (main && contenuInitial && overlay?.parentNode === main) {
        main.replaceChildren(...contenuInitial);
      } else {
        overlay?.remove();
      }
      overlay = null;
      defilements.forEach(({element,position}) => { element.scrollTop = position; });
    };
    try {
      const data = await getJson(invitationsApi + "/invites?idflux=" + encodeURIComponent(String(r.idflux)));
      const invites = Array.isArray(data.invites) ? data.invites : [];
      const urlObjet = chemin => typeof window.LCDP_urlObjet === "function"
        ? window.LCDP_urlObjet(chemin)
        : String(config.objetBaseUrl || "https://lacleduparc.fr/OBJET").replace(/\/+$/, "") + chemin;
      // Les styles de la vue Inviter doivent être prêts AVANT son montage,
      // y compris si cette page n'a pas préchargé les CSS de MES ACCÈS.
      const cssInviter = urlObjet("/CSSBASE/lcdp-mes-acces-membre.css?v=20261113-inviter-formulaire-v11");
      if (![...document.querySelectorAll('link[rel="stylesheet"]')].some(lien => lien.href === cssInviter)) {
        await new Promise((resolve, reject) => {
          const lien = document.createElement("link");
          lien.rel = "stylesheet";
          lien.href = cssInviter;
          lien.onload = resolve;
          lien.onerror = () => {
            lien.remove();
            reject(new Error("Styles du formulaire Inviter indisponibles."));
          };
          document.head.appendChild(lien);
        });
      }
      const reponse = await fetch(urlObjet("/HTMLBASE/04-card-listinvites-oui-non.html?v=20261113-inviter-champ-c040-v12"), {cache:"no-store"});
      if (!reponse.ok) throw new Error("Formulaire des invitations indisponible.");
      const template = document.createElement("template");
      template.innerHTML = (await reponse.text()).trim();
      main = document.querySelector("body.lcdp-mes-acces-page > .lcdp-app-wrapper > .lcdp-site-main");
      if (!main) throw new Error("Surface MES ACCÈS introuvable.");
      contenuInitial = Array.from(main.childNodes);
      defilements = [main.closest(".lcdp-app-wrapper"), document.scrollingElement]
        .filter(Boolean).map(element => ({element, position:element.scrollTop}));
      overlay = template.content.firstElementChild;
      if (!overlay) throw new Error("Gabarit invitation indisponible.");
      overlay.dataset.lcdpInvitationVuePage = "true";
      main.replaceChildren(overlay);
      defilements.forEach(({element}) => { element.scrollTop = 0; });

      const titre = overlay.querySelector("[data-lcdp-listinvites-title]");
      const liste = overlay.querySelector("[data-lcdp-listinvites-list]");
      const champ = overlay.querySelector("[data-lcdp-invite-email]");
      const effacer = overlay.querySelector("[data-lcdp-invite-effacer]");
      const ajouter = overlay.querySelector("[data-lcdp-listinvites-add-email]");
      const inviter = overlay.querySelector("[data-lcdp-listinvites-update]");
      const sansEmail = overlay.querySelector("[data-lcdp-listinvites-sans-email]");
      const annuler = overlay.querySelector("[data-lcdp-listinvites-cancel]");
      const message = overlay.querySelector("[data-lcdp-listinvites-message]");
      const formulaire = overlay.querySelector("[data-lcdp-invitation-form]");
      if (![titre,liste,champ,effacer,ajouter,inviter,sansEmail,annuler,message,formulaire].every(Boolean)) {
        throw new Error("Structure du formulaire des invitations incomplète.");
      }
      titre.textContent = "Inviter";
      const anciens = invites.filter(x => String(x.invit || "true").toLowerCase() !== "cancd");
      const annulations = new Map();
      let enregistrementEnCours = false;
      let fermeture = false;
      let adresseSaisie = "";

      function identifiant(x) { return String(x?.idmembre || "").trim(); }
      function email(x) { return String(x?.emailmembre || x?.email || "").trim(); }
      function identite(x) {
        return email(x) || [x?.prenommembre || x?.prenom,x?.nommembre || x?.nom]
          .filter(Boolean).join(" ") || "Invité enregistré";
      }
      function restants() { return anciens.filter(x => !annulations.has(identifiant(x))); }
      function afficherMessage(texte, erreur = false) {
        message.hidden = !texte;
        message.textContent = texte || "";
        message.classList.toggle("lcdp-box-dialogue-champ-inviter__erreur", erreur);
      }
      function fermer() {
        if (enregistrementEnCours || fermeture) return;
        fermeture = true;
        document.removeEventListener("keydown", gererEchap);
        restaurerVue();
      }
      function gererEchap(event) {
        if (event.key !== "Escape" || document.querySelector('[data-lcdp-dialogue-reference]')) return;
        event.preventDefault();
        afficherMessage("Utilisez la croix en haut à droite pour fermer ce formulaire.");
      }

      async function demanderRetrait(personne) {
        const id = identifiant(personne);
        if (!id) {
          await afficherInformationMesAcces("Cet invité ne peut pas être supprimé actuellement.", "Information");
          return;
        }
        const ok = await confirmerAnnulationAcces(
          "Supprimer " + identite(personne) + " de cette réservation ?",
          false,
          { titre:"Supprimer cet invité ?", conserver:"Non", supprimer:"Oui, supprimer" }
        );
        if (!ok || fermeture) return;
        annulations.set(id,{idmembre:id,invit:"cancd"});
        afficherMessage("");
        afficherLignes();
      }

      const corbeille = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v6m4-6v6"/></svg>';
      const croix = effacer.innerHTML;
      function afficherLignes() {
        const actifs = restants();
        liste.replaceChildren();
        const principal = actifs[0] || null;
        if (principal) {
          champ.value = identite(principal);
          champ.readOnly = true;
          effacer.innerHTML = corbeille;
          effacer.title = "Supprimer cet invité";
          effacer.setAttribute("aria-label","Supprimer cet invité");
        } else {
          champ.readOnly = false;
          champ.value = adresseSaisie;
          effacer.innerHTML = croix;
          effacer.title = "Effacer";
          effacer.setAttribute("aria-label","Effacer l'adresse e-mail");
        }
        actifs.slice(1).forEach(personne => {
          const item = document.createElement("li");
          item.className = "lcdp-box-card-listinvites-oui-non__item";
          item.appendChild(textEl("span", "lcdp-box-card-listinvites-oui-non__identite", identite(personne)));
          const bouton = document.createElement("button");
          bouton.type = "button";
          bouton.className = "lcdp-button lcdp-button-secondary";
          bouton.textContent = "Supprimer";
          bouton.addEventListener("click", () => demanderRetrait(personne));
          item.appendChild(bouton);
          liste.appendChild(item);
        });
        liste.classList.toggle("lcdp-box-card-listinvites-oui-non__list", actifs.length > 1);
        liste.hidden = actifs.length <= 1;
      }

      champ.addEventListener("input",() => { if (!champ.readOnly) adresseSaisie = champ.value; });
      effacer.addEventListener("click",async () => {
        const premier = restants()[0];
        if (premier) return demanderRetrait(premier);
        adresseSaisie = "";
        champ.value = "";
        champ.focus();
      });
      ajouter.addEventListener("click",async () => {
        await afficherInformationMesAcces("L’action n’est pas autorisée actuellement.", "Information");
      });
      sansEmail.addEventListener("click",async () => {
        await afficherInformationMesAcces("Cette fonctionnalité n’est pas disponible actuellement.", "Information");
      });
      annuler.addEventListener("click",fermer);

      document.addEventListener("keydown",gererEchap);
      afficherLignes();

      formulaire.addEventListener("submit",async event => {
        event.preventDefault();
        if (enregistrementEnCours) return;
        const actifs = restants();
        const valeur = !actifs.length ? champ.value.trim().toLowerCase() : "";
        if (actifs.length && valeur) {
          afficherMessage("Une seule invitation est autorisée par accès.",true);
          return;
        }
        if (valeur && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeur)) {
          afficherMessage("Saisissez une adresse e-mail valide.",true);
          return;
        }
        if (!annulations.size && !valeur) {
          afficherMessage(actifs.length ? "Aucune modification à enregistrer." : "Saisissez l’adresse e-mail de l’invité.");
          return;
        }
        enregistrementEnCours = true;
        [inviter,ajouter,sansEmail,annuler,effacer].forEach(x => x.disabled = true);
        inviter.textContent = "Enregistrement…";
        afficherMessage("Mise à jour des invitations en cours.");
        try {
          const resultat = await getJson(invitationsApi + "/invites", {
            method:"POST",
            body:{
              idflux:r.idflux,
              invites:Array.from(annulations.values()),
              emails:valeur ? [valeur] : [],
              personnesSansEmail:[]
            }
          });
          enregistrementEnCours = false;
          fermer();
          await recharger();
          await afficherInformationMesAcces(resultat.message || "Liste des invités mise à jour.", "Information");
        } catch (erreur) {
          if (fermeture) {
            await afficherInformationMesAcces("Invitations enregistrées, mais la liste n’a pas pu être actualisée.", "Information");
          } else {
            afficherMessage(erreur.message || "Enregistrement impossible. La saisie est conservée.",true);
          }
        } finally {
          enregistrementEnCours = false;
          if (!fermeture) {
            [inviter,ajouter,sansEmail,annuler,effacer].forEach(x => x.disabled = false);
            inviter.textContent = "Inviter et mettre à jour";
          }
        }
      });
      // Focus initial sur la box ; le champ reste accessible au clavier.
      const zoneFormulaire = overlay.querySelector("[data-lcdp-invitation-wrapper]");
      if (zoneFormulaire) {
        zoneFormulaire.tabIndex = -1;
        zoneFormulaire.focus({ preventScroll: true });
      }
    } catch (erreur) {
      restaurerVue();
      await afficherInformationMesAcces(erreur.message || "Impossible de consulter les invitations.", "Information");
    }
  }

  async function confirmerAnnulationAcces(question, invitationRecue, options = {}) {
    const urlObjet = chemin => typeof window.LCDP_urlObjet === "function"
      ? window.LCDP_urlObjet(chemin)
      : String(config.objetBaseUrl || config.OBJET_BASE || "https://lacleduparc.fr/OBJET").replace(/\/+$/, "") + chemin;
    const focusInitial = document.activeElement;
    let conteneur = null;
    try {
      const css = urlObjet("/CSSBASE/lcdp-lightbox-convergence.css");
      if (![...document.querySelectorAll('link[rel="stylesheet"]')].some(lien => lien.href === new URL(css, document.baseURI).href)) {
        await new Promise((resolve, reject) => {
          const lien = document.createElement("link");
          lien.rel = "stylesheet";
          lien.href = css;
          lien.onload = resolve;
          lien.onerror = () => { lien.remove(); reject(new Error("CSS SUPPRESSION indisponible.")); };
          document.head.appendChild(lien);
        });
      }
      const reponse = await fetch(urlObjet("/HTMLBASE/02-dialogue-reference-suppression.html"), { cache: "no-cache" });
      if (!reponse.ok) return false;
      const modele = document.createElement("template");
      modele.innerHTML = (await reponse.text()).trim();
      conteneur = document.createElement("div");
      conteneur.appendChild(modele.content.cloneNode(true));
      const dialogue = conteneur.querySelector('[data-lcdp-dialogue-reference="suppression"]');
      const titre = conteneur.querySelector("[data-lcdp-dialogue-titre]");
      const texte = conteneur.querySelector("[data-lcdp-dialogue-message]");
      const conserver = conteneur.querySelector('[data-lcdp-dialogue-action="conserver"]');
      const supprimer = conteneur.querySelector('[data-lcdp-dialogue-action="supprimer"]');
      if (!dialogue || !titre || !texte || !conserver || !supprimer) return false;
      if (document.querySelector('[data-lcdp-invitation-invites-overlay]')) dialogue.style.zIndex = "12000";
      titre.textContent = options.titre || "Annuler cet accès ?";
      texte.textContent = question;
      conserver.textContent = options.conserver || "Conserver";
      supprimer.textContent = options.supprimer || "Oui, annuler";
      document.body.appendChild(conteneur);
      conserver.focus();
      return await new Promise(resolve => {
        let termine = false;
        function fermer(valeur) {
          if (termine) return;
          termine = true;
          document.removeEventListener("keydown", gererClavier);
          conteneur.remove();
          if (focusInitial?.isConnected && typeof focusInitial.focus === "function") focusInitial.focus();
          resolve(valeur);
        }
        function gererClavier(event) {
          if (event.key === "Escape") { event.preventDefault(); fermer(false); }
          if (event.key === "Tab") {
            const cible = event.shiftKey ? conserver : supprimer;
            if (document.activeElement === cible) {
              event.preventDefault();
              (event.shiftKey ? supprimer : conserver).focus();
            }
          }
        }
        document.addEventListener("keydown", gererClavier);
        conserver.addEventListener("click", () => fermer(false), { once: true });
        supprimer.addEventListener("click", () => fermer(true), { once: true });
        dialogue.addEventListener("click", event => { if (event.target === dialogue) fermer(false); });
      });
    } catch (erreur) {
      console.error("Confirmation d'annulation indisponible :", erreur);
      return false;
    } finally {
      conteneur?.remove();
    }
  }

  async function demanderAnnulation(r) {
    if (etat.annulationEnCours || etat.periode !== 'avenir') return;
    if (!r.idflux) return afficherErreurMesAcces('Identifiant de réservation manquant.');
    const jour = dateIsoParis(r);
    if (!jour) return afficherInformationMesAcces('Date de réservation indisponible.', 'Information');
    const [annee, mois, date] = jour.split('-').map(Number);
    const veille = new Date(Date.UTC(annee, mois - 1, date - 1));
    const cible = new Intl.DateTimeFormat('fr-CA', {timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});
    const veilleIso = veille.toISOString().slice(0,10);
    const limite = [12,13].map(heure => Date.UTC(annee, mois - 1, date - 1, heure))
      .find(timestamp => {
        const parties = Object.fromEntries(cible.formatToParts(new Date(timestamp)).map(part => [part.type,part.value]));
        return [parties.year,parties.month,parties.day].join('-') === veilleIso && parties.hour === '14';
      });
    if (limite === undefined) return afficherInformationMesAcces('Date limite d’annulation indisponible.', 'Information');
    if (Date.now() >= limite) return afficherInformationMesAcces('Annulation impossible après 14h', 'Information');
    const nombre = estRecue(r) ? 0 : statsActifs(r);
    const question = nombre > 0 ? '(' + nombre + ' invité' + (nombre > 1 ? 's' : '') + ')' : '';
    if (!await confirmerAnnulationAcces(question, estRecue(r))) return;
    etat.annulationEnCours = true;
    try {
      await getJson(planningApi + '/annuler-reservation', {method:'POST', body: {idflux: r.idflux}});
      await recharger();
      await afficherInformationMesAcces('Annulation enregistrée.', 'Confirmation');
    } catch (e) {
      await afficherErreurMesAcces(e.message || 'Annulation impossible.');
    } finally { etat.annulationEnCours = false; }
  }

  // Structure reprenant HTMLBASE/04-card-parc-diaporama.html.
  // Une panne de téléchargement de fragment ne doit jamais empêcher le chargement des réservations.
  // Structure conforme aux classes du composant officiel 04-card-parc-diaporama.
  function creerModeleCarte() {
    const template=document.createElement('template');
    template.innerHTML=`<article class="lcdp-box-card-parc-diaporama" data-lcdp-card-parc-diaporama>
      <div class="lcdp-box-card-parc-diaporama__scene"><div class="lcdp-box-card-parc-diaporama__faces">
        <div class="lcdp-box-card-parc-diaporama__face lcdp-box-card-parc-diaporama__face--recto">
          <button class="lcdp-box-card-parc-diaporama__ouvrir" type="button" data-lcdp-diaporama-retourner aria-expanded="false" aria-label="Détails de l'accès">
            <span class="lcdp-box-card-parc__media lcdp-box-card-parc__media--avec-nom">
              <img class="lcdp-box-card-parc__image" data-lcdp-diaporama-image alt="" loading="lazy" decoding="async">
              <span class="lcdp-box-card-parc__nom-image" data-lcdp-diaporama-nom></span>
            </span>
          </button>
        </div>
        <div class="lcdp-box-card-parc-diaporama__face lcdp-box-card-parc-diaporama__face--verso lcdp-box-card-parc--reserver" data-lcdp-diaporama-dos aria-hidden="true">
          <button type="button" class="lcdp-box-card-parc-diaporama__fermer" data-lcdp-diaporama-fermer aria-label="Revenir à la photo">×</button>
          <div class="lcdp-box-card-parc-diaporama__contenu">
            <div class="lcdp-box-card-parc__body">
              <div class="lcdp-box-card-parc__text"><h3 class="lcdp-box-card-parc__title" data-lcdp-diaporama-nom-dos></h3></div>
              <p class="lcdp-box-card-parc__description" data-lcdp-diaporama-description style="margin:2px 0 8px"></p>\n               <div class="lcdp-box-card-parc__actions--reserver" data-lcdp-diaporama-actions></div>
            </div>
          </div>
        </div>
      </div></div>
    </article>`;
    return template.content.firstElementChild;
  }
  async function recharger() {
    if (!planningApi) {
      msg('Le service des accès n’est pas configuré.', true);
      return;
    }
    msg('Chargement de vos accès…');
    try {
      const data = await getJson(planningApi + '/mes-reservations');
      if (!Array.isArray(data.reservations)) throw new Error('Liste des accès indisponible.');
      etat.reservations = data.reservations.filter(r => dateValide(r) !== null);
      etat.reservationsChargees = true;
      synchroniserFiltres();
      afficher();
    } catch (e) {
      etat.reservationsChargees = false;
      ui.resultat.textContent = '';
      console.error('[MES ACCÈS] Chargement/rendu des réservations :', e);
      // Ne pas masquer une erreur réseau en affichant « Aucun accès ».
      msg(e.message || 'Impossible de charger vos accès.', true);
    }
  }
  async function chargerStatutsInvitations() {
    if (!etat.reservationsChargees) return;
    if (!invitationsApi) {
      etat.disponibiliteStats = false;
      etat.erreurStats = true;
      afficher();
      return;
    }
    try {
      const data = await getJson(invitationsApi + '/reservations-invitables');
      if (!Array.isArray(data.reservations)) throw new Error('Statuts des invitations indisponibles.');
      etat.donneesInvitations = new Map();
      for (const r of data.reservations) {
        if (r.idflux) etat.donneesInvitations.set(String(r.idflux), r.invitationStats || r.invitationsStats || {});
      }
      etat.disponibiliteStats = true;
      etat.erreurStats = false;
    } catch (e) {
      console.warn('[MES ACCÈS] Statuts des invitations indisponibles :', e);
      etat.erreurStats = true;
      etat.disponibiliteStats = false;
      etat.filtre.envoyees = false;
    }
    afficher();
  }

  function brancher() {
    ui.onglets.forEach(button => button.addEventListener('click', () => {
      etat.periode = button.dataset.lcdpPeriode;
      afficher();
    }));
    ui.date.addEventListener('change', () => { etat.filtre.date = ui.date.value; afficher(); });
    ui.parc.addEventListener('change', () => { etat.filtre.parc = ui.parc.value; afficher(); });
    ui.departement.addEventListener('change', () => { etat.filtre.departement = ui.departement.value; afficher(); });
    ui.recues.addEventListener('click', () => { etat.filtre.recues = !etat.filtre.recues; afficher(); });
    ui.envoyees.addEventListener('click', () => {
      if (!etat.disponibiliteStats) return;
      etat.filtre.envoyees = !etat.filtre.envoyees;
      afficher();
    });
    ui.effacer.addEventListener('click', () => {
      etat.filtre = { date:'', parc:'', departement:'', recues:false, envoyees:false };
      ui.date.value = '';
      ui.parc.value = '';
      ui.departement.value = '';
      afficher();
    });
  }

  async function initialiser() {
    void afficherStatutMembre();
    brancher();
    etat.cardModele = creerModeleCarte();
    majOngletsEtFiltres();
    await recharger();
    if (etat.reservationsChargees) {
      // Les invitations sont facultatives pour le premier affichage du portefeuille.
      void chargerStatutsInvitations().catch(erreur => {
        console.error('[MES ACCÈS] Invitations :', erreur);
        etat.disponibiliteStats = false;
        etat.erreurStats = true;
        try { afficher(); } catch (erreurAffichage) { console.error('[MES ACCÈS] Affichage :', erreurAffichage); }
      });
    }
  }
  function demarrer() {
    initialiser().catch(erreur => {
      console.error('[MES ACCÈS] Initialisation :', erreur);
      // L'erreur exacte est visible sur la page, sans demander au membre d'ouvrir F12.
      msg('Erreur d’initialisation : ' + (erreur?.message || 'erreur inconnue'), true);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer, {once:true});
  } else demarrer();
})();
