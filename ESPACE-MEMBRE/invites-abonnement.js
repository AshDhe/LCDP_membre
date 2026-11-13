/* Formulaire Inviter : saisie DUO/FAMILLE et sélection de contacts enregistrés.
 * Le serveur reste seul responsable de confirmer l'enregistrement.
 * Les quotas sont traités dans une étape distincte.
 */
(() => {
  "use strict";

  const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const CATEGORIES = ["duo","famille"];
  const normaliserEmail = valeur => String(valeur || "").trim().toLowerCase();
  const erreurDonnees = () => new Error("Liste des invités DUO/FAMILLE invalide.");

  function analyserContexte(contexte) {
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

    // Le conteneur fonctionne avec un carnet vide quand la nouvelle route est absente.
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
    const emailsNouveaux = categorie =>
      nouveaux[categorie].map(c => normaliserEmail(c.input.value)).filter(Boolean);

    // Première étape : l'ajout des contacts ne dépend pas du quota.
    function actualiserQuotas() {
      for (const categorie of CATEGORIES) {
        const bouton = vue.querySelector('[data-lcdp-invitation-ajouter="' + categorie + '"]');
        const note = vue.querySelector('[data-lcdp-invitation-quota="' + categorie + '"]');
        bouton.removeAttribute("aria-disabled");
        bouton.style.opacity = "";
        bouton.style.cursor = "";
        bouton.title = "Ajouter un invité " + categorie.toUpperCase();
        note.textContent = "";
      }
    }

    function creerLigneExistante(categorie, contact) {
      const item = creerElement("li", "lcdp-box-champ-formulaire");
      item.setAttribute("data-lcdp-invite-email-row", "");
      const adresse = creerElement("input");
      adresse.type = "email";
      adresse.readOnly = true;
      adresse.value = contact.email;
      adresse.setAttribute("aria-label", "Adresse e-mail de l'invité " + categorie.toUpperCase());
      adresse.setAttribute("data-lcdp-invite-email", "");
      const etiquette = creerElement("label", "lcdp-box-champ-formulaire__checkbox-line");
      const caseACocher = creerElement("input");
      caseACocher.type = "checkbox";
      caseACocher.checked = selection[categorie].has(String(contact.idinviteabo));
      caseACocher.setAttribute("aria-label", "Sélectionner " + contact.email);
      etiquette.appendChild(caseACocher);
      item.append(adresse, etiquette);
      caseACocher.addEventListener("change", () => {
        const id = String(contact.idinviteabo);
        if (caseACocher.checked) selection[categorie].add(id);
        else selection[categorie].delete(id);
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
      champ.setAttribute("data-lcdp-invite-email", "");
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
      if (!initial) champ.focus({preventScroll:true});
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
      ajouter.addEventListener("click", () => ajouterChamp(categorie));
      // Toujours permettre la saisie du premier invité, quelle que soit la formule.
      if (!contexte.contacts[categorie].length) ajouterChamp(categorie, true);
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
    groupe.style.opacity = "0.55";

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
          if (!email) continue;
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

  window.LCDP_InvitationsAbonnement = Object.freeze({ monter, analyserContexte });
})();
