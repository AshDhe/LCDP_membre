(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};
  const SOURCE_PAGE = "planning-membre";

  const ENDPOINT_PLANNING_MEMBRE = construireEndpointApi(
    "workerPlanningMembreUrl",
    "WORKER_PLANNING_MEMBRE_URL",
    "planning-membre-api"
  );

  const ENDPOINT_INDEX_MEMBRE = construireEndpointApi(
    "workerIndexMembreUrl",
    "WORKER_INDEX_MEMBRE_URL",
    "index-membre-api"
  );

  const ENDPOINT_INVITER_MEMBRE = construireEndpointApi(
    "workerInviterMembreUrl",
    "WORKER_INVITER_MEMBRE_URL",
    "inviter-membre-api"
  );

  const PAGE_CONNEXION_MEMBRE = construireUrlPublic("/ESPACE-PUBLIC/connexion-membre.html");
  let pageInitialisee = false;
  let promesseActualisationEtatMembre = null;

  const etat = {
    reservations: [],
    abonnements: [],
    reservationsAvecInvites: new Set(),
    maxInvitInvitation: 10,
    reservationsParDate: new Map(),
    moisCourant: debutMois(dateAujourdhuiParis()),
    templateJour: null,
    templateReservation: null,
    templateCardParcDiaporama: null,
    templateListeParcsDiaporama: null,
    workflowPlanning: null,
    contenuWorkflowPlanning: null,
    calendrierMois: null,
    wrapperPlanning: null,
    slotPlanning: null,
    slotCommandeListe: null,
    slotCommandeAgenda: null,
    commandeBar: null,
    modeAffichage: "liste",
    periodeAffichage: "avenir",
    filtres: {mois: "", parc: "", departement: "", recues: true, envoyees: true},
    filtresInitialises: false,
    formulaireFiltres: null,
    membre: {
      abonne: false,
      abonnementSuspendu: false,
      abonnementAnnuleNonPaye: false,
      paiementSuspension: null
    }
  };

  const PLAGES = [
    "plage1",
    "plage2",
    "plage3",
    "plage4",
    "plage5"
  ];

  const LEGENDE_AGENDA_MEMBRE = [
    {
      libelle: "Réservation",
      classeCouleur:
        "lcdp-box-card-jour-in-calendrier-mois__slot--vert"
    },
    {
      libelle: "Invitation",
      classeCouleur:
        "lcdp-box-card-jour-in-calendrier-mois__slot--orange-fonce"
    },
    {
      libelle: "Invite",
      classeCouleur:
        "lcdp-box-card-jour-in-calendrier-mois__slot--reservation-invitation"
    }
  ];

  /* Limite provisoire : navigation jusqu'à décembre N+1. */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiserPage);
  } else {
    initialiserPage();
  }


  function injecterStylesCorrectifsPlanningMembre() {
    if (document.querySelector('style[data-lcdp-planning-membre-correctifs="true"]')) return;

    const style = document.createElement("style");
    style.dataset.lcdpPlanningMembreCorrectifs = "true";
    style.textContent = `
      .lcdp-box-card-reservation-membre [data-action="adresse"],
      .lcdp-box-card-reservation-membre .lcdp-box-card-reservation-membre__micro-action--acces {
        border-color: var(--lcdp-color-logo-green) !important;
        background: var(--lcdp-color-logo-green) !important;
        color: #ffffff !important;
        text-decoration: none !important;
      }

      .lcdp-box-card-reservation-membre [data-action="adresse"]:hover,
      .lcdp-box-card-reservation-membre .lcdp-box-card-reservation-membre__micro-action--acces:hover {
        border-color: var(--lcdp-color-primary) !important;
        background: var(--lcdp-color-primary) !important;
        color: #ffffff !important;
      }

      .lcdp-box-card-reservation-membre [data-action="invitation"].lcdp-box-card-reservation-membre__micro-action--invit-recu {
        border-color: #7b4ab8 !important;
        background: #7b4ab8 !important;
        color: #ffffff !important;
        font-weight: 700 !important;
        text-decoration: none !important;
      }

      .lcdp-box-card-reservation-membre [data-action="invitation"].lcdp-box-card-reservation-membre__micro-action--invit-recu:hover,
      .lcdp-box-card-reservation-membre [data-action="invitation"].lcdp-box-card-reservation-membre__micro-action--invit-recu:focus-visible {
        border-color: #6d3fa7 !important;
        background: #6d3fa7 !important;
        color: #ffffff !important;
      }


      .lcdp-box-workflow-reservation--planning-reservation .lcdp-box-calendrier-mois__close,
      .lcdp-box-workflow-reservation--planning-reservation [data-lcdp-calendrier-mois-close],
      .lcdp-box-workflow-reservation--planning-reservation > .lcdp-box-workflow-reservation__card > button[aria-label="Fermer"],
      .lcdp-box-workflow-reservation--planning-reservation .lcdp-box-card-reservation-membre [data-lcdp-card-reservation-close] {
        display: none !important;
      }

      .lcdp-box-card-reservation-membre__place {
        display: flex !important;
        flex-direction: column !important;
        align-items: flex-start !important;
        justify-content: flex-start !important;
        gap: 10px !important;
      }

      .lcdp-box-card-reservation-membre__place-line {
        display: inline-flex !important;
        align-items: baseline !important;
        justify-content: flex-start !important;
        flex-wrap: wrap !important;
        gap: 6px 10px !important;
        max-width: 100% !important;
      }

      .lcdp-box-card-reservation-membre__place .lcdp-box-card-reservation-membre__micro-action--annuler {
        align-self: flex-start !important;
        flex: 0 0 auto !important;
        margin: 0 !important;
      }

      .lcdp-box-card-reservation-membre__actions .lcdp-box-card-reservation-membre__micro-action--fermer {
        border-color: var(--lcdp-color-border) !important;
        background: var(--lcdp-color-surface) !important;
        color: var(--lcdp-color-text) !important;
      }

      @media (max-width: 767px) {
        .lcdp-box-card-reservation-membre__place .lcdp-box-card-reservation-membre__micro-action--annuler {
          align-self: flex-start !important;
          max-width: 100% !important;
          margin: 0 !important;
          white-space: normal !important;
        }
      }

      .lcdp-box-card-reservation-membre__micro-action--delai-depasse {
        border-color: var(--lcdp-color-border) !important;
        background: var(--lcdp-color-surface-soft) !important;
        color: var(--lcdp-color-text-muted) !important;
        opacity: 0.58 !important;
        cursor: not-allowed !important;
      }

      .lcdp-box-card-reservation-membre__micro-action--delai-depasse:hover {
        border-color: var(--lcdp-color-border) !important;
        background: var(--lcdp-color-surface-soft) !important;
        color: var(--lcdp-color-text-muted) !important;
      }

      [data-lcdp-invitation-invites-overlay] {
        position: fixed !important;
        inset: 0 !important;
        z-index: 11000 !important;
        pointer-events: auto !important;
      }

      [data-lcdp-invitation-invites-overlay] .lcdp-box-card-listinvites-oui-non {
        z-index: 11001 !important;
      }

      [data-lcdp-invitation-invites-overlay] .lcdp-box-card-listinvites-oui-non__close {
        display: none !important;
      }

      [data-lcdp-invitation-invites-overlay] .lcdp-box-card-listinvites-oui-non__header {
        padding-right: 0 !important;
      }

      [data-lcdp-invitation-invites-overlay] .lcdp-box-card-listinvites-oui-non__ajout-title {
        display: none !important;
      }

      [data-lcdp-invitation-invites-overlay] .lcdp-box-card-listinvites-oui-non__actions {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
        gap: 10px 12px !important;
        align-items: stretch !important;
        justify-items: stretch !important;
        margin-top: 18px !important;
        max-width: 100% !important;
        overflow: hidden !important;
      }

      [data-lcdp-invitation-invites-overlay] .lcdp-box-card-listinvites-oui-non__actions .lcdp-button {
        width: 100% !important;
        min-width: 0 !important;
        max-width: none !important;
        min-height: 54px !important;
        margin: 0 !important;
        padding: 10px 14px !important;
        box-sizing: border-box !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        text-align: center !important;
        white-space: normal !important;
      }

      [data-lcdp-invitation-invites-overlay] [data-lcdp-listinvites-add-email] {
        grid-column: 1 !important;
        grid-row: 1 !important;
      }

      [data-lcdp-invitation-invites-overlay] [data-lcdp-listinvites-update] {
        grid-column: 2 !important;
        grid-row: 1 !important;
      }

      [data-lcdp-invitation-invites-overlay] [data-lcdp-listinvites-cancel] {
        grid-column: 1 !important;
        grid-row: 2 !important;
      }


      /* Mise en page locale uniquement ; gabarits et couleurs depuis CSSBASE. */
      #lcdp-planning-calendrier-slot,
      #lcdp-planning-calendrier-slot .lcdp-box-liste-card,
      #lcdp-planning-calendrier-slot .lcdp-box-liste-card__list {
        box-sizing: border-box;
        min-width: 0;
        max-width: 100%;
      }
      #lcdp-planning-calendrier-slot .lcdp-box-liste-card__header {
        min-width: 0;
      }
      /* Navigation segmentée de la maquette MES ACCÈS, commit 34045ac7d. */
      #lcdp-planning-calendrier-slot [data-lcdp-commande-bar-actions] {
        display: block !important; width:100% !important; min-width:0 !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-membre-periode-tabs {
        display:grid !important;grid-template-columns:repeat(3,minmax(0,1fr)) !important;
        align-items:stretch !important;box-sizing:border-box;width:100%;
        gap:4px !important;margin:0 0 16px;padding:5px !important;
        border:1px solid #e7e5e4;border-radius:16px;background:#f5f5f4;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-membre-periode-button {
        display:flex !important;align-items:center !important;justify-content:center !important;
        box-sizing:border-box;width:100% !important;max-width:none !important;min-width:0 !important;
        height:44px !important;min-height:44px !important;margin:0 !important;
        padding:8px 3px !important;border:0 !important;border-radius:11px !important;
        background:transparent !important;color:#78716c !important;
        font:600 .82rem/1.2 var(--lcdp-font-main) !important;box-shadow:none !important;
        transform:none !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-membre-periode-button[aria-pressed="true"] {
        background:#4e6838 !important;color:#fff !important;font-weight:700 !important;
        box-shadow:0 1px 2px rgba(0,0,0,.12) !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-box-liste-card--mode-agenda .lcdp-box-liste-card__header {
        display:block !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-box-liste-card__tools:not([hidden]) {
        display: block;
        padding: 0;
        border: 0;
        background: transparent;
      }
      /* Structure compacte des filtres ; les composants graphiques sont conservés. */
      #lcdp-planning-calendrier-slot .lcdp-planning-filtres {
        box-sizing:border-box !important;
        display:flex !important;
        flex-direction:column !important;
        width:100% !important;
        gap:12px !important;
        padding:14px !important;
        border:1px solid var(--lcdp-color-border,#e7e5e4);
        border-radius:16px;
        background:var(--lcdp-color-surface-soft,#fafaf9);
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-filtres__champs {
        display:grid;grid-template-columns:repeat(2,minmax(0,1fr));
        gap:10px;width:100%;min-width:0;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-filtres__select {
        box-sizing:border-box !important;
        width:100% !important;max-width:100% !important;min-width:0 !important;
        height:42px !important;min-height:42px !important;
        margin:0 !important;padding:8px 10px !important;
        border:1px solid var(--lcdp-color-border,#e7e5e4);
        border-radius:11px;background:#fff;
        color:var(--lcdp-color-text,#292524);
        font:inherit;font-size:.85rem;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-filtres__select[data-lcdp-filtre="parc"] {
        grid-column:1/-1;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-filtres__invitations {
        display:grid;grid-template-columns:repeat(2,minmax(0,1fr));
        gap:10px;width:100%;min-width:0;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-filtres__option {
        display:flex;align-items:center;justify-content:center;gap:8px;
        box-sizing:border-box;min-width:0;min-height:38px;
        padding:8px 6px;border:1px solid var(--lcdp-color-border,#e7e5e4);
        border-radius:10px;background:#fff;font-size:.8rem;cursor:pointer;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-filtres__option input {
        width:16px;height:16px;min-height:0;
        flex:0 0 16px;margin:0;accent-color:var(--lcdp-color-primary,#4e6838);
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-filtres__actions {
        display:flex;align-items:center;justify-content:space-between;
        gap:10px;padding-top:10px;margin:0;
        border-top:1px solid var(--lcdp-color-border,#e7e5e4);
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-filtres__resultat {
        font-size:.75rem;color:var(--lcdp-color-text-muted,#78716c);
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-filtres__effacer {
        width:auto;min-width:0;padding:3px 0;margin:0;
        border:0;background:transparent;box-shadow:none;
        color:var(--lcdp-color-text-muted,#78716c);
        font:inherit;font-size:.75rem;text-decoration:underline;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-filtres__effacer:disabled {
        opacity:.5;cursor:not-allowed;
      }
      #lcdp-planning-calendrier-slot .lcdp-box-liste-card-diaporama__list {
        display: grid;
        grid-template-columns: 1fr;
        gap: 14px;
        width: 100%;
        min-width: 0;
      }
      .lcdp-planning-carte-visite {
        width: 100%;
        max-width: 100%;
        min-width: 0;
        margin: 0;
      }
      .lcdp-planning-carte-visite .lcdp-box-card-parc-diaporama__scene { aspect-ratio: 4 / 3; }
      .lcdp-planning-carte-visite.is-retourne .lcdp-box-card-parc-diaporama__scene {
        aspect-ratio: auto; height: 370px; min-height: 370px;
      }
      .lcdp-planning-carte-visite .lcdp-box-card-parc-diaporama__ouvrir {
        display: flex; flex-direction: column; width: 100%; height: 100%;
      }
      .lcdp-planning-carte-visite__image {
        width: 100%; height: 100%; object-fit: cover; display: block;
        border-radius: 11px;
      }
      .lcdp-planning-carte-visite__legende {
        position: absolute; bottom: 0; left: 0; right: 0;
        padding: 24px 12px 12px;
        background: linear-gradient(transparent, rgba(0,0,0,.85));
        color: white; font-weight: 750;
        font-size: .86rem; line-height: 1.4; text-align: left;
        overflow-wrap: anywhere;
      }
      .lcdp-planning-carte-visite__sans-image {
        display: flex; align-items: center; justify-content: center;
        flex: 1; background: #e9eee6; color: #526c3f;
        font-weight: 750; font-size: 1.1rem;
      }
      .lcdp-planning-carte-visite .lcdp-box-card-parc-diaporama__contenu {
        min-height: 0; height: 100%; width: 100%; padding: 28px 4px 8px;
        box-sizing: border-box;
      }
      .lcdp-planning-carte-visite .lcdp-box-card-parc-diaporama__face--verso {
        overflow-y: auto; padding: 12px;
      }
      .lcdp-planning-carte-visite .lcdp-box-card-reservation-membre {
        display: flex; flex-direction: column; gap: 10px;
        width: 100%; min-width: 0; max-width: 100%;
        margin: 0; padding: 0; border: 0 !important; box-shadow: none !important;
        background: transparent;
      }
      .lcdp-planning-carte-visite .lcdp-box-card-reservation-membre__media { display: none !important; }
      .lcdp-planning-carte-visite .lcdp-box-card-reservation-membre__body,
      .lcdp-planning-carte-visite .lcdp-box-card-reservation-membre__content {
        width: 100%; min-width: 0; gap: 8px;
      }
      .lcdp-planning-carte-visite .lcdp-box-card-reservation-membre__date,
      .lcdp-planning-carte-visite .lcdp-box-card-reservation-membre__place {
        display: flex; flex-wrap: wrap; justify-content: flex-start;
        align-items: baseline; width: 100%;
        min-width: 0; gap: 7px;
      }
      .lcdp-planning-carte-visite .lcdp-box-card-reservation-membre__date-label {
        font-size: .95rem; line-height: 1.35; font-weight: 750;
      }
      .lcdp-planning-carte-visite .lcdp-box-card-reservation-membre__hour {
        font-size: .85rem; font-weight: 650;
      }
      .lcdp-planning-carte-visite .lcdp-box-card-reservation-membre__park {
        white-space: normal; overflow-wrap: anywhere;
      }
      .lcdp-planning-carte-visite .lcdp-box-card-reservation-membre__actions {
        display: flex; flex-wrap: wrap; gap: 8px;
      }
      .lcdp-planning-carte-visite .lcdp-box-card-reservation-membre__micro-action {
        max-width: 100%; white-space: normal; overflow-wrap: anywhere;
      }

      /* Gouttières alignées et contenu contraint à la largeur du wrapper. */
      #lcdp-planning-calendrier-slot .lcdp-box-workflow-reservation--planning-page,
      #lcdp-planning-calendrier-slot .lcdp-box-workflow-reservation__card,
      #lcdp-planning-calendrier-slot .lcdp-box-workflow-reservation__content,
      #lcdp-planning-calendrier-slot .lcdp-box-liste-card--planning-membre {
        box-sizing:border-box !important;min-width:0 !important;
        width:100% !important;max-width:100% !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-box-liste-card--mode-liste {
        padding:12px !important;gap:12px !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-box-liste-card--mode-liste .lcdp-box-liste-card__header {
        padding-bottom:12px !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-membre-periode-tabs {margin-bottom:0 !important;}
      #lcdp-planning-calendrier-slot .lcdp-box-liste-card__tools:not([hidden]) {
        box-sizing:border-box;padding:0 !important;margin:0 !important;
        width:100% !important;max-width:100% !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-filtres {
        box-sizing:border-box;width:100% !important;max-width:100% !important;
        margin:0 !important;padding:14px !important;gap:12px !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-box-liste-card__list {
        box-sizing:border-box;padding-top:12px !important;
        width:100% !important;max-width:100% !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-box-liste-card-diaporama,
      #lcdp-planning-calendrier-slot .lcdp-box-liste-card-diaporama__list {
        box-sizing:border-box;width:100% !important;max-width:100% !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite .lcdp-box-card-parc-diaporama__scene {
        box-sizing:border-box;max-width:100%;
      }
      /* Verso en flux normal : aucun cadre imbriqué à hauteur fixe ni scroll secondaire. */
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne .lcdp-box-card-parc-diaporama__scene {
        aspect-ratio:auto !important;height:auto !important;min-height:0 !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne .lcdp-box-card-parc-diaporama__faces {
        height:auto !important;transform:none !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne .lcdp-box-card-parc-diaporama__face--recto {
        display:none !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne .lcdp-box-card-parc-diaporama__face--verso {
        position:relative !important;inset:auto !important;
        display:block !important;visibility:visible !important;
        height:auto !important;min-height:0 !important;
        overflow:visible !important;transform:none !important;
        backface-visibility:visible !important;
        -webkit-backface-visibility:visible !important;
        padding:16px 14px !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite .lcdp-box-card-parc-diaporama__contenu {
        padding:18px 0 0 !important;height:auto !important;
        min-height:0 !important;overflow:visible !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite .lcdp-box-card-reservation-membre {
        display:block !important;border:0 !important;
        padding:0 !important;margin:0 !important;box-shadow:none !important;
        background:transparent !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite .lcdp-box-card-reservation-membre__body {
        padding:0 !important;display:flex !important;flex-direction:column !important;
        gap:12px !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite .lcdp-box-card-reservation-membre__content {
        display:flex !important;flex-direction:column !important;gap:12px !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite .lcdp-box-card-reservation-membre__date,
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite .lcdp-box-card-reservation-membre__place {
        box-sizing:border-box;display:flex !important;flex-wrap:wrap !important;
        align-items:baseline !important;justify-content:flex-start !important;
        gap:6px 10px !important;flex:none !important;width:100% !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite .lcdp-box-card-reservation-membre__place {
        align-items:flex-start !important;flex-direction:column !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite .lcdp-box-card-reservation-membre__actions {
        display:flex !important;flex-wrap:wrap !important;gap:8px !important;
        padding:0 !important;margin:0 !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite .lcdp-box-card-reservation-membre__micro-action {
        box-sizing:border-box;max-width:100% !important;
      }
      /* Régression corrigée : une seule carte par ligne à toutes les largeurs. */
      #lcdp-planning-calendrier-slot .lcdp-box-liste-card-diaporama__list {
        display:grid !important;
        grid-template-columns:minmax(0,1fr) !important;
        gap:16px !important;
        align-items:stretch !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-box-liste-card-diaporama__list > .lcdp-planning-carte-visite {
        grid-column:1 / -1 !important;
        min-width:0 !important;
        width:100% !important;
      }
      /* Espacements du gabarit : le statut, les onglets et les filtres ne se touchent pas. */
      #lcdp-planning-calendrier-slot {
        box-sizing:border-box;
        width:100%;
        min-width:0;
      }
      .lcdp-page-content:has(> .lcdp-page-header > #mention-statut-membre) {
        box-sizing:border-box;
        width:100%;
        min-width:0;
        padding:18px 16px 24px;
      }
      .lcdp-page-content:has(> .lcdp-page-header > #mention-statut-membre) > .lcdp-page-header {
        display:flex;
        justify-content:center;
        align-items:center;
        box-sizing:border-box;
        width:100%;
        margin:0 0 20px;
        padding:0;
      }
      .lcdp-page-content:has(> .lcdp-page-header > #mention-statut-membre) #mention-statut-membre {
        margin:0;
      }
      #lcdp-planning-calendrier-slot .lcdp-box-liste-card--mode-liste {
        box-sizing:border-box;
        padding:18px 16px 20px !important;
        gap:18px !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-box-liste-card--mode-liste .lcdp-box-liste-card__header {
        box-sizing:border-box;
        margin:0;
        padding:0 0 18px !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-box-liste-card--mode-liste .lcdp-box-liste-card__list {
        padding-top:18px !important;
      }
      /* Recto/verso ouvert : neutraliser les effets 3D qui rognent les textes. */
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne,
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne .lcdp-box-card-parc-diaporama__scene,
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne .lcdp-box-card-parc-diaporama__faces {
        perspective:none !important;
        transform:none !important;
        transform-style:flat !important;
        overflow:visible !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne .lcdp-box-card-parc-diaporama__face--verso {
        box-sizing:border-box !important;
        top:auto !important;
        left:auto !important;
        right:auto !important;
        bottom:auto !important;
        margin:0 !important;
        padding:24px 20px 20px !important;
        overflow:visible !important;
        transform:none !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne .lcdp-box-card-parc-diaporama__contenu {
        box-sizing:border-box !important;
        width:100% !important;
        min-width:0 !important;
        padding:16px 0 0 !important;
        margin:0 !important;
        overflow:visible !important;
        transform:none !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne .lcdp-box-card-reservation-membre__body,
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne .lcdp-box-card-reservation-membre__content {
        box-sizing:border-box !important;
        width:100% !important;
        min-width:0 !important;
        padding:0 !important;
        margin:0 !important;
        overflow:visible !important;
        transform:none !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne .lcdp-box-card-reservation-membre__date-label,
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne .lcdp-box-card-reservation-membre__park {
        display:block;
        max-width:100%;
        white-space:normal !important;
        overflow:visible !important;
        text-overflow:clip !important;
        overflow-wrap:anywhere;
        line-height:1.4 !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne .lcdp-box-card-parc-diaporama__fermer {
        top:10px !important;
        right:10px !important;
      }
      /* Même emplacement pour les trois onglets, y compris quand le calendrier est affiché. */
      #lcdp-planning-calendrier-slot .lcdp-planning-navigation-permanente,
      #lcdp-planning-calendrier-slot .lcdp-planning-navigation-permanente.lcdp-box-liste-card--mode-agenda {
        display:flex !important;
        flex-direction:column !important;
        box-sizing:border-box !important;
        width:100% !important;
        min-width:0 !important;
        padding:18px 16px 20px !important;
        gap:18px !important;
        background:var(--lcdp-color-surface,#fff) !important;
        border:1px solid var(--lcdp-color-border,#e7e5e4) !important;
        border-radius:var(--lcdp-radius-large,18px) !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-navigation-permanente .lcdp-box-liste-card__header,
      #lcdp-planning-calendrier-slot .lcdp-planning-navigation-permanente.lcdp-box-liste-card--mode-agenda .lcdp-box-liste-card__header {
        display:block !important;
        visibility:visible !important;
        position:relative !important;
        width:100% !important;
        min-width:0 !important;
        padding:0 0 18px !important;
        margin:0 !important;
        flex:0 0 auto !important;
        border-bottom:1px solid var(--lcdp-color-border,#e7e5e4) !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-navigation-permanente .lcdp-box-liste-card__commande {
        display:block !important;
        width:100% !important;
        min-width:0 !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-navigation-permanente .lcdp-box-liste-card__list {
        box-sizing:border-box !important;
        width:100% !important;
        min-width:0 !important;
        padding-top:0 !important;
        margin:0 !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-navigation-permanente .lcdp-planning-membre-periode-tabs {
        margin:0 !important;
      }
      /* Consultation d'une journée : wrapper existant et cartouches en colonne. */
      #lcdp-lightbox-slot .lcdp-planning-jour-workflow .lcdp-box-workflow-reservation__card {
        box-sizing:border-box !important;
        width:min(94vw,640px) !important;
        max-width:640px !important;
        max-height:min(88dvh,850px) !important;
        overflow-y:auto !important;
        padding:20px 18px !important;
        border-radius:22px !important;
      }
      #lcdp-lightbox-slot .lcdp-planning-jour-vues,
      #lcdp-lightbox-slot .lcdp-planning-jour-liste,
      #lcdp-lightbox-slot .lcdp-planning-jour-item {
        box-sizing:border-box;min-width:0;width:100%;
      }
      #lcdp-lightbox-slot .lcdp-planning-jour-entete {
        display:flex;align-items:center;justify-content:space-between;
        gap:14px;margin:0 0 18px;padding:0 0 14px;
        border-bottom:1px solid var(--lcdp-color-border,#e7e5e4);
      }
      #lcdp-lightbox-slot .lcdp-planning-jour-entete h2 {
        margin:0;font-size:1.05rem;line-height:1.35;
        color:var(--lcdp-color-text,#1f2a24);
      }
      #lcdp-lightbox-slot .lcdp-planning-jour-fermer {
        flex:0 0 auto;min-height:38px;padding:7px 12px;
        border:1px solid var(--lcdp-color-border,#d6d3d1);
        border-radius:999px;background:#fff;
        color:var(--lcdp-color-text,#1f2a24);cursor:pointer;
      }
      #lcdp-lightbox-slot .lcdp-planning-jour-liste {
        display:flex;flex-direction:column;gap:14px;
      }
      #lcdp-lightbox-slot .lcdp-planning-jour-item .lcdp-box-card-reservation-membre {
        box-sizing:border-box;width:100%;max-width:100%;margin:0;
      }
      @media(max-width:520px) {
        #lcdp-lightbox-slot .lcdp-planning-jour-workflow .lcdp-box-workflow-reservation__card {
          width:calc(100vw - 24px) !important;padding:16px 12px !important;
        }
      }
      /* Journée intégrée dans le wrapper, présentation mobile-first en galerie. */
      #lcdp-planning-calendrier-slot .lcdp-planning-jour-inline {
        box-sizing:border-box;width:100%;max-width:100%;min-width:0;
        margin:0;padding:0;background:transparent;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-jour-entete {
        display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;
        gap:10px;margin:0 0 16px;padding:0 0 12px;
        border-bottom:1px solid var(--lcdp-color-border,#e7e5e4);
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-jour-entete h2 {
        margin:0;color:var(--lcdp-color-text,#1f2a24);
        font-size:1rem;line-height:1.4;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-jour-fermer {
        box-sizing:border-box;max-width:100%;padding:9px 12px;
        border:1px solid var(--lcdp-color-border,#d6d3d1);border-radius:999px;
        background:#fff;color:var(--lcdp-color-text,#1f2a24);cursor:pointer;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-jour-workflow-inline,
      #lcdp-planning-calendrier-slot .lcdp-planning-jour-workflow-inline > .lcdp-box-workflow-reservation__card {
        position:static !important;inset:auto !important;
        display:block !important;box-sizing:border-box;
        width:100% !important;max-width:100% !important;min-width:0 !important;
        height:auto !important;max-height:none !important;min-height:0 !important;
        margin:0 !important;padding:0 !important;border:0 !important;
        background:transparent !important;box-shadow:none !important;
        overflow:visible !important;transform:none !important;
        backdrop-filter:none !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-jour-workflow-inline::backdrop {
        display:none !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-jour-workflow-inline .lcdp-box-workflow-reservation__content,
      #lcdp-planning-calendrier-slot .lcdp-planning-jour-workflow-inline .lcdp-planning-reservation-vues,
      #lcdp-planning-calendrier-slot .lcdp-planning-jour-workflow-inline .lcdp-box-liste-card-diaporama {
        box-sizing:border-box;width:100%;max-width:100%;min-width:0;
        padding:0;margin:0;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-jour-liste {
        display:grid !important;grid-template-columns:minmax(0,1fr) !important;
        gap:16px !important;width:100% !important;max-width:100%;min-width:0;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-jour-liste > * {
        grid-column:1 / -1 !important;max-width:100%;min-width:0;
      }
      /* Versos en galerie dans MES ACCÈS : marges de sécurité pour les libellés. */
      #lcdp-planning-calendrier-slot .lcdp-planning-jour-inline
      .lcdp-planning-carte-visite.is-retourne .lcdp-box-card-parc-diaporama__face--verso {
        position:relative !important;
        box-sizing:border-box !important;
        height:auto !important;
        padding:42px 18px 20px !important;
        overflow:visible !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-jour-inline
      .lcdp-planning-carte-visite.is-retourne .lcdp-box-card-parc-diaporama__contenu {
        box-sizing:border-box !important;
        padding:0 !important;
        margin:0 !important;
        overflow:visible !important;
        height:auto !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-jour-inline
      .lcdp-planning-carte-visite.is-retourne .lcdp-box-card-reservation-membre__date,
      #lcdp-planning-calendrier-slot .lcdp-planning-jour-inline
      .lcdp-planning-carte-visite.is-retourne .lcdp-box-card-reservation-membre__place {
        overflow:visible !important;
        min-height:0 !important;
        line-height:1.4 !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-jour-inline
      .lcdp-planning-carte-visite.is-retourne .lcdp-box-card-reservation-membre__date-label,
      #lcdp-planning-calendrier-slot .lcdp-planning-jour-inline
      .lcdp-planning-carte-visite.is-retourne .lcdp-box-card-reservation-membre__park {
        display:block;
        white-space:normal !important;
        overflow:visible !important;
        line-height:1.45 !important;
      }
      /* Correction commune aux deux galeries (À venir et consultation d'une journée).
         Le gabarit retourne une face dont le contenu doit rester dans le flux
         normal et sous la zone du bouton de fermeture. */
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne
      .lcdp-box-card-parc-diaporama__face--verso {
        display:block !important;
        position:relative !important;
        box-sizing:border-box !important;
        padding:44px 18px 22px !important;
        height:auto !important;
        min-height:0 !important;
        overflow:visible !important;
        transform:none !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne
      .lcdp-box-card-parc-diaporama__contenu {
        display:block !important;
        position:static !important;
        box-sizing:border-box !important;
        padding:0 !important;
        margin:0 !important;
        width:100% !important;
        height:auto !important;
        min-height:0 !important;
        overflow:visible !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne
      .lcdp-box-card-reservation-membre,
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne
      .lcdp-box-card-reservation-membre__body,
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne
      .lcdp-box-card-reservation-membre__content {
        position:static !important;
        box-sizing:border-box !important;
        margin:0 !important;
        padding:0 !important;
        width:100% !important;
        height:auto !important;
        min-height:0 !important;
        max-height:none !important;
        overflow:visible !important;
        transform:none !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne
      .lcdp-box-card-reservation-membre__date,
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne
      .lcdp-box-card-reservation-membre__place {
        position:static !important;
        box-sizing:border-box !important;
        min-height:0 !important;
        height:auto !important;
        overflow:visible !important;
        padding:2px 0 !important;
        margin:0 !important;
        line-height:1.5 !important;
      }
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne
      .lcdp-box-card-reservation-membre__date-label,
      #lcdp-planning-calendrier-slot .lcdp-planning-carte-visite.is-retourne
      .lcdp-box-card-reservation-membre__park {
        height:auto !important;
        min-height:0 !important;
        max-height:none !important;
        line-height:1.5 !important;
        padding:2px 0 !important;
        margin:0 !important;
        overflow:visible !important;
        white-space:normal !important;
        text-overflow:clip !important;
      }
      @media (max-width: 350px) {
        .lcdp-planning-filtres { grid-template-columns: 1fr; }
      }
    `;

    document.head.appendChild(style);
  }

  async function initialiserPage() {
    if (pageInitialisee) return;
    pageInitialisee = true;

    injecterStylesCorrectifsPlanningMembre();

    try {
      await initialiserBandeau();
      await initialiserFooter();

      // Un seul affichage du statut, après vérification : pas de badge provisoire.
      etat.membre = creerEtatMembreFallback();
      await initialiserPlanningCalendrier();
      document.addEventListener("click", gererClicDocument);

      await Promise.all([
        chargerReservations(),
        lancerActualisationEtatMembrePlanning()
      ]);
      afficherStatutMembrePlanning(etat.membre);
    } catch (error) {
      console.error("Erreur planning membre :", error);
      afficherErreurCalendrier(error.message || "Erreur technique. Merci de réessayer.");
    } finally {
      // Aucun fragment ou cartouche ne doit apparaître isolément pendant l'initialisation.
      document.documentElement.classList.add("lcdp-planning-membre-ready");
    }
  }

  function creerEtatMembreFallback() {
    return {
      abonne: membreAbonne(),
      abonnementSuspendu: false,
      abonnementAnnuleNonPaye: false,
      paiementSuspension: null,
      sourceApi: false
    };
  }

  function lancerActualisationEtatMembrePlanning() {
    if (!promesseActualisationEtatMembre) {
      promesseActualisationEtatMembre = actualiserEtatMembrePlanningSilencieux()
        .catch((error) => {
          console.warn("Statut membre indisponible sur le planning.", error);
          return false;
        })
        .finally(() => {
          promesseActualisationEtatMembre = null;
        });
    }

    return promesseActualisationEtatMembre;
  }

  async function actualiserEtatMembrePlanningSilencieux() {
    try {
      const membre = await chargerEtatMembrePlanning();

      if (!membre) return false;

      etat.membre = membre;
      afficherStatutMembrePlanning(etat.membre);
      return true;
    } catch (error) {
      console.warn("Statut membre indisponible sur le planning.", error);
      return false;
    }
  }

  async function chargerEtatMembrePlanning() {
    if (!ENDPOINT_INDEX_MEMBRE) {
      return {
        abonne: membreAbonne(),
        abonnementSuspendu: false,
        abonnementAnnuleNonPaye: false,
        paiementSuspension: null,
        sourceApi: false
      };
    }

    const reponse = await fetch(ENDPOINT_INDEX_MEMBRE + "/index", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    });

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return null;
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      throw new Error(messageErreurApi(data, "Impossible de vérifier votre statut membre."));
    }

    return {
      abonne: valeurBooleenneVraie(data.abonne),
      abonnementSuspendu: valeurBooleenneVraie(data.abonnementSuspendu || data.suspendu),
      abonnementAnnuleNonPaye: valeurBooleenneVraie(data.abonnementAnnuleNonPaye || data.abonnementAnnule || data.annuleNonPaye),
      paiementSuspension: data.paiementSuspension || data.paiementRegularisation || null,
      sourceApi: true
    };
  }

  function afficherStatutMembrePlanning(membre) {
    const mention = document.getElementById("mention-statut-membre");

    if (!mention) return;

    mention.textContent = membre && membre.abonne
      ? "MEMBRE ABONNÉ"
      : "MEMBRE INVITÉ";
    mention.hidden = false;
  }

  async function initialiserPlanningCalendrier() {
    const slot = document.getElementById("lcdp-planning-calendrier-slot");

    if (!slot) {
      throw new Error("Slot planning calendrier introuvable.");
    }

    slot.innerHTML = "";

    const fragmentWorkflow = await chargerFragmentObjet("/HTMLBASE/04-workflow-reservation.html");
    slot.appendChild(fragmentWorkflow);

    const workflow = slot.querySelector("[data-lcdp-box-workflow-reservation]");
    const contenu = slot.querySelector("[data-lcdp-workflow-reservation-content]");

    if (!workflow || !contenu) {
      throw new Error("Structure workflow réservation incomplète.");
    }

    workflow.removeAttribute("role");
    workflow.removeAttribute("aria-modal");
    workflow.classList.add(
      "lcdp-box-workflow-reservation--planning-page",
      "lcdp-box-workflow-reservation--calendrier-mois",
      "lcdp-workflow-reservation-box"
    );
    const fragmentWrapper = await chargerFragmentObjet("/HTMLBASE/04-liste-card.html");
    contenu.appendChild(fragmentWrapper);

    const wrapperPlanning = contenu.querySelector("[data-lcdp-box-liste-card]");
    const titreWrapper = contenu.querySelector("[data-lcdp-liste-card-title]");
    const slotCommande = contenu.querySelector("[data-lcdp-liste-card-commande]");
    const slotPlanning = contenu.querySelector("[data-lcdp-liste-card-list]");

    if (!wrapperPlanning || !slotCommande || !slotPlanning) {
      throw new Error("Structure wrapper planning membre incomplète.");
    }

    wrapperPlanning.classList.add("lcdp-box-liste-card--planning-membre");

    if (titreWrapper) {
      titreWrapper.textContent = "";
      titreWrapper.hidden = true;
    }
    const fragmentCalendrier = await chargerFragmentObjet("/HTMLBASE/04-calendrier-mois.html");
    slotPlanning.appendChild(fragmentCalendrier);

    // Même hôte CSS que le calendrier permanent de PLANIFIER.
    slotPlanning.id = "lcdp-planifier-calendrier-slot";
    const calendrier = slotPlanning.querySelector("[data-lcdp-box-calendrier-mois]");

    if (!calendrier) {
      throw new Error("Structure calendrier mois incomplète.");
    }

    const slotCommandeAgenda = calendrier.querySelector(
      "[data-lcdp-calendrier-mois-commande]"
    );

    if (!slotCommandeAgenda) {
      throw new Error("Slot commande du calendrier mensuel introuvable.");
    }

    const fragmentCommande = await chargerFragmentObjet("/HTMLBASE/04-commande-bar.html");
    slotCommandeAgenda.appendChild(fragmentCommande);

    const commandeBar = slotCommandeAgenda.querySelector("[data-lcdp-box-commande-bar]");
    const actionsCommande = slotCommandeAgenda.querySelector("[data-lcdp-commande-bar-actions]");

    if (!commandeBar || !actionsCommande) {
      throw new Error("Structure commande bar incomplète.");
    }

    ajouterActionsPlanningMembre(actionsCommande);
    actualiserBoutonsPeriodePlanningMembre();

    calendrier.removeAttribute("role");
    calendrier.removeAttribute("aria-modal");

    const boutonFermer = calendrier.querySelector("[data-lcdp-calendrier-mois-close]");
    if (boutonFermer) boutonFermer.hidden = true;

    calendrier.classList.add(
      "lcdp-box-calendrier-mois--planning-membre",
      "lcdp-box-calendrier-mois--inline"
    );

    const titre = calendrier.querySelector("[data-lcdp-calendrier-mois-title]");
    if (titre) {
      titre.textContent = "";
      titre.hidden = true;
    }

    const meta = calendrier.querySelector("[data-lcdp-calendrier-mois-meta]");
    if (meta) {
      await installerLegendeAgendaMembre(meta);
    }

    const boutonPrecedent = calendrier.querySelector("[data-lcdp-calendrier-mois-prev]");
    const boutonSuivant = calendrier.querySelector("[data-lcdp-calendrier-mois-next]");

    if (boutonPrecedent) {
      boutonPrecedent.addEventListener("click", () => {
        const mois = moisAdjacentAvecAccesPlanning(-1);
        if (!mois) return;
        etat.moisCourant = mois;
        afficherCalendrierMois();
      });
    }
    if (boutonSuivant) {
      boutonSuivant.addEventListener("click", () => {
        const mois = moisAdjacentAvecAccesPlanning(1);
        if (!mois) return;
        etat.moisCourant = mois;
        afficherCalendrierMois();
      });
    }

    const fragmentJour = await chargerFragmentObjet("/HTMLBASE/04-card-jour-in-calendrier-mois.html");
    etat.templateJour = fragmentJour.querySelector("[data-lcdp-card-jour-mois]");

    if (!etat.templateJour) {
      throw new Error("Template jour calendrier mois introuvable.");
    }

    const [fragmentCardParc, fragmentListeParcs, fragmentReservation] = await Promise.all([
      chargerFragmentObjet("/HTMLBASE/04-card-parc-diaporama.html"),
      chargerFragmentObjet("/HTMLBASE/04-liste-card-diaporama.html"),
      chargerFragmentObjet("/HTMLBASE/04-card-reservation-membre.html")
    ]);
    etat.templateCardParcDiaporama = fragmentCardParc.querySelector("[data-lcdp-card-parc-diaporama]");
    etat.templateListeParcsDiaporama = fragmentListeParcs.querySelector("[data-lcdp-liste-card-diaporama]");
    if (!etat.templateCardParcDiaporama || !etat.templateListeParcsDiaporama) throw new Error("Gabarits diaporama Parc indisponibles.");
    etat.templateReservation = fragmentReservation.querySelector("[data-lcdp-box-card-reservation-membre]");

    if (!etat.templateReservation) {
      throw new Error("Template card réservation membre introuvable.");
    }

    etat.workflowPlanning = workflow;
    etat.contenuWorkflowPlanning = contenu;
    etat.calendrierMois = calendrier;
    etat.wrapperPlanning = wrapperPlanning;
    etat.slotPlanning = slotPlanning;
    etat.slotCommandeListe = slotCommande;
    etat.slotCommandeAgenda = slotCommandeAgenda;
    etat.commandeBar = commandeBar;

    // Barre de navigation permanente : hors du calendrier et de la zone interchangeable.
    slotCommande.appendChild(commandeBar);
    installerFiltresPlanningMembre();
    actualiserModeWrapperPlanning();
    actualiserBoutonAffichagePlanningMembre();
    actualiserBoutonsPeriodePlanningMembre();
    afficherChargementCalendrier("Chargement de votre planning...");
  }

  async function installerLegendeAgendaMembre(meta) {
    if (!meta) return;
    const fragment = await chargerFragmentObjet("/HTMLBASE/04-legende.html");
    const legende = fragment.querySelector("[data-lcdp-box-legende]");
    const contenu = fragment.querySelector("[data-lcdp-legende-contenu]");
    if (!legende || !contenu) throw new Error("Structure Box Légende incomplète.");

    // Libellés et classes de la légende du planning général dans PLANIFIER.
    legende.className = "lcdp-box-legende lcdp-planifier-legende-planning";
    legende.setAttribute("role","group");
    legende.setAttribute("aria-label","Légende du planning");
    contenu.replaceChildren();
    const ligne = document.createElement("div");
    ligne.className = "lcdp-box-legende__ligne";
    for (const [libelle, classe] of [
      ["abonnement en cours", "lcdp-planifier-jour--abonnement-couvert"],
      ["accès planifié dans un parc", "lcdp-box-legende__carre--bleu-fonce"],
      ["invitation reçue pour un parc", "lcdp-box-legende__carre--bleu-clair"]
    ]) {
      const item = document.createElement("span");
      item.className = "lcdp-box-legende__item";
      const carre = document.createElement("span");
      carre.className = "lcdp-box-legende__carre " + classe;
      carre.setAttribute("aria-hidden","true");
      const texte = document.createElement("span");
      texte.className = "lcdp-box-legende__libelle";
      texte.textContent = libelle;
      item.append(carre,document.createTextNode(" "),texte);
      ligne.appendChild(item);
    }
    contenu.appendChild(ligne);
    const corps = meta.closest("[data-lcdp-box-calendrier-mois]")?.querySelector(".lcdp-box-calendrier-mois__body");
    if (!corps) throw new Error("Corps du calendrier introuvable.");
    corps.querySelector(".lcdp-planifier-legende-planning")?.remove();
    corps.appendChild(legende);
    meta.replaceChildren();
    meta.hidden = true;
  }

  function ajouterActionsPlanningMembre(actionsWrapper) {
    if (!actionsWrapper) return;

    actionsWrapper.innerHTML = "";

    const groupePeriodes =
      document.createElement("div");
    groupePeriodes.className =
      "lcdp-planning-membre-periode-tabs";
    groupePeriodes.setAttribute(
      "role",
      "group"
    );
    groupePeriodes.setAttribute(
      "aria-label",
      "Période de Mon agenda"
    );

    groupePeriodes.appendChild(
      creerBoutonPeriodePlanningMembre(
        "avenir",
        "À venir"
      )
    );
    groupePeriodes.appendChild(
      creerBoutonPeriodePlanningMembre(
        "passe",
        "Passé"
      )
    );

    const boutonAffichage = document.createElement("button");
    boutonAffichage.type = "button";
    boutonAffichage.className = "lcdp-button lcdp-button-secondary lcdp-button-mini lcdp-planning-membre-periode-button lcdp-planning-membre-affichage-button";
    boutonAffichage.dataset.lcdpPlanningAffichage = "true";
    boutonAffichage.textContent = "Planning";
    boutonAffichage.setAttribute("aria-pressed","false");
    boutonAffichage.addEventListener("click", () => {
      if (etat.modeAffichage === "agenda") fermerReservationsJourPlanning();
      else afficherPlanningMembreEnAgenda();
    });
    groupePeriodes.appendChild(boutonAffichage);
    actionsWrapper.appendChild(groupePeriodes);

    actualiserBoutonsPeriodePlanningMembre();
  }

  function creerBoutonPeriodePlanningMembre(
    periode,
    libelle
  ) {
    const bouton =
      document.createElement("button");

    bouton.type = "button";
    bouton.className =
      "lcdp-button lcdp-button-secondary " +
      "lcdp-button-mini " +
      "lcdp-planning-membre-periode-button";
    bouton.dataset.lcdpPlanningPeriode =
      periode;
    bouton.textContent = libelle;
    bouton.addEventListener(
      "click",
      () => changerPeriodePlanningMembre(
        periode
      )
    );

    return bouton;
  }

  function changerPeriodePlanningMembre(periode) {
    const prochainePeriode = periode === "passe" ? "passe" : "avenir";
    const changementPeriode = etat.periodeAffichage !== prochainePeriode;
    const retourDepuisPlanning = etat.modeAffichage === "agenda";

    // Le bouton À venir doit aussi quitter Planning quand la période est déjà avenir.
    if (!changementPeriode && !retourDepuisPlanning) return;

    etat.periodeAffichage = prochainePeriode;
    if (changementPeriode) ajusterMoisCourantSelonPeriode();

    // AfficherPlanningMembreEnListe actualise seul les trois boutons et les filtres.
    afficherPlanningMembreEnListe();
  }

  function actualiserBoutonsPeriodePlanningMembre() {
    if (!etat.commandeBar) return;

    etat.commandeBar
      .querySelectorAll(
        "[data-lcdp-planning-periode]"
      )
      .forEach((bouton) => {
        const periode = bouton.dataset.lcdpPlanningPeriode;
        const actif = etat.modeAffichage === "liste" && periode === etat.periodeAffichage;
        const compte = etat.reservations.filter(r => reservationDansPeriodeAgenda(r,periode)).length;
        bouton.textContent = (periode === "avenir" ? "À venir" : "Passé") + " (" + compte + ")";

        bouton.classList.toggle(
          "lcdp-button-primary",
          actif
        );
        bouton.classList.toggle(
          "lcdp-button-secondary",
          !actif
        );
        bouton.setAttribute(
          "aria-pressed",
          actif ? "true" : "false"
        );
      });
  }

  function basculerAffichagePlanningMembre() {
    if (etat.modeAffichage === "agenda") {
      afficherPlanningMembreEnListe();
      return;
    }

    afficherPlanningMembreEnAgenda();
  }

  function afficherPlanningMembreEnAgenda() {
    const slotPlanning = etat.slotPlanning;
    const calendrier = etat.calendrierMois;

    if (!slotPlanning || !calendrier) return;

    ajusterMoisCourantSelonPeriode();
    afficherCalendrierMois();

    slotPlanning.classList.add(
      "lcdp-box-liste-card__list--transition"
    );

    window.requestAnimationFrame(() => {
      slotPlanning.replaceChildren(
        calendrier
      );

      // Le calendrier remplace uniquement le contenu, jamais la barre de navigation.
      etat.modeAffichage = "agenda";
      actualiserModeWrapperPlanning();
      actualiserBoutonAffichagePlanningMembre();
      actualiserBoutonsPeriodePlanningMembre();
      actualiserEtatFiltresPlanningMembre();

      window.requestAnimationFrame(() => {
        slotPlanning.classList.remove(
          "lcdp-box-liste-card__list--transition"
        );
      });
    });
  }

  function afficherPlanningMembreEnListe() {
    const slotPlanning = etat.slotPlanning;

    if (
      !slotPlanning ||
      !etat.templateReservation
    ) {
      return;
    }

    const fragment = etat.templateListeParcsDiaporama
      ? etat.templateListeParcsDiaporama.cloneNode(true)
      : document.createDocumentFragment();
    const zoneCartes = fragment.querySelector?.("[data-lcdp-liste-card-diaporama-list]") || fragment;
    const reservations = filtrerReservationsPlanningMembre(
      filtrerEtTrierReservationsAgenda(etat.reservations)
    );
    const resultats = etat.formulaireFiltres?.querySelector("[data-lcdp-filtres-resultat]");
    if(resultats)resultats.textContent=reservations.length+" accès affiché"+(reservations.length>1?"s":"");
    actualiserEtatFiltresPlanningMembre();

    if (!reservations.length) {
      const message =
        document.createElement("p");
      message.className =
        "lcdp-box-liste-card__message";
      message.textContent =
        etat.periodeAffichage === "avenir"
          ? (filtresPlanningActifs() ? "Aucun accès ne correspond aux filtres sélectionnés." : "Vous n’avez aucun accès à venir.")
          : "Vous n’avez aucun accès passé ou annulé.";
      zoneCartes.appendChild(message);
    } else {
      reservations.forEach(
        (reservation, index) => {
          const card = creerCardReservation(
            reservation,
            {
              contexte: "liste",
              prochaine:
                etat.periodeAffichage ===
                  "avenir" &&
                index === 0
            }
          );

          card.classList.add("lcdp-box-card-reservation-membre--liste");
          zoneCartes.appendChild(creerCarteVisiteDiaporama(card, reservation));
        }
      );
    }

    slotPlanning.classList.add(
      "lcdp-box-liste-card__list--transition"
    );

    window.requestAnimationFrame(() => {
      slotPlanning.replaceChildren(
        fragment
      );
      etat.modeAffichage = "liste";
      actualiserModeWrapperPlanning();
      actualiserBoutonAffichagePlanningMembre();
      actualiserBoutonsPeriodePlanningMembre();
      actualiserEtatFiltresPlanningMembre();

      window.requestAnimationFrame(() => {
        slotPlanning.classList.remove(
          "lcdp-box-liste-card__list--transition"
        );
      });
    });
  }

  function creerCarteVisiteDiaporama(cardReservation, reservation) {
    if (!etat.templateCardParcDiaporama) return cardReservation;
    const carte = etat.templateCardParcDiaporama.cloneNode(true);
    carte.classList.add("lcdp-box-card-parc--reserver", "lcdp-planning-carte-visite");
    carte.dataset.idflux = String(reservation.idflux || "");
    const ouvrir = carte.querySelector("[data-lcdp-diaporama-retourner]");
    const fermer = carte.querySelector("[data-lcdp-diaporama-fermer]");
    const dos = carte.querySelector("[data-lcdp-diaporama-dos]");
    const contenu = carte.querySelector("[data-lcdp-diaporama-dos-contenu]");
    const parc = reservation.parc || {};
    const nom = String(parc.nom || parc.nomparc || reservation.nomparc || "Parc");
    const date = formaterDateCourte(reservation.datebookd);
    const heure = formaterHeureReservation(reservation.datebookd);
    const media = cardReservation.querySelector("[data-lcdp-card-reservation-media]");
    if (media && !media.hidden) {
      const img = media.querySelector("img");
      if (img) {
        const image = document.createElement("img");
        image.src = img.src;
        image.alt = img.alt;
        image.loading = "lazy";
        image.decoding = "async";
        image.className = "lcdp-planning-carte-visite__image";
        image.addEventListener("error", () => {
          const secours = construireUrlObjet("/IMAG/PARC/cardlogo.webp");
          if (image.src !== secours) image.src = secours;
        }, { once: true });
        ouvrir.appendChild(image);
      }
    }
    const titre = document.createElement("span");
    titre.className = "lcdp-planning-carte-visite__legende";
    titre.textContent = "Parc de " + nom + " · " + date + (heure ? " · " + heure : "");
    if (!ouvrir.querySelector("img")) {
      const imageAbsente = document.createElement("span");
      imageAbsente.className = "lcdp-planning-carte-visite__sans-image";
      imageAbsente.textContent = "Parc de " + nom;
      ouvrir.appendChild(imageAbsente);
    }
    ouvrir.appendChild(titre);
    ouvrir.setAttribute("aria-label", "Voir les détails de la visite au parc " + nom + " le " + date);
    contenu.appendChild(cardReservation);
    const basculer = ouvert => {
      // Éviter de conserver un décalage vertical du recto dans le verso.
      if (ouvert) {
        dos.scrollTop = 0;
        contenu.scrollTop = 0;
      }
      carte.classList.toggle("is-retourne", ouvert);
      ouvrir.setAttribute("aria-expanded", String(ouvert));
      dos.setAttribute("aria-hidden", String(!ouvert));
      fermer.tabIndex = ouvert ? 0 : -1;
      contenu.querySelectorAll("button").forEach(bouton => { bouton.tabIndex = ouvert ? 0 : -1; });
    };
    ouvrir.addEventListener("click", () => basculer(true));
    fermer.addEventListener("click", () => { basculer(false); ouvrir.focus(); });
    basculer(false);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (carte.isConnected) carte.classList.add("is-ready");
    }));
    return carte;
  }

  function rafraichirListeFiltreePlanningMembre() {
    if (etat.modeAffichage === "liste") afficherPlanningMembreEnListe();
    else afficherCalendrierMois();
  }

  function moisReservationPlanningMembre(reservation) {
    return extraireDateFranceReservation(reservation.datebookd).slice(0,7);
  }

  function futursPourFiltresPlanningMembre() {
    return filtrerEtTrierReservationsAgenda(etat.reservations,"avenir");
  }

  function premierMoisRendezVousPlanningMembre() {
    const prochain = futursPourFiltresPlanningMembre()[0];
    return prochain ? moisReservationPlanningMembre(prochain) : "";
  }

  function installerFiltresPlanningMembre() {
    const tools = etat.wrapperPlanning?.querySelector("[data-lcdp-liste-card-tools]");
    if (!tools) return;
    const formulaire = document.createElement("form");
    formulaire.className = "lcdp-planning-filtres";
    formulaire.setAttribute("aria-label","Filtres des accès à venir");
    formulaire.addEventListener("submit", event => event.preventDefault());

    const champs = document.createElement("div");
    champs.className = "lcdp-planning-filtres__champs";
    for (const [cle, nom] of [["mois","Mois"],["departement","Département"],["parc","Parc"]]) {
      const select = document.createElement("select");
      select.id = "lcdp-planning-filtre-" + cle;
      select.className = "lcdp-planning-filtres__select";
      select.dataset.lcdpFiltre = cle;
      select.setAttribute("aria-label","Filtrer par " + nom.toLowerCase());
      select.appendChild(new Option("Tous",""));
      select.addEventListener("change", () => {
        etat.filtres[cle] = select.value;
        if (cle === "departement" || cle === "mois") actualiserOptionsFiltresPlanningMembre();
        actualiserEtatFiltresPlanningMembre();
        rafraichirListeFiltreePlanningMembre();
      });
      champs.appendChild(select);
    }
    formulaire.appendChild(champs);

    const groupe = document.createElement("div");
    groupe.className = "lcdp-planning-filtres__invitations";
    for (const [cle, libelle] of [["recues","Invitations"],["envoyees","Invités"]]) {
      const label = document.createElement("label");
      label.className = "lcdp-planning-filtres__option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = true;
      input.dataset.lcdpFiltreInvitation = cle;
      input.setAttribute("aria-label",libelle);
      const texte = document.createElement("span");
      texte.textContent = libelle;
      label.append(input,texte);
      input.addEventListener("change", () => {
        etat.filtres[cle] = input.checked;
        actualiserEtatFiltresPlanningMembre();
        rafraichirListeFiltreePlanningMembre();
      });
      groupe.appendChild(label);
    }
    formulaire.appendChild(groupe);

    const pied = document.createElement("div");
    pied.className = "lcdp-planning-filtres__actions";
    const resultat = document.createElement("span");
    resultat.className = "lcdp-planning-filtres__resultat";
    resultat.dataset.lcdpFiltresResultat = "true";
    resultat.setAttribute("role","status");
    resultat.setAttribute("aria-live","polite");
    const effacer = document.createElement("button");
    effacer.type = "button";
    effacer.className = "lcdp-planning-filtres__effacer";
    effacer.dataset.lcdpEffacerFiltres = "true";
    effacer.textContent = "Effacer";
    effacer.addEventListener("click", () => {
      etat.filtres = {
        mois: premierMoisRendezVousPlanningMembre(),
        departement: "", parc: "", recues: true, envoyees: true
      };
      actualiserOptionsFiltresPlanningMembre();
      actualiserEtatFiltresPlanningMembre();
      rafraichirListeFiltreePlanningMembre();
    });
    pied.append(resultat,effacer);
    formulaire.appendChild(pied);
    tools.replaceChildren(formulaire);
    tools.hidden = false;
    etat.formulaireFiltres = formulaire;
    actualiserOptionsFiltresPlanningMembre();
    actualiserEtatFiltresPlanningMembre();
  }

  function actualiserOptionsFiltresPlanningMembre() {
    const formulaire = etat.formulaireFiltres;
    if(!formulaire) return;
    const futures = futursPourFiltresPlanningMembre();
    const mois = [...new Set(futures.map(moisReservationPlanningMembre).filter(Boolean))].sort();
    if(!etat.filtresInitialises && futures.length) {
      etat.filtres.mois = mois[0] || "";
      etat.filtresInitialises = true;
    }

    const selectMois = formulaire.querySelector('[data-lcdp-filtre="mois"]');
    const selectionMois = etat.filtres.mois;
    selectMois.replaceChildren(new Option("Tous",""));
    for(const valeur of mois) {
      const [annee,numMois] = valeur.split("-").map(Number);
      const libelle = new Intl.DateTimeFormat("fr-FR", {month:"long",year:"numeric"})
        .format(new Date(annee,numMois-1,1));
      selectMois.add(new Option(libelle.charAt(0).toUpperCase()+libelle.slice(1),valeur));
    }
    if(selectionMois && !mois.includes(selectionMois)) etat.filtres.mois = "";
    selectMois.value = etat.filtres.mois;

    const dansMois = futures.filter(r => !etat.filtres.mois ||
      moisReservationPlanningMembre(r) === etat.filtres.mois);
    const dpts = [...new Set(dansMois.map(r=>
      String(r.parc?.dptmt||r.parc?.departement||r.dptmt||"").trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,"fr",{numeric:true}));
    const selectDpt = formulaire.querySelector('[data-lcdp-filtre="departement"]');
    selectDpt.replaceChildren(new Option("Tous",""));
    dpts.forEach(value=>selectDpt.add(new Option(value,value)));
    if(etat.filtres.departement && !dpts.includes(etat.filtres.departement)) etat.filtres.departement="";
    selectDpt.value = etat.filtres.departement;

    const dansDpt = dansMois.filter(r => !etat.filtres.departement ||
      String(r.parc?.dptmt||r.parc?.departement||r.dptmt||"").trim()===etat.filtres.departement);
    const parcs = [...new Set(dansDpt.map(r=>
      String(r.parc?.nom||r.parc?.nomparc||r.nomparc||"").trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,"fr",{numeric:true}));
    const selectParc = formulaire.querySelector('[data-lcdp-filtre="parc"]');
    selectParc.replaceChildren(new Option("Tous",""));
    parcs.forEach(value=>selectParc.add(new Option(value,value)));
    if(etat.filtres.parc && !parcs.includes(etat.filtres.parc)) etat.filtres.parc="";
    selectParc.value = etat.filtres.parc;
  }

  function nombreInvitesEnvoyesPlanning(reservation) {
    if (reservationHorsAbonnementMembre(reservation)) return 0;
    const stats = reservation?.invitationStats || reservation?.invitationsStats || {};
    const n = Number(stats.in ?? stats.actifs ?? stats.invites ?? 0);
    return Number.isFinite(n) ? Math.max(0,n) : 0;
  }
  function filtresPlanningActifs() {
    const f=etat.filtres;
    return Boolean(f.mois || f.parc || f.departement || !f.recues || !f.envoyees);
  }

  function actualiserEtatFiltresPlanningMembre() {
    const formulaire=etat.formulaireFiltres;
    if(!formulaire)return;
    const inactif=etat.periodeAffichage!=="avenir";
    const conteneur=formulaire.closest("[data-lcdp-liste-card-tools]");
    if(conteneur)conteneur.hidden=inactif||etat.modeAffichage==="agenda";
    for(const select of formulaire.querySelectorAll("select[data-lcdp-filtre]")) {
      select.disabled=inactif;
      select.value=etat.filtres[select.dataset.lcdpFiltre]||"";
    }
    for(const caseACocher of formulaire.querySelectorAll("input[data-lcdp-filtre-invitation]")) {
      caseACocher.disabled=inactif;
      caseACocher.checked=Boolean(etat.filtres[caseACocher.dataset.lcdpFiltreInvitation]);
    }
    const effacer=formulaire.querySelector("[data-lcdp-effacer-filtres]");
    if(effacer)effacer.disabled=inactif || (
      etat.filtres.mois===premierMoisRendezVousPlanningMembre() &&
      !etat.filtres.parc && !etat.filtres.departement &&
      etat.filtres.recues && etat.filtres.envoyees
    );
    formulaire.setAttribute("aria-disabled",String(inactif));
  }

  function filtrerReservationsPlanningMembre(reservations) {
    if(etat.periodeAffichage!=="avenir")return reservations;
    const f=etat.filtres;
    return reservations.filter(reservation=>{
      const parc=reservation.parc||{};
      const departement=String(parc.dptmt||parc.departement||reservation.dptmt||"").trim();
      const nom=String(parc.nom||parc.nomparc||reservation.nomparc||"").trim();
      if(f.mois && moisReservationPlanningMembre(reservation)!==f.mois)return false;
      if(f.departement && departement!==f.departement)return false;
      if(f.parc && nom!==f.parc)return false;
      if(!f.recues && reservationHorsAbonnementMembre(reservation))return false;
      if(!f.envoyees && !reservationHorsAbonnementMembre(reservation) &&
        (nombreInvitesEnvoyesPlanning(reservation)>0 ||
         etat.reservationsAvecInvites.has(String(reservation.idflux||""))))return false;
      return true;
    });
  }

  function filtrerEtTrierReservationsAgenda(
    source,
    periode = etat.periodeAffichage
  ) {
    const reservations =
      (Array.isArray(source) ? source : [])
        .filter((reservation) =>
          reservationDansPeriodeAgenda(
            reservation,
            periode
          )
        );

    reservations.sort((a, b) => {
      const dateA = new Date(
        a?.datebookd || ""
      ).getTime();
      const dateB = new Date(
        b?.datebookd || ""
      ).getTime();

      return periode === "avenir"
        ? dateA - dateB
        : dateB - dateA;
    });

    return reservations;
  }

  function reservationDansPeriodeAgenda(
    reservation,
    periode = etat.periodeAffichage
  ) {
    const annulee =
      reservationAnnuleePlanning(
        reservation
      );
    const passee =
      reservationPasseePlanning(
        reservation
      );

    return periode === "avenir"
      ? !annulee && !passee
      : annulee || passee;
  }

  function reservationAnnuleePlanning(
    reservation
  ) {
    return (
      normaliserTexteTechnique(
        reservation?.statut || ""
      ) === "cancd"
    );
  }

  function actualiserModeWrapperPlanning() {
    if (!etat.wrapperPlanning) return;

    const estListe = etat.modeAffichage === "liste";

    etat.wrapperPlanning.classList.toggle(
      "lcdp-box-liste-card--mode-liste",
      estListe
    );
    etat.wrapperPlanning.classList.toggle(
      "lcdp-box-liste-card--mode-agenda",
      !estListe
    );
    // Le titre/les onglets gardent exactement le même ancrage dans les trois modes.
    etat.wrapperPlanning.classList.add("lcdp-planning-navigation-permanente");
  }

  function actualiserBoutonAffichagePlanningMembre() {
    const bouton = etat.wrapperPlanning
      ? etat.wrapperPlanning.querySelector("[data-lcdp-planning-affichage]")
      : null;

    if (!bouton) return;

    const actif = etat.modeAffichage === "agenda";
    bouton.textContent = "Planning";
    bouton.setAttribute("aria-pressed", actif ? "true" : "false");
    bouton.classList.toggle("lcdp-button-primary", actif);
    bouton.classList.toggle("lcdp-button-secondary", !actif);
  }

  async function chargerReservations() {
    if (!ENDPOINT_PLANNING_MEMBRE) {
      afficherErreurCalendrier("Le service planning membre n’est pas configuré.");
      return;
    }

    try {
      afficherChargementCalendrier("Chargement de votre planning...");

      const reponse = await fetch(ENDPOINT_PLANNING_MEMBRE + "/mes-reservations", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      });

      const data = await reponse.json().catch(() => null);

      if (reponse.status === 401) {
        redirigerConnexionMembre("inactive");
        return;
      }

      if (!reponse.ok || !data || !reponseApiOk(data)) {
        throw new Error(messageErreurApi(data, "Impossible de charger votre planning."));
      }

      etat.reservations = Array.isArray(data.reservations) ? data.reservations : [];
      etat.abonnements = normaliserAbonnementsMembre(data.abonnements || data.abos || []);
      await chargerStatutsInvitationsPlanning();
      actualiserOptionsFiltresPlanningMembre();
      actualiserEtatFiltresPlanningMembre();
      etat.reservationsParDate = indexerReservationsParDate(etat.reservations);
      actualiserBoutonsPeriodePlanningMembre();
      ajusterMoisCourantSelonPeriode();
      afficherCalendrierMois();

      if (etat.modeAffichage === "liste") {
        afficherPlanningMembreEnListe();
      }
    } catch (error) {
      console.error("Erreur chargement planning membre :", error);
      afficherErreurCalendrier(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function chargerStatutsInvitationsPlanning() {
    if (!ENDPOINT_INVITER_MEMBRE || !etat.reservations.length) return;

    try {
      const reponse = await fetch(ENDPOINT_INVITER_MEMBRE + "/reservations-invitables", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      });

      const data = await reponse.json().catch(() => null);

      if (!reponse.ok || !data || !reponseApiOk(data) || !Array.isArray(data.reservations)) {
        return;
      }

      const maxInvit = Number.parseInt(String(data.maxInvit || "0"), 10);

      if (Number.isFinite(maxInvit) && maxInvit > 0) {
        etat.maxInvitInvitation = Math.min(maxInvit, 10);
      }

      const statsParFlux = new Map();
      etat.reservationsAvecInvites.clear();

      data.reservations.forEach((reservation) => {
        const idflux = String(reservation?.idflux || "").trim();
        if (!idflux) return;
        statsParFlux.set(idflux, reservation.invitationStats || { in: 0, out: 0 });
      });

      etat.reservations.forEach((reservation) => {
        const idflux = String(reservation?.idflux || "").trim();
        if (!idflux || !statsParFlux.has(idflux)) return;

        reservation.invitationStats = statsParFlux.get(idflux);

        if (Number(reservation.invitationStats?.in || 0) > 0) {
          etat.reservationsAvecInvites.add(idflux);
        }
      });
    } catch (error) {
      console.warn("Statuts invitation indisponibles :", error);
    }
  }

  function ajusterMoisCourantSelonPeriode() {
    const aujourdHui =
      dateAujourdhuiParis();
    const reservations =
      filtrerEtTrierReservationsAgenda(
        etat.reservations
      );
    const reservationReference =
      reservations[0] || null;
    const dateReference =
      reservationReference
        ? extraireDateFranceReservation(
            reservationReference.datebookd
          )
        : aujourdHui;

    etat.moisCourant =
      limiterMoisSelonPeriodePlanning(
        debutMois(
          dateReference || aujourdHui
        )
      );
  }

  function indexerReservationsParDate(reservations) {
    const index = new Map();

    (Array.isArray(reservations) ? reservations : []).forEach((reservation) => {
      const dateIso = extraireDateFranceReservation(reservation.datebookd);
      if (!dateIso) return;

      const plage = normaliserPlageReservation(reservation);
      if (!plage) return;

      if (!index.has(dateIso)) {
        index.set(dateIso, new Map());
      }

      const reservationsJour = index.get(dateIso);

      if (!reservationsJour.has(plage)) {
        reservationsJour.set(plage, []);
      }

      reservationsJour.get(plage).push(reservation);
    });

    return index;
  }

  function afficherCalendrierMois() {
    const calendrier = etat.calendrierMois;
    if (!calendrier || !etat.templateJour) return;

    const courant =
      limiterMoisSelonPeriodePlanning(
        etat.moisCourant ||
        debutMois(dateAujourdhuiParis())
      );
    etat.moisCourant = courant;
    const titreMois = calendrier.querySelector("[data-lcdp-calendrier-mois-current]");
    const grille = calendrier.querySelector("[data-lcdp-calendrier-mois-grid]");
    const message = calendrier.querySelector("[data-lcdp-calendrier-mois-message]");

    if (titreMois) {
      titreMois.textContent = formaterMoisAnnee(courant);
    }

    if (!grille) return;

    grille.innerHTML = "";
    grille.classList.remove("lcdp-box-calendrier-mois__grid--loading");

    const jours = construireJoursMois(courant);

    if (message) {
      message.hidden = true;
      message.textContent = "";
      delete message.dataset.lcdpMessageType;
    }

    actualiserNavigationMoisPlanning();

    const decalageDebut = obtenirDecalageLundi(jours[0].dateIso);

    for (let i = 0; i < decalageDebut; i += 1) {
      grille.appendChild(creerJourVide());
    }

    jours.forEach((jour) => {
      grille.appendChild(creerJourCalendrier(jour));
    });
  }

  function afficherChargementCalendrier() {
    const calendrier = etat.calendrierMois;
    if (!calendrier) return;

    const grille = calendrier.querySelector("[data-lcdp-calendrier-mois-grid]");
    const message = calendrier.querySelector("[data-lcdp-calendrier-mois-message]");

    if (grille) {
      grille.innerHTML = "";
      grille.classList.add("lcdp-box-calendrier-mois__grid--loading");
    }

    if (message) {
      message.hidden = true;
      message.textContent = "";
      delete message.dataset.lcdpMessageType;
    }
  }

  function afficherErreurCalendrier(messageTexte) {
    const calendrier = etat.calendrierMois;

    if (!calendrier) {
      const slot = document.getElementById("lcdp-planning-calendrier-slot");
      if (slot) slot.textContent = messageTexte || "Erreur technique.";
      return;
    }

    const grille = calendrier.querySelector("[data-lcdp-calendrier-mois-grid]");
    const message = calendrier.querySelector("[data-lcdp-calendrier-mois-message]");

    if (grille) {
      grille.innerHTML = "";
      grille.classList.remove("lcdp-box-calendrier-mois__grid--loading");
    }

    if (message) {
      message.hidden = false;
      message.textContent = messageTexte || "Erreur technique.";
      message.dataset.lcdpMessageType = "erreur";
    }
  }

  function creerJourVide() {
    const jour = etat.templateJour.cloneNode(true);
    jour.classList.add("lcdp-box-card-jour-in-calendrier-mois--empty");
    jour.disabled = true;
    jour.setAttribute("aria-hidden", "true");
    return jour;
  }

  function creerJourCalendrier(jourMois) {
    const jour = etat.templateJour.cloneNode(true);
    const numero = jour.querySelector("[data-lcdp-card-jour-mois-number]");
    const reservationsJour = etat.reservationsParDate.get(jourMois.dateIso) || new Map();
    const aujourdHui = dateAujourdhuiParis();
    const estPasse = jourMois.dateIso < aujourdHui;
    const estAujourdhui = jourMois.dateIso === aujourdHui;
    const estDansAbonnementAvenir = !estPasse && dateDansPeriodeAbonnementMembre(jourMois.dateIso);
    let jourReservable = false;

    if (numero) numero.textContent = String(jourMois.jour);

    jour.dataset.date = jourMois.dateIso;

    // Classes et couleurs du calendrier général PLANIFIER.
    jour.classList.add("lcdp-box-card-jour-in-calendrier-mois--planning-lecture",
      "lcdp-planifier-jour--sans-parc");
    if (estAujourdhui) jour.classList.add("lcdp-box-card-jour-in-calendrier-mois--today");
    if (estPasse) jour.classList.add("lcdp-box-card-jour-in-calendrier-mois--past");
    if (estDansAbonnementAvenir) jour.classList.add("lcdp-planifier-jour--abonnement-couvert");

    PLAGES.forEach((plage) => {
      const slot = jour.querySelector(`[data-lcdp-card-jour-mois-slot="${plage}"]`);
      if (!slot) return;

      // À l'identique de PLANIFIER, un trait n'est visible que si la plage est occupée.
      slot.className = "lcdp-box-card-jour-in-calendrier-mois__slot";
      slot.hidden = true;
      slot.replaceChildren();
      slot.removeAttribute("data-idflux");
      slot.removeAttribute("data-plage");

      const reservationsPlage =
        (reservationsJour.get(plage) || [])
          .filter((reservation) =>
            reservationDansPeriodeAgenda(
              reservation
            )
          )
          .sort((a, b) => {
            const dateA = new Date(
              a?.datebookd || ""
            ).getTime();
            const dateB = new Date(
              b?.datebookd || ""
            ).getTime();

            return etat.periodeAffichage ===
              "avenir"
              ? dateA - dateB
              : dateB - dateA;
          });
      const reservation =
        reservationsPlage[0] || null;

      if (!reservation) return;

      jourReservable = true;
      slot.hidden = false;

      const estAnnulee =
        reservationAnnuleePlanning(
          reservation
        );

      if (estAnnulee) {
        jour.classList.add(
          "lcdp-box-card-jour-in-calendrier-mois--past",
          "lcdp-box-card-jour-in-calendrier-mois--reservation-annulee"
        );
      }

      const estInvite =
        reservationHorsAbonnementMembre(
          reservation
        );
      const estInvitation =
        !estInvite &&
        reservationAvecInvitesActifsAgenda(
          reservation
        );

      const reservationsPersonnelles = reservationsPlage.some(r => !reservationHorsAbonnementMembre(r));
      const invitationsRecues = reservationsPlage.some(r => reservationHorsAbonnementMembre(r));
      slot.classList.add(
        reservationsPersonnelles && invitationsRecues
          ? "lcdp-planifier-plage--acces-et-invitation"
          : invitationsRecues
            ? "lcdp-planifier-plage--invitation-recue"
            : "lcdp-planifier-plage--acces-personnel"
      );
      // Aucune étiquette de parc superposée aux traits de PLANIFIER.
      slot.dataset.idflux =
        String(reservation.idflux || "");
      slot.dataset.plage = plage;
      slot.addEventListener(
        "click",
        gererClicSlotCalendrier
      );

      const nomParcComplet = nomParcReservation(reservation);
      const typeAgenda =
        typeReservationAgenda(reservation);
      const libelleStatut =
        estAnnulee
          ? typeAgenda + " annulée"
          : typeAgenda;

      slot.setAttribute(
        "aria-label",
        libelleStatut +
          " " +
          (nomParcComplet
            ? nomParcComplet + " - "
            : "") +
          libellePlage(plage) +
          " du " +
          formaterDateCourte(
            reservation.datebookd
          )
      );
      slot.title =
        libelleStatut +
        " " +
        (nomParcComplet
          ? nomParcComplet + " - "
          : "") +
        libellePlage(plage);
    });

    // La journée est consultable si elle contient au moins une réservation.
    // Les traits conservent leur interaction propre sans déclencher celle du jour.
    jour.disabled = !jourReservable;
    if (jourReservable) {
      jour.setAttribute("aria-label", "Afficher tous les accès du " + formaterJourMoisDateIso(jourMois.dateIso));
      jour.addEventListener("click", () => {
        ouvrirReservationsJourPlanning(jourMois.dateIso).catch(error => {
          console.error("Erreur ouverture des accès du jour :", error);
          afficherAlerte("Impossible d’afficher les accès de cette journée.").catch(console.error);
        });
      });
    }

    return jour;
  }

  function gererClicSlotCalendrier(event) {
    event.preventDefault();
    event.stopPropagation();

    const slot = event.currentTarget;

    if (!slot || !slot.dataset.idflux) {
      return;
    }

    const reservation =
      trouverReservationPlanningParId(
        slot.dataset.idflux
      );

    if (!reservation) {
      afficherAlerte(
        "Réservation introuvable."
      ).catch(console.error);
      return;
    }

    ouvrirReservationPlanning(
      reservation
    ).catch(console.error);
  }

  // Consultation d'une journée DANS le wrapper membre : aucune lightbox globale.
  function fermerReservationsJourPlanning() {
    const slot = etat.slotPlanning;
    if (!slot || !slot.querySelector("[data-lcdp-planning-jour-inline]")) return;
    slot.replaceChildren(etat.calendrierMois);
    afficherCalendrierMois();
    const retour = slot.querySelector('[data-lcdp-card-jour-mois][data-date="' +
      (etat.jourConsultationPlanning || "") + '"]');
    etat.jourConsultationPlanning = null;
    if (retour) retour.focus({preventScroll:true});
  }

  async function ouvrirReservationsJourPlanning(dateIso) {
    const slot = etat.slotPlanning;
    if (!slot || !etat.templateReservation || etat.modeAffichage !== "agenda") return;
    const reservations = (etat.reservations || [])
      .filter(reservation =>
        extraireDateFranceReservation(reservation.datebookd) === dateIso &&
        reservationDansPeriodeAgenda(reservation)
      )
      .sort((a,b) => {
        const dateA = new Date(a.datebookd || "").getTime();
        const dateB = new Date(b.datebookd || "").getTime();
        if (dateA !== dateB) return dateA - dateB;
        return PLAGES.indexOf(normaliserPlageReservation(a)) -
          PLAGES.indexOf(normaliserPlageReservation(b));
      });
    if (!reservations.length) return;

    const page = document.createElement("section");
    page.className = "lcdp-planning-jour-inline";
    page.dataset.lcdpPlanningJourInline = "true";
    const entete = document.createElement("header");
    entete.className = "lcdp-planning-jour-entete";
    const titre = document.createElement("h2");
    titre.textContent = "Accès du " + formaterJourMoisDateIso(dateIso);
    const fermer = document.createElement("button");
    fermer.type = "button";
    fermer.className = "lcdp-planning-jour-fermer";
    fermer.textContent = "Retour au planning";
    fermer.addEventListener("click", fermerReservationsJourPlanning);
    entete.append(titre,fermer);
    page.appendChild(entete);

    // Le workflow existant est conservé pour les actions Accès/Inviter/Annuler.
    // En mode inline, il n'est ni modal ni en superposition.
    const fragment = await chargerFragmentObjet("/HTMLBASE/04-workflow-reservation.html");
    const workflow = fragment.querySelector("[data-lcdp-box-workflow-reservation]");
    const contenu = fragment.querySelector("[data-lcdp-workflow-reservation-content]");
    if (!workflow || !contenu) throw new Error("Gabarit workflow réservation introuvable.");
    workflow.removeAttribute("role");
    workflow.removeAttribute("aria-modal");
    workflow.classList.add("lcdp-box-workflow-reservation--planning-page",
      "lcdp-planning-jour-workflow-inline");
    const vues = document.createElement("div");
    vues.className = "lcdp-planning-reservation-vues";
    vues.dataset.lcdpPlanningReservationVues = "true";
    const vue = document.createElement("div");
    vue.className = "lcdp-planning-reservation-vue lcdp-planning-reservation-vue--active";
    vue.dataset.lcdpPlanningVue = "reservation";

    const galerie = etat.templateListeParcsDiaporama
      ? etat.templateListeParcsDiaporama.cloneNode(true)
      : document.createElement("div");
    const liste = galerie.querySelector?.("[data-lcdp-liste-card-diaporama-list]") || galerie;
    liste.classList.add("lcdp-planning-jour-liste");
    for (const reservation of reservations) {
      const carteReservation = creerCardReservation(reservation,{contexte:"liste"});
      carteReservation.classList.add("lcdp-box-card-reservation-membre--liste");
      liste.appendChild(creerCarteVisiteDiaporama(carteReservation,reservation));
    }
    vue.appendChild(galerie);
    vues.appendChild(vue);
    contenu.appendChild(vues);
    workflow._lcdpFermerReservationPlanning = fermerReservationsJourPlanning;
    page.appendChild(workflow);

    etat.jourConsultationPlanning = dateIso;
    slot.replaceChildren(page);
    fermer.focus({preventScroll:true});
  }

  async function ouvrirReservationPlanning(reservation) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot || !etat.templateReservation) return;

    slot.innerHTML = "";

    const fragmentWorkflow = await chargerFragmentObjet("/HTMLBASE/04-workflow-reservation.html");
    slot.appendChild(fragmentWorkflow);

    const workflow = slot.querySelector("[data-lcdp-box-workflow-reservation]");
    const contenu = slot.querySelector("[data-lcdp-workflow-reservation-content]");

    if (!workflow || !contenu) {
      slot.innerHTML = "";
      throw new Error("Structure workflow réservation incomplète.");
    }

    workflow.classList.add(
      "lcdp-box-workflow-reservation--planning-reservation",
      "lcdp-box-workflow-reservation--confirmation",
      "lcdp-workflow-reservation-box"
    );

    const vues = document.createElement("div");
    vues.className = "lcdp-planning-reservation-vues";
    vues.dataset.lcdpPlanningReservationVues = "true";

    const vueReservation = document.createElement("div");
    vueReservation.className = "lcdp-planning-reservation-vue lcdp-planning-reservation-vue--active";
    vueReservation.dataset.lcdpPlanningVue = "reservation";

    const card = creerCardReservation(
      reservation,
      {
        contexte: "detail"
      }
    );
    vueReservation.appendChild(card);
    vues.appendChild(vueReservation);

    contenu.appendChild(vues);

    function fermer() {
      document.removeEventListener("keydown", gererEchapReservation);
      slot.innerHTML = "";
    }

    function gererEchapReservation(event) {
      if (event.key !== "Escape") return;

      if (workflow.classList.contains("lcdp-box-workflow-reservation--acces-parc-ouvert")) {
        event.preventDefault();
        fermerAccesParcDansReservation(workflow);
        return;
      }

      fermer();
    }

    workflow._lcdpFermerReservationPlanning = fermer;

    workflow.addEventListener("click", (event) => {
      if (event.target === workflow) fermer();
    });

    document.addEventListener("keydown", gererEchapReservation);
  }

  function creerCardReservation(
    reservation,
    options = {}
  ) {
    const card =
      etat.templateReservation.cloneNode(true);

    const estPasse = reservationPasseePlanning(reservation);
    const delaiActionDepasse = reservationDelaiActionDepasse(reservation);

    const parc = reservation.parc || {};
    const nomParc = parc.nom || parc.nomparc || reservation.nomparc || "Parc";
    const departement = parc.dptmt || parc.departement || reservation.dptmt || "";
    const idParc = parc.idparc || reservation.idparc || "";
    const idFlux = reservation.idflux || "";
    const cheminImageCard = construireCheminImageParcParDefaut(nomParc, departement);

    const media = card.querySelector("[data-lcdp-card-reservation-media]");
    const image = card.querySelector("[data-lcdp-card-reservation-image]");
    const invitation = card.querySelector("[data-lcdp-card-reservation-invitation]");
    const badgeInvitation = card.querySelector("[data-lcdp-card-reservation-invitation-badge]");
    const date = card.querySelector("[data-lcdp-card-reservation-date]");
    const heure = card.querySelector("[data-lcdp-card-reservation-heure]");
    const parcElement = card.querySelector("[data-lcdp-card-reservation-parc]");
    const departementElement = card.querySelector("[data-lcdp-card-reservation-departement]");
    const boutonAdresse = card.querySelector("[data-action='adresse']");
    const boutonInvitation =
      card.querySelector(
        "[data-action='invitation']"
      );
    const boutonAnnuler =
      card.querySelector(
        "[data-action='annuler']"
      );
    const boutonFermer =
      card.querySelector(
        "[data-action='fermer']"
      );

    card.dataset.idflux = idFlux;

    const estAnnulee =
      reservationAnnuleePlanning(
        reservation
      );

    if (estPasse || estAnnulee) {
      card.classList.add(
        "lcdp-box-card-reservation-membre--passe"
      );
    }

    if (estAnnulee) {
      card.classList.add(
        "lcdp-box-card-reservation-membre--annulee"
      );
    }

    if (
      options.prochaine === true &&
      !estPasse &&
      !estAnnulee
    ) {
      card.classList.add(
        "lcdp-box-card-reservation-membre--prochaine"
      );
      card.dataset.lcdpProchaineReservation =
        "true";
    }

    if (boutonFermer) {
      const afficherFermer =
        options.contexte === "detail";

      boutonFermer.hidden =
        !afficherFermer;
      boutonFermer.setAttribute(
        "aria-hidden",
        afficherFermer
          ? "false"
          : "true"
      );
    }

    const estReservationHorsAbonnement = reservationHorsAbonnementMembre(reservation);

    if (estReservationHorsAbonnement) {
      card.classList.add("lcdp-box-card-reservation-membre--invitation");
    }

    if (image && media) {
      const srcImage = construireUrlImageParc(cheminImageCard);

      if (srcImage) {
        image.src = srcImage;
        image.alt = "Parc de " + nomParc;
        image.addEventListener("error", () => {
          const secours = construireUrlObjet("/IMAG/PARC/cardlogo.webp");
          if (image.src !== secours) image.src = secours;
        }, { once: true });
        media.hidden = false;
        card.classList.add("lcdp-box-card-reservation-membre--avec-image");
      } else {
        image.removeAttribute("src");
        image.alt = "";
        media.hidden = true;
      }
    }

    if (invitation) {
      invitation.textContent =
        estAnnulee
          ? "Annulée"
          : "";
      invitation.hidden =
        !estAnnulee;
    }

    if (date) date.textContent = formaterDateCourte(reservation.datebookd);
    if (heure) heure.textContent = formaterHeureReservation(reservation.datebookd);
    if (parcElement) parcElement.textContent = "Parc de " + nomParc;

    if (departementElement) {
      departementElement.textContent = departement ? "(" + departement + ")" : "";
      departementElement.hidden = !departement;
    }

    if (boutonAdresse) {
      boutonAdresse.textContent = "Accès";
      boutonAdresse.classList.add("lcdp-box-card-reservation-membre__micro-action--acces");
      boutonAdresse.dataset.idparc = idParc;
      boutonAdresse.dataset.id = idFlux;
    }

    if (boutonInvitation) {
      boutonInvitation.dataset.id = idFlux;
      boutonInvitation.hidden =
        estAnnulee;
      boutonInvitation.classList.remove(
        "lcdp-box-card-reservation-membre__micro-action--delai-depasse",
        "lcdp-box-card-reservation-membre__micro-action--invit-recu"
      );

      if (estReservationHorsAbonnement) {
        boutonInvitation.textContent = "Invit’";
        boutonInvitation.classList.add("lcdp-box-card-reservation-membre__micro-action--invit-recu");
        boutonInvitation.setAttribute("aria-disabled", "false");
        boutonInvitation.removeAttribute("disabled");
        boutonInvitation.disabled = false;
        boutonInvitation.style.pointerEvents = "auto";
        boutonInvitation.title = "Afficher le parrain";
        boutonInvitation.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          afficherParrainReservationInvitee(reservation).catch((error) => {
            console.error("[LCDP invitation reçue] affichage parrain impossible", error);
            try {
              window.alert(formaterParrainInvitationRecue(reservation));
            } catch {
              window.alert("Invitation par : Parrain non renseigné");
            }
          });
        });
      } else {
        boutonInvitation.textContent = reservationAvecInvitesPlanning(reservation) ? "Invité(s)" : "Inviter";
        boutonInvitation.setAttribute("aria-disabled", "false");
        boutonInvitation.removeAttribute("title");
      }
    }

    if (badgeInvitation) {
      badgeInvitation.textContent = "";
      badgeInvitation.hidden = true;
      badgeInvitation.setAttribute("aria-hidden", "true");
    }

    if (boutonAnnuler) {
      boutonAnnuler.dataset.id = idFlux;
      boutonAnnuler.hidden =
        estAnnulee;
      boutonAnnuler.textContent =
        estReservationHorsAbonnement
          ? "Annuler l’invite"
          : "Annuler la réservation";
      boutonAnnuler.hidden = false;
      boutonAnnuler.classList.toggle("lcdp-box-card-reservation-membre__micro-action--delai-depasse", delaiActionDepasse);
      boutonAnnuler.setAttribute("aria-disabled", delaiActionDepasse ? "true" : "false");

      if (delaiActionDepasse) {
        boutonAnnuler.title = "Délai dépassé";
      } else {
        boutonAnnuler.removeAttribute("title");
      }
    }

    return card;
  }

  function creerLigneInvitation(reservation, estReservationHorsAbonnement) {
    if (estReservationHorsAbonnement !== true) return "";

    const parrain = reservation.parrain || null;

    if (!parrain) return "Invitation";

    const nom = parrain.nommembre || parrain.nom || "";
    const prenom = parrain.prenommembre || parrain.prenom || "";

    const identite = [nom, prenom]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ");

    return identite ? "Invitation (" + identite + ")" : "Invitation";
  }

  async function gererClicDocument(event) {
    const boutonRetourAcces = event.target.closest("[data-lcdp-card-acces-parc-retour]");
    const boutonFermerReservation = event.target.closest("[data-action='fermer']");
    const boutonAdresse = event.target.closest("[data-action='adresse']");
    const boutonInvitation = event.target.closest("[data-action='invitation']");
    const boutonAnnuler = event.target.closest("[data-action='annuler']");

    if (boutonRetourAcces) {
      event.preventDefault();
      event.stopPropagation();
      const workflow = boutonRetourAcces.closest("[data-lcdp-box-workflow-reservation]");
      fermerAccesParcDansReservation(workflow);
      return;
    }

    if (boutonFermerReservation) {
      event.preventDefault();
      event.stopPropagation();
      const workflow = boutonFermerReservation.closest("[data-lcdp-box-workflow-reservation]");

      if (workflow && typeof workflow._lcdpFermerReservationPlanning === "function") {
        workflow._lcdpFermerReservationPlanning();
        return;
      }

      const slot = document.getElementById("lcdp-lightbox-slot");
      if (slot) slot.innerHTML = "";
      return;
    }

    if (boutonAdresse) {
      const cardReservation = boutonAdresse.closest("[data-lcdp-box-card-reservation-membre]");
      const idflux = String(boutonAdresse.dataset.id || cardReservation?.dataset.idflux || "").trim();
      await ouvrirAccesParcReservation(idflux, boutonAdresse);
      return;
    }

    if (boutonInvitation) {
      const cardReservation = boutonInvitation.closest("[data-lcdp-box-card-reservation-membre]");
      const idflux = String(boutonInvitation.dataset.id || cardReservation?.dataset.idflux || "").trim();
      const reservation = trouverReservationPlanningParId(idflux);

      if (reservationHorsAbonnementMembre(reservation)) {
        event.preventDefault();
        event.stopPropagation();
        await afficherParrainReservationInvitee(reservation);
        return;
      }

      await ouvrirPageInvitation(idflux, boutonInvitation);
      return;
    }

    if (boutonAnnuler) {
      await traiterAnnulationReservation(boutonAnnuler);
    }
  }

  async function ouvrirAccesParcReservation(idflux, declencheur) {
    const idReservation = String(idflux || "").trim();

    if (!idReservation) {
      await afficherAlerte("Réservation manquante.");
      return;
    }

    const reservation = etat.reservations.find((item) => String(item.idflux || "") === idReservation);

    if (!reservation) {
      await afficherAlerte("Réservation introuvable.");
      return;
    }

    const workflow = declencheur
      ? declencheur.closest("[data-lcdp-box-workflow-reservation]")
      : document.querySelector("#lcdp-lightbox-slot [data-lcdp-box-workflow-reservation]");

    if (!workflow) return;

    const vues = workflow.querySelector("[data-lcdp-planning-reservation-vues]");
    const vueReservation = workflow.querySelector('[data-lcdp-planning-vue="reservation"]');

    if (!vues || !vueReservation) return;

    let vueAcces = workflow.querySelector('[data-lcdp-planning-vue="acces"]');
    let boxAcces = vueAcces ? vueAcces.querySelector("[data-lcdp-box-card-acces-parc]") : null;

    if (!vueAcces || !boxAcces) {
      vueAcces = document.createElement("div");
      vueAcces.className = "lcdp-planning-reservation-vue";
      vueAcces.dataset.lcdpPlanningVue = "acces";
      vueAcces.hidden = true;

      const fragmentAcces = await chargerFragmentObjet("/HTMLBASE/04-card-acces-parc.html");
      vueAcces.appendChild(fragmentAcces);
      vues.appendChild(vueAcces);

      boxAcces = vueAcces.querySelector("[data-lcdp-box-card-acces-parc]");

      if (!boxAcces) {
        throw new Error("Structure accès parc introuvable.");
      }

      preparerBoxAccesParcInline(boxAcces, workflow);
    }

    await remplirBoxAccesParc(boxAcces, reservation);

    workflow.dataset.lcdpAccesDeclencheurId = declencheur && declencheur.id ? declencheur.id : "";
    workflow._lcdpDernierDeclencheurAcces = declencheur || null;

    vueReservation.hidden = true;
    vueReservation.classList.remove("lcdp-planning-reservation-vue--active");

    vueAcces.hidden = false;
    vueAcces.classList.add("lcdp-planning-reservation-vue--active");
    workflow.classList.add("lcdp-box-workflow-reservation--acces-parc-ouvert");

    const retour = boxAcces.querySelector("[data-lcdp-card-acces-parc-retour]");
    const titre = boxAcces.querySelector("[data-lcdp-card-acces-parc-title]");

    if (retour && typeof retour.focus === "function") {
      retour.focus({ preventScroll: true });
    } else if (titre && typeof titre.focus === "function") {
      titre.focus({ preventScroll: true });
    }
  }

  function preparerBoxAccesParcInline(boxAcces, workflow) {
    boxAcces.classList.add("lcdp-box-card-acces-parc--inline");
    boxAcces.removeAttribute("aria-modal");
    boxAcces.setAttribute("role", "region");

    let boutonRetour = boxAcces.querySelector("[data-lcdp-card-acces-parc-retour]");
    const header = boxAcces.querySelector(".lcdp-box-card-acces-parc__header");
    const titre = boxAcces.querySelector("[data-lcdp-card-acces-parc-title]");

    if (!boutonRetour) {
      boutonRetour = boxAcces.querySelector("[data-lcdp-card-acces-parc-close]");

      if (boutonRetour) {
        boutonRetour.removeAttribute("data-lcdp-card-acces-parc-close");
        boutonRetour.setAttribute("data-lcdp-card-acces-parc-retour", "");
        boutonRetour.setAttribute("aria-label", "Retour à la réservation");
        boutonRetour.textContent = "← Retour";
      }
    }

    if (boutonRetour) {
      boutonRetour.classList.add("lcdp-box-card-acces-parc__close--retour");
      boutonRetour.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        fermerAccesParcDansReservation(workflow);
      });

      if (header) {
        let ligneRetour = boxAcces.querySelector(".lcdp-box-card-acces-parc__retour-row");

        if (!ligneRetour) {
          ligneRetour = document.createElement("div");
          ligneRetour.className = "lcdp-box-card-acces-parc__retour-row";
          header.insertAdjacentElement("beforebegin", ligneRetour);
        }

        if (boutonRetour.parentNode !== ligneRetour) {
          ligneRetour.appendChild(boutonRetour);
        }
      }
    }

    if (titre) {
      titre.tabIndex = -1;
    }
  }

  function fermerAccesParcDansReservation(workflow) {
    const racine = workflow || document.querySelector("#lcdp-lightbox-slot [data-lcdp-box-workflow-reservation]");
    if (!racine) return;

    const vueReservation = racine.querySelector('[data-lcdp-planning-vue="reservation"]');
    const vueAcces = racine.querySelector('[data-lcdp-planning-vue="acces"]');

    if (vueAcces) {
      vueAcces.hidden = true;
      vueAcces.classList.remove("lcdp-planning-reservation-vue--active");
    }

    if (vueReservation) {
      vueReservation.hidden = false;
      vueReservation.classList.add("lcdp-planning-reservation-vue--active");
    }

    racine.classList.remove("lcdp-box-workflow-reservation--acces-parc-ouvert");

    const declencheur = racine._lcdpDernierDeclencheurAcces;
    if (declencheur && typeof declencheur.focus === "function") {
      declencheur.focus({ preventScroll: true });
    }
  }

  async function remplirBoxAccesParc(boxAcces, reservation) {
    const parc = reservation.parc || {};
    const nomParc = parc.nom || parc.nomparc || reservation.nomparc || "Parc";
    const departement = parc.dptmt || parc.departement || reservation.dptmt || "";

    const titre = boxAcces.querySelector("[data-lcdp-card-acces-parc-title]");
    const slotMap = boxAcces.querySelector("[data-lcdp-card-acces-parc-map-slot]");
    const zoneAdresse = boxAcces.querySelector("[data-lcdp-card-acces-parc-adresse]");
    const zoneEntree = boxAcces.querySelector("[data-lcdp-card-acces-parc-entree]");
    const slotGalerie = boxAcces.querySelector("[data-lcdp-card-acces-parc-galerie-slot]");

    if (titre) titre.textContent = "Accès au parc de " + nomParc;

    if (slotMap) {
      await remplirMapParc(slotMap, parc);
    }

    if (zoneAdresse) {
      remplirAdresseParc(zoneAdresse, parc);
    }

    if (zoneEntree) {
      zoneEntree.textContent = String(parc.entreeparc || reservation.entreeparc || "Entrée du parc à renseigner.").trim();
    }

    if (slotGalerie) {
      await remplirGalerieEntreeParc(slotGalerie, {
        nomParc,
        departement
      });
    }
  }

  async function remplirMapParc(slotMap, parc) {
    slotMap.innerHTML = "";

    const fragmentMap = await chargerFragmentObjet("/HTMLBASE/04-card-map-parc.html");
    slotMap.appendChild(fragmentMap);

    const coords = slotMap.querySelector("[data-lcdp-card-map-parc-coords]");
    const lat = nettoyerCoordonneeParc(parc.latparc);
    const lng = nettoyerCoordonneeParc(parc.lngparc);

    if (coords) {
      coords.textContent = lat && lng
        ? "Lat. " + lat + " · Lng. " + lng
        : "Coordonnées à renseigner.";
    }
  }

  function remplirAdresseParc(zoneAdresse, parc) {
    zoneAdresse.innerHTML = "";

    const lignes = [parc.adresse1, parc.adresse2, parc.adresse3]
      .map((ligne) => String(ligne || "").trim())
      .filter(Boolean);

    if (!lignes.length) {
      const ligneVide = document.createElement("p");
      ligneVide.textContent = "Adresse à renseigner.";
      zoneAdresse.appendChild(ligneVide);
      return;
    }

    lignes.forEach((ligne) => {
      const paragraphe = document.createElement("p");
      paragraphe.textContent = ligne;
      zoneAdresse.appendChild(paragraphe);
    });
  }

  async function remplirGalerieEntreeParc(slotGalerie, data) {
    if (!slotGalerie) return;

    slotGalerie.innerHTML = "";
    slotGalerie.classList.add("lcdp-box-card-acces-parc__photos");

    const liste = document.createElement("div");
    liste.className = "lcdp-box-card-acces-parc__photos-list";

    ["entree1.webp", "entree2.webp"].forEach((fichier, index) => {
      liste.appendChild(creerPhotoEntreeParc({
        chemin: construireCheminImageParcFichier(data.nomParc, data.departement, fichier),
        alt: "Entrée " + String(index + 1) + " du parc de " + data.nomParc
      }));
    });

    slotGalerie.appendChild(liste);
  }

  function creerPhotoEntreeParc(data) {
    const figure = document.createElement("figure");
    figure.className = "lcdp-box-card-acces-parc__photo";

    const image = document.createElement("img");
    image.className = "lcdp-box-card-acces-parc__photo-image";
    image.alt = data.alt || "Entrée du parc";
    image.loading = "eager";
    image.decoding = "async";
    image.src = construireUrlImageParc(data.chemin || "");

    figure.appendChild(image);

    return figure;
  }

  function nettoyerCoordonneeParc(value) {
    const texte = String(value ?? "").trim();
    if (!texte) return "";

    const nombre = Number(texte.replace(",", "."));
    if (!Number.isFinite(nombre)) return texte;

    return String(Math.round(nombre * 1000000) / 1000000);
  }

  async function ouvrirPageInvitation(idflux, declencheur) {
    const idReservation = String(idflux || "").trim();

    if (!idReservation) {
      await afficherAlerteInvitationReservation("Réservation manquante.", declencheur);
      return;
    }

    const reservation = trouverReservationPlanningParId(idReservation);

    if (!reservation) {
      await afficherAlerteInvitationReservation("Réservation introuvable.", declencheur);
      return;
    }

    if (reservationHorsAbonnementMembre(reservation)) {
      await afficherAlerteInvitationReservation(formaterParrainInvitationRecue(reservation), declencheur);
      return;
    }

    if (reservationAvecInvitesPlanning(reservation)) {
      await ouvrirListeInvitesReservation(idReservation, declencheur);
      return;
    }

    const blocageInvitation = determinerBlocageInvitationReservation(reservation);

    if (blocageInvitation) {
      await afficherAlerteInvitationReservation(blocageInvitation, declencheur);
      return;
    }

    const blocageAcces = determinerBlocageReservationPlanning(etat.membre || creerEtatMembreFallback());

    if (blocageAcces) {
      await afficherAlerteInvitationReservation(blocageAcces, declencheur);
      return;
    }

    const resultat = await ouvrirBoxEmailsInvitationReservation(idReservation, declencheur);

    if (!resultat) return;

    if (invitationReservationCreee(resultat)) {
      marquerReservationAvecInvitesPlanning(idReservation, declencheur);
      await afficherAlerteInvitationReservation(resultat.message || "Invitation envoyée.", declencheur);
    }
  }

  function trouverReservationPlanningParId(idflux) {
    const idReservation = String(idflux || "").trim();

    if (!idReservation) return null;

    return etat.reservations.find((item) => String(item.idflux || "") === idReservation) || null;
  }

  async function afficherParrainReservationInvitee(reservation) {
    const message = formaterParrainInvitationRecue(reservation);

    try {
      await afficherAlerteOkParDessusLightbox(message);
    } catch (error) {
      console.error("[LCDP invitation reçue] alerte objet impossible", error);
      window.alert(message);
    }
  }

  function nettoyerTexteSimple(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function nettoyerEmail(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function emailValide(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
  }

  function formaterParrainInvitationRecue(reservation) {
    const affichage = nettoyerTexteSimple(reservation?.parrainInvitation?.affichage || "");

    if (affichage) return "Invitation par : " + affichage;

    const parrain = reservation?.parrainInvitation || reservation?.parrain || {};
    const alias = nettoyerTexteSimple(
      parrain.alias ||
      parrain.aliasmembre ||
      reservation?.aliasparrain ||
      reservation?.aliasParrain ||
      ""
    );

    if (alias) return "Invitation par : " + alias;

    const prenom = nettoyerTexteSimple(
      parrain.prenommembre ||
      parrain.prenom ||
      reservation?.prenomparrain ||
      reservation?.prenomParrain ||
      ""
    );
    const nom = nettoyerTexteSimple(
      parrain.nommembre ||
      parrain.nom ||
      reservation?.nomparrain ||
      reservation?.nomParrain ||
      ""
    );
    const initialeNom = nom ? nom.charAt(0).toUpperCase() + "." : "";
    const identite = [prenom, initialeNom].filter(Boolean).join(" ");

    return "Invitation par : " + (identite || "Parrain non renseigné");
  }

  function reservationAvecInvitesActifsAgenda(
    reservation
  ) {
    if (
      !reservation ||
      reservationHorsAbonnementMembre(
        reservation
      )
    ) {
      return false;
    }

    const idflux = String(
      reservation.idflux || ""
    ).trim();

    if (
      idflux &&
      etat.reservationsAvecInvites.has(idflux)
    ) {
      return true;
    }

    const stats =
      reservation.invitationStats ||
      reservation.invitationsStats ||
      null;
    const actifs = Number(
      stats?.in ||
      stats?.actifs ||
      stats?.invites ||
      0
    );

    return (
      Number.isFinite(actifs) &&
      actifs > 0
    );
  }

  function typeReservationAgenda(reservation) {
    if (
      reservationHorsAbonnementMembre(
        reservation
      )
    ) {
      return "Invite";
    }

    if (
      reservationAvecInvitesActifsAgenda(
        reservation
      )
    ) {
      return "Invitation";
    }

    return "Réservation";
  }

  function reservationAvecInvitesPlanning(reservation) {
    const idflux = String(reservation?.idflux || "").trim();

    if (!idflux) return false;
    if (etat.reservationsAvecInvites.has(idflux)) return true;
    if (reservationDelaiActionDepasse(reservation)) return true;

    const stats = reservation?.invitationStats || reservation?.invitationsStats || null;
    const invitesActifs = Number(stats?.in || stats?.actifs || stats?.invites || 0);

    return Number.isFinite(invitesActifs) && invitesActifs > 0;
  }

  function invitationReservationCreee(data) {
    if (!data || !reponseApiOk(data)) return false;

    if (Array.isArray(data.invitations) && data.invitations.length > 0) return true;
    if (Array.isArray(data.emailsValides) && data.emailsValides.length > 0) return true;

    return Number(data.nbInvitations || 0) > 0;
  }

  function marquerReservationAvecInvitesPlanning(idflux, declencheur) {
    const idReservation = String(idflux || "").trim();

    if (!idReservation) return;

    etat.reservationsAvecInvites.add(idReservation);

    const reservation = trouverReservationPlanningParId(idReservation);

    if (reservation) {
      const statsActuelles = reservation.invitationStats || {};
      const invitesActifs = Number(statsActuelles.in || 0);
      const invitesAnnules = Number(statsActuelles.out || 0);

      reservation.invitationStats = {
        ...statsActuelles,
        in: invitesActifs > 0 ? invitesActifs : (invitesAnnules > 0 ? 0 : 1),
        out: invitesAnnules > 0 ? invitesAnnules : Number(statsActuelles.out || 0)
      };
    }

    actualiserBoutonsInvitationPlanning(idReservation, declencheur);
  }

  function actualiserBoutonsInvitationPlanning(idflux, declencheur) {
    const idReservation = String(idflux || "").trim();
    const reservation = trouverReservationPlanningParId(idReservation);

    if (!idReservation || !reservation) return;

    const boutons = [];

    if (declencheur) boutons.push(declencheur);

    document
      .querySelectorAll('[data-action="invitation"][data-id="' + echapperSelecteurCss(idReservation) + '"]')
      .forEach((bouton) => boutons.push(bouton));

    boutons.forEach((bouton) => {
      if (!bouton) return;

      bouton.hidden = false;
      bouton.classList.remove(
        "lcdp-box-card-reservation-membre__micro-action--delai-depasse",
        "lcdp-box-card-reservation-membre__micro-action--invit-recu"
      );

      if (reservationHorsAbonnementMembre(reservation)) {
        bouton.textContent = "Invit’";
        bouton.classList.add("lcdp-box-card-reservation-membre__micro-action--invit-recu");
        bouton.setAttribute("aria-disabled", "false");
        bouton.title = "Afficher le parrain";
        return;
      }

      bouton.textContent = reservationAvecInvitesPlanning(reservation) ? "Invité(s)" : "Inviter";
      bouton.setAttribute("aria-disabled", "false");
      bouton.removeAttribute("title");
    });
  }

  async function ouvrirListeInvitesReservation(idflux, declencheur) {
    const idReservation = String(idflux || "").trim();
    const reservation = trouverReservationPlanningParId(idReservation);
    const invites = await chargerInvitesReservation(idReservation, declencheur);

    if (!invites) return;

    if (reservation && reservationDelaiActionDepasse(reservation)) {
      await ouvrirBoxListeInvitesLectureSeule(idReservation, invites, declencheur);
      return;
    }

    await ouvrirBoxListeInvitesModifiable(idReservation, invites, declencheur);
  }

  async function chargerInvitesReservation(idflux, declencheur) {
    const idReservation = String(idflux || "").trim();

    if (!idReservation) {
      await afficherAlerteInvitationReservation("Réservation manquante.", declencheur);
      return null;
    }

    if (!ENDPOINT_INVITER_MEMBRE) {
      await afficherAlerteInvitationReservation("Le service invitation membre n’est pas configuré.", declencheur);
      return null;
    }

    const reponse = await fetch(ENDPOINT_INVITER_MEMBRE + "/invites?idflux=" + encodeURIComponent(idReservation), {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    });

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return null;
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      await afficherAlerteInvitationReservation(messageErreurApi(data, "Impossible de charger la liste des invités."), declencheur);
      return null;
    }

    return Array.isArray(data.invites) ? data.invites : [];
  }

  async function ouvrirBoxListeInvitesLectureSeule(idflux, invites, declencheur) {
    const conteneur = document.createElement("div");
    conteneur.className = "lcdp-box-card-listinvites-oui-non lcdp-box-card-listinvites-oui-non--lecture";
    conteneur.dataset.lcdpInvitationInvitesOverlay = "true";
    conteneur.setAttribute("role", "dialog");
    conteneur.setAttribute("aria-modal", "true");
    conteneur.setAttribute("aria-labelledby", "lcdp-listinvites-lecture-title");

    document.body.appendChild(conteneur);

    const card = document.createElement("article");
    card.className = "lcdp-box-card-listinvites-oui-non__card lcdp-box-card-listinvites-oui-non__card--lecture";

    const titre = document.createElement("h2");
    titre.className = "lcdp-box-card-listinvites-oui-non__title";
    titre.id = "lcdp-listinvites-lecture-title";
    titre.textContent = "Invité(s)";

    const liste = document.createElement("ul");
    liste.className = "lcdp-box-card-listinvites-oui-non__list lcdp-box-card-listinvites-oui-non__list--lecture";

    const invitesActifs = Array.isArray(invites) ? invites : [];

    if (!invitesActifs.length) {
      const message = document.createElement("p");
      message.className = "lcdp-box-card-listinvites-oui-non__message";
      message.textContent = "Aucun invité enregistré pour cette réservation.";
      card.appendChild(titre);
      card.appendChild(message);
    } else {
      invitesActifs.forEach((invite) => {
        liste.appendChild(creerLigneInviteLectureSeule(invite));
      });

      card.appendChild(titre);
      card.appendChild(liste);
    }

    const actions = document.createElement("div");
    actions.className = "lcdp-box-card-listinvites-oui-non__actions";

    const boutonOk = document.createElement("button");
    boutonOk.type = "button";
    boutonOk.className = "lcdp-button lcdp-button-primary";
    boutonOk.textContent = "OK";
    actions.appendChild(boutonOk);

    card.appendChild(actions);
    conteneur.appendChild(card);

    return new Promise((resolve) => {
      let resolu = false;

      function fermer() {
        if (resolu) return;
        resolu = true;
        document.removeEventListener("keydown", gererEchap);
        conteneur.remove();
        resolve(true);
      }

      function gererEchap(event) {
        if (event.key === "Escape") fermer();
      }

      boutonOk.addEventListener("click", fermer);
      document.addEventListener("keydown", gererEchap);
    });
  }

  async function ouvrirBoxListeInvitesModifiable(idflux, invites, declencheur) {
    const idReservation = String(idflux || "").trim();
    const conteneur = document.createElement("div");
    conteneur.dataset.lcdpInvitationInvitesOverlay = "true";

    document.body.appendChild(conteneur);

    const fragment = await chargerFragmentObjet("/HTMLBASE/04-card-listinvites-oui-non.html");
    conteneur.appendChild(fragment);

    const box = conteneur.querySelector("[data-lcdp-box-card-listinvites-oui-non]");
    const titre = conteneur.querySelector("[data-lcdp-listinvites-title]");
    const message = conteneur.querySelector("[data-lcdp-listinvites-message]");
    const liste = conteneur.querySelector("[data-lcdp-listinvites-list]");
    const zoneAjout = conteneur.querySelector("[data-lcdp-listinvites-ajout]");
    const listeEmails = conteneur.querySelector("[data-lcdp-listinvites-emails]");
    const boutonAjouterEmail = conteneur.querySelector("[data-lcdp-listinvites-add-email]");
    const boutonFermer = conteneur.querySelector("[data-lcdp-listinvites-close]");
    const boutonMettreAJour = conteneur.querySelector("[data-lcdp-listinvites-update]");
    const boutonAnnuler = conteneur.querySelector("[data-lcdp-listinvites-cancel]");

    if (!box || !titre || !message || !liste || !zoneAjout || !listeEmails || !boutonAjouterEmail || !boutonMettreAJour || !boutonAnnuler) {
      conteneur.remove();
      throw new Error("Structure liste invités oui/non incomplète.");
    }

    titre.textContent = "Invité(s)";
    liste.innerHTML = "";
    listeEmails.innerHTML = "";

    const titreAjout = conteneur.querySelector(".lcdp-box-card-listinvites-oui-non__ajout-title");

    if (boutonFermer) {
      boutonFermer.hidden = true;
      boutonFermer.setAttribute("aria-hidden", "true");
    }

    if (titreAjout) {
      titreAjout.hidden = true;
      titreAjout.setAttribute("aria-hidden", "true");
    }

    boutonAjouterEmail.textContent = "Ajouter un membre";
    boutonAnnuler.textContent = "Annuler";

    const actions = boutonMettreAJour.closest(".lcdp-box-card-listinvites-oui-non__actions");

    if (actions && boutonAjouterEmail.parentNode !== actions) {
      actions.insertBefore(boutonAjouterEmail, boutonMettreAJour);
    }

    const invitesListe = Array.isArray(invites) ? invites : [];
    const limiteTotale = limiteEmailsInvitation();
    const placesDisponibles = Math.max(0, limiteTotale - invitesListe.length);

    function afficherMessage(texte, estErreur = false) {
      message.hidden = !texte;
      message.textContent = texte || "";
      message.classList.toggle("lcdp-box-card-listinvites-oui-non__message--erreur", estErreur === true);
    }

    if (!invitesListe.length) {
      afficherMessage("Aucun invité actif enregistré pour cette réservation.");
    } else {
      afficherMessage("");
      invitesListe.forEach((invite) => {
        liste.appendChild(creerLigneInviteOuiNon(invite));
      });
    }

    if (placesDisponibles <= 0) {
      zoneAjout.hidden = true;
      boutonAjouterEmail.hidden = true;
      boutonAjouterEmail.disabled = true;
    } else {
      zoneAjout.hidden = false;
      boutonAjouterEmail.hidden = false;
      boutonAjouterEmail.disabled = false;
      boutonAjouterEmail.textContent = "Ajouter un membre";
    }

    function ajouterChampEmailInvite() {
      if (listeEmails.querySelectorAll("input[type='email']").length >= placesDisponibles) {
        afficherMessage("Votre droit d'invitation est limité à " + String(limiteTotale) + " invité" + (limiteTotale > 1 ? "s" : "") + ".", true);
        return;
      }

      listeEmails.appendChild(creerChampEmailInviteSupplementaire());
    }

    boutonAjouterEmail.addEventListener("click", ajouterChampEmailInvite);

    return new Promise((resolve) => {
      let resolu = false;
      let enregistrementEnCours = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        document.removeEventListener("keydown", gererEchap);
        conteneur.remove();
        resolve(valeur);
      }

      function gererEchap(event) {
        if (event.key === "Escape") fermer(null);
      }

      async function mettreAJour() {
        if (enregistrementEnCours || !idReservation) return;

        const lignes = Array.from(liste.querySelectorAll("[data-lcdp-listinvites-item]"));
        const majInvites = lignes
          .map((ligne) => {
            const idmembre = String(ligne.dataset.idmembre || "").trim();
            const toggle = ligne.querySelector("[data-lcdp-listinvites-toggle]");

            if (!idmembre || !toggle) return null;

            return {
              idmembre,
              invit: toggle.checked ? "true" : "cancd"
            };
          })
          .filter(Boolean);

        const emails = collecterEmailsSupplementairesInvitation(listeEmails);

        if (emails.erreur) {
          afficherMessage(emails.erreur, true);
          return;
        }

        if (!majInvites.length && !emails.valeurs.length) {
          afficherMessage("Aucun invité à mettre à jour.", true);
          return;
        }

        enregistrementEnCours = true;
        boutonAjouterEmail.disabled = true;
        boutonAnnuler.disabled = true;
        boutonMettreAJour.disabled = true;
        boutonMettreAJour.textContent = "Mise à jour...";
        afficherMessage("Patientez, la liste des invités est en cours de mise à jour.");

        const resultat = await enregistrerListeInvitesReservation(idReservation, {
          invites: majInvites,
          emails: emails.valeurs
        }, declencheur);

        enregistrementEnCours = false;
        boutonAjouterEmail.disabled = placesDisponibles <= 0;
        boutonAnnuler.disabled = false;
        boutonMettreAJour.disabled = false;
        boutonMettreAJour.textContent = "Mettre à jour";

        if (!resultat) return;

        const reservation = trouverReservationPlanningParId(idReservation);
        const nbActifs = Number(resultat.nbInvitesActifs || 0);
        const nbAnnules = Number(resultat.nbInvitesAnnules || 0);

        if (reservation) {
          reservation.invitationStats = {
            ...(reservation.invitationStats || {}),
            in: Number.isFinite(nbActifs) ? nbActifs : 0,
            out: Number.isFinite(nbAnnules) ? nbAnnules : 0
          };
        }

        if (Number.isFinite(nbActifs) && nbActifs > 0) {
          etat.reservationsAvecInvites.add(idReservation);
        } else {
          etat.reservationsAvecInvites.delete(idReservation);
        }

        actualiserBoutonsInvitationPlanning(idReservation, declencheur);
        await afficherAlerteInvitationReservation(resultat.message || "Liste des invités mise à jour.", declencheur);
        fermer(resultat);
      }

      boutonMettreAJour.addEventListener("click", mettreAJour);
      boutonAnnuler.addEventListener("click", () => fermer(null));

      if (boutonFermer) {
        boutonFermer.addEventListener("click", () => fermer(null));
      }

      box.addEventListener("click", (event) => {
        if (event.target === box) fermer(null);
      });

      document.addEventListener("keydown", gererEchap);
    });
  }

  function creerLigneInviteLectureSeule(invite) {
    const item = document.createElement("li");
    item.className = "lcdp-box-card-listinvites-oui-non__item lcdp-box-card-listinvites-oui-non__item--lecture";

    const identite = document.createElement("span");
    identite.className = "lcdp-box-card-listinvites-oui-non__identite";
    identite.textContent = formaterLigneInviteReservation(invite);

    item.appendChild(identite);
    return item;
  }

  function creerLigneInviteOuiNon(invite) {
    const item = document.createElement("li");
    item.className = "lcdp-box-card-listinvites-oui-non__item";
    item.dataset.lcdpListinvitesItem = "true";
    item.dataset.idmembre = String(invite?.idmembre || "").trim();

    const identite = document.createElement("span");
    identite.className = "lcdp-box-card-listinvites-oui-non__identite";
    identite.textContent = formaterLigneInviteReservation(invite);

    const label = document.createElement("label");
    label.className = "lcdp-box-card-listinvites-oui-non__switch";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "lcdp-box-card-listinvites-oui-non__switch-input";
    input.dataset.lcdpListinvitesToggle = "true";
    input.checked = normaliserStatutInvitationInvite(invite?.invit) !== "cancd";
    input.setAttribute("aria-label", "Invitation active pour " + identite.textContent);

    const curseur = document.createElement("span");
    curseur.className = "lcdp-box-card-listinvites-oui-non__switch-slider";
    curseur.setAttribute("aria-hidden", "true");

    const etatTexte = document.createElement("span");
    etatTexte.className = "lcdp-box-card-listinvites-oui-non__switch-text";
    etatTexte.textContent = input.checked ? "Oui" : "Non";

    item.classList.toggle("lcdp-box-card-listinvites-oui-non__item--cancd", !input.checked);

    input.addEventListener("change", () => {
      etatTexte.textContent = input.checked ? "Oui" : "Non";
      item.classList.toggle("lcdp-box-card-listinvites-oui-non__item--cancd", !input.checked);
    });

    label.appendChild(input);
    label.appendChild(curseur);
    label.appendChild(etatTexte);

    item.appendChild(identite);
    item.appendChild(label);

    return item;
  }

  function creerChampEmailInviteSupplementaire() {
    const item = document.createElement("li");
    item.className = "lcdp-box-card-listinvites-oui-non__email-item";

    const input = document.createElement("input");
    input.type = "email";
    input.placeholder = "Adresse e-mail du membre invité";
    input.autocomplete = "email";
    input.className = "lcdp-box-card-listinvites-oui-non__email-input";

    item.appendChild(input);
    input.focus();
    return item;
  }

  function collecterEmailsSupplementairesInvitation(listeEmails) {
    const saisies = Array.from(listeEmails.querySelectorAll("input[type='email']"))
      .map((input) => nettoyerEmail(input.value))
      .filter(Boolean);

    const valeurs = saisies.filter((email, index, array) => array.indexOf(email) === index);
    const invalide = valeurs.find((email) => !emailValide(email));

    if (invalide) {
      return { valeurs: [], erreur: "Une adresse e-mail est invalide." };
    }

    return { valeurs, erreur: "" };
  }

  function normaliserStatutInvitationInvite(value) {
    const statut = normaliserTexteTechnique(value);
    return statut || "true";
  }

  async function enregistrerListeInvitesReservation(idflux, payload, declencheur) {
    const idReservation = String(idflux || "").trim();
    const donnees = payload || {};
    const invites = Array.isArray(donnees.invites) ? donnees.invites : [];
    const emails = Array.isArray(donnees.emails) ? donnees.emails : [];

    if (!idReservation) {
      await afficherAlerteInvitationReservation("Réservation manquante.", declencheur);
      return null;
    }

    if (!ENDPOINT_INVITER_MEMBRE) {
      await afficherAlerteInvitationReservation("Le service invitation membre n’est pas configuré.", declencheur);
      return null;
    }

    const reponse = await fetch(ENDPOINT_INVITER_MEMBRE + "/invites", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        idflux: idReservation,
        invites,
        emails
      })
    });

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return null;
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      await afficherAlerteInvitationReservation(messageErreurApi(data, "Impossible de mettre à jour la liste des invités."), declencheur);
      return null;
    }

    return data;
  }

  function formaterLigneInviteReservation(invite) {
    const nom = [invite?.prenommembre, invite?.nommembre]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ");

    const email = nettoyerEmail(invite?.emailmembre || "");

    if (nom && email) return nom + " — " + email;
    if (nom) return nom;
    if (email) return email;

    return "Membre invité";
  }

  function echapperSelecteurCss(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(String(value || ""));
    }

    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function reservationPasseePlanning(reservation) {
    const date = new Date(reservation?.datebookd || "");

    if (Number.isNaN(date.getTime())) return false;

    const reservationParis = dateHeureParis(date);
    const maintenantParis = dateHeureParis(new Date());

    if (!reservationParis.dateIso || !maintenantParis.dateIso) return false;
    if (reservationParis.dateIso < maintenantParis.dateIso) return true;
    if (reservationParis.dateIso > maintenantParis.dateIso) return false;

    const minutesReservation = (reservationParis.heure * 60) + reservationParis.minute;
    const minutesMaintenant = (maintenantParis.heure * 60) + maintenantParis.minute;

    return minutesMaintenant >= minutesReservation;
  }

  function reservationDelaiActionDepasse(reservation) {
    const date = new Date(reservation?.datebookd || "");

    if (Number.isNaN(date.getTime())) return false;

    return Date.now() >= date.getTime() - (30 * 60 * 1000);
  }

  function determinerBlocageInvitationReservation(reservation) {
    const dateReservation = extraireDateFranceReservation(reservation?.datebookd);

    if (!dateReservation) return "";

    const abonnement = trouverAbonnementPourDateInvitation(dateReservation);
    const statutabo = normaliserTexteTechnique(abonnement?.statutabo || "");

    if (statutabo === "impaye") {
      return "Votre abonnement est suspendu (impayé). Vous devez régulariser votre abonnement avant de pouvoir utiliser la fonction Inviter.";
    }

    if (statutabo === "cancd" && dateReservation > dateAujourdhuiParis()) {
      return "Vous avez annulé votre abonnement. Cette réservation est annulée ce soir à minuit. Vous ne pouvez donc pas utiliser la fonction Inviter pour cette date.";
    }

    return "";
  }

  function trouverAbonnementPourDateInvitation(dateIso) {
    const date = String(dateIso || "").trim().slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

    return (Array.isArray(etat.abonnements) ? etat.abonnements : []).find((abonnement) => {
      const debut = String(abonnement?.debut || "").slice(0, 10);
      const fin = String(abonnement?.finInitiale || abonnement?.fin || "").slice(0, 10);

      return debut && fin && date >= debut && date <= fin;
    }) || null;
  }

  async function afficherAlerteInvitationReservation(message, declencheur) {
    const workflow = declencheur
      ? declencheur.closest("[data-lcdp-box-workflow-reservation]")
      : document.querySelector("#lcdp-lightbox-slot [data-lcdp-box-workflow-reservation]");

    if (workflow) {
      await afficherAlerteOkParDessusLightbox(message);
      return;
    }

    await afficherAlerteOk(message);
  }

  async function ouvrirBoxEmailsInvitationReservation(idflux, declencheur) {
    const idReservation = String(idflux || "").trim();

    if (!idReservation) {
      await afficherAlerteInvitationReservation("Réservation manquante.", declencheur);
      return null;
    }
    const conteneur = document.createElement("div");
    conteneur.dataset.lcdpInvitationEmailsOverlay = "true";
    conteneur.style.position = "relative";
    conteneur.style.zIndex = "9000";

    document.body.appendChild(conteneur);

    const fragment = await chargerFragmentObjet("/HTMLBASE/04-listemails.html");
    conteneur.appendChild(fragment);

    const box = conteneur.querySelector("[data-lcdp-box-card-listemails]");
    const titre = conteneur.querySelector("[data-lcdp-listemails-title]");
    const message = conteneur.querySelector("[data-lcdp-listemails-message]");
    const liste = conteneur.querySelector("[data-lcdp-listemails-list]");
    const actions = conteneur.querySelector("[data-lcdp-listemails-actions]");
    const boutonFermer = conteneur.querySelector("[data-lcdp-listemails-close]");

    if (!box || !titre || !message || !liste || !actions) {
      conteneur.remove();
      throw new Error("Structure liste e-mails incomplète.");
    }

    titre.textContent = "Inviter";
    message.hidden = true;
    message.textContent = "";

    const limiteEmails = limiteEmailsInvitation();
    let traitementEnCours = false;
    let fermerBox = () => {};

    function afficherMessageEmails(texte, estErreur = false) {
      message.hidden = !texte;
      message.textContent = texte || "";
      message.dataset.lcdpMessageType = estErreur ? "erreur" : "information";
      message.classList.toggle("lcdp-box-card-listemails__message--erreur", estErreur === true);
    }

    function definirTraitementEnCours(valeur) {
      traitementEnCours = valeur === true;

      Array.from(liste.querySelectorAll("input[type='email']")).forEach((input) => {
        input.disabled = traitementEnCours;
      });

      Array.from(actions.querySelectorAll("button")).forEach((bouton) => {
        bouton.disabled = traitementEnCours;
      });

      if (boutonFermer) {
        boutonFermer.disabled = traitementEnCours;
        boutonFermer.setAttribute("aria-disabled", traitementEnCours ? "true" : "false");
      }
    }

    function ajouterChamp(valeur = "") {
      if (traitementEnCours) return;

      if (liste.querySelectorAll("input[type='email']").length >= limiteEmails) {
        afficherMessageEmails("Votre droit d'invitation est limité à " + String(limiteEmails) + " e-mail" + (limiteEmails > 1 ? "s" : "") + ".", true);
        return;
      }

      const item = document.createElement("li");
      item.className = "lcdp-box-card-listemails__item";

      const input = document.createElement("input");
      input.type = "email";
      input.value = valeur;
      input.placeholder = "Adresse e-mail du membre invité";
      input.autocomplete = "email";
      input.className = "lcdp-box-card-listemails__input";

      item.appendChild(input);
      liste.appendChild(item);
      input.focus();
    }

    function collecterEmailsBox() {
      const emailsSaisis = Array.from(liste.querySelectorAll("input[type='email']"))
        .map((input) => nettoyerEmail(input.value))
        .filter(Boolean);

      const emails = emailsSaisis.filter((email, index, array) => array.indexOf(email) === index);
      const emailInvalide = emails.find((email) => !emailValide(email));

      if (!emails.length) {
        return { emails: [], erreur: "Renseignez au moins une adresse e-mail." };
      }

      if (emailInvalide) {
        return { emails: [], erreur: "Une adresse e-mail est invalide." };
      }

      if (emails.length > limiteEmails) {
        return {
          emails: [],
          erreur: "Votre droit d'invitation est limité à " + String(limiteEmails) + " e-mail" + (limiteEmails > 1 ? "s" : "") + "."
        };
      }

      return { emails, erreur: "" };
    }

    ajouterChamp();

    actions.innerHTML = "";

    const boutonAjouter = creerBoutonInvitationEmails("Ajouter un e-mail", "lcdp-button-secondary", () => ajouterChamp());
    const boutonInviter = creerBoutonInvitationEmails("Inviter", "lcdp-button-primary", async () => {
      if (traitementEnCours) return;

      const collecte = collecterEmailsBox();

      if (collecte.erreur) {
        afficherMessageEmails(collecte.erreur, true);
        return;
      }

      definirTraitementEnCours(true);
      boutonInviter.textContent = "Envoi en cours...";
      afficherMessageEmails("Patientez, l’invitation est en cours d’enregistrement...");

      try {
        console.info("[LCDP invitation] POST /inviter-reservation", {
          idflux: idReservation,
          nbEmails: collecte.emails.length
        });

        const resultat = await posterInvitationReservation(idReservation, collecte.emails);

        console.info("[LCDP invitation] invitation enregistrée", resultat);
        fermerBox(resultat);
      } catch (error) {
        console.error("[LCDP invitation] échec invitation", error);
        definirTraitementEnCours(false);
        boutonInviter.textContent = "Inviter";
        afficherMessageEmails(error.message || "Impossible d’envoyer l’invitation.", true);
      }
    });
    const boutonAnnuler = creerBoutonInvitationEmails("Annuler", "lcdp-button-secondary", () => fermerBox(null));

    actions.appendChild(boutonAjouter);
    actions.appendChild(boutonInviter);
    actions.appendChild(boutonAnnuler);

    return new Promise((resolve) => {
      let resolu = false;

      fermerBox = (valeur) => {
        if (traitementEnCours && !valeur) return;
        if (resolu) return;
        resolu = true;
        document.removeEventListener("keydown", gererEchap);
        conteneur.remove();
        resolve(valeur || null);
      };

      function gererEchap(event) {
        if (event.key === "Escape") fermerBox(null);
      }

      if (boutonFermer) {
        boutonFermer.addEventListener("click", () => fermerBox(null));
      }

      box.addEventListener("click", (event) => {
        if (event.target === box) fermerBox(null);
      });

      document.addEventListener("keydown", gererEchap);
    });
  }

  function creerBoutonInvitationEmails(label, style, action) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-button " + (style || "lcdp-button-primary");
    bouton.textContent = label;
    bouton.addEventListener("click", action);
    return bouton;
  }

  function limiteEmailsInvitation() {
    const maxInvit = Number.parseInt(String(etat.maxInvitInvitation || "0"), 10);

    if (Number.isFinite(maxInvit) && maxInvit > 0) {
      return Math.min(maxInvit, 10);
    }

    return 10;
  }

  async function posterInvitationReservation(idflux, emails) {
    if (!ENDPOINT_INVITER_MEMBRE) {
      throw new Error("Le service invitation membre n’est pas configuré.");
    }

    let reponse = null;

    try {
      reponse = await fetch(ENDPOINT_INVITER_MEMBRE + "/inviter-reservation", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          idflux,
          emails
        })
      });
    } catch (error) {
      console.error("[LCDP invitation] fetch impossible", error);
      throw new Error("Le service invitation membre est indisponible.");
    }

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      throw new Error("Session membre inactive.");
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      throw new Error(messageErreurApi(data, "Impossible d’envoyer l’invitation."));
    }

    return data;
  }

  async function envoyerInvitationReservation(idflux, emails, declencheur) {
    try {
      const data = await posterInvitationReservation(idflux, emails);
      await afficherAlerteInvitationReservation(data.message || "Invitation envoyée.", declencheur);
      return data;
    } catch (error) {
      await afficherAlerteInvitationReservation(error.message || "Impossible d’envoyer l’invitation.", declencheur);
      return null;
    }
  }

  async function traiterAnnulationReservation(boutonAnnuler) {
    const idflux = boutonAnnuler ? String(boutonAnnuler.dataset.id || "").trim() : "";

    if (!idflux) {
      await afficherAlerte("Réservation manquante.");
      return;
    }

    const workflowReservation = boutonAnnuler
      ? boutonAnnuler.closest("[data-lcdp-box-workflow-reservation]")
      : null;

    const reservation = trouverReservationPlanningParId(idflux);

    if (!reservation) {
      if (workflowReservation) {
        await afficherAlerteOkParDessusLightbox("Réservation introuvable.");
      } else {
        await afficherAlerteOk("Réservation introuvable.");
      }
      return;
    }

    if (reservationDelaiActionDepasse(reservation)) {
      if (workflowReservation) {
        await afficherAlerteOkParDessusLightbox("Vous ne pouvez plus utiliser la fonction annuler (délai dépassé).");
      } else {
        await afficherAlerteOk("Vous ne pouvez plus utiliser la fonction annuler (délai dépassé).");
      }
      return;
    }

    const estInvite =
      reservationHorsAbonnementMembre(
        reservation
      );
    const optionsDialogue = {
      titre: "Confirmer l’annulation",
      texte: estInvite
        ? "Voulez-vous vraiment annuler cette invite ?"
        : "Voulez-vous vraiment annuler cette réservation ?",
      boutons: [
        {
          label: "Non",
          valeur: "non",
          style: "lcdp-button-secondary"
        },
        {
          label: "Oui",
          valeur: "oui",
          style: "lcdp-button-primary"
        }
      ]
    };

    const confirmation = workflowReservation
      ? await ouvrirDialogueBoutonsParDessusLightbox(optionsDialogue)
      : await ouvrirDialogueBoutons(optionsDialogue);

    if (confirmation !== "oui") return;

    const texteInitial = boutonAnnuler.textContent;
    boutonAnnuler.disabled = true;
    boutonAnnuler.textContent = "Annulation...";

    try {
      await annulerReservation(idflux);
      await afficherAlerte(
        estInvite
          ? "Votre invite est annulée."
          : "Votre réservation est annulée."
      );
      const slot = document.getElementById("lcdp-lightbox-slot");
      if (slot) slot.innerHTML = "";
      await chargerReservations();
    } catch (error) {
      boutonAnnuler.disabled = false;
      boutonAnnuler.textContent = texteInitial;
      await afficherAlerte(error.message || "Impossible d’annuler cette réservation.");
    }
  }

  async function annulerReservation(idflux) {
    if (!ENDPOINT_PLANNING_MEMBRE) {
      throw new Error("Le service planning membre n’est pas configuré.");
    }

    const reponse = await fetch(ENDPOINT_PLANNING_MEMBRE + "/annuler-reservation", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ idflux })
    });

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return null;
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      throw new Error(messageErreurApi(data, "Impossible d’annuler cette réservation."));
    }

    return data.reservation || null;
  }

  async function verifierAccesReservationPlanning() {
    const blocage = determinerBlocageReservationPlanning(etat.membre || creerEtatMembreFallback());

    if (!blocage) return true;

    await afficherAlerte(blocage);
    return false;
  }

  function determinerBlocageReservationPlanning(membre) {
    const donnees = membre || {};

    if (
      donnees.abonnementAnnuleNonPaye === true ||
      paiementSuspensionDelaiDepasse(donnees.paiementSuspension)
    ) {
      return "Votre abonnement est annulé (non payé).";
    }

    if (donnees.abonnementSuspendu === true) {
      return "Votre abonnement est suspendu (non payé).";
    }

    const estAbonne = donnees.sourceApi === true
      ? donnees.abonne === true
      : donnees.abonne === true || membreAbonne();

    if (!estAbonne) {
      return "Vous devez être membre abonné.";
    }

    return "";
  }

  function paiementSuspensionDelaiDepasse(paiement) {
    if (!paiement || typeof paiement !== "object") return false;

    if (
      valeurBooleenneVraie(paiement.delaiPaiementDepasse) ||
      valeurBooleenneVraie(paiement.abonnementAnnuleNonPaye)
    ) {
      return true;
    }

    return delaiPaiementDepasseDepuisFin(paiement.fin || paiement.dateFin || paiement.finabo || "");
  }

  function delaiPaiementDepasseDepuisFin(value) {
    const fin = dateIsoDepuisValeur(value);

    if (!fin) return false;

    const maintenantParis = dateHeureParis(new Date());

    if (maintenantParis.dateIso > fin) return true;
    if (maintenantParis.dateIso < fin) return false;

    return maintenantParis.heure >= 14;
  }

  function dateIsoDepuisValeur(value) {
    const texte = String(value || "").trim();
    const match = texte.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (match) {
      return match[1] + "-" + match[2] + "-" + match[3];
    }

    const date = new Date(texte);

    if (Number.isNaN(date.getTime())) return "";

    return dateHeureParis(date).dateIso;
  }

  function dateHeureParis(date) {
    const morceaux = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      hourCycle: "h23"
    }).formatToParts(date);

    const valeur = (type) => morceaux.find((item) => item.type === type)?.value || "";

    return {
      dateIso: valeur("year") + "-" + valeur("month") + "-" + valeur("day"),
      heure: Number(valeur("hour") || 0),
      minute: Number(valeur("minute") || 0)
    };
  }

  function construireJoursMois(moisIso) {
    const match = String(moisIso || "").match(/^(\d{4})-(\d{2})-\d{2}$/);
    const maintenant = dateAujourdhuiParis();

    if (!match) {
      return construireJoursMois(debutMois(maintenant));
    }

    const annee = Number(match[1]);
    const mois = Number(match[2]);
    const nombreJours = new Date(annee, mois, 0).getDate();
    const jours = [];

    for (let jour = 1; jour <= nombreJours; jour += 1) {
      jours.push({
        dateIso: annee + "-" + String(mois).padStart(2, "0") + "-" + String(jour).padStart(2, "0"),
        jour
      });
    }

    return jours;
  }

  function obtenirDecalageLundi(dateIso) {
    const match = String(dateIso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) return 0;

    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
    const jour = date.getDay();

    return jour === 0 ? 6 : jour - 1;
  }

  function debutMois(dateIso) {
    const texte = String(dateIso || dateAujourdhuiParis()).slice(0, 10);
    const match = texte.match(/^(\d{4})-(\d{2})/);

    if (!match) return debutMois(dateAujourdhuiParis());

    return match[1] + "-" + match[2] + "-01";
  }

  function ajouterMois(dateIso, delta) {
    const match = String(dateIso || "").match(/^(\d{4})-(\d{2})-\d{2}$/);

    if (!match) return debutMois(dateAujourdhuiParis());

    const date = new Date(Number(match[1]), Number(match[2]) - 1 + Number(delta || 0), 1, 12, 0, 0);

    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-01";
  }

  function formaterMoisAnnee(dateIso) {
    const match = String(dateIso || "").match(/^(\d{4})-(\d{2})-\d{2}$/);

    if (!match) return "";

    const date = new Date(Number(match[1]), Number(match[2]) - 1, 1, 12, 0, 0);

    return date.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric"
    });
  }


  function normaliserAbonnementsMembre(source) {
    const aujourdHui = dateAujourdhuiParis();

    return (Array.isArray(source) ? source : [])
      .map((abonnement) => {
        const statutabo = normaliserTexteTechnique(abonnement?.statutabo || abonnement?.statut || "");
        const debut = dateIsoDepuisValeur(abonnement?.debut || abonnement?.debutabo || abonnement?.dateDebut || "");
        let fin = dateIsoDepuisValeur(abonnement?.fin || abonnement?.finabo || abonnement?.dateFin || "");
        const finInitiale = fin;

        /* Un abonnement cancd reste couvert uniquement le jour d'annulation. */
        if (statutabo === "cancd" && fin && fin > aujourdHui) {
          fin = aujourdHui;
        }

        return { debut, fin, finInitiale, statutabo };
      })
      .filter((abonnement) => abonnement.debut && abonnement.fin && abonnement.fin >= abonnement.debut);
  }

  function reservationHorsAbonnementMembre(reservation) {
    return valeurBooleenneVraie(reservation?.invitation);
  }

  function dateDansPeriodeAbonnementMembre(dateIso) {
    const date = String(dateIso || "").trim().slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;

    return etat.abonnements.some((abonnement) => {
      return date >= abonnement.debut && date <= abonnement.fin;
    });
  }

  function normaliserTexteTechnique(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, "");
  }

  // Navigation uniquement entre les mois contenant des accès ou invitations
  // pour la période affichée ; aucun mois intercalaire sans rendez-vous.
  function moisAvecAccesPlanning() {
    return [...new Set(
      filtrerEtTrierReservationsAgenda(etat.reservations)
        .map(reservation => extraireDateFranceReservation(reservation.datebookd))
        .filter(Boolean)
        .map(dateIso => debutMois(dateIso))
    )].sort();
  }

  function moisMinimumPlanning() {
    return moisAvecAccesPlanning()[0] || debutMois(dateAujourdhuiParis());
  }

  function moisMaximumPlanning() {
    const mois = moisAvecAccesPlanning();
    return mois[mois.length - 1] || debutMois(dateAujourdhuiParis());
  }

  function moisDansLimitesPeriodePlanning(moisIso) {
    return moisAvecAccesPlanning().includes(debutMois(moisIso || dateAujourdhuiParis()));
  }

  function moisAdjacentAvecAccesPlanning(direction, moisIso = etat.moisCourant) {
    const mois = moisAvecAccesPlanning();
    const courant = debutMois(moisIso || dateAujourdhuiParis());
    if (direction < 0) return [...mois].reverse().find(value => value < courant) || null;
    return mois.find(value => value > courant) || null;
  }

  function limiterMoisSelonPeriodePlanning(moisIso) {
    const mois = moisAvecAccesPlanning();
    const cible = debutMois(moisIso || dateAujourdhuiParis());
    if (!mois.length) return debutMois(dateAujourdhuiParis());
    if (mois.includes(cible)) return cible;
    return mois.find(value => value > cible) || mois[mois.length - 1];
  }

  function actualiserNavigationMoisPlanning() {
    const calendrier = etat.calendrierMois;
    if (!calendrier) return;
    const precedent = calendrier.querySelector("[data-lcdp-calendrier-mois-prev]");
    const suivant = calendrier.querySelector("[data-lcdp-calendrier-mois-next]");
    if (precedent) {
      const actif = Boolean(moisAdjacentAvecAccesPlanning(-1));
      precedent.disabled = !actif;
      precedent.setAttribute("aria-disabled", String(!actif));
    }
    if (suivant) {
      const actif = Boolean(moisAdjacentAvecAccesPlanning(1));
      suivant.disabled = !actif;
      suivant.setAttribute("aria-disabled", String(!actif));
    }
  }

  function normaliserPlageReservation(reservation) {
    const brut = String(reservation?.plagebookd || reservation?.plage || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s_-]+/g, "");

    if (
      brut.includes("plage1") ||
      brut === "1"
    ) {
      return "plage1";
    }

    if (
      brut.includes("plage2") ||
      brut === "2"
    ) {
      return "plage2";
    }

    if (
      brut.includes("plage3") ||
      brut === "3"
    ) {
      return "plage3";
    }

    if (
      brut.includes("plage4") ||
      brut === "4"
    ) {
      return "plage4";
    }

    if (
      brut.includes("plage5") ||
      brut === "5"
    ) {
      return "plage5";
    }

    const date = new Date(
      reservation?.datebookd || ""
    );

    if (!Number.isNaN(date.getTime())) {
      const heure = Number(
        new Intl.DateTimeFormat("fr-FR", {
          timeZone: "Europe/Paris",
          hour: "2-digit",
          hour12: false,
          hourCycle: "h23"
        }).format(date)
      );

      if (heure >= 6 && heure < 10) {
        return "plage1";
      }

      if (heure >= 10 && heure < 13) {
        return "plage2";
      }

      if (heure >= 13 && heure < 17) {
        return "plage3";
      }

      if (heure >= 17 && heure < 21) {
        return "plage4";
      }

      return "plage5";
    }

    return "";
  }

  function libellePlage(plage) {
    if (plage === "plage1") {
      return "6 h–10 h";
    }

    if (plage === "plage2") {
      return "10 h–13 h";
    }

    if (plage === "plage3") {
      return "13 h–17 h";
    }

    if (plage === "plage4") {
      return "17 h–21 h";
    }

    if (plage === "plage5") {
      return "21 h–2 h";
    }

    return "plage horaire";
  }

  function nomParcReservation(reservation) {
    const parc = reservation?.parc || {};

    return String(parc.nom || parc.nomparc || reservation?.nomparc || "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function nomParcCourtReservation(reservation) {
    const nom = nomParcReservation(reservation);

    if (!nom) return "";

    return nom.slice(0, 15);
  }

  async function initialiserBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");

    if (!slot) return;

    slot.innerHTML = "";

    const bandeau = await chargerFragmentMembre("/ESPACE-MEMBRE/box-bandeau-nav-membre.html");
    slot.appendChild(bandeau);
    appliquerRoutesSite(slot);

    await chargerScriptMembreUneFois("/ESPACE-MEMBRE/box-menu-burger-membre.js");

    if (typeof window.LCDP_initialiserMenuBurgerMembre === "function") {
      await window.LCDP_initialiserMenuBurgerMembre({
        etatMembre: {
          abonne: membreAbonne()
        }
      });
    }
  }

  async function initialiserFooter() {
    const slot = document.getElementById("lcdp-footer-slot");

    if (!slot) return;

    slot.innerHTML = "";

    const footer = await chargerFragmentObjet("/HTMLBASE/02-footer.html");
    slot.appendChild(footer);
    appliquerRoutesSite(slot);
  }

  async function afficherAlerte(message) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return null;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/HTMLBASE/02-alerte.html");
    slot.appendChild(fragment);

    const alerte = slot.querySelector("[data-lcdp-box-alerte]");
    const texte = slot.querySelector("[data-lcdp-alerte-message]");
    const boutonFermer = slot.querySelector("[data-lcdp-alerte-close]");
    const boutonOk = slot.querySelector("[data-lcdp-alerte-ok]");

    if (!alerte || !texte || !boutonFermer || !boutonOk) {
      throw new Error("Structure de l’alerte incomplète.");
    }

    texte.textContent = message || "";

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        slot.innerHTML = "";
        resolve(valeur);
      }

      boutonFermer.addEventListener("click", () => fermer(false));
      boutonOk.addEventListener("click", () => fermer(true));
      alerte.addEventListener("click", (event) => {
        if (event.target === alerte) fermer(false);
      });

      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") fermer(false);
        },
        { once: true }
      );
    });
  }

  async function afficherAlerteOk(message) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return null;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/HTMLBASE/02-alerte.html");
    slot.appendChild(fragment);

    const alerte = slot.querySelector("[data-lcdp-box-alerte]");
    const texte = slot.querySelector("[data-lcdp-alerte-message]");
    const boutonFermer = slot.querySelector("[data-lcdp-alerte-close]");
    const boutonOk = slot.querySelector("[data-lcdp-alerte-ok]");

    if (!alerte || !texte || !boutonOk) {
      throw new Error("Structure de l’alerte incomplète.");
    }

    texte.textContent = message || "";

    if (boutonFermer) boutonFermer.hidden = true;

    return new Promise((resolve) => {
      let resolu = false;

      function fermer() {
        if (resolu) return;
        resolu = true;
        slot.innerHTML = "";
        resolve(true);
      }

      boutonOk.addEventListener("click", fermer);
    });
  }

  async function afficherAlerteOkParDessusLightbox(message) {
    document.querySelectorAll("[data-lcdp-alerte-ok-overlay]").forEach((element) => element.remove());

    const couche = document.createElement("div");
    couche.dataset.lcdpAlerteOkOverlay = "true";
    couche.style.position = "fixed";
    couche.style.inset = "0";
    couche.style.zIndex = "12000";
    couche.style.pointerEvents = "auto";
    document.body.appendChild(couche);

    const fragment = await chargerFragmentObjet("/HTMLBASE/02-alerte.html");
    couche.appendChild(fragment);

    const alerte = couche.querySelector("[data-lcdp-box-alerte]");
    const texte = couche.querySelector("[data-lcdp-alerte-message]");
    const boutonFermer = couche.querySelector("[data-lcdp-alerte-close]");
    const boutonOk = couche.querySelector("[data-lcdp-alerte-ok]");

    if (!alerte || !texte || !boutonOk) {
      couche.remove();
      throw new Error("Structure de l’alerte incomplète.");
    }

    alerte.style.position = "fixed";
    alerte.style.inset = "0";
    alerte.style.zIndex = "12001";
    alerte.style.display = "flex";
    alerte.style.alignItems = "center";
    alerte.style.justifyContent = "center";

    texte.textContent = message || "";

    if (boutonFermer) boutonFermer.hidden = true;

    return new Promise((resolve) => {
      let resolu = false;

      function fermer() {
        if (resolu) return;
        resolu = true;
        couche.remove();
        resolve(true);
      }

      boutonOk.addEventListener("click", fermer);
      alerte.addEventListener("click", (event) => {
        if (event.target === alerte) fermer();
      });
    });
  }

  async function ouvrirDialogueBoutonsParDessusLightbox(options) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return null;

    const coucheExistante = slot.querySelector("[data-lcdp-dialogue-bouton-overlay]");
    if (coucheExistante) coucheExistante.remove();

    const couche = document.createElement("div");
    couche.dataset.lcdpDialogueBoutonOverlay = "true";
    slot.appendChild(couche);

    const fragment = await chargerFragmentObjet("/HTMLBASE/02-dialogue-bouton.html");
    couche.appendChild(fragment);

    const dialogue = couche.querySelector("[data-lcdp-box-dialogue-bouton]");
    const titre = couche.querySelector("[data-lcdp-dialogue-title]");
    const texte = couche.querySelector("[data-lcdp-dialogue-text]");
    const actions = couche.querySelector("[data-lcdp-dialogue-actions]");
    const boutonFermer = couche.querySelector("[data-lcdp-dialogue-close]");

    if (!dialogue || !titre || !texte || !actions || !boutonFermer) {
      couche.remove();
      throw new Error("Structure de dialogue bouton incomplète.");
    }

    titre.textContent = options.titre || "";
    texte.textContent = options.texte || "";
    actions.innerHTML = "";

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        document.removeEventListener("keydown", gererEchap);
        couche.remove();
        resolve(valeur || null);
      }

      function gererEchap(event) {
        if (event.key === "Escape") fermer(null);
      }

      (options.boutons || []).forEach((configuration) => {
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "lcdp-button " + (configuration.style || "lcdp-button-primary");
        bouton.textContent = configuration.label || "Valider";

        bouton.addEventListener("click", () => {
          fermer(configuration.valeur || configuration.label || true);
        });

        actions.appendChild(bouton);
      });

      boutonFermer.addEventListener("click", () => fermer(null));
      dialogue.addEventListener("click", (event) => {
        if (event.target === dialogue) fermer(null);
      });

      document.addEventListener("keydown", gererEchap);
    });
  }

  async function ouvrirDialogueBoutons(options) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return null;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/HTMLBASE/02-dialogue-bouton.html");
    slot.appendChild(fragment);

    const dialogue = slot.querySelector("[data-lcdp-box-dialogue-bouton]");
    const titre = slot.querySelector("[data-lcdp-dialogue-title]");
    const texte = slot.querySelector("[data-lcdp-dialogue-text]");
    const actions = slot.querySelector("[data-lcdp-dialogue-actions]");
    const boutonFermer = slot.querySelector("[data-lcdp-dialogue-close]");

    if (!dialogue || !titre || !texte || !actions || !boutonFermer) {
      throw new Error("Structure de dialogue bouton incomplète.");
    }

    titre.textContent = options.titre || "";
    texte.textContent = options.texte || "";
    actions.innerHTML = "";

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        slot.innerHTML = "";
        resolve(valeur || null);
      }

      (options.boutons || []).forEach((configuration) => {
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "lcdp-button " + (configuration.style || "lcdp-button-primary");
        bouton.textContent = configuration.label || "Valider";

        bouton.addEventListener("click", () => {
          fermer(configuration.valeur || configuration.label || true);
        });

        actions.appendChild(bouton);
      });

      boutonFermer.addEventListener("click", () => fermer(null));
      dialogue.addEventListener("click", (event) => {
        if (event.target === dialogue) fermer(null);
      });

      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") fermer(null);
        },
        { once: true }
      );
    });
  }

  function chargerCssObjetUneFois(chemin) {
    const valeur = String(chemin || "").trim();

    if (!valeur) return Promise.resolve();

    const href = construireUrlObjet(valeur);

    if (document.querySelector('link[data-lcdp-css-objet="' + valeur + '"]')) {
      return Promise.resolve();
    }

    if (Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some((link) => link.href === href)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.lcdpCssObjet = valeur;
      link.onload = resolve;
      link.onerror = () => reject(new Error("CSS OBJET introuvable : " + valeur));
      document.head.appendChild(link);
    });
  }

  async function chargerFragmentObjet(chemin) {
    const reponse = await fetch(construireUrlObjet(chemin), {
      method: "GET",
      credentials: "omit",
      cache: "no-cache"
    });

    if (!reponse.ok) throw new Error("Fragment OBJET introuvable : " + chemin);

    const html = await reponse.text();
    const template = document.createElement("template");
    template.innerHTML = html.trim();

    return template.content.cloneNode(true);
  }

  async function chargerFragmentMembre(chemin) {
    const reponse = await fetch(construireUrlMembre(chemin), {
      method: "GET",
      credentials: "omit",
      cache: "no-cache"
    });

    if (!reponse.ok) throw new Error("Fragment membre introuvable : " + chemin);

    const html = await reponse.text();
    const template = document.createElement("template");
    template.innerHTML = html.trim();

    return template.content.cloneNode(true);
  }

  function chargerScriptMembreUneFois(chemin) {
    const src = construireUrlMembre(chemin);

    if (document.querySelector(`script[data-lcdp-script="${chemin}"]`)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.dataset.lcdpScript = chemin;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Script membre introuvable : " + chemin));
      document.body.appendChild(script);
    });
  }

  function appliquerRoutesSite(racine = document) {
    racine.querySelectorAll("[data-site-href]").forEach((element) => {
      const chemin = element.dataset.siteHref || "";
      const espace = element.dataset.space || "public";

      element.setAttribute(
        "href",
        espace === "membre" ? construireUrlMembre(chemin) : construireUrlPublic(chemin)
      );
    });

    racine.querySelectorAll("[data-site-src]").forEach((element) => {
      const chemin = element.dataset.siteSrc || "";
      const cheminObjet = chemin.replace(/^\/?OBJET\/?/, "/");
      element.setAttribute("src", construireUrlObjet(cheminObjet));
    });
  }

  function construireEndpointApi(cleModerne, cleLegacy, sousDomaineWorker) {
    const depuisConfig =
      CONFIG_PAGE?.[cleModerne] ||
      CONFIG_PAGE?.[cleLegacy] ||
      "";

    if (depuisConfig) return String(depuisConfig).replace(/\/+$/, "");

    if (typeof CONFIG_PAGE.apiUrl === "function") {
      return CONFIG_PAGE.apiUrl(sousDomaineWorker).replace(/\/+$/, "");
    }

    return "";
  }

  function construireUrlPublic(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) return valeur;
    if (typeof window.LCDP_urlPublic === "function") return window.LCDP_urlPublic(valeur);
    if (typeof CONFIG_PAGE.publicUrl === "function") return CONFIG_PAGE.publicUrl(valeur);

    return buildUrl(CONFIG_PAGE.publicBaseUrl || CONFIG_PAGE.PUBLIC_BASE || "", valeur);
  }

  function construireUrlMembre(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) return valeur;
    if (typeof window.LCDP_urlMembre === "function") return window.LCDP_urlMembre(valeur);
    if (typeof CONFIG_PAGE.membreUrl === "function") return CONFIG_PAGE.membreUrl(valeur);

    return buildUrl(
      CONFIG_PAGE.membreBaseUrl ||
      CONFIG_PAGE.MEMBRE_BASE ||
      CONFIG_PAGE.siteBase ||
      "",
      valeur
    );
  }

  function construireUrlObjet(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) return valeur;
    if (typeof window.LCDP_urlObjet === "function") return window.LCDP_urlObjet(valeur);
    if (typeof CONFIG_PAGE.objetUrl === "function") return CONFIG_PAGE.objetUrl(valeur);

    const objetBase =
      CONFIG_PAGE.objetBaseUrl ||
      CONFIG_PAGE.OBJET_BASE ||
      buildUrl(CONFIG_PAGE.publicBaseUrl || CONFIG_PAGE.PUBLIC_BASE || "", "/OBJET");

    return buildUrl(objetBase, valeur);
  }

  function construireCheminImageParcParDefaut(nomParc, departement) {
    return construireCheminImageParcFichier(nomParc, departement, "card1.webp");
  }

  function construireCheminImageParcFichier(nomParc, departement, fichier) {
    const nom = normaliserSegmentCheminImageParc(nomParc);
    const dptmt = normaliserDepartementCheminImageParc(departement);
    const nomFichier = String(fichier || "").trim();

    if (!nom || !dptmt || !nomFichier) return "";

    return "/IMAG/PARC/" + dptmt + "/" + nom + "/" + nomFichier;
  }

  function normaliserSegmentCheminImageParc(value) {
    // Même normalisation que la galerie Parc de PLANIFIER.
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_");
  }

  function normaliserDepartementCheminImageParc(value) {
    const texte = String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();

    const corse = texte.match(/(?:^|\b)(2A|2B)(?:$|\b)/);

    if (corse) return corse[1];

    const matchDepartement = texte.match(/\d{1,3}/);
    const departement = matchDepartement ? matchDepartement[0] : "";

    if (/^[1-9]$/.test(departement)) return "0" + departement;

    return departement;
  }

  function construireUrlImageParc(value) {
    const chemin = String(value || "").trim();

    if (!chemin) return "";
    if (estUrlExterneOuAncre(chemin)) return chemin;

    const cheminParc = chemin
      .replace(/^\/?OBJET\/IMAG\/PARC\//i, "/IMAG/PARC/")
      .replace(/^\/?IMAG\/PARC\//i, "/IMAG/PARC/");

    if (cheminParc.startsWith("/IMAG/PARC/")) {
      return construireUrlObjet(cheminParc);
    }

    const cheminObjet = chemin.replace(/^\/?OBJET\/?/, "/");

    return construireUrlObjet(cheminObjet);
  }

  function estUrlExterneOuAncre(chemin) {
    return (
      !chemin ||
      chemin.startsWith("#") ||
      chemin.startsWith("mailto:") ||
      chemin.startsWith("tel:") ||
      chemin.startsWith("http://") ||
      chemin.startsWith("https://") ||
      chemin.startsWith("data:")
    );
  }

  function redirigerConnexionMembre(motif) {
    const separateur = PAGE_CONNEXION_MEMBRE.includes("?") ? "&" : "?";

    window.location.href =
      PAGE_CONNEXION_MEMBRE +
      separateur +
      "source=" +
      encodeURIComponent(SOURCE_PAGE) +
      "&session=" +
      encodeURIComponent(motif || "inactive");
  }

  function lireCookie(nom) {
    return document.cookie
      .split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(nom + "="))
      ?.split("=")
      .slice(1)
      .join("=") || "";
  }

  function membreAbonne() {
    return Boolean(lireCookie("abonne"));
  }

  function reponseApiOk(data) {
    return data && (data.ok === true || data.success === true);
  }

  function messageErreurApi(resultat, messageDefaut) {
    return resultat && (resultat.message || resultat.error)
      ? String(resultat.message || resultat.error)
      : messageDefaut;
  }

  function valeurBooleenneVraie(valeur) {
    return valeur === true || valeur === "true" || valeur === 1 || valeur === "1";
  }

  function nettoyerBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function buildUrl(base, path) {
    return nettoyerBaseUrl(base) + "/" + String(path || "").replace(/^\/+/, "");
  }

  function formaterDateCourte(dateIso) {
    const date = new Date(dateIso);

    if (Number.isNaN(date.getTime())) return "Date non renseignée";

    const dateFranceIso = extraireDateFranceReservation(dateIso);
    const aujourdHui = dateAujourdhuiParis();
    const demain = ajouterJoursDateIso(aujourdHui, 1);
    const apresDemain = ajouterJoursDateIso(aujourdHui, 2);

    if (dateFranceIso && dateFranceIso === aujourdHui) {
      return "Aujourd’hui " + formaterJourMoisDateIso(dateFranceIso);
    }

    if (dateFranceIso && dateFranceIso === demain) {
      return "Demain " + formaterJourMoisDateIso(dateFranceIso);
    }

    if (dateFranceIso && dateFranceIso === apresDemain) {
      return "Après-demain " + formaterJourMoisDateIso(dateFranceIso);
    }

    const dateFormatee = date.toLocaleDateString("fr-FR", {
      timeZone: "Europe/Paris",
      weekday: "long",
      day: "numeric",
      month: "long"
    });

    return majusculePremiereLettre(dateFormatee);
  }

  function extraireDateFranceReservation(timestampIso) {
    const date = new Date(timestampIso);

    if (Number.isNaN(date.getTime())) return "";

    const morceaux = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);

    const annee = morceaux.find((item) => item.type === "year")?.value || "";
    const mois = morceaux.find((item) => item.type === "month")?.value || "";
    const jour = morceaux.find((item) => item.type === "day")?.value || "";

    return annee && mois && jour ? annee + "-" + mois + "-" + jour : "";
  }

  function dateAujourdhuiParis() {
    return extraireDateFranceReservation(new Date().toISOString());
  }

  function ajouterJoursDateIso(dateIso, nombreJours) {
    const match = String(dateIso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) return "";

    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + Number(nombreJours || 0)));

    return [
      String(date.getUTCFullYear()).padStart(4, "0"),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
  }

  function formaterJourMoisDateIso(dateIso) {
    const match = String(dateIso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) return "";

    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);

    return date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long"
    });
  }

  function formaterHeureReservation(dateIso) {
    const date = new Date(dateIso);

    if (Number.isNaN(date.getTime())) return "";

    const heure = date.toLocaleTimeString("fr-FR", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit"
    });

    return heure.replace(":", "h").replace("h00", "h");
  }

  function majusculePremiereLettre(texte) {
    const valeur = String(texte || "");
    return valeur ? valeur.charAt(0).toUpperCase() + valeur.slice(1) : "";
  }
})();
