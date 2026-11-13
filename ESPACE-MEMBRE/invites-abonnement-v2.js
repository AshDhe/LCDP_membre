/* DUO / FAMILLE — contrôleur préparé, non activé sans Worker compatible.
 * Ne contient aucune donnée inventée : le Worker fournit le carnet,
 * les droits achetés (avec options) et l'utilisation DUO+ du mois.
 *
 * Contrat attendu du Worker via les callbacks du module hôte :
 * chargerContexte(idflux) -> {
 *   privileges: {maxduo,duoplus,freqduoplus,famille},
 *   duoplusUtilisesMois: number,
 *   contacts: {duo:[{idinviteabo,email}],famille:[{idinviteabo,email}]},
 *   selection: {duo:[idinviteabo],famille:[idinviteabo]}
 * }
 * enregistrer(idflux,selection) -> {ok:true,confirme:true,message:string}
 * Le Worker doit verrouiller l'abonnement et revérifier quotas/fréquence,
 * enregistrer les deux tables avant d'envoyer les invitations,
 * y compris pour un destinataire sans compte.
 */
(() => {
  "use strict";

  const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const CATEGORIES = ["duo","famille"];
  const normaliserEmail = valeur => String(valeur || "").trim().toLowerCase();
  const entier = valeur => Number.isInteger(valeur) && valeur >= 0;
  const erreurDonnees = () => new Error("Privilèges DUO/FAMILLE indisponibles : envoi non autorisé.");

  function analyserContexte(contexte) {
    const p = contexte?.privileges;
    if (!p || !["maxduo","duoplus","freqduoplus","famille"].every(cle => entier(p[cle]))) {
      throw erreurDonnees();
    }
    if (!contexte.contacts || !contexte.selection || !CATEGORIES.every(categorie =>
      Array.isArray(contexte.contacts[categorie]) && Array.isArray(contexte.selection[categorie])
    )) throw erreurDonnees();

    for (const categorie of CATEGORIES) {
      const valeurs = new Set();
      for (const contact of contexte.contacts[categorie]) {
        if (!contact || !String(contact.idinviteabo || "").trim() ||
            !EMAIL_VALIDE.test(normaliserEmail(contact.email))) throw erreurDonnees();
        const email = normaliserEmail(contact.email);
        if (valeurs.has(email)) throw erreurDonnees();
        valeurs.add(email);
      }
      const ids = new Set(contexte.contacts[categorie].map(c => String(c.idinviteabo)));
      if (contexte.selection[categorie].some(id => !ids.has(String(id)))) throw erreurDonnees();
    }
    return {
      privileges: p,
      duoplusUtilisesMois: entier(contexte.duoplusUtilisesMois) ? contexte.duoplusUtilisesMois : null,
      contacts: contexte.contacts,
      selection: contexte.selection
    };
  }

  function creerElement(tag, classe, texte) {
    const element = document.createElement(tag);
    if (classe) element.className = classe;
    if (texte !== undefined) element.textContent = String(texte);
    return element;
  }

  async function monter({ conteneur, idflux, fragment, chargerContexte, enregistrer, informer, fermer }) {
    if (!conteneur || !fragment || !idflux || typeof chargerContexte !== "function" ||
        typeof enregistrer !== "function" || typeof informer !== "function" ||
        typeof fermer !== "function") throw new Error("Contrôleur DUO/FAMILLE incomplet.");

    // Rien n'est monté tant que la réponse fiable du Worker n'a pas été contrôlée.
    const contexte = analyserContexte(await chargerContexte(idflux));
    const vue = fragment.cloneNode(true);
    const formulaire = vue.querySelector("[data-lcdp-invitation-abonnement-form]");
    const envoyer = vue.querySelector("[data-lcdp-invitation-envoyer]");
    const groupe = vue.querySelector("[data-lcdp-invitation-groupe]");
    const fermerCroix = vue.querySelector("[data-lcdp-listinvites-close]");
    const message = vue.querySelector("[data-lcdp-invitation-abonnement-message]");
    if (![formulaire,envoyer,groupe,fermerCroix,message].every(Boolean)) {
      throw new Error("Gabarit DUO/FAMILLE incomplet.");
    }

    const selection = {
      duo: new Set(contexte.selection.duo.map(String)),
      famille: new Set(contexte.selection.famille.map(String))
    };
    const nouveaux = { duo: [], famille: [] };
    let prochain = 0;
    let enregistrementEnCours = false;
    let ferme = false;

    const info = async texte => {
      await informer(String(texte));
    };
    const messageLocal = texte => {
      message.textContent = texte;
      message.hidden = !texte;
    };
    const quotaCarnet = categorie =>
      categorie === "duo" ? contexte.privileges.maxduo : contexte.privileges.famille;
    const emailsNouveaux = categorie =>
      nouveaux[categorie].map(c => normaliserEmail(c.input.value)).filter(Boolean);
    const nbSelectionnes = categorie =>
      selection[categorie].size + nouveaux[categorie].filter(c => normaliserEmail(c.input.value)).length;
    const totalCandidats = categorie =>
      contexte.contacts[categorie].length +
      nouveaux[categorie].filter(contact => normaliserEmail(contact.input.value)).length;
    const lignesOuvertes = categorie =>
      contexte.contacts[categorie].length + nouveaux[categorie].length;

    function verifierSelectionDuo(nombre) {
      if (nombre <= 1) return "";
      if (contexte.privileges.duoplus < 2 || nombre > contexte.privileges.duoplus) {
        return "Le quota DUO+ simultané de votre abonnement est dépassé.";
      }
      if (contexte.duoplusUtilisesMois === null) {
        return "La fréquence DUO+ du mois n'a pas pu être vérifiée.";
      }
      if (contexte.duoplusUtilisesMois >= contexte.privileges.freqduoplus) {
        return "La fréquence DUO+ de votre abonnement est atteinte pour ce mois.";
      }
      return "";
    }

    function verifierSelection() {
      if (nbSelectionnes("famille") > contexte.privileges.famille) {
        return "Le nombre d'invités FAMILLE autorisés est dépassé.";
      }
      if (nbSelectionnes("duo") > contexte.privileges.maxduo) {
        return "Le MAXDUO de votre abonnement est atteint.";
      }
      return verifierSelectionDuo(nbSelectionnes("duo"));
    }

    function actualiserQuotas() {
      for (const categorie of CATEGORIES) {
        const bouton = vue.querySelector('[data-lcdp-invitation-ajouter="' + categorie + '"]');
        const note = vue.querySelector('[data-lcdp-invitation-quota="' + categorie + '"]');
        const quota = quotaCarnet(categorie);
        const atteint = totalCandidats(categorie) >= quota;
        bouton.setAttribute("aria-disabled", atteint ? "true" : "false");
        bouton.title = atteint
          ? (categorie === "duo" ? "Le MAXDUO de votre abonnement est atteint." : "Le MAXFAMILL de votre abonnement est atteint.")
          : "Ajouter un nouvel invité " + categorie.toUpperCase();
        note.textContent = categorie === "duo"
          ? "MAXDUO : " + totalCandidats(categorie) + " / " + quota + " invités différents."
          : "MAXFAMILL : " + totalCandidats(categorie) + " / " + quota + " invités.";
      }
    }

    function creerLigneExistante(categorie, contact) {
      const item = creerElement("li","lcdp-box-champ-formulaire");
      const etiquette = creerElement("label","lcdp-box-champ-formulaire__checkbox-line");
      const caseACocher = creerElement("input");
      caseACocher.type = "checkbox";
      caseACocher.checked = selection[categorie].has(String(contact.idinviteabo));
      caseACocher.setAttribute("aria-label", "Inviter " + contact.email);
      const texte = creerElement("span",null,contact.email);
      etiquette.append(caseACocher,texte);
      item.appendChild(etiquette);
      caseACocher.addEventListener("change", async () => {
        const id = String(contact.idinviteabo);
        if (caseACocher.checked) selection[categorie].add(id);
        else selection[categorie].delete(id);
        const probleme = verifierSelection();
        if (probleme) {
          if (caseACocher.checked) selection[categorie].delete(id);
          else selection[categorie].add(id);
          caseACocher.checked = !caseACocher.checked;
          await info(probleme);
        }
      });
      return item;
    }

    function ajouterChamp(categorie, initial = false) {
      if (enregistrementEnCours || ferme) return;
      const liste = vue.querySelector('[data-lcdp-invitation-nouveaux="' + categorie + '"]');
      const item = creerElement("li","lcdp-box-champ-formulaire");
      if (!initial) item.setAttribute("data-lcdp-invite-email-row","");
      const champ = creerElement("input");
      champ.type = "email";
      champ.inputMode = "email";
      champ.autocomplete = "email";
      champ.placeholder = "nom@exemple.fr";
      champ.setAttribute("aria-label","Adresse e-mail du nouvel invité "+categorie.toUpperCase());
      const supprimer = creerElement("button","lcdp-button lcdp-button-secondary","×");
      supprimer.type = "button";
      supprimer.setAttribute("data-lcdp-invite-effacer","");
      supprimer.setAttribute("aria-label","Supprimer cette adresse avant envoi");
      const entree = { id:++prochain, input:champ, supprimer };
      supprimer.addEventListener("click", () => {
        if (enregistrementEnCours || ferme) return;
        nouveaux[categorie] = nouveaux[categorie].filter(x => x !== entree);
        item.remove();
        actualiserQuotas();
      });
      if (initial) item.appendChild(champ);
      else item.append(champ,supprimer);
      champ.addEventListener("input", actualiserQuotas);
      nouveaux[categorie].push(entree);
      liste.appendChild(item);
      actualiserQuotas();
      champ.focus({preventScroll:true});
    }

    for (const categorie of CATEGORIES) {
      const liste = vue.querySelector('[data-lcdp-invitation-existants="' + categorie + '"]');
      const ajouter = vue.querySelector('[data-lcdp-invitation-ajouter="' + categorie + '"]');
      if (!liste || !ajouter || !vue.querySelector('[data-lcdp-invitation-nouveaux="' + categorie + '"]')) {
        throw new Error("Rubrique " + categorie.toUpperCase() + " incomplète.");
      }
      for (const contact of contexte.contacts[categorie]) {
        liste.appendChild(creerLigneExistante(categorie,contact));
      }
      ajouter.addEventListener("click",async () => {
        if (totalCandidats(categorie) >= quotaCarnet(categorie)) {
          await info(categorie === "duo"
            ? "Le MAXDUO de votre abonnement est atteint."
            : "Le MAXFAMILL de votre abonnement est atteint.");
          return;
        }
        if (lignesOuvertes(categorie) >= quotaCarnet(categorie)) {
          await info("Saisissez d'abord l'adresse e-mail dans le champ ouvert.");
          return;
        }
        ajouterChamp(categorie);
      });
      // Un premier champ nu, sans croix, si le carnet de la catégorie est vide.
      if (!contexte.contacts[categorie].length && quotaCarnet(categorie) > 0) {
        ajouterChamp(categorie, true);
      }
    }

    const quitter = () => {
      if (enregistrementEnCours || ferme) return;
      ferme = true;
      fermer();
    };
    fermerCroix.addEventListener("click",quitter);
    groupe.addEventListener("click",() =>
      info("La fonction Groupe n'est pas disponible actuellement.")
    );

    formulaire.addEventListener("submit",async event => {
      event.preventDefault();
      if (enregistrementEnCours || ferme) return;
      const emailsTous = new Set();
      for (const categorie of CATEGORIES) {
        for (const contact of contexte.contacts[categorie]) emailsTous.add(normaliserEmail(contact.email));
      }
      for (const categorie of CATEGORIES) {
        for (const contact of nouveaux[categorie]) {
          const email = normaliserEmail(contact.input.value);
          if (!EMAIL_VALIDE.test(email)) {
            messageLocal("Veuillez renseigner une adresse e-mail valide dans la rubrique " + categorie.toUpperCase() + ".");
            contact.input.focus();
            return;
          }
          if (emailsTous.has(email)) {
            messageLocal("Cette adresse e-mail figure déjà parmi les invités.");
            contact.input.focus();
            return;
          }
          emailsTous.add(email);
        }
      }
      if (!nbSelectionnes("duo") && !nbSelectionnes("famille")) {
        messageLocal("Sélectionnez au moins un invité.");
        return;
      }
      const probleme = verifierSelection();
      if (probleme) {
        await info(probleme);
        return;
      }
      const donnees = {
        duo: {
          existants: Array.from(selection.duo),
          nouveaux: emailsNouveaux("duo")
        },
        famille: {
          existants: Array.from(selection.famille),
          nouveaux: emailsNouveaux("famille")
        }
      };
      enregistrementEnCours = true;
      envoyer.disabled = true;
      fermerCroix.disabled = true;
      envoyer.textContent = "Enregistrement…";
      messageLocal("Enregistrement des invités en cours.");
      try {
        const resultat = await enregistrer(idflux,donnees);
        if (resultat?.ok !== true || resultat?.confirme !== true) {
          throw new Error(resultat?.message || "Enregistrement non confirmé. Les choix sont conservés.");
        }
        ferme = true;
        fermer();
        await info(resultat.message || "Invitations enregistrées.");
      } catch (erreur) {
        messageLocal(erreur?.message || "Enregistrement impossible. Les choix sont conservés.");
      } finally {
        enregistrementEnCours = false;
        if (!ferme) {
          envoyer.disabled = false;
          fermerCroix.disabled = false;
          envoyer.textContent = "Inviter";
        }
      }
    });
    actualiserQuotas();
    conteneur.replaceChildren(vue);
    return { fermer: quitter, element: vue };
  }

  window.LCDP_InvitationsAbonnementV2 = Object.freeze({ monter, analyserContexte });
})();
