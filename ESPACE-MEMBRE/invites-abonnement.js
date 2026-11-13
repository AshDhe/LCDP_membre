/* Formulaire Inviter : saisie DUO/FAMILLE et sélection de contacts enregistrés.
 * Le serveur reste seul responsable de confirmer l'enregistrement.
 * Les quotas sont traités dans une étape distincte.
 */
(() => {
  "use strict";

  const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const CATEGORIES = ["duo","famille"];
  const CLES_DROITS = ["maxduo","duoplus","freqduoplus","famille"];
  const CLES_UTILISATION = ["duoCarnet","familleCarnet","duoplusUtilisesMois","duoSelectionnesAcces","familleSelectionnesAcces"];
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
    // Le carnet reste consultable sans Worker actif, mais les droits ne
    // peuvent être inventés : ils sont fournis par la commande payée.
    const avecQuotas = contexte.privileges != null || contexte.utilisation != null;
    if (avecQuotas && (!contexte.privileges || !contexte.utilisation ||
        !CLES_DROITS.every(cle => Number.isInteger(contexte.privileges[cle]) && contexte.privileges[cle] >= 0) ||
        !CLES_UTILISATION.every(cle => Number.isInteger(contexte.utilisation[cle]) && contexte.utilisation[cle] >= 0))) {
      throw erreurDonnees();
    }
    return {
      contacts: contexte.contacts,
      selection: contexte.selection,
      privileges: avecQuotas ? contexte.privileges : null,
      utilisation: avecQuotas ? contexte.utilisation : null
    };
  }

  function creerElement(tag, classe, texte) {
    const element = document.createElement(tag);
    if (classe) element.className = classe;
    if (texte !== undefined) element.textContent = String(texte);
    return element;
  }

  async function monter({ conteneur, idflux, fragment, chargerContexte, enregistrer, informer, erreur, confirmerQuitter, fermer }) {
    if (!conteneur || !fragment || !idflux || typeof chargerContexte !== "function" ||
        typeof enregistrer !== "function" || typeof informer !== "function" ||
        typeof erreur !== "function" || typeof confirmerQuitter !== "function" ||
        typeof fermer !== "function") {
      throw new Error("Contrôleur DUO/FAMILLE incomplet.");
    }

    // Le conteneur fonctionne avec un carnet vide quand la nouvelle route est absente.
    const contexte = analyserContexte(await chargerContexte(idflux));
    // Ne pas conserver un DocumentFragment comme racine interactive :
    // replaceChildren() en déplace les enfants et vide le fragment.
    // Les boutons doivent rechercher leurs champs dans l'élément DOM monté.
    const copie = fragment.cloneNode(true);
    const vue = copie.querySelector("[data-lcdp-invitation-abonnement]");
    if (!vue) throw new Error("Gabarit DUO/FAMILLE : racine introuvable.");
    const formulaire = vue.querySelector("[data-lcdp-invitation-abonnement-form]");
    const envoyer = vue.querySelector("[data-lcdp-invitation-envoyer]");
    // Garder le libellé fixe et afficher un spinner indépendant de la saisie.
    const spinnerEnregistrement = creerElement("span", "lcdp-invitation-spinner");
    spinnerEnregistrement.setAttribute("aria-hidden", "true");
    spinnerEnregistrement.style.cssText = "display:inline-block;width:17px;height:17px;flex:0 0 17px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:lcdp-button-logo-loading .75s linear infinite;";
    envoyer.style.display = "inline-flex";
    envoyer.style.alignItems = "center";
    envoyer.style.justifyContent = "center";
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
    let fermetureEnCours = false;
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

    // Les quotas sont lus depuis Supabase. Sans contexte de droits, le
    // formulaire reste visible, mais l'enregistrement est bloqué par l'hôte.
    const droits = contexte.privileges;
    const usage = contexte.utilisation;
    const nombreNouveaux = categorie =>
      nouveaux[categorie].filter(c => normaliserEmail(c.input.value)).length;
    const nombreSelectionnes = categorie => selection[categorie].size + nombreNouveaux(categorie);
    const nombreCarnet = categorie => contexte.contacts[categorie].length + nombreNouveaux(categorie);
    const duoPlusPossible = () => !droits || usage.duoplusUtilisesMois < droits.freqduoplus;
    const maxDuoAcces = () => !droits ? Infinity :
      (duoPlusPossible() ? Math.max(1,droits.duoplus) : 1);

    function verifierSelection() {
      if (!droits) return "";
      if (nombreCarnet("duo") > droits.maxduo) {
        return "Le maximum d’invités DUO est atteint sur cet abonnement.";
      }
      if (nombreCarnet("famille") > droits.famille) {
        return "Le maximum d’invités FAMILLE est atteint sur cet abonnement.";
      }
      if (nombreSelectionnes("duo") > maxDuoAcces()) {
        return duoPlusPossible()
          ? "Le nombre maximum d’invités DUO+ est atteint pour cet accès."
          : "L’option DUO+ n’est plus valable pour ce mois.";
      }
      if (nombreSelectionnes("famille") > droits.famille) {
        return "Le nombre maximum d’invités FAMILLE est atteint pour cet accès.";
      }
      return "";
    }

    function motifBlocageAjout(categorie) {
      if (!droits) return "";
      if (categorie === "duo") {
        if (nombreCarnet("duo") >= droits.maxduo) {
          return "Le maximum d’invités DUO est atteint sur cet abonnement.";
        }
        if (nombreSelectionnes("duo") >= maxDuoAcces()) {
          return duoPlusPossible()
            ? "Le nombre maximum d’invités DUO+ est atteint pour cet accès."
            : "L’option DUO+ n’est plus valable pour ce mois. Un seul invité DUO peut être sélectionné.";
        }
      } else {
        if (nombreCarnet("famille") >= droits.famille) {
          return "Le maximum d’invités FAMILLE est atteint sur cet abonnement.";
        }
        if (nombreSelectionnes("famille") >= droits.famille) {
          return "Le nombre maximum d’invités FAMILLE est atteint pour cet accès.";
        }
      }
      return "";
    }

    function actualiserQuotas() {
      for (const categorie of CATEGORIES) {
        const bouton = vue.querySelector('[data-lcdp-invitation-ajouter="' + categorie + '"]');
        const note = vue.querySelector('[data-lcdp-invitation-quota="' + categorie + '"]');
        const blocage = motifBlocageAjout(categorie);
        if (blocage) {
          bouton.setAttribute("aria-disabled","true");
          bouton.style.opacity = "0.55";
          bouton.style.cursor = "help";
          // Un bouton grisé reste cliquable pour afficher l'explication.
          bouton.style.pointerEvents = "auto";
          bouton.title = blocage;
        } else {
          bouton.removeAttribute("aria-disabled");
          bouton.style.opacity = "";
          bouton.style.cursor = "";
          bouton.style.pointerEvents = "";
          bouton.title = categorie === "duo" ? "Ajouter un invité DUO / DUO+" : "Ajouter un invité FAMILLE";
        }
        note.textContent = "";
        note.hidden = true;
      }
    }

    function creerLigneExistante(categorie, contact) {
      const item = creerElement("li", "lcdp-box-champ-formulaire");
      item.setAttribute("data-lcdp-invite-email-row", "");
      const adresse = creerElement("input");
      adresse.type = "email";
      adresse.readOnly = true;
      adresse.value = contact.email;
      adresse.style.background = "var(--lcdp-color-surface-soft,#edf0ed)";
      adresse.setAttribute("aria-label", "Adresse e-mail de l'invité " + categorie.toUpperCase());
      adresse.setAttribute("data-lcdp-invite-email", "");
      const etiquette = creerElement("label", "lcdp-box-champ-formulaire__checkbox-line");
      const caseACocher = creerElement("input");
      caseACocher.type = "checkbox";
      // Seuls les invités encore actifs sur cet accès sont précochés.
      caseACocher.checked = selection[categorie].has(String(contact.idinviteabo));
      caseACocher.setAttribute("aria-label", "Sélectionner " + contact.email);
      etiquette.appendChild(caseACocher);
      item.append(adresse, etiquette);
      caseACocher.addEventListener("change", () => {
        const id = String(contact.idinviteabo);
        if (caseACocher.checked) {
          selection[categorie].add(id);
          const violation = verifierSelection();
          if (violation) {
            selection[categorie].delete(id);
            caseACocher.checked = false;
            void erreur(violation);
          }
        } else {
          selection[categorie].delete(id);
        }
        actualiserQuotas();
      });
      return item;
    }

    function ajouterChamp(categorie, initial = false) {
      if (enregistrementEnCours || ferme) return;
      const liste = vue.querySelector('[data-lcdp-invitation-nouveaux="' + categorie + '"]');
      liste.style.display = "flex";
      liste.style.flexDirection = "column";
      liste.style.gap = "8px";
      const item = creerElement("li","lcdp-box-champ-formulaire");
      // Présentation explicite : le nouveau champ doit rester visible même
      // lorsque le formulaire est ouvert depuis un espace différent.
      item.style.display = initial ? "block" : "grid";
      item.style.gridTemplateColumns = initial ? "" : "minmax(0,1fr) 44px";
      item.style.gap = "8px";
      item.style.width = "100%";
      item.style.minWidth = "0";
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
      champ.addEventListener("input", () => {
        actualiserQuotas();
        messageLocal(verifierSelection());
      });
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
      // Une liste vide ne doit pas réserver d'espace au-dessus du champ e-mail.
      liste.style.display = contexte.contacts[categorie].length ? "" : "none";
      ajouter.addEventListener("click", () => {
        const blocage = motifBlocageAjout(categorie);
        if (blocage) {
          void info(blocage);
          return;
        }
        ajouterChamp(categorie);
      });
      // Le premier champ vide ne consomme aucun quota.
      if (!contexte.contacts[categorie].length && !motifBlocageAjout(categorie)) {
        ajouterChamp(categorie, true);
      }
    }

    const quitter = async () => {
      if (enregistrementEnCours || fermetureEnCours || ferme) return;
      fermetureEnCours = true;
      try {
        // CHOIX obligatoire : ne jamais fermer sans validation explicite.
        const confirmation = await confirmerQuitter();
        if (confirmation !== true || ferme) return;
        ferme = true;
        fermer();
      } catch (erreur) {
        console.error("Confirmation de fermeture des invités indisponible :", erreur);
        messageLocal("Impossible de confirmer la fermeture. Vos modifications sont conservées.");
      } finally {
        fermetureEnCours = false;
      }
    };
    fermerCroix.addEventListener("click", quitter);
    groupe.addEventListener("click",() =>
      info("La fonction Groupe n'est pas disponible actuellement.")
    );
    groupe.style.opacity = "0.55";

    formulaire.addEventListener("submit",async event => {
      event.preventDefault();
      if (enregistrementEnCours || fermetureEnCours || ferme) return;
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
      const violation = verifierSelection();
      if (violation) {
        await erreur(violation);
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
      envoyer.setAttribute("aria-busy","true");
      envoyer.appendChild(spinnerEnregistrement);
      messageLocal("");
      try {
        const resultat = await enregistrer(idflux,donnees);
        if (resultat?.ok !== true || resultat?.confirme !== true) {
          throw new Error(resultat?.message || "Enregistrement non confirmé. Les choix sont conservés.");
        }
        ferme = true;
        fermer();
        const envoiPartiel = Number(resultat.nbEnAttente || 0) > 0 ||
          Number(resultat.annulationsNonNotifiees || 0) > 0;
        await info(envoiPartiel
          ? "Liste mise à jour. Certains destinataires n’ont pas pu être informés."
          : "Liste mise à jour. Destinataire(s) informé(s).");
      } catch (erreur) {
        messageLocal(erreur?.message || "Enregistrement impossible. Les choix sont conservés.");
      } finally {
        enregistrementEnCours = false;
        spinnerEnregistrement.remove();
        envoyer.removeAttribute("aria-busy");
        if (!ferme) {
          envoyer.disabled = false;
          fermerCroix.disabled = false;
        }
      }
    });
    actualiserQuotas();
    conteneur.replaceChildren(vue);
    return { fermer: quitter, element: vue };
  }

  window.LCDP_InvitationsAbonnement = Object.freeze({ monter, analyserContexte });
})();
