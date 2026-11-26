(() => {
  "use strict";

  const siteBase = String(window.SITE_CONFIG?.publicBaseUrl || "").replace(/\/+$/, "");
  let controleSouscriptionEnCours = false;

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

  function appliquerRoutesSite(racine) {
    racine.querySelectorAll("[data-site-href]").forEach(element => {
      element.href = construireUrlSite(element.dataset.siteHref);
    });
    racine.querySelectorAll("[data-site-src]").forEach(element => {
      element.src = construireUrlSite(element.dataset.siteSrc);
    });
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

  function chargerScriptUneFois(chemin) {
    if (document.querySelector('script[data-lcdp-script="' + chemin + '"]')) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = construireUrlSite(chemin);
      script.dataset.lcdpScript = chemin;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Script introuvable : " + chemin));
      document.body.appendChild(script);
    });
  }

  async function initialiserBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");
    slot.replaceChildren(await chargerFragment("/ESPACE-MEMBRE/box-bandeau-nav-membre.html"));
    appliquerRoutesSite(slot);
    await chargerScriptUneFois("/ESPACE-MEMBRE/box-menu-burger-membre.js?v=20261126-presentation-membre");
    if (typeof window.LCDP_initialiserMenuBurgerMembre === "function") {
      await window.LCDP_initialiserMenuBurgerMembre();
    }
  }

  async function initialiserFooter() {
    const slot = document.getElementById("lcdp-footer-slot");
    slot.replaceChildren(await chargerFragment("/OBJET/HTMLBASE/02-footer.html"));
    appliquerRoutesSite(slot);
  }

  function urlMembre(chemin) {
    const config = window.SITE_CONFIG || {};
    if (typeof config.membreUrl === "function") return config.membreUrl(chemin);
    const base = String(config.membreBaseUrl || config.MEMBRE_BASE || "").replace(/\/+$/, "");
    if (!base) throw new Error("L'espace membre n'est pas configuré.");
    return base + "/" + String(chemin).replace(/^\/+/, "");
  }

  async function ouvrirDaDepuisPresentation() {
    if (typeof window.LCDP_ouvrirPresentationDaMembre !== "function") {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = urlMembre("/ESPACE-MEMBRE/da-membre.js?v=20261126-wrapper-da-v26");
        script.onload = resolve;
        script.onerror = () => reject(new Error("Module DA membre indisponible."));
        document.body.appendChild(script);
      });
    }
    if (typeof window.LCDP_ouvrirPresentationDaMembre !== "function") {
      throw new Error("Module DA membre indisponible.");
    }
    await window.LCDP_ouvrirPresentationDaMembre();
  }

  // Même contexte et mêmes conditions d'éligibilité que le worker DA.
  // Ne jamais assimiler une session absente ou une erreur réseau à une DA absente.
  function determinerSituationDa(data, maintenant = Date.now()) {
    if (!data || !Object.hasOwn(data, "statuda") || !Object.hasOwn(data, "daactive")) return { type: "inconnu" };
    const statut = String(data.statuda ?? "").trim().toLowerCase();
    if (!["", "oui", "non", "encours"].includes(statut) || ![true, false, null].includes(data.daactive)) return { type: "inconnu" };
    if (data.daactive === true) return { type: statut === "oui" ? "validee" : "encours" };
    if (data.daactive === false) {
      const date = data.datenext ? Date.parse(data.datenext) : NaN;
      if (Number.isFinite(date) && date <= maintenant) return { type: "renouvelable" };
      return { type: "refusee", date: Number.isFinite(date) ? date : null };
    }
    if (statut === "oui") return { type: "validee" };
    if (statut === "encours") return { type: "encours" };
    if (statut === "non") return { type: "refusee", date: null };
    return { type: "absente" };
  }

  async function lireSituationDaSouscription() {
    const config = window.SITE_CONFIG || {};
    const base = config.workerDaMembreUrl || config.WORKER_DA_MEMBRE_URL ||
      (typeof config.apiUrl === "function" ? config.apiUrl("da-membre-api") : "");
    if (!base) return { type: "inconnu" };
    try {
      const reponse = await fetch(String(base).replace(/\/+$/, "") + "/contexte", {
        method: "GET", credentials: "include", cache: "no-store",
        signal: AbortSignal.timeout(20000), headers: { Accept: "application/json" }
      });
      if (reponse.status === 401) return { type: "connexion" };
      const data = await reponse.json().catch(() => null);
      return reponse.ok && (data?.ok === true || data?.success === true)
        ? determinerSituationDa(data) : { type: "inconnu" };
    } catch (error) {
      console.warn("Statut DA non vérifiable :", error);
      return { type: "inconnu" };
    }
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
        return { titre: "Connexion nécessaire", message: "Connectez-vous à votre compte membre pour vérifier votre droit d’abonnement.", action: "Me connecter", destination: "connexion" };
      default:
        return { titre: "Droit d’abonnement", message: "Votre droit d’abonnement ne peut pas être vérifié. Veuillez réessayer." };
    }
  }

  async function ouvrirInformationSouscription(situation) {
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
      if (contenu.destination === "da") document.getElementById("lcdp-ouvrir-da-abonnement")?.click();
      else if (contenu.destination === "connexion") window.location.assign(construireUrlSite("/ESPACE-PUBLIC/connexion-membre.html"));
    }, { once: true });
    dialogue.addEventListener("click", event => { if (event.target === dialogue) fermer(); });
    slot.classList.add("lcdp-souscription-dialogue-actif");
    slot.appendChild(fragment);
    etats.forEach(([element]) => { element.inert = true; });
    document.addEventListener("keydown", gererClavier);
    fermerBouton.focus();
  }

  // Plaquette commerciale : les noms et capacités sont lus dans les pivots
  // applicables. Seules les fenêtres de vente/démarrage et le Duo de base sont fixes.
  const CALENDRIER_OFFRES = {
    "1J": ["1 jour", "Démarrage le jour choisi · M à M+2", "Souscription chaque mois"],
    "1M": ["1 mois", "Démarrage le 1er du mois · M+1 ou M+2", "Souscription chaque mois"],
    "3M": ["3 mois", "Démarrage le 1er du mois · M+1 à M+3", "Souscription chaque mois"],
    "5M": ["5 mois", "Démarrage le 1er du mois · M+1 à M+4", "Souscription chaque mois"],
    "1A": ["12 mois", "Démarrage le 1er janvier", "Souscription de juillet à décembre"],
    "11M": ["11 mois", "Démarrage le 1er février", "Souscription en janvier"],
    "10M": ["10 mois", "Démarrage le 1er mars", "Souscription en février"]
  };
  let lectureOffresEnCours = null;
  function lireOffresAbonnements() {
    if (lectureOffresEnCours) return lectureOffresEnCours;
    const config = window.SITE_CONFIG || {};
    const base = String(config.workerAboRezaUrl || config.WORKER_ABOREZA_URL ||
      (typeof config.apiUrl === "function" ? config.apiUrl("aboreza-api") : "https://aboreza-api.lacleduparc.fr")).replace(/\/+$/, "");
    lectureOffresEnCours = (async () => {
      const r = await fetch(base + "/offres-abonnements", {credentials:"omit", cache:"no-store", signal:AbortSignal.timeout(15000), headers:{Accept:"application/json"}});
      const data = await r.json();
      if (!r.ok || data?.ok !== true || !Array.isArray(data.offres)) throw new Error("Offres indisponibles.");
      const parCode = new Map();
      for (const o of data.offres) {
        if (!Object.hasOwn(CALENDRIER_OFFRES,o.groupeabo) || parCode.has(o.groupeabo) ||
          typeof o.nomabo !== "string" || !o.nomabo.trim() ||
          !Number.isInteger(o.maxduo) || o.maxduo < 1 || !Number.isInteger(o.famille) || o.famille < 0) throw new Error("Offre incohérente.");
        parCode.set(o.groupeabo,o);
      }
      return parCode;
    })().finally(() => { lectureOffresEnCours = null; });
    return lectureOffresEnCours;
  }

  async function chargerOffresAbonnements(dialogue) {
    const etat = dialogue.querySelector(".lcdp-offre-abonnement__etat");
    const scroll = dialogue.querySelector(".lcdp-offre-abonnement__scroll");
    const corps = scroll.querySelector(".lcdp-offre-abonnement__liste");
    try {
      const parCode = await lireOffresAbonnements();
      const fragment = document.createDocumentFragment();
      for (const [code,[duree,debut,detail]] of Object.entries(CALENDRIER_OFFRES)) {
        const o = parCode.get(code);
        if (!o) continue;
        const creer = (tag, classe, valeur, role) => {
          const el = document.createElement(tag);
          if (classe) el.className = "lcdp-offre-abonnement__" + classe;
          if (valeur != null) el.textContent = String(valeur);
          if (role) el.setAttribute("role", role);
          return el;
        };
        const ligne = creer("div","ligne",null,"row");
        const abo = creer("div","abonnement",null,"rowheader");
        const identite = creer("div","identite");
        identite.append(creer("span","nom",o.nomabo.toLocaleUpperCase("fr-FR")),creer("span","code","("+code+")"));
        abo.append(identite,creer("span","duree",duree));
        const debutCell = creer("div","demarrage",null,"cell");
        debutCell.append(creer("span","debut",debut),creer("span","detail",detail));
        const privileges = creer("div","privileges",null,"presentation");
        const quotas = creer("div","quotas",null,"presentation");
        const labels = ["Duo","Famille","MaxDuo"];
        const valeurs = [1,o.famille,o.maxduo];
        quotas.append(creer("span","libelle-vide",null,"presentation"));
        labels.forEach(label=>quotas.append(creer("span","label-mobile",label,"columnheader")));
        quotas.append(creer("span","libelle","Invité par accès","rowheader"));
        valeurs.forEach((valeur,i)=>{
          const cellule = creer("div","quota",null,"cell");
          cellule.setAttribute("aria-label",labels[i]+" : "+valeur+(i===2?" invités Duo différents sur la durée":" invité(s) par accès"));
          cellule.append(creer("span","badge",valeur));
          quotas.append(cellule);
        });
        // Possibilité de principe, pas une confirmation de disponibilité commerciale.
        const libelleExtension = creer("span","libelle","Extension abonnement","rowheader");
        libelleExtension.classList.add("lcdp-offre-abonnement__extension");
        quotas.append(libelleExtension);
        labels.forEach(label=>{
          const cellule = creer("span","extension","Oui","cell");
          cellule.setAttribute("aria-label","Extension "+label+" : oui, selon les offres disponibles");
          quotas.append(cellule);
        });
        privileges.append(quotas);
        ligne.append(abo,debutCell,privileges);
        fragment.append(ligne);
      }
      if (!parCode.size) {etat.textContent="Aucune offre en vigueur.";return;}
      corps.replaceChildren(fragment);scroll.hidden=false;
      etat.hidden=true;
    } catch (error) {
      etat.textContent="Les offres sont momentanément indisponibles. Merci de réessayer.";
      scroll.hidden=true;
      console.warn("Offres non disponibles :",error);
    }
  }

  function initialiserTableauxAbonnements() {
    const lien = document.getElementById("lcdp-afficher-tableaux-abonnements");
    const contenu = document.getElementById("lcdp-tableaux-abonnements");
    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!lien || !contenu || !slot) return;
    let chargement = false;
    lien.addEventListener("click", async event => {
      event.preventDefault();
      if (chargement || slot.children.length) return;
      chargement = true;
      lien.setAttribute("aria-busy", "true");
      let dialogue, clavier, etats = [];
      const clore = () => {
        if (clavier) document.removeEventListener("keydown", clavier);
        dialogue?.remove();
        etats.forEach(([element, inert]) => { element.inert = inert; });
        lien.setAttribute("aria-expanded", "false");
        lien.focus();
      };
      try {
        const fragment = await chargerFragment("/OBJET/HTMLBASE/02-dialogue-reference-information.html");
        dialogue = fragment.querySelector('[data-lcdp-dialogue-reference="information"]');
        const titre = dialogue?.querySelector("[data-lcdp-dialogue-titre]");
        const message = dialogue?.querySelector("[data-lcdp-dialogue-message]");
        const fermer = dialogue?.querySelector('[data-lcdp-dialogue-action="compris"]');
        if (!dialogue || !titre || !message || !fermer) throw new Error("Dialogue INFORMATION incomplet.");
        dialogue.dataset.lcdpDialogueContext = "conteneur";
        dialogue.classList.add("lcdp-offre-abonnement__dialogue");
        dialogue.setAttribute("role", "dialog");
        dialogue.removeAttribute("aria-describedby");
        dialogue.querySelector(".lcdp-dialogue-ref__icone")?.remove();
        titre.textContent = "Offre des abonnements";
        message.replaceWith(contenu.content.cloneNode(true));
        await chargerOffresAbonnements(dialogue);
        if (slot.children.length) return;
        fermer.closest(".lcdp-dialogue-ref__actions")?.remove();
        fermer.remove();
        const croix = document.createElement("button");
        croix.type = "button";
        croix.className = "lcdp-box-dialogue-bouton__close";
        croix.setAttribute("aria-label", "Fermer");
        croix.textContent = "×";
        dialogue.appendChild(croix);
        croix.addEventListener("click", clore, { once: true });
        const souscrireOffre = dialogue.querySelector("[data-lcdp-offre-souscrire]");
        souscrireOffre?.addEventListener("click", () => {
          const souscrire = document.getElementById("lcdp-demarrer-abonnement");
          clore();
          souscrire?.click();
        });
        dialogue.addEventListener("click", event => { if (event.target === dialogue) clore(); });
        clavier = event => {
          if (event.key === "Escape") { event.preventDefault(); clore(); }
          else if (event.key === "Tab") {
            event.preventDefault();
            const scroll = dialogue.querySelector(".lcdp-offre-abonnement__scroll:not([hidden])");
            const cibles = [croix,scroll,scroll ? souscrireOffre : null].filter(Boolean);
            const i = cibles.indexOf(document.activeElement);
            cibles[(i + (event.shiftKey ? -1 : 1) + cibles.length) % cibles.length].focus();
          }
        };
        etats = Array.from(slot.parentElement.children)
          .filter(element => element !== slot && element.tagName !== "TEMPLATE")
          .map(element => [element, element.inert]);
        slot.replaceChildren(fragment);
        etats.forEach(([element]) => { element.inert = true; });
        lien.setAttribute("aria-expanded", "true");
        document.addEventListener("keydown", clavier);
        croix.focus();

      } catch (error) {
        clore();
        console.error("Offre des abonnements indisponible :", error);
      } finally { chargement = false; lien.removeAttribute("aria-busy"); }
    });
  }

  // Plafond général de planification : private.lcdp_garde_quotas_planification.
  // Le DUO de base est un invité par accès, distinct du carnet MAXDUO.
  function calculerCout1J(offre) {
    if (!offre || offre.groupeabo !== "1J" || !Number.isInteger(offre.famille) || offre.famille < 0 ||
      !Number.isInteger(offre.maxduo) || offre.maxduo < 1 ||
      typeof offre.nomabo !== "string" || !offre.nomabo.trim()) throw new Error("Pivot 1J indisponible.");
    if (!(typeof offre.prixabottc === "number" || (typeof offre.prixabottc === "string" && /^\d+(?:\.\d+)?$/.test(offre.prixabottc)))) throw new Error("Prix 1J invalide.");
    const prix = Number(offre.prixabottc);
    if (!Number.isFinite(prix) || prix < 0) throw new Error("Prix 1J invalide.");
    const acces = 5, duo = 1, famille = offre.famille;
    const membres = 1 + duo + famille;
    const ua = acces * membres;
    return {prix, acces, duo, famille, membres, ua, coutUa: prix / ua};
  }

  async function actualiserExemple1J(racine) {
    const article = racine.querySelector(".lcdp-faq__item");
    const reponse = article?.querySelector(".lcdp-faq__reponse");
    const nom = article?.querySelector(".lcdp-cout-abonnement__nom");
    if (!reponse || !nom) return;
    try {
      const offre = (await lireOffresAbonnements()).get("1J");
      const c = calculerCout1J(offre);
      const nombre = new Intl.NumberFormat("fr-FR", {maximumFractionDigits:2});
      const euros = v => nombre.format(v) + " € TTC";
      const nomPivot = offre.nomabo.trim().toLocaleUpperCase("fr-FR");
      nom.textContent = (nomPivot === "DECOUVERTE" ? "DÉCOUVERTE" : nomPivot) + " (1 jour)";
      const p1 = document.createElement("p"), p2 = document.createElement("p");
      const famille = c.famille + " membre" + (c.famille > 1 ? "s" : "") + " invité" + (c.famille > 1 ? "s" : "") + " FAMILLE";
      const fort1 = document.createElement("strong");
      fort1.textContent = "Le tarif d’un abonnement 1J (1 jour) sans extension d’invitation est à " + euros(c.prix);
      p1.append(fort1, " la journée, pour " + c.acces + " accès maximum planifiés dans les parcs pour la journée et " + c.membres + " membres maximum par accès (vous + " + c.duo + " membre invité DUO" + (c.famille ? " + " + famille : "") + ").");
      const fort2 = document.createElement("strong");
      fort2.textContent = "Soit " + euros(c.coutUa) + " par unité d’accès (UA) max";
      p2.append(fort2, " (votre abonnement 1J sans extension d’invitation a " + c.acces + " x " + c.membres + " = " + c.ua + " UA).");
      reponse.replaceChildren(p1,p2);
    } catch (error) {
      const p = document.createElement("p");
      p.textContent = "Le tarif en vigueur est momentanément indisponible.";
      reponse.replaceChildren(p);
      console.warn("Exemple de coût 1J :",error);
    }
  }

  function calculerCout1M(offre) {
    if (!offre || offre.groupeabo !== "1M" || !Number.isInteger(offre.famille) || offre.famille < 0 ||
      !Number.isInteger(offre.maxduo) || offre.maxduo < 1 ||
      typeof offre.nomabo !== "string" || !offre.nomabo.trim()) throw new Error("Pivot 1M indisponible.");
    if (!(typeof offre.prixabottc === "number" || (typeof offre.prixabottc === "string" && /^\d+(?:\.\d+)?$/.test(offre.prixabottc)))) throw new Error("Prix 1M invalide.");
    const prix = Number(offre.prixabottc);
    if (!Number.isFinite(prix) || prix < 0) throw new Error("Prix 1M invalide.");
    // Exemple commercial sur quatre semaines ; plafond hebdomadaire métier.
    const accesSemaine = 15, acces = 4 * accesSemaine, duo = 1, famille = offre.famille;
    const membres = 1 + duo + famille;
    const ua = acces * membres;
    return {prix, accesSemaine, acces, duo, famille, maxduo: offre.maxduo, membres, ua, coutUa: prix / ua};
  }

  async function actualiserExemple1M(racine) {
    const article = racine.querySelectorAll(".lcdp-faq__item")[1];
    const reponse = article?.querySelector(".lcdp-faq__reponse");
    const nom = article?.querySelector(".lcdp-cout-abonnement__nom");
    if (!reponse || !nom) return;
    try {
      const offres = await lireOffresAbonnements();
      const offre = offres.get("1M");
      const c = calculerCout1M(offre);
      const nombre = new Intl.NumberFormat("fr-FR", {maximumFractionDigits:2});
      nom.textContent = offre.nomabo.trim().toLocaleUpperCase("fr-FR") + " (1 mois)";
      const famille = c.famille + " membre" + (c.famille > 1 ? "s" : "") + " invité" + (c.famille > 1 ? "s" : "") + " FAMILLE";
      const comparaison = offres.get("1J")?.famille === c.famille
        ? ", c’est-à-dire avec les mêmes privilèges par accès que le tarif 1J" : "";
      const textes = [
        "Le tarif 1M (1 mois) est à " + nombre.format(c.prix) + " € TTC sans extension d’invitation" + comparaison + " (soit " + c.duo + " membre invité DUO par accès planifié" + (c.famille ? " + " + famille : "") + ").",
        "L’abonnement 1M se souscrit en M pour M+1 ou M+2 et bénéficie par conséquent d’un horizon de planification sur tout le mois de l’abonnement.",
        "Il bénéficie également de " + c.acces + " accès maximum planifiés dans les parcs pour un exemple de quatre semaines (" + c.accesSemaine + " accès maximum par semaine du lundi au dimanche) et d’un privilège MAXDUO de " + c.maxduo + " membre" + (c.maxduo > 1 ? "s" : "") + " (soit le nombre d’invités DUO différents sur le mois).",
        "Son coût de revient est de " + nombre.format(c.coutUa) + " € par UA max (" + c.acces + " accès x " + c.membres + " membres par accès = " + c.ua + " UA max) pour MAXDUO=" + c.maxduo + "."
      ];
      const finsGras = [
        "sans extension d’invitation" + (comparaison ? "," : ""),
        "M+2",
        "accès maximum planifiés",
        "€ par UA max"
      ];
      reponse.replaceChildren(...textes.map((texte, index) => {
        const p = document.createElement("p");
        const fin = finsGras[index];
        const position = texte.indexOf(fin);
        if (position === -1) {
          p.textContent = texte;
          return p;
        }
        const limite = position + fin.length;
        const fort = document.createElement("strong");
        fort.textContent = texte.slice(0, limite);
        p.append(fort, document.createTextNode(texte.slice(limite)));
        return p;
      }));
    } catch (error) {
      const p = document.createElement("p");
      p.textContent = "Le tarif en vigueur est momentanément indisponible.";
      reponse.replaceChildren(p);
      console.warn("Exemple de coût 1M :",error);
    }
  }

  function calculerCout1A(offre) {
    if (!offre || offre.groupeabo !== "1A" || !Number.isInteger(offre.famille) || offre.famille < 0 ||
      !Number.isInteger(offre.maxduo) || offre.maxduo < 1 ||
      typeof offre.nomabo !== "string" || !offre.nomabo.trim()) throw new Error("Pivot 1A indisponible.");
    if (!(typeof offre.prixabottc === "number" || (typeof offre.prixabottc === "string" && /^\d+(?:\.\d+)?$/.test(offre.prixabottc)))) throw new Error("Prix 1A invalide.");
    const prix = Number(offre.prixabottc);
    if (!Number.isFinite(prix) || prix < 0) throw new Error("Prix 1A invalide.");
    // Les anciens workers ne publient pas les deux champs DUO+.
    // Ne pas substituer des valeurs tarifaires historiques à des données manquantes.
    const duoPlusDisponible = Number.isInteger(offre.duoplus) && offre.duoplus >= 0 &&
      Number.isInteger(offre.freqduoplus) && offre.freqduoplus >= 0;
    return {prix, prixMensuel: prix / 12, famille: offre.famille, duo: 1, maxduo: offre.maxduo,
      duoplus: duoPlusDisponible ? offre.duoplus : null,
      freqduoplus: duoPlusDisponible ? offre.freqduoplus : null};
  }

  function texteDuoPlus1A(c) {
    if (c.duoplus === null || c.freqduoplus === null) return "Privilège DUO+ momentanément indisponible.";
    if (!c.duoplus || !c.freqduoplus) return "Aucune extension DUO+ incluse.";
    return c.freqduoplus + " extension" + (c.freqduoplus > 1 ? "s" : "") + " DUO+ à " +
      c.duoplus + " invité" + (c.duoplus > 1 ? "s" : "") + " par mois (soit " +
      c.duoplus + " invité" + (c.duoplus > 1 ? "s" : "") +
      " DUO en + sur un même accès " + c.freqduoplus + " fois par mois)";
  }

  async function actualiserExemple1A(racine) {
    const article = racine.querySelectorAll(".lcdp-faq__item")[2];
    const reponse = article?.querySelector(".lcdp-faq__reponse");
    const nom = article?.querySelector(".lcdp-cout-abonnement__nom");
    if (!reponse || !nom) return;
    try {
      const offre = (await lireOffresAbonnements()).get("1A");
      const c = calculerCout1A(offre);
      const nombre = new Intl.NumberFormat("fr-FR", {maximumFractionDigits:2});
      nom.textContent = offre.nomabo.trim().toLocaleUpperCase("fr-FR") + " (1 an)";
      const p1 = document.createElement("p");
      const tarif = document.createElement("strong");
      tarif.textContent = "Le tarif 1A (1 an) est à " + nombre.format(c.prixMensuel) +
        " € TTC par mois (" + nombre.format(c.prix) + " € TTC l’année)";
      p1.append(tarif, ".");
      const p2 = document.createElement("p");
      p2.textContent = "Il bénéficie d’un horizon de planification à M+9.";
      function paragraphe(titre, lignes) {
        const p = document.createElement("p"), fort = document.createElement("strong");
        fort.textContent = titre;
        p.append(fort);
        for (const ligne of lignes) p.append(document.createElement("br"), document.createTextNode(ligne));
        return p;
      }
      const p3 = paragraphe("Ses privilèges d’invitation sans extension de privilèges sont :", [
        c.duo + " invité DUO sur chaque accès",
        c.famille + " invité" + (c.famille > 1 ? "s" : "") + " FAMILLE",
        texteDuoPlus1A(c),
        "Un MAXDUO=" + c.maxduo + "."
      ]);
      const p4 = paragraphe("L’abonnement 1A bénéficie également de privilèges fonctionnels :", [
        "Extension du nombre de recherches de planification enregistrées",
        "Recherche IA de planification",
        "Accès au planning des coachs",
        "Planification IG COACH."
      ]);
      reponse.replaceChildren(p1,p2,p3,p4);
    } catch (error) {
      const p = document.createElement("p");
      p.textContent = "Le tarif en vigueur est momentanément indisponible.";
      reponse.replaceChildren(p);
      console.warn("Exemple de coût 1A :",error);
    }
  }

  function initialiserExemplesAbonnements() {
    const racine = document.getElementById("lcdp-exemples-abonnements");
    if (!racine || typeof window.LCDP_FAQ?.afficher !== "function") return;
    const exemples = [
      ["1J", "DÉCOUVERTE (1 jour)"],
      ["1M", "EXPLORATION (1 mois)"],
      ["1A", "PASSION (1 an)"]
    ];
    const blocs = exemples.map(([code, nom]) => ({
      titre: "Exemple " + code + " — " + nom,
      html: document.getElementById("lcdp-exemple-" + code).innerHTML
    }));
    window.LCDP_FAQ.afficher(racine, blocs, { ouvrirPremier: false });
    // Seuls les titres de ces exemples ont deux lignes ; la FAQ commune reste inchangée.
    racine.querySelectorAll(".lcdp-faq__question").forEach((bouton, index) => {
      const [code, nom] = exemples[index];
      const libelle = document.createElement("span");
      libelle.className = "lcdp-cout-abonnement__libelle";
      const reference = document.createElement("span");
      reference.className = "lcdp-cout-abonnement__reference";
      reference.textContent = "Exemple " + code;
      const sousTitre = document.createElement("span");
      sousTitre.className = "lcdp-cout-abonnement__nom";
      sousTitre.textContent = nom;
      libelle.append(reference, sousTitre);
      bouton.replaceChildren(libelle);
    });
    void actualiserExemple1J(racine);
    void actualiserExemple1M(racine);
    void actualiserExemple1A(racine);
    // Relire les pivots à l'ouverture de chaque exemple dynamique.
    const questions = racine.querySelectorAll(".lcdp-faq__question");
    [actualiserExemple1J, actualiserExemple1M, actualiserExemple1A].forEach((actualiser, index) => {
      questions[index]?.addEventListener("click", event => {
        if (event.currentTarget.getAttribute("aria-expanded") === "true") void actualiser(racine);
      });
    });
  }

  function initialiserActionsMembre() {
    const planifier = document.getElementById("lcdp-acces-planifier-abonnement");
    const souscrire = document.getElementById("lcdp-demarrer-abonnement");

    try {
      planifier.href = urlMembre("/ESPACE-MEMBRE/reserver-membre.html");
      souscrire.href = urlMembre("/ESPACE-MEMBRE/reserver-membre.html?mode=aboreza");
    } catch (error) {
      console.error(error);
      planifier.removeAttribute("href");
      souscrire.removeAttribute("href");
    }

    souscrire.addEventListener("click", async event => {
      event.preventDefault();
      if (controleSouscriptionEnCours) return;
      controleSouscriptionEnCours = true;
      souscrire.setAttribute("aria-busy", "true");
      const libelle = souscrire.textContent;
      souscrire.textContent = "Vérification…";
      try {
        const situation = await lireSituationDaSouscription();
        if (situation.type === "validee" && souscrire.hasAttribute("href")) {
          window.location.assign(souscrire.href);
          return;
        }
        await ouvrirInformationSouscription(situation.type === "validee" ? {type: "inconnu"} : situation);
      } catch (error) {
        console.error("Contrôle DA :", error);
      } finally {
        souscrire.textContent = libelle;
        souscrire.removeAttribute("aria-busy");
        controleSouscriptionEnCours = false;
      }
    });
  }

  appliquerRoutesSite(document);
  initialiserTableauxAbonnements();
  initialiserExemplesAbonnements();
  initialiserActionsMembre();
  const navigationPrete = Promise.allSettled([
    initialiserBandeau(), initialiserFooter()
  ]).then(resultats => {
    for (const resultat of resultats) {
      if (resultat.status === "rejected") console.error(resultat.reason);
    }
  });

  // Le mode DA garde le pictogramme d'attente jusqu'à la vue complète.
  if (new URLSearchParams(window.location.search).get("mode") === "da") {
    Promise.all([ouvrirDaDepuisPresentation(), navigationPrete]).then(() => {
      if (!document.querySelector("#lcdp-da-membre-overlay-slot .lcdp-document-legal")) {
        throw new Error("Présentation DA non montée.");
      }
      window.LCDP_terminerInitialisationDa?.(true);
    }).catch(error => {
      console.error("Ouverture de la DA impossible :", error);
      window.LCDP_terminerInitialisationDa?.(false);
    });
  }
})();
