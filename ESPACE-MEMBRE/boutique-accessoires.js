(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const retour = document.querySelector("[data-lcdp-accessoires-retour]");
  if (retour) retour.href = window.LCDP_urlPublic("/ESPACE-PUBLIC/boutique.html");

  const siteBase = String(window.SITE_CONFIG?.publicBaseUrl || "").replace(/\/+$/, "");
  let controleBoutiqueEnCours = false;

  // Vérification de session commune aux actions réservées aux membres.
  // Une erreur réseau ou une réponse inattendue ne signifie pas une déconnexion.
  async function lireSessionBoutique() {
    const base = config.workerIndexMembreUrl || config.WORKER_INDEX_MEMBRE_URL ||
      config.W_INDEX_MEMBRE_URL ||
      (typeof config.apiUrl === "function" ? config.apiUrl("index-membre-api") : "");
    if (!base) return "inconnu";
    try {
      const reponse = await fetch(String(base).replace(/\/+$/, "") + "/index", {
        method: "GET", credentials: "include", cache: "no-store",
        signal: AbortSignal.timeout(20000), headers: { Accept: "application/json" }
      });
      if (reponse.status === 401) return "connexion";
      const data = await reponse.json().catch(() => null);
      if (reponse.ok && data?.success === true) {
        if (data.connected === true) return "connecte";
        if (data.connected === false) return "connexion";
      }
    } catch (error) {
      console.warn("Session boutique non vérifiable :", error);
    }
    return "inconnu";
  }

  function protegerActionBoutique(bouton, action) {
    if (!bouton) return;
    bouton.addEventListener("click", async event => {
      event.preventDefault();
      if (controleBoutiqueEnCours || document.getElementById("lcdp-lightbox-slot")?.children.length) return;
      controleBoutiqueEnCours = true;
      const ancienLabel = bouton.getAttribute("aria-label");
      bouton.setAttribute("aria-busy", "true");
      bouton.setAttribute("aria-label", "Vérification en cours");
      try {
        const session = await lireSessionBoutique();
        if (session === "connecte") await action();
        else await ouvrirDialogueBoutique({type: session === "connexion" ? "connexion" : "session-inconnue"});
      } catch (error) {
        console.error("Contrôle boutique :", error);
        await ouvrirDialogueBoutique({type: "session-inconnue"}).catch(console.error);
      } finally {
        if (ancienLabel === null) bouton.removeAttribute("aria-label");
        else bouton.setAttribute("aria-label", ancienLabel);
        bouton.removeAttribute("aria-busy");
        controleBoutiqueEnCours = false;
      }
    });
  }

  function construireUrlSite(chemin) {
    if (!chemin) return chemin;
    if (/^(?:#|mailto:|tel:|https?:|data:)/i.test(chemin)) return chemin;
    if (chemin.startsWith("/ESPACE-MEMBRE/")) return urlMembre(chemin);
    if (chemin.startsWith("/OBJET/") && typeof window.SITE_CONFIG?.objetUrl === "function") {
      return window.SITE_CONFIG.objetUrl(chemin.slice("/OBJET".length));
    }
    if (siteBase) return siteBase + "/" + String(chemin).replace(/^\/+/, "");
    return chemin.startsWith("/") ? ".." + chemin : chemin;
  }

  async function chargerFragment(chemin) {
    const reponse = await fetch(construireUrlSite(chemin), {
      method: "GET", credentials: "same-origin", cache: "no-cache"
    });
    if (!reponse.ok) throw new Error("Fragment introuvable : " + chemin);
    const template = document.createElement("template");
    template.innerHTML = (await reponse.text()).trim();
    return template.content.cloneNode(true);
  }

  function urlMembre(chemin) {
    const config = window.SITE_CONFIG || {};
    if (typeof config.membreUrl === "function") return config.membreUrl(chemin);
    const base = String(config.membreBaseUrl || config.MEMBRE_BASE || "").replace(/\/+$/, "");
    if (!base) throw new Error("L'espace membre n'est pas configuré.");
    return base + "/" + String(chemin).replace(/^\/+/, "");
  }

  function presentationSituationDa(situation) {
    switch (situation.type) {
      case "absente":
        return { titre: "Droit d’abonnement (DA) nécessaire", message: "Vous ne disposez pas encore d’un droit d’abonnement. Vous pouvez faire votre demande de DA.", action: "Faire ma demande", destination: "da" };
      case "renouvelable":
        return { titre: "Droit d’abonnement (DA) nécessaire", message: "Votre précédente demande de DA n’a pas été accordée. Vous pouvez faire une nouvelle demande.", action: "Faire ma demande", destination: "da" };
      case "encours":
        return { titre: "Demande de DA en cours", message: "Votre demande de DA est à l’étude. Nous vous tenons informé(e)." };
      case "refusee":
        return { titre: "Droit d’abonnement non accordé", message: situation.date !== null
          ? "Votre demande de DA n’a pas été accordée. Vous pouvez faire une nouvelle demande à partir du " + new Date(situation.date).toLocaleDateString("fr-FR", {timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric"}) + "."
          : "Votre demande de DA n’a pas été accordée. Vous ne pouvez pas faire de nouvelle demande actuellement." };
      case "connexion":
        return { titre: "Connexion nécessaire", message: "Vous devez vous connecter à votre compte pour continuer.", action: "Mon compte", destination: "connexion" };
      case "session-inconnue":
        return { titre: "Vérification de connexion", message: "Votre connexion ne peut pas être vérifiée. Veuillez réessayer." };
      case "commande-demo":
        return { titre: "Commande indisponible", message: "La commande de cet accessoire n’est pas encore disponible." };
      case "accessoire-details":
        return { titre: situation.nom, message: situation.description };
      default:
        return { titre: "Droit d’abonnement", message: "Votre droit d’abonnement ne peut pas être vérifié. Veuillez réessayer." };
    }
  }

  async function ouvrirDialogueBoutique(situation) {
    const slot = document.getElementById("lcdp-lightbox-slot");
    const wrapper = slot?.closest(".lcdp-site-page.lcdp-app-wrapper");
    if (!slot || !wrapper || slot.children.length) return;
    const elementActif = document.activeElement;
    const contenu = presentationSituationDa(situation);
    const choix = Boolean(contenu.action);
    const type = choix ? "choix" : "information";
    const fragment = await chargerFragment("/OBJET/HTMLBASE/02-dialogue-reference-" + type + ".html");
    if (slot.children.length) return;
    const dialogue = fragment.querySelector('[data-lcdp-dialogue-reference="' + type + '"]');
    const titre = dialogue?.querySelector("[data-lcdp-dialogue-titre]");
    const message = dialogue?.querySelector("[data-lcdp-dialogue-message]");
    const fermerBouton = dialogue?.querySelector('[data-lcdp-dialogue-action="' + (choix ? "annuler" : "compris") + '"]');
    const confirmer = choix ? dialogue?.querySelector('[data-lcdp-dialogue-action="confirmer"]') : null;
    if (!dialogue || !titre || !message || !fermerBouton || (choix && !confirmer)) throw new Error("Dialogue DA incomplet.");
    dialogue.dataset.lcdpDialogueContext = "conteneur";
    titre.textContent = contenu.titre;
    message.textContent = contenu.message;
    fermerBouton.textContent = choix ? "Annuler" : "Fermer";
    if (confirmer) confirmer.textContent = contenu.action;
    const etats = Array.from(wrapper.children).filter(element => element !== slot).map(element => [element, element.inert]);
    const fermer = () => {
      document.removeEventListener("keydown", gererClavier);
      dialogue.remove();
      slot.classList.remove("lcdp-souscription-dialogue-actif");
      etats.forEach(([element, inert]) => { element.inert = inert; });
      if (elementActif?.isConnected) elementActif.focus();
    };
    const gererClavier = event => {
      if (event.key === "Escape") { event.preventDefault(); fermer(); }
      else if (event.key === "Tab") {
        event.preventDefault();
        (confirmer && document.activeElement === fermerBouton ? confirmer : fermerBouton).focus();
      }
    };
    fermerBouton.addEventListener("click", fermer, { once: true });
    confirmer?.addEventListener("click", () => {
      fermer();
      if (contenu.destination === "da") {
        const lienDa = document.createElement("a");
        lienDa.href = urlMembre("/ESPACE-MEMBRE/abonnement-membre.html?mode=da");
        lienDa.target = "_blank";
        lienDa.rel = "noopener noreferrer";
        lienDa.click();
      }
      else if (contenu.destination === "connexion") window.location.assign(construireUrlSite("/ESPACE-PUBLIC/connexion-membre.html"));
    }, { once: true });
    dialogue.addEventListener("click", event => { if (event.target === dialogue) fermer(); });
    slot.classList.add("lcdp-souscription-dialogue-actif");
    slot.appendChild(fragment);
    etats.forEach(([element]) => { element.inert = true; });
    document.addEventListener("keydown", gererClavier);
    fermerBouton.focus();
  }

  // La liste reste masquée tant que la session n'est pas confirmée,
  // y compris à l'ouverture directe d'une URL ou au retour de l'historique.
  const catalogue = document.querySelector("[data-lcdp-accessoires-reserves]");
  if (catalogue) {
    const etat = document.getElementById("lcdp-accessoires-etat");
    let controle = 0;
    let renduCatalogue;
    // Jeu de données de maquettage : aucun article n’est commercialisé.
    const demonstrations = {
      acces: [
        { id:"bracelet-1", nom:"Bracelet de présence", prix:12, description:"Bracelet fluorescent · réglable · témoin de présence nominatif.", image:"/OBJET/IMAG/BOUTIQUE/ACCES/bracelet-presence-demo.svg" },
        { id:"bracelet-2", nom:"Bracelet de présence – modèle 2", prix:15, description:"Bracelet fluorescent · réglable · témoin de présence nominatif.", image:"/OBJET/IMAG/BOUTIQUE/ACCES/bracelet-presence-demo.svg" }
      ],
      cadeau: [
        { id:"gourde-1", nom:"Gourde La Clé du Parc", prix:19, description:"Gourde inox · 500 ml · réutilisable en promenade.", image:"/OBJET/IMAG/BOUTIQUE/CADEAU/gourde-demo.svg" },
        { id:"gourde-2", nom:"Gourde La Clé du Parc – modèle 2", prix:24, description:"Gourde inox · 500 ml · réutilisable en promenade.", image:"/OBJET/IMAG/BOUTIQUE/CADEAU/gourde-demo.svg" }
      ]
    };
    async function rendreCatalogueDemo() {
      const produits = demonstrations[catalogue.dataset.lcdpAccessoiresReserves];
      const liste = catalogue.querySelector("[data-lcdp-liste-card-diaporama-list]");
      const filtres = catalogue.querySelector("[data-lcdp-accessoires-filtres]");
      const modele = filtres?.querySelector('[data-lcdp-accessoire-filtre="modele"]');
      const prix = filtres?.querySelector('[data-lcdp-accessoire-filtre="prix"]');
      const resultat = filtres?.querySelector("[data-lcdp-accessoires-resultat]");
      if (!produits || !liste || !modele || !prix || !resultat) throw new Error("Catalogue accessoire incomplet.");
      const fragment = await chargerFragment("/OBJET/HTMLBASE/04-card-accessoire.html");
      const template = fragment.querySelector("[data-lcdp-card-accessoire]");
      if (!template) throw new Error("Gabarit accessoire introuvable.");
      const cartes = produits.map(produit => {
        const carte = template.cloneNode(true);
        const recto = carte.querySelector("[data-lcdp-diaporama-retourner]");
        const dos = carte.querySelector("[data-lcdp-diaporama-dos]");
        const fermer = carte.querySelector("[data-lcdp-diaporama-fermer]");
        const image = carte.querySelector("[data-lcdp-accessoire-image]");
        const commander = carte.querySelector("[data-lcdp-accessoire-commander]");
        const details = carte.querySelector("[data-lcdp-accessoire-details]");
        image.alt = produit.nom;
        image.src = construireUrlSite(produit.image);
        recto.setAttribute("aria-label", "Découvrir : " + produit.nom);
        carte.querySelector("[data-lcdp-accessoire-nom-image]").textContent = produit.nom;
        carte.querySelector("[data-lcdp-accessoire-nom]").textContent = produit.nom;
        carte.querySelector("[data-lcdp-accessoire-prix]").textContent = produit.prix + " €";
        carte.querySelector("[data-lcdp-card-parc-description-texte]").textContent = produit.description;
        function retourner(ouvert, focus = true) {
          carte.classList.toggle("is-retourne", ouvert);
          recto.setAttribute("aria-expanded", String(ouvert));
          recto.inert = ouvert;
          dos.inert = !ouvert;
          dos.setAttribute("aria-hidden", String(!ouvert));
          if (focus) (ouvert ? fermer : recto).focus({preventScroll:true});
        }
        recto.addEventListener("click", () => retourner(true));
        fermer.addEventListener("click", () => retourner(false));
        carte.addEventListener("keydown", event => {
          if (event.key === "Escape" && carte.classList.contains("is-retourne")) {
            event.preventDefault();
            retourner(false);
          }
        });
        protegerActionBoutique(commander, () => ouvrirDialogueBoutique({type:"commande-demo"}));
        details.addEventListener("click", () => ouvrirDialogueBoutique({type:"accessoire-details", nom:produit.nom, description:produit.description}).catch(console.error));
        retourner(false,false);
        const option = document.createElement("option");
        option.value = produit.id;
        option.textContent = produit.nom;
        modele.appendChild(option);
        return { produit, carte, image };
      });
      function afficher() {
        let selection = cartes.filter(item => !modele.value || item.produit.id === modele.value);
        if (prix.value) selection = selection.slice().sort((a,b) => (a.produit.prix-b.produit.prix)*(prix.value === "desc" ? -1 : 1));
        liste.replaceChildren(...selection.map(item => item.carte));
        resultat.textContent = selection.length + (selection.length === 1 ? " accessoire" : " accessoires");
        requestAnimationFrame(() => requestAnimationFrame(() => selection.forEach(item => item.carte.classList.add("is-ready"))));
      }
      filtres.addEventListener("submit", event => event.preventDefault());
      filtres.addEventListener("change", afficher);
      filtres.addEventListener("reset", () => { setTimeout(afficher,0); });
      afficher();
      await Promise.all(cartes.map(({image}) => typeof image.decode === "function" ? image.decode().catch(() => {}) : Promise.resolve()));
    }
    async function initialiserCatalogue() {
      const generation = ++controle;
      catalogue.hidden = true;
      if (etat) etat.hidden = true;
      const [session] = await Promise.all([
        lireSessionBoutique(),
        window.LCDP_cadreAccessoiresPret || Promise.resolve()
      ]);
      if (generation !== controle) return;
      if (session === "connecte") {
        try {
          renduCatalogue ||= rendreCatalogueDemo().catch(error => { renduCatalogue = null; throw error; });
          await renduCatalogue;
        } catch (error) {
          console.error(error);
          if (generation !== controle) return;
          if (etat) { etat.textContent = "Le catalogue est momentanément indisponible."; etat.hidden = false; }
          window.LCDP_terminerAttenteAccessoires?.();
          return;
        }
        if (generation !== controle) return;
        catalogue.hidden = false;
        if (etat) etat.hidden = true;
        window.LCDP_terminerAttenteAccessoires?.();
        return;
      }
      window.LCDP_terminerAttenteAccessoires?.();
      if (etat) {
        etat.textContent = session === "connexion"
          ? "Vous devez vous connecter à votre compte pour continuer."
          : "Votre connexion ne peut pas être vérifiée. Veuillez réessayer.";
        etat.hidden = false;
      }
      await ouvrirDialogueBoutique({type: session === "connexion" ? "connexion" : "session-inconnue"});
    }
    initialiserCatalogue().catch(console.error);
    window.addEventListener("pagehide", () => { ++controle; catalogue.hidden = true; });
    window.addEventListener("pageshow", event => {
      if (event.persisted) initialiserCatalogue().catch(console.error);
    });
  }
})();
