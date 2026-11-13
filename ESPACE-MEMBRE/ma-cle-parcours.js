/* MA CLÉ — pilote des étapes 1 et 2.
   S'insère dans le wrapper MA CLÉ déjà ouvert. Aucune action de
   contrôle d'accès, vidéo, présence, invité ou checkout n'est modifiée.
   Les textes/photos TEST 1 - 41 sont des données pilotes vérifiées :
   le raccordement dynamique sécurisé Accès détail sera réalisé séparément. */
(function (global) {
  "use strict";

  const conteneur = document.querySelector(".lcdp-page-cle-du-parc .lcdp-site-page .lcdp-page-container");
  const controle = document.querySelector("[data-lcdp-control-access]");
  const workflow = document.querySelector("[data-lcdp-cle-workflow]");
  if (!conteneur || !controle || !workflow) return;

  const NOM_ETAPES = ["Session", "Accès au parc", "Check-in", "Présence", "Check-out", "Terminé"];
  const PARC_DEMO = "TEST 1 - 41";
  const PARC_DEMO_ID = "dceeefb1-1fe4-54bb-a3f2-5bc6607e2531";
  const RUBRIQUES_DEMO = [
    {
      titre: "Entrée",
      texte: "L'entrée du parc est à droite de l'entrée principale au niveau de la cour de la ferme.",
      images: []
    },
    {
      titre: "Check-in",
      texte: "L'activation de LA CLÉ se fait dans la grange à gauche avant de continuer et sortir par la porte d'écurie.",
      images: ["checkin1.webp"]
    }
  ];

  function element(tag, classe, texte) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texte !== undefined) el.textContent = texte;
    return el;
  }
  function bouton(texte, classe) {
    const el = element("button", "lcdp-button " + classe, texte);
    el.type = "button";
    return el;
  }

  const timeline = element("nav", "lcdp-ma-cle-timeline");
  timeline.setAttribute("aria-label", "Progression Ma clé");
  timeline.hidden = true;
  const jalonsListe = element("ol", "lcdp-ma-cle-timeline__liste");
  const jalons = NOM_ETAPES.map((titre, indice) => {
    const item = element("li", "lcdp-ma-cle-timeline__etape");
    item.append(element("span", "lcdp-ma-cle-timeline__numero", String(indice + 1)),
      element("span", "lcdp-ma-cle-timeline__libelle", titre));
    jalonsListe.appendChild(item);
    return item;
  });
  timeline.appendChild(jalonsListe);

  const ecranSession = element("section", "lcdp-ma-cle-pilote lcdp-ma-cle-pilote--session");
  ecranSession.setAttribute("aria-label", "Étape 1 : session validée");
  ecranSession.hidden = true;
  ecranSession.append(element("h1", "lcdp-ma-cle-pilote__titre", "MA CLÉ"),
    element("p", "lcdp-ma-cle-pilote__validation", "Session validée"));
  const suiteSession = bouton("Continuer", "lcdp-ma-cle-pilote__continuer");
  ecranSession.appendChild(suiteSession);

  const ecranAcces = element("section", "lcdp-ma-cle-pilote lcdp-ma-cle-pilote--acces");
  ecranAcces.setAttribute("aria-label", "Étape 2 : accès au parc");
  ecranAcces.hidden = true;
  const titreAcces = element("h1", "lcdp-ma-cle-pilote__titre", "Accès au parc");
  const nomParc = element("p", "lcdp-ma-cle-pilote__nom-parc");
  const ouvrirDetail = bouton("Accès détail", "lcdp-ma-cle-pilote__detail");
  const suiteAcces = bouton("Continuer", "lcdp-ma-cle-pilote__continuer");
  const messageErreurControle = element("p", "lcdp-ma-cle-pilote__erreur");
  messageErreurControle.setAttribute("role", "alert");
  messageErreurControle.hidden = true;
  ecranAcces.append(titreAcces, nomParc, ouvrirDetail, messageErreurControle, suiteAcces);

  const ecranDetail = element("section", "lcdp-ma-cle-detail");
  ecranDetail.setAttribute("aria-label", "Accès détail du parc");
  ecranDetail.hidden = true;
  const enteteDetail = element("header", "lcdp-ma-cle-detail__entete");
  const titreDetail = element("h1", "lcdp-ma-cle-detail__titre", "Accès détail");
  const fermerDetail = bouton("×", "lcdp-ma-cle-detail__fermer");
  fermerDetail.setAttribute("aria-label", "Fermer les informations d’accès");
  enteteDetail.append(titreDetail, fermerDetail);
  const contenuDetail = element("div", "lcdp-ma-cle-detail__contenu");
  ecranDetail.append(enteteDetail, contenuDetail);

  // Le détail remplace l'écran 2 dans le wrapper existant. Aucune modale.
  conteneur.insertBefore(timeline, controle);
  conteneur.insertBefore(ecranSession, controle);
  conteneur.insertBefore(ecranAcces, controle);
  conteneur.insertBefore(ecranDetail, controle);

  let actif = false;
  let etape = 0;
  let detailVisible = false;
  let dernierEtat = null;
  let rafraichirControle = null;
  let controleAvantIntro = false;
  let workflowAvantIntro = false;
  let repriseEnCours = false;
  let controleAccesDisponible = false;

  function mettreTimeline(numero) {
    timeline.hidden = false;
    jalons.forEach((li, index) => {
      const position = index + 1;
      li.dataset.etat = position < numero ? "termine" : position === numero ? "actif" : "avenir";
      if (position === numero) li.setAttribute("aria-current", "step");
      else li.removeAttribute("aria-current");
    });
  }

  function rendre() {
    if (!actif) return;
    mettreTimeline(etape);
    ecranSession.hidden = etape !== 1 || detailVisible;
    ecranAcces.hidden = etape !== 2 || detailVisible;
    ecranDetail.hidden = !detailVisible;
    // Pendant les deux écrans pilotes, le contrôle existant reste en mémoire.
    // On ne touche ni à son DOM interne ni à ses handlers.
    controle.hidden = true;
    workflow.hidden = true;
  }

  function afficherEtape(numero) {
    if (!actif || (numero !== 1 && numero !== 2)) return;
    etape = numero;
    detailVisible = false;
    if (numero === 2) {
      const droit = dernierEtat?.accessState?.droit || dernierEtat?.droit;
      nomParc.textContent = String(dernierEtat?.reservation?.parkName ||
        (droit?.parkId === PARC_DEMO_ID ? PARC_DEMO : "Parc"));
      messageErreurControle.hidden = true;
      messageErreurControle.textContent = "";
      suiteAcces.disabled = false;
      dessinerDetail();
    }
    rendre();
  }

  function urlPhoto(nomFichier) {
    if (typeof global.LCDP_urlObjet !== "function") return null;
    return global.LCDP_urlObjet("/IMAG/ACCESPARC/41/TEST_1_-_41/" + nomFichier);
  }

  function dessinerDetail() {
    contenuDetail.replaceChildren();
    // Aucune donnée de parc réel ne doit être publiée dans le code client.
    // La donnée pilote ne sert que sur le nom exact du parc de test identifié
    // dans la réponse serveur après /ouvrir et /control-access.
    if (nomParc.textContent !== PARC_DEMO) {
      contenuDetail.appendChild(element("p", "lcdp-ma-cle-detail__vide",
        "Les informations d’accès de ce parc ne sont pas encore disponibles dans cette version de test."));
      return;
    }
    RUBRIQUES_DEMO.forEach(rubrique => {
      const bloc = element("section", "lcdp-ma-cle-detail__rubrique");
      bloc.appendChild(element("h2", "lcdp-ma-cle-detail__rubrique-titre", rubrique.titre));
      if (rubrique.texte) bloc.appendChild(element("p", "lcdp-ma-cle-detail__texte", rubrique.texte));
      rubrique.images.forEach(fichier => {
        const url = urlPhoto(fichier);
        if (!url) return;
        const imageBloc = element("figure", "lcdp-ma-cle-detail__photo-bloc");
        const photo = element("img", "lcdp-ma-cle-detail__photo");
        photo.src = url;
        photo.alt = rubrique.titre + " — photographie du parc";
        photo.loading = "lazy";
        photo.addEventListener("error", () => { imageBloc.hidden = true; }, {once: true});
        imageBloc.appendChild(photo);
        bloc.appendChild(imageBloc);
      });
      contenuDetail.appendChild(bloc);
    });
  }

  async function terminerIntroduction() {
    if (!actif || repriseEnCours || etape !== 2) return;
    repriseEnCours = true;
    suiteAcces.disabled = true;
    messageErreurControle.hidden = true;
    try {
      if (typeof rafraichirControle !== "function") {
        throw new Error("Le contrôle MA CLÉ n'est pas disponible.");
      }
      // L'écran 2 reste visible pendant la vérification. En cas d'erreur,
      // aucun écran ancien ni spinner permanent ne vient remplacer le wrapper.
      await rafraichirControle();
      if (!controleAccesDisponible) {
        throw new Error("Le contrôle MA CLÉ n'a pas pu être vérifié.");
      }
      actif = false;
      detailVisible = false;
      timeline.hidden = true;
      ecranSession.hidden = true;
      ecranAcces.hidden = true;
      ecranDetail.hidden = true;
      controle.hidden = controleAvantIntro;
      workflow.hidden = workflowAvantIntro;
    } catch (error) {
      messageErreurControle.textContent = error?.message || "Le contrôle d'accès est momentanément indisponible.";
      messageErreurControle.hidden = false;
      console.error("MA CLÉ : reprise du contrôle impossible :", error);
      rendre();
    } finally {
      repriseEnCours = false;
      suiteAcces.disabled = false;
    }
  }

  suiteSession.addEventListener("click", () => afficherEtape(2));
  suiteAcces.addEventListener("click", terminerIntroduction);
  ouvrirDetail.addEventListener("click", () => {
    if (!actif || etape !== 2) return;
    detailVisible = true;
    rendre();
    ecranDetail.scrollIntoView({block: "start", behavior: "auto"});
    fermerDetail.focus();
  });
  fermerDetail.addEventListener("click", () => {
    if (!actif || !detailVisible) return;
    detailVisible = false;
    rendre();
    ouvrirDetail.focus();
  });

  function demarrer(etat, options) {
    dernierEtat = etat || null;
    controleAccesDisponible = Boolean(options?.controlePret);
    rafraichirControle = options?.rafraichirControle || null;
    // Ne jamais réinitialiser une présence déjà commencée ou un checkout.
    if (etat?.screen === "active" || etat?.screen === "presence" ||
        etat?.screen === "expired" || etat?.screen === "key_closed" ||
        etat?.action === "checkout" || etat?.screen === "checkout_done" ||
        etat?.screen === "access_confirmed" || etat?.screen === "guest_list" ||
        etat?.screen === "confirmation_done") {
      return;
    }
    controleAvantIntro = controle.hidden;
    workflowAvantIntro = workflow.hidden;
    actif = true;
    afficherEtape(1);
  }

  function synchroniser(etat) {
    if (etat?.screen) controleAccesDisponible = true;
    // Conserver le droit vérifié par /ouvrir si /control-access renvoie un
    // écran sans identifiants de parc.
    dernierEtat = etat ? {
      ...dernierEtat, ...etat,
      accessState: dernierEtat?.accessState
    } : dernierEtat;
    if (actif) {
      if (etape === 2) {
        const droit = dernierEtat?.accessState?.droit || dernierEtat?.droit;
        nomParc.textContent = String(dernierEtat?.reservation?.parkName ||
          (droit?.parkId === PARC_DEMO_ID ? PARC_DEMO : "Parc"));
        dessinerDetail();
      }
      rendre();
    }
  }

  global.LCDP_ParcoursMaCle = {demarrer, synchroniser};
})(window);
