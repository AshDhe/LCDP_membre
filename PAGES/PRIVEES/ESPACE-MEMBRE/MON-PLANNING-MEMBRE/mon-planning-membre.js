const CONFIG_MON_PLANNING_MEMBRE = window.SITE_CONFIG || {};

const ENDPOINT_FLUXM = construireEndpointApi(
  "workerFluxmUrl",
  "WORKER_FLUXM_URL",
  "worker-fluxm-api"
);

const ENDPOINT_IA_SHIFT_FLUXM = construireEndpointApi(
  "workerIaShiftFluxmUrl",
  "WORKER_IA_SHIFT_FLUXM_URL",
  "worker-ia-shift-fluxm"
);

const ROUTE_RECHERCHE_IA = ENDPOINT_IA_SHIFT_FLUXM
  ? ENDPOINT_IA_SHIFT_FLUXM + "/chercher-parcs"
  : "";

const PAGE_CONNEXION_MEMBRE = construireUrlPublic(
  "/PAGES/PUBLIQUES/CONNEXION-MEMBRE/connexion-membre.html"
);

const PAGE_NOUVELLE_DATE_MEMBRE = construireUrlMembre(
  "/PAGES/PRIVEES/MON%20PLANNING%20MEMBRE/nouvelle-date-membre.html"
);

let monPlanningMembreInitialise = false;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialiserMonPlanningMembre);
} else {
  initialiserMonPlanningMembre();
}

