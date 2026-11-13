/* MA CLÉ — progression des six étapes, informations Accès détail dynamiques.
   Les données d'accès proviennent exclusivement du Worker MA CLÉ qui vérifie
   la session et la réservation du parc, puis lit Park Admin (Supabase).
   Aucune modification des droits, contrôles vidéo ou règles de présence. */
(function (global) {
  "use strict";

  const conteneur = document.querySelector(".lcdp-page-cle-du-parc .lcdp-site-page .lcdp-page-content");
  const zoneDefilante = document.querySelector(".lcdp-page-cle-du-parc .lcdp-ma-cle-wrapper > .lcdp-site-main");
  const sousHeader = document.getElementById("lcdp-ma-cle-navigation-slot");
  const controle = document.querySelector("[data-lcdp-control-access]");
  const workflow = document.querySelector("[data-lcdp-cle-workflow]");
  if (!conteneur || !zoneDefilante || !sousHeader || !controle || !workflow) return;

  const NOM_ETAPES = ["Session", "Accès au parc", "Check-in", "Accès", "Check-out", "Terminé"];
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
  const statutDetail = element("p", "lcdp-ma-cle-detail__statut");
  statutDetail.setAttribute("role", "status");
  statutDetail.hidden = true;
  const reessayerDetail = bouton("Réessayer", "lcdp-ma-cle-detail__reessayer");
  reessayerDetail.hidden = true;
  const contenuDetail = element("div", "lcdp-ma-cle-detail__contenu");
  ecranDetail.append(enteteDetail, statutDetail, reessayerDetail, contenuDetail);

  // Le chemin est un vrai sous-header du wrapper, HORS de la zone défilante.
  // Les écrans seuls défilent, sous le bandeau et le chemin de navigation.
  sousHeader.appendChild(timeline);
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
  let derniereErreurControle = "";
  let obtenirGuideAcces = null;
  let guideAcces = null;
  let promesseGuideAcces = null;

  // La progression reflète l'état confirmé par les écrans existants.
  // Elle ne décide jamais des droits et ne lance aucun appel au Worker.
  function etapeDepuisEtat(etat) {
    if (!etat || typeof etat !== "object") return 0;
    if (etat.unlocked === true && ["key_closed", "checkout_done"].includes(etat.screen)) return 6;
    if (etat.action === "checkout" ||
        ["exit_confirmed", "checkout_done", "expired"].includes(etat.screen)) return 5;
    if (["active", "presence", "access_confirmed", "guest_list",
         "confirmation_done"].includes(etat.screen)) return 4;
    if (["camera_ready", "processing", "uploading", "capture_error",
         "guest_pending", "guest_waiting_control", "denied"].includes(etat.screen)) return 3;
    return 0;
  }

  function indiquerEtape(numero) {
    if (actif || !Number.isInteger(numero) || numero < 3 || numero > 6) return;
    etape = numero;
    mettreTimeline(numero);
    // Les commandes existantes restent dans le corps défilant du wrapper.
  }

  function mettreTimeline(numero) {
    sousHeader.hidden = false;
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
      nomParc.textContent = String(guideAcces?.parc?.nom ||
        dernierEtat?.reservation?.parkName || "Chargement des informations du parc…");
      messageErreurControle.hidden = !derniereErreurControle;
      messageErreurControle.textContent = derniereErreurControle;
      suiteAcces.disabled = false;
      // Lecture asynchrone, sans retarder la navigation de l'étape 2.
      void chargerGuideAcces().catch(() => {});
    }
    rendre();
  }

  function photoUrl(nomFichier, version) {
    const parc = guideAcces?.parc;
    if (!parc || typeof global.LCDP_urlObjet !== "function") return null;
    const nom = String(nomFichier || "");
    const dptmt = String(parc.dptmt || "");
    const dossier = String(parc.dossier || "");
    if (!/^[a-z0-9_-]+\.webp$/i.test(nom) ||
        !/^(?:[0-9]{1,3}|2A|2B)$/.test(dptmt) ||
        !dossier || dossier.length > 160 || /[\\/]/.test(dossier) ||
        dossier === "." || dossier === "..") return null;
    const url = global.LCDP_urlObjet("/IMAG/ACCESPARC/" +
      encodeURIComponent(dptmt) + "/" + encodeURIComponent(dossier) + "/" + nom);
    const sha = String(version || "");
    return /^[a-f0-9]{40}$/.test(sha) ? url + "?v=" + sha : url;
  }

  // Aucune donnée de démonstration: cette fonction n'affiche que la réponse
  // obtenue du Worker pour le parc de la réservation verrouillée.
  function dessinerDetail() {
    contenuDetail.replaceChildren();
    if (!guideAcces) return;
    const rubriques = Array.isArray(guideAcces.rubriques) ? guideAcces.rubriques : [];
    if (!rubriques.length) {
      contenuDetail.appendChild(element("p", "lcdp-ma-cle-detail__vide",
        "Aucune consigne d’accès n’est actuellement renseignée pour ce parc."));
      return;
    }
    rubriques.forEach(rubrique => {
      if (!rubrique || typeof rubrique.titre !== "string") return;
      const texte = typeof rubrique.texte === "string" ? rubrique.texte : "";
      const images = Array.isArray(rubrique.images) ? rubrique.images : [];
      if (!texte && !images.length) return;
      const bloc = element("section", "lcdp-ma-cle-detail__rubrique");
      bloc.appendChild(element("h2", "lcdp-ma-cle-detail__rubrique-titre", rubrique.titre));
      if (texte) bloc.appendChild(element("p", "lcdp-ma-cle-detail__texte", texte));
      images.forEach(nom => {
        const url = photoUrl(nom, rubrique.versions?.[nom]);
        if (!url) return;
        const figure = element("figure", "lcdp-ma-cle-detail__photo-bloc");
        const photo = element("img", "lcdp-ma-cle-detail__photo");
        photo.src = url;
        photo.alt = rubrique.titre + " — " + nom;
        photo.loading = "lazy";
        photo.addEventListener("error", () => { figure.hidden = true; }, {once: true});
        figure.appendChild(photo);
        bloc.appendChild(figure);
      });
      contenuDetail.appendChild(bloc);
    });
  }

  function afficherEtatGuide(message, erreur) {
    statutDetail.textContent = message || "";
    statutDetail.hidden = !message || !detailVisible;
    statutDetail.setAttribute("role", erreur ? "alert" : "status");
    reessayerDetail.hidden = !erreur || !detailVisible;
  }

  async function chargerGuideAcces() {
    if (guideAcces) return guideAcces;
    if (promesseGuideAcces) return promesseGuideAcces;
    promesseGuideAcces = (async () => {
      if (typeof obtenirGuideAcces !== "function") {
        throw new Error("Les informations d’accès ne sont pas encore disponibles.");
      }
      afficherEtatGuide("Chargement des informations d’accès du parc…",false);
      const resultat = await obtenirGuideAcces();
      if (resultat?.success !== true || !resultat.parc || !Array.isArray(resultat.rubriques)) {
        throw new Error(resultat?.message || "Impossible de charger les accès de ce parc.");
      }
      const droit = dernierEtat?.accessState?.droit || dernierEtat?.droit;
      if (!droit?.parkId || !droit?.reservationId ||
          String(resultat.parc.idparc) !== String(droit.parkId) ||
          String(resultat.reservationId) !== String(droit.reservationId)) {
        throw new Error("Les informations reçues ne correspondent pas à votre réservation.");
      }
      guideAcces = resultat;
      nomParc.textContent = String(resultat.parc.nom || "Parc");
      afficherEtatGuide("",false);
      if (detailVisible) dessinerDetail();
      return guideAcces;
    })();
    try {
      return await promesseGuideAcces;
    } catch(error) {
      if (!guideAcces && actif && etape === 2) {
        nomParc.textContent = String(dernierEtat?.reservation?.parkName ||
          "Informations du parc indisponibles");
      }
      afficherEtatGuide(String(error?.message || "Informations d’accès indisponibles."),true);
      throw error;
    } finally {
      promesseGuideAcces = null;
    }
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
      ecranSession.hidden = true;
      ecranAcces.hidden = true;
      ecranDetail.hidden = true;
      // Restituer le contrôle réel dans le même wrapper, après vérification.
      const presenceActive = dernierEtat?.screen === "active";
      controle.hidden = presenceActive;
      workflow.hidden = !presenceActive;
      // Passage à l'étape 3 uniquement après la réponse du contrôle d'accès.
      indiquerEtape(etapeDepuisEtat(dernierEtat) || 3);
      zoneDefilante.scrollTop = 0;
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
    // Le défilement appartient au corps du wrapper, jamais à la page globale.
    zoneDefilante.scrollTop = 0;
    if (guideAcces) {
      afficherEtatGuide("",false);
      dessinerDetail();
    } else {
      afficherEtatGuide("Chargement des informations d’accès du parc…",false);
      void chargerGuideAcces().catch(() => {});
    }
    fermerDetail.focus({preventScroll: true});
  });
  reessayerDetail.addEventListener("click", () => {
    afficherEtatGuide("Chargement des informations d’accès du parc…",false);
    void chargerGuideAcces().catch(() => {});
  });
  fermerDetail.addEventListener("click", () => {
    if (!actif || !detailVisible) return;
    detailVisible = false;
    rendre();
    zoneDefilante.scrollTop = 0;
    ouvrirDetail.focus({preventScroll: true});
  });

  function demarrer(etat, options) {
    dernierEtat = etat || null;
    guideAcces = null;
    promesseGuideAcces = null;
    obtenirGuideAcces = options?.obtenirGuideAcces || null;
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
    if (etat?.screen) {
      controleAccesDisponible = true;
      derniereErreurControle = "";
      messageErreurControle.hidden = true;
    }
    // Conserver le droit vérifié par /ouvrir si /control-access renvoie un
    // écran sans identifiants de parc.
    dernierEtat = etat ? {
      ...dernierEtat, ...etat,
      accessState: dernierEtat?.accessState
    } : dernierEtat;
    if (!actif) {
      const etapeControle = etapeDepuisEtat(etat);
      if (etapeControle) indiquerEtape(etapeControle);
    }
    if (actif) {
      if (etape === 2 && !guideAcces) {
        nomParc.textContent = String(dernierEtat?.reservation?.parkName ||
          "Chargement des informations du parc…");
      }
      rendre();
    }
  }

  function signalerErreurControle(error) {
    derniereErreurControle = String(error?.message || "Le contrôle d'accès est momentanément indisponible.");
    if (!actif || etape !== 2) return;
    messageErreurControle.textContent = derniereErreurControle;
    messageErreurControle.hidden = false;
    rendre();
  }
  global.LCDP_ParcoursMaCle = {demarrer, synchroniser, signalerErreurControle, indiquerEtape};
})(window);
