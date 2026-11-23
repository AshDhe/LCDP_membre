/* Consultation des CGV publiées : session membre exigée par le Worker.
   Présentation calquée sur reglement-app.html et reglement-club.html. */
(() => {
  'use strict';

  const cfg = window.SITE_CONFIG || {};
  const API = String(
    cfg.workerEditingAdminUrl ||
    cfg.WORKER_EDITING_ADMIN_URL ||
    'https://editing-admin-api.lacleduparc.fr'
  ).replace(/\/+$/, '');

  const status = document.getElementById('lcdp-cgv-status');
  const contenu = document.getElementById('lcdp-cgv-contenu');
  const date = document.getElementById('lcdp-cgv-date');

  const autorises = new Set(['P','BR','STRONG','EM','UL','OL','LI','A']);

  function construireUrl(base, chemin) {
    return String(base || '').replace(/\/+$/, '') + '/' + String(chemin || '').replace(/^\/+/, '');
  }

  function urlPublic(chemin) {
    return typeof cfg.publicUrl === 'function'
      ? cfg.publicUrl(chemin)
      : construireUrl(cfg.publicBaseUrl || cfg.PUBLIC_BASE || 'https://lacleduparc.fr', chemin);
  }

  function urlMembre(chemin) {
    return typeof cfg.membreUrl === 'function'
      ? cfg.membreUrl(chemin)
      : construireUrl(cfg.membreBaseUrl || cfg.MEMBRE_BASE || cfg.siteBase || location.origin, chemin);
  }

  function urlObjet(chemin) {
    return typeof cfg.objetUrl === 'function'
      ? cfg.objetUrl(chemin)
      : construireUrl(cfg.objetBaseUrl || cfg.OBJET_BASE || urlPublic('/OBJET'), chemin);
  }

  function appliquerRoutesSite(racine) {
    racine.querySelectorAll('[data-site-href]').forEach(element => {
      const chemin = element.dataset.siteHref || '';
      element.href = element.dataset.space === 'membre' ? urlMembre(chemin) : urlPublic(chemin);
    });
    racine.querySelectorAll('[data-site-src]').forEach(element => {
      element.src = urlObjet((element.dataset.siteSrc || '').replace(/^\/?OBJET\/?/, '/'));
    });
  }

  async function chargerFragment(url) {
    const res = await fetch(url, { credentials: 'omit', cache: 'no-cache' });
    if (!res.ok) throw new Error('Fragment indisponible : ' + url);
    const tpl = document.createElement('template');
    tpl.innerHTML = (await res.text()).trim();
    return tpl.content.cloneNode(true);
  }

  async function initialiserBandeau() {
    const slot = document.getElementById('lcdp-bandeau-slot');
    slot.replaceChildren(await chargerFragment(urlMembre('/ESPACE-MEMBRE/box-bandeau-nav-membre.html')));
    appliquerRoutesSite(slot);

    const cheminBurger = '/ESPACE-MEMBRE/box-menu-burger-membre.js?v=20261120-presentation-abonnements';
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = urlMembre(cheminBurger);
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Menu membre indisponible.'));
      document.body.appendChild(script);
    });

    if (typeof window.LCDP_initialiserMenuBurgerMembre === 'function') {
      await window.LCDP_initialiserMenuBurgerMembre();
    }
  }

  async function initialiserFooter() {
    const slot = document.getElementById('lcdp-footer-slot');
    slot.replaceChildren(await chargerFragment(urlObjet('/HTMLBASE/02-footer.html')));
    appliquerRoutesSite(slot);
  }

  function nettoyerHtml(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html || '');
    tpl.content.querySelectorAll('script,style,iframe,object,embed,svg,math,form,input,button,textarea,select,template')
      .forEach(n => n.remove());
    [...tpl.content.querySelectorAll('*')].reverse().forEach(n => {
      if (!autorises.has(n.tagName)) { n.replaceWith(...n.childNodes); return; }
      [...n.attributes].forEach(attr => {
        if (n.tagName === 'A' && attr.name.toLowerCase() === 'href') {
          const h = attr.value.trim();
          const compact = h.replace(/[\x00-\x20\x7f]/g, '').toLowerCase();
          if (h.startsWith('//') || !/^(https:\/\/|mailto:|tel:|\/(?!\/)|#|\.\/|\.\.\/)/.test(compact)) {
            n.removeAttribute(attr.name);
          }
        } else n.removeAttribute(attr.name);
      });
      if (n.tagName === 'A' && n.hasAttribute('href')) n.setAttribute('rel', 'noopener noreferrer');
    });
    return tpl.innerHTML;
  }

  function message(s) {
    status.textContent = s;
    status.hidden = false;
    contenu.replaceChildren();
    contenu.setAttribute('aria-busy', 'false');
  }

  async function chargerCGV() {
    try {
      const res = await fetch(API + '/membre/cgv', {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || data?.success !== true) {
        if (res.status === 401) {
          message('Connectez-vous à votre compte membre pour consulter les CGV.');
          const a = document.createElement('a');
          a.href = urlPublic('/ESPACE-PUBLIC/connexion-membre.html');
          a.textContent = 'Se connecter';
          status.append(document.createElement('br'), a);
        } else {
          message(data?.message || 'CGV indisponibles.');
        }
        return;
      }

      if (!Array.isArray(data.blocs) || !data.blocs.length) {
        message('CGV non publiées.');
        return;
      }

      const fragment = document.createDocumentFragment();
      for (const bloc of data.blocs) {
        const enveloppe = document.createElement('div');
        const section = document.createElement('section');
        section.className = 'lcdp-component lcdp-boxtext';
        section.setAttribute('data-lcdp-boxtext', '');

        const titre = String(bloc?.titre || '');
        const h2 = document.createElement('h2');
        h2.className = 'lcdp-boxtext__title';
        h2.textContent = titre;

        // Même numérotation visuelle que les règlements ; aucun titre administratif modifié.
        if (!/^\s*(?:(?:article|section|chapitre)\s*)?\d+(?=\s|[.):\-])/i.test(titre)) {
          enveloppe.classList.add('lcdp-legal-section--numerotation-auto');
        }

        const texte = document.createElement('div');
        texte.className = 'lcdp-boxtext__content';
        texte.innerHTML = nettoyerHtml(bloc?.html);

        section.append(h2, texte);
        enveloppe.append(section);
        fragment.append(enveloppe);
      }

      contenu.replaceChildren(fragment);
      contenu.setAttribute('aria-busy', 'false');
      status.hidden = true;

      (window.LCDP_affichagesLegauxEnAttente ||= []).push('cgv');
      window.dispatchEvent(new Event('lcdp:affichage-legal'));

      if (data.datepublication) {
        const d = new Date(data.datepublication);
        if (!Number.isNaN(d.valueOf())) {
          date.textContent = 'Version publiée le ' + new Intl.DateTimeFormat('fr-FR', {
            timeZone: 'Europe/Paris',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          }).format(d);
          date.hidden = false;
        }
      }
    } catch (e) {
      console.error('Chargement des CGV :', e);
      message('Impossible de charger les CGV.');
    } finally {
      window.LCDP_terminerAttentePageMembre?.();
    }
  }

  // Le chargement des éléments de navigation n'empêche pas la consultation des CGV.
  initialiserBandeau().catch(error => console.warn('Bandeau membre :', error));
  initialiserFooter().catch(error => console.warn('Footer :', error));
  chargerCGV();
})();