function initialiserMonPlanningMembre() {
  if (monPlanningMembreInitialise) return;

  monPlanningMembreInitialise = true;

  const listePlanning = document.getElementById("liste-planning-membre");
  const lienPasse = document.getElementById("planning-membre-passe");
  const boutonNouvelleDate = document.getElementById("bouton-nouvelle-date-planning");
  const boutonIaPlanning = document.getElementById("bouton-ia-planning");

  const lightboxIaPlanning = document.getElementById("lightbox-ia-planning");
  const conversationIaPlanning = document.getElementById("ia-planning-conversation");
  const transcriptionIaPlanning = document.getElementById("ia-planning-transcription-texte");
  const statutIaPlanning = document.getElementById("ia-planning-statut");
  const erreurIaPlanning = document.getElementById("ia-planning-erreur");
  const boutonFermerIaPlanning = document.getElementById("bouton-fermer-ia-planning");
  const boutonRecommencerIaPlanning = document.getElementById("bouton-recommencer-ia-planning");
  const boutonMicroIaPlanning = document.getElementById("bouton-micro-ia-planning");

  let affichageActuel = "avenir";
  let reservations = [];
  let reconnaissanceVocale = null;
  let reconnaissanceActive = false;
  let demandeIaEnCours = false;
  let texteReconnuIa = "";
  let derniereDemandeIaEnvoyee = "";

  if (boutonNouvelleDate) {
    boutonNouvelleDate.setAttribute("href", PAGE_NOUVELLE_DATE_MEMBRE);

    boutonNouvelleDate.addEventListener("click", (event) => {
      event.preventDefault();
      window.location.href = PAGE_NOUVELLE_DATE_MEMBRE;
    });
  }

  if (boutonIaPlanning) {
    boutonIaPlanning.addEventListener("click", (event) => {
      event.preventDefault();
      ouvrirLightboxIaPlanning();
    });
  }

  if (boutonFermerIaPlanning) {
    boutonFermerIaPlanning.addEventListener("click", fermerLightboxIaPlanning);
  }

  if (boutonRecommencerIaPlanning) {
    boutonRecommencerIaPlanning.addEventListener("click", reinitialiserLightboxIaPlanning);
  }

  if (boutonMicroIaPlanning) {
    boutonMicroIaPlanning.addEventListener("click", gererClicMicroIaPlanning);
  }

  if (lightboxIaPlanning) {
    lightboxIaPlanning.addEventListener("click", (event) => {
      if (event.target === lightboxIaPlanning) {
        fermerLightboxIaPlanning();
      }
    });
  }

  if (lienPasse) {
    lienPasse.addEventListener("click", (event) => {
      event.preventDefault();

      affichageActuel = affichageActuel === "avenir" ? "passe" : "avenir";

      lienPasse.textContent = affichageActuel === "avenir" ? "Passé" : "À venir";
      lienPasse.dataset.affichage = affichageActuel === "avenir" ? "passe" : "avenir";

      afficherPlanning();
    });
  }

  document.addEventListener("click", gererClicDocument);

  chargerReservations();

  async function chargerReservations() {
    if (!ENDPOINT_FLUXM) {
      afficherErreur("Le service du planning membre n’est pas configuré.");
      return;
    }

    try {
      afficherChargement();

      const reponse = await fetch(ENDPOINT_FLUXM + "/mes-reservations", {
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
        throw new Error(
          messageErreurApi(data, "Impossible de charger votre planning.")
        );
      }

      reservations = Array.isArray(data.reservations)
        ? data.reservations
        : [];

      afficherPlanning();
    } catch (erreur) {
      console.error("Erreur chargement planning membre :", erreur);
      afficherErreur(erreur.message || "Erreur technique. Merci de réessayer.");
    }
  }

  function afficherChargement() {
    if (!listePlanning) return;

    listePlanning.innerHTML = `
      <tr>
        <td colspan="3">
          Chargement de votre planning...
        </td>
      </tr>
    `;
  }

  function afficherErreur(message) {
    if (!listePlanning) return;

    listePlanning.innerHTML = `
      <tr>
        <td colspan="3">
          ${echapperHtml(message)}
        </td>
      </tr>
    `;
  }

  function afficherPlanning() {
    if (!listePlanning) return;

    const maintenant = new Date();

    const reservationsFiltrees = reservations
      .filter((reservation) => {
        const dateReservation = new Date(reservation.datebookd);

        if (Number.isNaN(dateReservation.getTime())) {
          return false;
        }

        if (affichageActuel === "avenir") {
          return dateReservation >= maintenant;
        }

        return dateReservation < maintenant;
      })
      .sort((a, b) => {
        const dateA = new Date(a.datebookd);
        const dateB = new Date(b.datebookd);

        if (affichageActuel === "avenir") {
          return dateA - dateB;
        }

        return dateB - dateA;
      });

    if (reservationsFiltrees.length === 0) {
      listePlanning.innerHTML = `
        <tr>
          <td colspan="3">
            Aucune date ${affichageActuel === "avenir" ? "à venir" : "passée"}.
          </td>
        </tr>
      `;
      return;
    }

    listePlanning.innerHTML = reservationsFiltrees.map(creerCartePlanning).join("");
  }

  function creerCartePlanning(reservation) {
    const dateReservation = new Date(reservation.datebookd);
    const estPasse = dateReservation < new Date();

    const parc = reservation.parc || {};
    const nomParc = parc.nom || parc.nomparc || reservation.nomparc || "Parc";
    const departement = parc.dptmt || parc.departement || reservation.dptmt || "";

    const ligneInvitation = creerLigneInvitation(reservation);

    return `
      <tr>
        <td colspan="3">
          <article class="carte-planning-membre">

            ${
              ligneInvitation
                ? `
                  <p class="carte-planning-membre-ligne carte-planning-membre-invitation">
                    ${ligneInvitation}
                  </p>
                `
                : ""
            }

            <p class="carte-planning-membre-ligne carte-planning-membre-date">
              <span class="date-planning-membre">
                ${formaterDateCourte(reservation.datebookd)}
              </span>

              <span class="heure-planning-membre">
                ${formaterHeureReservation(reservation.datebookd)}
              </span>
            </p>

            <p class="carte-planning-membre-ligne carte-planning-membre-parc">
              <span class="parc-planning-membre">
                Parc de ${echapperHtml(nomParc)}
              </span>

              <span class="departement-planning-membre">
                ${departement ? "(" + echapperHtml(departement) + ")" : ""}
              </span>
            </p>

            <div class="carte-planning-membre-actions">

              <button
                class="micro-action"
                type="button"
                data-action="adresse"
                data-idparc="${echapperHtml(parc.idparc || reservation.idparc || "")}" 
              >
                Voir l’adresse
              </button>

              ${
                estPasse
                  ? ""
                  : `
                    <button
                      class="micro-action"
                      type="button"
                      data-action="annuler"
                      data-id="${echapperHtml(reservation.idflux || "")}" 
                    >
                      Annuler
                    </button>
                  `
              }

            </div>

          </article>
        </td>
      </tr>
    `;
  }

  function creerLigneInvitation(reservation) {
    if (reservation.invitation !== true) {
      return "";
    }

    const parrain =
      reservation.parrain ||
      reservation.inviteur ||
      reservation.membre_parrain ||
      null;

    if (!parrain) {
      return "Invitation";
    }

    const nom = parrain.nommembre || parrain.nom || "";
    const prenom = parrain.prenommembre || parrain.prenom || "";

    const identite = [nom, prenom]
      .map((valeur) => String(valeur || "").trim())
      .filter(Boolean)
      .join(" ");

    return identite
      ? "Invitation (" + echapperHtml(identite) + ")"
      : "Invitation";
  }

  function formaterDateCourte(dateIso) {
    const date = new Date(dateIso);

    if (Number.isNaN(date.getTime())) {
      return "Date non renseignée";
    }

    const dateFormatee = date.toLocaleDateString("fr-FR", {
      timeZone: "Europe/Paris",
      weekday: "long",
      day: "numeric",
      month: "long"
    });

    return majusculePremiereLettre(dateFormatee);
  }

  function formaterHeureReservation(dateIso) {
    const date = new Date(dateIso);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const heure = date.toLocaleTimeString("fr-FR", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit"
    });

    return heure
      .replace(":", "h")
      .replace("h00", "h");
  }

  function majusculePremiereLettre(texte) {
    const valeur = String(texte || "");

    if (!valeur) return "";

    return valeur.charAt(0).toUpperCase() + valeur.slice(1);
  }

  async function annulerReservation(idflux) {
    if (!ENDPOINT_FLUXM) {
      throw new Error("Le service du planning membre n’est pas configuré.");
    }

    const reponse = await fetch(ENDPOINT_FLUXM + "/annuler-reservation", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        idflux: idflux
      })
    });

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return null;
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      throw new Error(
        messageErreurApi(data, "Impossible d’annuler cette réservation.")
      );
    }

    return data.reservation || null;
  }

  function ouvrirLightboxConfirmationAnnulation(idflux) {
    fermerLightboxPlanningMembre();

    const lightbox = document.createElement("div");
    lightbox.id = "lightbox-planning-membre";
    lightbox.className = "dialog-overlay";

    lightbox.innerHTML = `
      <div class="dialog-box" role="dialog" aria-modal="true">

        <h2>
          Confirmer l’annulation
        </h2>

        <p>
          Voulez-vous vraiment annuler cette date ?
        </p>

        <div class="dialog-actions">

          <button
            class="button button-secondary"
            type="button"
            data-action="annuler-lightbox-annulation"
          >
            Non
          </button>

          <button
            class="button"
            type="button"
            data-action="confirmer-annulation-reservation"
            data-id="${echapperHtml(idflux)}"
          >
            Oui
          </button>

        </div>

      </div>
    `;

    document.body.appendChild(lightbox);
  }

  function ouvrirLightboxAnnulationEnregistree() {
    fermerLightboxPlanningMembre();

    const lightbox = document.createElement("div");
    lightbox.id = "lightbox-planning-membre";
    lightbox.className = "dialog-overlay";

    lightbox.innerHTML = `
      <div class="dialog-box" role="dialog" aria-modal="true">

        <h2>
          Annulation enregistrée
        </h2>

        <p>
          Votre annulation est enregistrée.
        </p>

        <div class="dialog-actions">

          <button
            class="button"
            type="button"
            data-action="retour-planning-apres-annulation"
          >
            OK
          </button>

        </div>

      </div>
    `;

    document.body.appendChild(lightbox);
  }

  function fermerLightboxPlanningMembre() {
    const lightbox = document.getElementById("lightbox-planning-membre");

    if (lightbox) {
      lightbox.remove();
    }
  }

  function ouvrirLightboxIaPlanning() {
    if (!lightboxIaPlanning) return;

    if (!ROUTE_RECHERCHE_IA) {
      afficherMessageErreur("Le service IA du planning n’est pas configuré.");
      return;
    }

    reinitialiserLightboxIaPlanning();
    lightboxIaPlanning.hidden = false;

    if (boutonMicroIaPlanning) {
      boutonMicroIaPlanning.focus();
    }
  }

  function fermerLightboxIaPlanning() {
    arreterReconnaissanceVocaleIa();

    if (lightboxIaPlanning) {
      lightboxIaPlanning.hidden = true;
    }
  }

  function reinitialiserLightboxIaPlanning() {
    arreterReconnaissanceVocaleIa();

    demandeIaEnCours = false;
    texteReconnuIa = "";
    derniereDemandeIaEnvoyee = "";

    if (conversationIaPlanning) {
      conversationIaPlanning.innerHTML = `
        <p class="ia-planning-message ia-planning-message-systeme">
          Exemple : “Je cherche un parc calme demain après-midi près de Blois.”
        </p>
      `;
    }

    if (transcriptionIaPlanning) {
      transcriptionIaPlanning.textContent = "Aucune demande pour le moment.";
    }

    afficherStatutIaPlanning("Micro en attente.");
    afficherErreurIaPlanning("");

    if (boutonMicroIaPlanning) {
      boutonMicroIaPlanning.disabled = false;
      boutonMicroIaPlanning.textContent = "🎙️ Parler";
    }

    if (boutonRecommencerIaPlanning) {
      boutonRecommencerIaPlanning.disabled = false;
    }
  }

  function gererClicMicroIaPlanning() {
    if (demandeIaEnCours) return;

    if (reconnaissanceActive) {
      arreterReconnaissanceVocaleIa();
      return;
    }

    demarrerReconnaissanceVocaleIa();
  }

  function demarrerReconnaissanceVocaleIa() {
    const APIReconnaissance =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!APIReconnaissance) {
      afficherErreurIaPlanning(
        "La reconnaissance vocale n’est pas disponible sur ce navigateur."
      );
      afficherStatutIaPlanning("Micro indisponible.");
      return;
    }

    if (!reconnaissanceVocale) {
      reconnaissanceVocale = new APIReconnaissance();
      reconnaissanceVocale.lang = "fr-FR";
      reconnaissanceVocale.interimResults = true;
      reconnaissanceVocale.continuous = false;
      reconnaissanceVocale.maxAlternatives = 1;

      reconnaissanceVocale.onstart = () => {
        reconnaissanceActive = true;
        texteReconnuIa = "";
        derniereDemandeIaEnvoyee = "";
        afficherErreurIaPlanning("");
        afficherStatutIaPlanning("Je t’écoute...");
        mettreAJourBoutonMicroIaPlanning();
      };

      reconnaissanceVocale.onresult = (event) => {
        let texteFinal = "";
        let texteIntermediaire = "";

        for (let index = 0; index < event.results.length; index += 1) {
          const resultat = event.results[index];
          const transcription = resultat[0] && resultat[0].transcript
            ? resultat[0].transcript
            : "";

          if (resultat.isFinal) {
            texteFinal += transcription;
          } else {
            texteIntermediaire += transcription;
          }
        }

        texteReconnuIa = texteFinal.trim();

        const texteAffiche = (texteReconnuIa + " " + texteIntermediaire).trim();

        if (transcriptionIaPlanning) {
          transcriptionIaPlanning.textContent =
            texteAffiche || "Aucune demande pour le moment.";
        }
      };

      reconnaissanceVocale.onerror = (event) => {
        reconnaissanceActive = false;
        mettreAJourBoutonMicroIaPlanning();

        if (event.error === "no-speech") {
          afficherErreurIaPlanning("Je n’ai pas entendu de demande.");
          afficherStatutIaPlanning("Micro en attente.");
          return;
        }

        if (event.error === "not-allowed") {
          afficherErreurIaPlanning("Le navigateur n’a pas accès au micro.");
          afficherStatutIaPlanning("Micro bloqué.");
          return;
        }

        afficherErreurIaPlanning("La reconnaissance vocale a échoué.");
        afficherStatutIaPlanning("Micro en attente.");
      };

      reconnaissanceVocale.onend = () => {
        reconnaissanceActive = false;
        mettreAJourBoutonMicroIaPlanning();

        const demande = String(texteReconnuIa || "").trim();

        if (!demande) {
          afficherStatutIaPlanning("Micro en attente.");
          return;
        }

        if (demande === derniereDemandeIaEnvoyee) {
          return;
        }

        derniereDemandeIaEnvoyee = demande;
        envoyerDemandeIaPlanning(demande);
      };
    }

    try {
      reconnaissanceVocale.start();
    } catch (erreur) {
      afficherErreurIaPlanning("Le micro est déjà en cours d’écoute.");
    }
  }

  function arreterReconnaissanceVocaleIa() {
    if (!reconnaissanceVocale || !reconnaissanceActive) {
      reconnaissanceActive = false;
      mettreAJourBoutonMicroIaPlanning();
      return;
    }

    reconnaissanceVocale.stop();
  }

  async function envoyerDemandeIaPlanning(demande) {
    demandeIaEnCours = true;
    afficherErreurIaPlanning("");
    afficherStatutIaPlanning("Recherche en cours...");
    ajouterMessageIaPlanning("utilisateur", demande);

    if (boutonMicroIaPlanning) {
      boutonMicroIaPlanning.disabled = true;
      boutonMicroIaPlanning.textContent = "Recherche...";
    }

    if (boutonRecommencerIaPlanning) {
      boutonRecommencerIaPlanning.disabled = true;
    }

    try {
      const reponse = await fetch(ROUTE_RECHERCHE_IA, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: demande,
          source: "mon-planning-membre"
        })
      });

      const data = await reponse.json().catch(() => null);

      if (reponse.status === 401) {
        redirigerConnexionMembre("inactive");
        return;
      }

      if (!reponse.ok || !data || data.success === false || data.ok === false) {
        throw new Error(
          messageErreurApi(data, "La recherche IA n’a pas répondu correctement.")
        );
      }

      const texteReponse = extraireTexteReponseIaPlanning(data);

      ajouterMessageIaPlanning(
        "assistant",
        texteReponse || "Je n’ai pas trouvé de parc correspondant à cette demande."
      );

      afficherStatutIaPlanning("Réponse affichée.");
    } catch (erreur) {
      console.error("Erreur recherche IA planning membre :", erreur);
      afficherErreurIaPlanning(erreur.message || "Recherche interrompue.");
      afficherStatutIaPlanning("Recherche interrompue.");
    } finally {
      demandeIaEnCours = false;

      if (boutonMicroIaPlanning) {
        boutonMicroIaPlanning.disabled = false;
        boutonMicroIaPlanning.textContent = "🎙️ Parler";
      }

      if (boutonRecommencerIaPlanning) {
        boutonRecommencerIaPlanning.disabled = false;
      }
    }
  }

  function extraireTexteReponseIaPlanning(data) {
    if (!data) return "";

    if (typeof data.reponse === "string") return data.reponse;
    if (typeof data.response === "string") return data.response;
    if (typeof data.message === "string") return data.message;
    if (typeof data.texte === "string") return data.texte;

    if (Array.isArray(data.parcs)) {
      return creerTexteDepuisParcsIaPlanning(data.parcs);
    }

    if (Array.isArray(data.resultats)) {
      return creerTexteDepuisParcsIaPlanning(data.resultats);
    }

    return "";
  }

  function creerTexteDepuisParcsIaPlanning(parcs) {
    if (!parcs.length) {
      return "Je n’ai pas trouvé de parc disponible pour cette demande.";
    }

    return parcs
      .map((parc, index) => {
        const nom = parc.nom || parc.nomparc || parc.nom_parc || "Parc";
        const dptmt = parc.dptmt || parc.departement || "";
        const disponibilite = parc.disponibilite || parc.creneau || parc.horaire || "";

        return [
          index + 1 + ". Parc de " + nom + (dptmt ? " (" + dptmt + ")" : ""),
          disponibilite ? "Créneau : " + disponibilite : ""
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");
  }

  function ajouterMessageIaPlanning(type, texte) {
    if (!conversationIaPlanning) return;

    const message = document.createElement("p");

    message.className =
      "ia-planning-message " +
      (type === "utilisateur"
        ? "ia-planning-message-utilisateur"
        : "ia-planning-message-assistant");

    message.innerHTML = echapperHtml(texte).replaceAll("\n", "<br>");

    conversationIaPlanning.appendChild(message);
    conversationIaPlanning.scrollTop = conversationIaPlanning.scrollHeight;
  }

  function afficherStatutIaPlanning(message) {
    if (statutIaPlanning) {
      statutIaPlanning.textContent = message;
    }
  }

  function afficherErreurIaPlanning(message) {
    if (!erreurIaPlanning) return;

    if (!message) {
      erreurIaPlanning.hidden = true;
      erreurIaPlanning.textContent = "";
      return;
    }

    erreurIaPlanning.hidden = false;
    erreurIaPlanning.textContent = message;
  }

  function mettreAJourBoutonMicroIaPlanning() {
    if (!boutonMicroIaPlanning) return;

    if (reconnaissanceActive) {
      boutonMicroIaPlanning.textContent = "Arrêter";
      boutonMicroIaPlanning.disabled = false;
      return;
    }

    if (!demandeIaEnCours) {
      boutonMicroIaPlanning.textContent = "🎙️ Parler";
      boutonMicroIaPlanning.disabled = false;
    }
  }

  async function gererClicDocument(event) {
    const boutonAdresse = event.target.closest("[data-action='adresse']");
    const boutonAnnuler = event.target.closest("[data-action='annuler']");
    const boutonAnnulerLightbox = event.target.closest("[data-action='annuler-lightbox-annulation']");
    const boutonConfirmerAnnulation = event.target.closest("[data-action='confirmer-annulation-reservation']");
    const boutonRetourPlanning = event.target.closest("[data-action='retour-planning-apres-annulation']");

    if (boutonAdresse) {
      afficherMessageErreur("L’adresse sera raccordée ensuite.");
      return;
    }

    if (boutonAnnuler) {
      ouvrirLightboxConfirmationAnnulation(boutonAnnuler.dataset.id);
      return;
    }

    if (boutonAnnulerLightbox) {
      fermerLightboxPlanningMembre();
      return;
    }

    if (boutonConfirmerAnnulation) {
      const idflux = boutonConfirmerAnnulation.dataset.id;

      boutonConfirmerAnnulation.disabled = true;
      boutonConfirmerAnnulation.textContent = "Annulation...";

      try {
        await annulerReservation(idflux);
        ouvrirLightboxAnnulationEnregistree();
      } catch (erreur) {
        boutonConfirmerAnnulation.disabled = false;
        boutonConfirmerAnnulation.textContent = "Oui";
        afficherMessageErreur(erreur.message || "Impossible d’annuler cette réservation.");
      }

      return;
    }

    if (boutonRetourPlanning) {
      window.location.reload();
    }
  }
}

function construireEndpointApi(cleModerne, cleLegacy, sousDomaineWorker) {
  const depuisConfig =
    CONFIG_MON_PLANNING_MEMBRE?.[cleModerne] ||
    CONFIG_MON_PLANNING_MEMBRE?.[cleLegacy] ||
    "";

  if (depuisConfig) {
    return String(depuisConfig).replace(/\/$/, "");
  }

  if (typeof CONFIG_MON_PLANNING_MEMBRE.apiUrl === "function") {
    return CONFIG_MON_PLANNING_MEMBRE.apiUrl(sousDomaineWorker).replace(/\/$/, "");
  }

  return "";
}

function construireUrlMembre(chemin) {
  const valeur = String(chemin || "");

  if (
    !valeur ||
    valeur.startsWith("#") ||
    valeur.startsWith("mailto:") ||
    valeur.startsWith("tel:") ||
    valeur.startsWith("http://") ||
    valeur.startsWith("https://")
  ) {
    return valeur;
  }

  if (typeof CONFIG_MON_PLANNING_MEMBRE.membreUrl === "function") {
    return CONFIG_MON_PLANNING_MEMBRE.membreUrl(valeur);
  }

  const base = (
    window.SITE_BASE ||
    CONFIG_MON_PLANNING_MEMBRE.membreBaseUrl ||
    CONFIG_MON_PLANNING_MEMBRE.MEMBRE_BASE ||
    ""
  ).replace(/\/$/, "");

  if (base) {
    return valeur.startsWith("/")
      ? base + valeur
      : base + "/" + valeur.replace(/^\.\//, "");
  }

  return valeur.startsWith("/") ? valeur : "/" + valeur;
}

function construireUrlPublic(chemin) {
  const valeur = String(chemin || "");

  if (
    !valeur ||
    valeur.startsWith("#") ||
    valeur.startsWith("mailto:") ||
    valeur.startsWith("tel:") ||
    valeur.startsWith("http://") ||
    valeur.startsWith("https://")
  ) {
    return valeur;
  }

  if (typeof CONFIG_MON_PLANNING_MEMBRE.publicUrl === "function") {
    return CONFIG_MON_PLANNING_MEMBRE.publicUrl(valeur);
  }

  const base = (
    window.ASSETS_BASE ||
    CONFIG_MON_PLANNING_MEMBRE.publicBaseUrl ||
    CONFIG_MON_PLANNING_MEMBRE.PUBLIC_BASE ||
    ""
  ).replace(/\/$/, "");

  if (base) {
    return valeur.startsWith("/")
      ? base + valeur
      : base + "/" + valeur.replace(/^\.\//, "");
  }

  return valeur.startsWith("/") ? valeur : "/" + valeur;
}

function redirigerConnexionMembre(motif) {
  const separateur = PAGE_CONNEXION_MEMBRE.includes("?") ? "&" : "?";

  window.location.href =
    PAGE_CONNEXION_MEMBRE +
    separateur +
    "source=mon-planning-membre&session=" +
    encodeURIComponent(motif || "inactive");
}

function reponseApiOk(data) {
  return data && (data.ok === true || data.success === true);
}

function messageErreurApi(resultat, messageDefaut) {
  return resultat && (resultat.message || resultat.error)
    ? String(resultat.message || resultat.error)
    : messageDefaut;
}

function afficherMessageErreur(message) {
  if (typeof window.afficherLightboxInformation === "function") {
    window.afficherLightboxInformation(
      "Erreur",
      message,
      { type: "erreur" }
    );
    return;
  }

  alert(message);
}

function echapperHtml(valeur) {
  return String(valeur ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}