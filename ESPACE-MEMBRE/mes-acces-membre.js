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
    onglets: Array.from(root.querySelectorAll('[data-lcdp-periode]')),
    planning: document.getElementById('lcdp-mes-acces-planning'),
    grillePlanning: null,
    moisPlanning: null,
    precedentPlanning: null,
    suivantPlanning: null,
    listeConteneur: document.getElementById('lcdp-mes-acces-liste-conteneur')
  };
  if (!ui.liste || !ui.message || !ui.filtres || ui.onglets.length !== 3 || !ui.planning) return;

  const etat = {
    periode: 'avenir',
    reservations: [],
    moisPlanning: (() => {
      const d = new Date();
      return {annee:d.getFullYear(),mois:d.getMonth()+1};
    })(),
    filtre: { date: '', parc: '', departement: '', recues: false, envoyees: false },
    donneesInvitations: new Map(),
    disponibiliteStats: false,
    erreurStats: false,
    cardModele: null,
    reservationsChargees: false,
    templateJour: null,
    calendrierPret: false,
    annulationEnCours: false
  };

  function endpoint(cle, ancienne, service) {
    const value = config[cle] || config[ancienne] ||
      (typeof config.apiUrl === 'function' ? config.apiUrl(service) : '');
    return String(value || '').replace(/\/+$/, '');
  }
  const planningApi = endpoint('workerPlanningMembreUrl', 'WORKER_PLANNING_MEMBRE_URL', 'planning-membre-api');
  const invitationsApi = endpoint('workerInviterMembreUrl', 'WORKER_INVITER_MEMBRE_URL', 'inviter-membre-api');
  const indexApi = endpoint('workerIndexMembreUrl','WORKER_INDEX_MEMBRE_URL','index-membre-api');

  async function initialiserStatutMembre() {
    const mention = document.getElementById('mention-statut-membre');
    if (!mention || !indexApi) return;
    try {
      const data = await getJson(indexApi + '/index');
      mention.textContent = vrai(data.abonne) ? 'MEMBRE ABONNÉ' : 'MEMBRE INVITÉ';
      mention.hidden = false;
    } catch (erreur) {
      console.warn('[MES ACCÈS] Statut membre non vérifié :', erreur);
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
    nom.replaceChildren(textEl('span', '', lieu), textEl('span', '', ' — ' + dat + (h ? ' à ' + h : '')));
    titre.textContent = lieu;
    recto.setAttribute('aria-label', 'Détails de votre accès au ' + lieu + ', le ' + dat);
    description.textContent = [dat + (h ? ' à ' + h : ''), dept ? 'Département ' + dept : '', labelType]
      .filter(Boolean).join(' · ');

    if (r.parc?.adresse1 || r.parc?.entreeparc) {
      const infos = [r.parc?.adresse1, r.parc?.adresse2, r.parc?.adresse3, r.parc?.entreeparc]
        .map(v => String(v || '').trim()).filter(Boolean).join(' — ');
      if (infos) description.appendChild(textEl('span', '', ' · ' + infos));
    }
    const ajouterBouton = (libelle, action, style='lcdp-button-secondary') => {
      const b = textEl('button', 'lcdp-button lcdp-box-card-parc__action ' + style, libelle);
      b.type = 'button';
      b.addEventListener('click', action);
      actions.appendChild(b);
    };

    // Invitations déjà enregistrées : consultation via le Worker existant.
    if (estRecue(r)) {
      ajouterBouton('Invitation reçue', () => montrerParrain(r));
    } else if (estEnvoyee(r)) {
      ajouterBouton('Voir les invités', () => montrerInvites(r));
    }
    if (etat.periode === 'avenir' && !statutAnnule(r)) {
      const delaiDepasse = dateValide(r) !== null && Date.now() >= dateValide(r) - 30 * 60 * 1000;
      const annuler = textEl('button', 'lcdp-button lcdp-box-card-parc__action lcdp-button-orange', estRecue(r) ? 'Annuler mon invitation' : 'Annuler cet accès');
      annuler.type = 'button';
      annuler.disabled = delaiDepasse;
      if (delaiDepasse) annuler.title = 'Délai d’annulation dépassé';
      annuler.addEventListener('click', () => void demanderAnnulation(r));
      actions.appendChild(annuler);
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

  // Même composant HTMLBASE, mêmes classes et mêmes règles que PLANIFIER sans parc.
  async function initialiserCalendrierPersonnel() {
    if (etat.calendrierPret) return;
    const charger = async chemin => {
      const url = typeof window.LCDP_urlObjet === 'function'
        ? window.LCDP_urlObjet(chemin) : chemin;
      const response = await fetch(url,{credentials:'omit',cache:'no-store'});
      if (!response.ok) throw new Error('Composant calendrier indisponible.');
      const template=document.createElement('template');
      template.innerHTML=await response.text();
      return template.content;
    };
    const [contenu,jour,legendeFragment] = await Promise.all([
      charger('/HTMLBASE/04-calendrier-mois.html'),
      charger('/HTMLBASE/04-card-jour-in-calendrier-mois.html'),
      charger('/HTMLBASE/04-legende.html')
    ]);
    const calendrier=contenu.querySelector('[data-lcdp-box-calendrier-mois]');
    const jourModele=jour.querySelector('[data-lcdp-card-jour-mois]');
    if (!calendrier || !jourModele) throw new Error('Structure calendrier incomplète.');
    calendrier.removeAttribute('role');
    calendrier.removeAttribute('aria-modal');
    calendrier.classList.add('lcdp-box-calendrier-mois--inline');
    const fermeture=calendrier.querySelector('[data-lcdp-calendrier-mois-close]');
    fermeture?.remove();
    const entete=calendrier.querySelector('[data-lcdp-calendrier-mois-header]');
    calendrier.querySelector('.lcdp-box-calendrier-mois__header')?.remove();
    const navigation=calendrier.querySelector('.lcdp-box-calendrier-mois__navigation');
    const grille=calendrier.querySelector('[data-lcdp-calendrier-mois-grid]');
    if (!navigation || !grille) throw new Error('Navigation calendrier indisponible.');
    const legende=legendeFragment.querySelector('[data-lcdp-box-legende]')?.cloneNode(true);
    if (legende) {
      legende.className='lcdp-box-legende lcdp-planifier-legende-planning';
      legende.setAttribute('aria-label','Légende des accès');
      const contenuLegende=legende.querySelector('[data-lcdp-legende-contenu]');
      if (contenuLegende) {
        contenuLegende.replaceChildren();
        const ligne=document.createElement('div');
        ligne.className='lcdp-box-legende__ligne';
        for(const [texte,classe] of [
          ['accès planifié dans un parc','lcdp-box-legende__carre--bleu-fonce'],
          ['invitation reçue pour un parc','lcdp-box-legende__carre--bleu-clair']
        ]) {
          const item=document.createElement('span');
          item.className='lcdp-box-legende__item';
          const carre=document.createElement('span');
          carre.className='lcdp-box-legende__carre '+classe;
          carre.setAttribute('aria-hidden','true');
          const libelle=document.createElement('span');
          libelle.className='lcdp-box-legende__libelle';
          libelle.textContent=texte;
          item.append(carre,libelle);
          ligne.appendChild(item);
        }
        contenuLegende.appendChild(ligne);
      }
      grille.after(legende);
    }
    ui.planning.querySelector('#lcdp-planifier-calendrier-slot').replaceChildren(calendrier);
    ui.grillePlanning=grille;
    ui.moisPlanning=calendrier.querySelector('[data-lcdp-calendrier-mois-current]');
    ui.precedentPlanning=calendrier.querySelector('[data-lcdp-calendrier-mois-prev]');
    ui.suivantPlanning=calendrier.querySelector('[data-lcdp-calendrier-mois-next]');
    etat.templateJour=jourModele;
    const changerMois=ecart=>{
      const d=new Date(etat.moisPlanning.annee,etat.moisPlanning.mois-1+ecart,1);
      etat.moisPlanning={annee:d.getFullYear(),mois:d.getMonth()+1};
      afficherPlanningPersonnel();
    };
    ui.precedentPlanning.addEventListener('click',()=>changerMois(-1));
    ui.suivantPlanning.addEventListener('click',()=>changerMois(1));
    etat.calendrierPret=true;
  }

  function afficherPlanningPersonnel() {
    if (!etat.calendrierPret) return;
    const {annee,mois}=etat.moisPlanning;
    const moisDate=new Date(annee,mois-1,1);
    ui.moisPlanning.textContent=new Intl.DateTimeFormat('fr-FR',{
      month:'long',year:'numeric'
    }).format(moisDate).replace(/^./,c=>c.toUpperCase());
    ui.grillePlanning.replaceChildren();
    const decalage=(moisDate.getDay()+6)%7;
    const nombreJours=new Date(annee,mois,0).getDate();
    const aujourdHui=dateIsoParis(Date.now());
    const parDate=new Map();
    for(const reservation of etat.reservations) {
      if (statutAnnule(reservation) || estPasse(reservation)) continue;
      const date=dateIsoParis(reservation);
      const plage=String(reservation.plagebookd||'');
      if(!/^plage[1-5]$/.test(plage))continue;
      if(!parDate.has(date))parDate.set(date,new Map());
      const byPlage=parDate.get(date);
      if(!byPlage.has(plage))byPlage.set(plage,{acces:false,invitation:false,parcs:[]});
      const e=byPlage.get(plage);
      if(estRecue(reservation))e.invitation=true;
      else e.acces=true;
      const parc=nomParc(reservation);
      if(parc && parc!=='Parc')e.parcs.push(parc);
    }
    for(let i=0;i<decalage;i++) {
      const vide=etat.templateJour.cloneNode(true);
      vide.classList.add('lcdp-box-card-jour-in-calendrier-mois--empty');
      vide.disabled=true;
      vide.setAttribute('aria-hidden','true');
      ui.grillePlanning.appendChild(vide);
    }
    for(let jour=1;jour<=nombreJours;jour++) {
      const iso=annee+'-'+String(mois).padStart(2,'0')+'-'+String(jour).padStart(2,'0');
      const card=etat.templateJour.cloneNode(true);
      card.classList.add('lcdp-box-card-jour-in-calendrier-mois--planning-lecture','lcdp-planifier-jour--sans-parc');
      card.dataset.date=iso;
      card.querySelector('[data-lcdp-card-jour-mois-number]').textContent=String(jour);
      if(iso<aujourdHui) {
        card.classList.add('lcdp-box-card-jour-in-calendrier-mois--past');
        card.disabled=true;
      }else if(iso===aujourdHui)card.classList.add('lcdp-box-card-jour-in-calendrier-mois--today');
      const plages=parDate.get(iso);
      const info=[];
      for(let p=1;p<=5;p++) {
        const cle='plage'+p;
        const segment=card.querySelector('[data-lcdp-card-jour-mois-slot="'+cle+'"]');
        segment.hidden=true;
        const e=plages?.get(cle);
        if(!e)continue;
        segment.hidden=false;
        segment.classList.add(e.acces&&e.invitation?'lcdp-planifier-plage--acces-et-invitation':
          e.invitation?'lcdp-planifier-plage--invitation-recue':'lcdp-planifier-plage--acces-personnel');
        const nature=e.acces&&e.invitation?'accès et invitation':
          e.invitation?'invitation reçue':'accès planifié';
        info.push('plage '+p+' : '+nature+(e.parcs.length?' ('+[...new Set(e.parcs)].join(', ')+')':''));
      }
      const texte=iso+(info.length?' · '+info.join(' · '):' · aucun accès');
      card.title=texte;
      card.setAttribute('aria-label',texte);
      // Lecture seule sans griser artificiellement les jours futurs.
      card.tabIndex=-1;
      ui.grillePlanning.appendChild(card);
    }
  }

  function afficher() {
    majOngletsEtFiltres();
    if (etat.periode === 'planning') {
      if (!etat.calendrierPret) {
        initialiserCalendrierPersonnel()
          .then(()=>afficherPlanningPersonnel())
          .catch(erreur=>{ui.message.hidden=false;ui.message.textContent=erreur.message;});
      } else afficherPlanningPersonnel();
      return;
    }
    const periode = periodeReservations();
    const visibles = etat.periode === 'avenir' ? periode.filter(passeFiltres) : periode;
    const fragment = document.createDocumentFragment();
    visibles.forEach(r => fragment.appendChild(creerCarte(r)));
    ui.liste.replaceChildren(fragment);
    ui.resultat.textContent = visibles.length + ' accès affiché' + (visibles.length > 1 ? 's' : '');
    if (etat.erreurStats && etat.periode === 'avenir') {
      ui.resultat.textContent += ' · Le filtre « Invitations envoyées » est indisponible.';
    }
    if (!visibles.length) {
      msg(periode.length > 0 && etat.periode === 'avenir' && actifsFiltres()
        ? 'Aucun accès ne correspond aux filtres sélectionnés.'
        : etat.periode === 'avenir' ? 'Vous n’avez aucun accès à venir.' : 'Vous n’avez aucun accès passé.');
    } else masqueMsg();
  }

  function montrerParrain(r) {
    const parrain = r.parrainInvitation || r.parrain || {};
    const alias = String(parrain.affichage || parrain.alias || parrain.aliasmembre || '').trim();
    const prenom = String(parrain.prenommembre || parrain.prenom || '').trim();
    const nom = String(parrain.nommembre || parrain.nom || '').trim();
    const identite = alias || [prenom, nom ? nom[0].toUpperCase() + '.' : ''].filter(Boolean).join(' ');
    window.alert('Invitation par : ' + (identite || 'Information indisponible'));
  }
  async function montrerInvites(r) {
    if (!invitationsApi) return window.alert('Le service des invitations est indisponible.');
    try {
      const data = await getJson(invitationsApi + '/invites?idflux=' + encodeURIComponent(String(r.idflux)));
      const invites = Array.isArray(data.invites) ? data.invites : [];
      if (!invites.length) return window.alert('Aucun invité enregistré pour cet accès.');
      const lignes = invites.map(i => {
        const label = [i.prenom || i.prenommembre, i.nom || i.nommembre].filter(Boolean).join(' ');
        return label || i.email || i.emailinvite || 'Invité';
      });
      window.alert('Invités :\n' + lignes.join('\n'));
    } catch (e) { window.alert(e.message || 'Impossible de consulter les invités.'); }
  }
  async function demanderAnnulation(r) {
    if (etat.annulationEnCours || etat.periode !== 'avenir') return;
    if (!r.idflux) return window.alert('Identifiant de réservation manquant.');
    const question = estRecue(r)
      ? 'Annuler cette invitation reçue ? L’invitant sera informé selon les règles du service.'
      : 'Annuler cet accès ? Les invitations associées seront traitées par le service de réservation.';
    if (!window.confirm(question)) return;
    etat.annulationEnCours = true;
    try {
      await getJson(planningApi + '/annuler-reservation', {method:'POST', body: {idflux: r.idflux}});
      await recharger();
      window.alert('Annulation enregistrée.');
    } catch (e) {
      window.alert(e.message || 'Annulation impossible.');
    } finally { etat.annulationEnCours = false; }
  }

  // Structure reprenant HTMLBASE/04-card-parc-diaporama.html.
  // Une panne de téléchargement de fragment ne doit jamais empêcher le chargement des réservations.
  function creerModeleCarte() {
    const template = document.createElement('template');
    template.innerHTML = `<article class="lcdp-box-card-parc-diaporama" data-lcdp-card-parc-diaporama>
      <div class="lcdp-box-card-parc-diaporama__scene"><div class="lcdp-box-card-parc-diaporama__faces">
        <div class="lcdp-box-card-parc-diaporama__face lcdp-box-card-parc-diaporama__face--recto">
          <button type="button" class="lcdp-box-card-parc-diaporama__ouvrir" data-lcdp-diaporama-retourner aria-expanded="false" aria-label="Détails de l'accès">
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
              <div class="lcdp-box-card-parc__text">
                <h3 class="lcdp-box-card-parc__title" data-lcdp-diaporama-nom-dos></h3>
              </div>
              <div class="lcdp-box-card-parc__actions--reserver" data-lcdp-diaporama-actions></div>
              <p class="lcdp-box-card-parc__description" data-lcdp-diaporama-description></p>
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
    void initialiserStatutMembre();
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
