(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};
  const SOURCE_PAGE = "avoir-abonnement";

  const ENDPOINT_ABO_MEMBRE = construireEndpointApi(
    "workerAboMembreUrl",
    "WORKER_ABO_MEMBRE_URL",
    "abo-membre-api"
  );

  const PAGE_CONNEXION_MEMBRE = construireUrlPublic("/ESPACE-PUBLIC/connexion-membre.html");
  const PAGE_ABONNEMENT_MEMBRE = construireUrlMembre("/ESPACE-MEMBRE/abonnement-membre.html");

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiserPageAvoir);
  } else {
    initialiserPageAvoir();
  }

  async function initialiserPageAvoir() {
    const racine = document.getElementById("lcdp-avoir-a4-root");
    const params = new URLSearchParams(window.location.search);
    const idabo = String(params.get("idabo") || "").trim();
    const impressionAuto = params.get("print") === "1";

    if (!racine) return;

    if (!idabo) {
      afficherMessage(racine, "Identifiant d'abonnement manquant.");
      return;
    }

    if (!ENDPOINT_ABO_MEMBRE) {
      afficherMessage(racine, "Le service abonnement membre n’est pas configuré.");
      return;
    }

    try {
      const avoir = await chargerAvoir(idabo);
      await afficherAvoirA4(racine, avoir);

      document.title = "Avoir " + (avoir?.numeroavoir || avoir?.orderid || idabo) + " - La Clé du Parc";

      if (impressionAuto) {
        window.setTimeout(() => {
          window.focus();
          window.print();
        }, 350);
      }
    } catch (error) {
      console.error("Erreur avoir abonnement :", error);
      afficherMessage(racine, error.message || "Impossible de charger l'avoir.");
    }
  }

  async function chargerAvoir(idabo) {
    const reponse = await fetch(
      ENDPOINT_ABO_MEMBRE + "/avoir?idabo=" + encodeURIComponent(idabo),
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      }
    );

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return null;
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      throw new Error(messageErreurApi(data, "Impossible de charger l'avoir."));
    }

    if (!data.avoir) {
      throw new Error("Avoir introuvable.");
    }

    return data.avoir;
  }

  async function afficherAvoirA4(racine, facture) {
    racine.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/04-box-facture-a4.html");
    racine.appendChild(fragment);

    const box = racine.querySelector("[data-lcdp-box-facture-a4]");
    const boutonPrint = racine.querySelector("[data-lcdp-facture-a4-print]");

    if (!box) {
      throw new Error("Structure avoir A4 incomplète.");
    }

    await remplirFacture(racine, facture);

    if (boutonPrint) {
      boutonPrint.addEventListener("click", () => {
        window.print();
      });
    }
  }

  async function remplirFacture(racine, facture) {
    remplirTexte(racine, "[data-lcdp-facture-date]", formaterDate(facture.datefacture || facture.date || ""));

    if (String(facture?.typeDocument || "").trim().toLowerCase() === "avoir") {
      remplacerTexteExact(racine, "FACTURE", "AVOIR");
    }

    const slotEmetteur = racine.querySelector("[data-lcdp-facture-emetteur-slot]");
    const slotDestinataire = racine.querySelector("[data-lcdp-facture-destinataire-slot]");
    const slotCard = racine.querySelector("[data-lcdp-facture-card-slot]");
    const slotMentions = racine.querySelector("[data-lcdp-facture-mentions-slot]");

    if (!slotEmetteur || !slotDestinataire || !slotCard || !slotMentions) {
      throw new Error("Slots facture incomplets.");
    }

    slotEmetteur.appendChild(await creerCardCoordonneesFacture("Émetteur", null));
    slotDestinataire.appendChild(await creerCardCoordonneesFacture("Destinataire", facture.destinataire || {}));
    slotCard.appendChild(await creerCardDetailFacture(facture));
    slotMentions.appendChild(await creerCardMentionsFacture(facture));
  }

  async function creerCardCoordonneesFacture(titreCard, donnees) {
    const fragment = await chargerFragmentObjet("/BOX/04-box-card-coordonnees-facture.html");
    const card = fragment.querySelector("[data-lcdp-card-coordonnees-facture]");
    const titre = fragment.querySelector("[data-lcdp-coordonnees-facture-title]");
    const nom = fragment.querySelector("[data-lcdp-coordonnees-facture-nom]");
    const lignes = fragment.querySelector("[data-lcdp-coordonnees-facture-lignes]");

    if (!card || !titre || !nom || !lignes) {
      throw new Error("Structure coordonnées facture incomplète.");
    }

    titre.textContent = titreCard || titre.textContent || "Coordonnées";

    if (donnees) {
      nom.textContent = donnees.nom || "Non renseigné";
      lignes.innerHTML = "";

      (Array.isArray(donnees.lignes) ? donnees.lignes : []).filter(Boolean).forEach((ligne) => {
        const item = document.createElement("span");
        item.textContent = ligne;
        lignes.appendChild(item);
      });
    }

    return card;
  }

  async function creerCardDetailFacture(facture) {
    const fragment = await chargerFragmentObjet("/BOX/04-box-card-facture.html");
    const card = fragment.querySelector("[data-lcdp-card-facture]");
    const slotProduit = fragment.querySelector("[data-lcdp-facture-produit-slot]");
    const slotPrix = fragment.querySelector("[data-lcdp-facture-prix-slot]");
    const slotPaiement = fragment.querySelector("[data-lcdp-facture-paiement-slot]");

    if (!card || !slotProduit || !slotPrix || !slotPaiement) {
      throw new Error("Structure card facture incomplète.");
    }

    if (String(facture?.typeDocument || "").trim().toLowerCase() === "avoir") {
      remplacerTexteExact(card, "Commande", "Annulation de commande");
    }

    slotProduit.appendChild(await creerCardProduitFacture(facture.produit || {}));
    slotPaiement.appendChild(await creerCardPaiementFacture(facture.paiement || {}));
    slotPrix.appendChild(await creerCardPrixFacture(facture.prix || {}));

    return card;
  }

  async function creerCardProduitFacture(produit) {
    const fragment = await chargerFragmentObjet("/BOX/04-box-card-produit-in-facture.html");
    remplirTexte(fragment, "[data-lcdp-facture-produit-orderid]", produit.orderid || "Non renseigné");
    remplirTexte(fragment, "[data-lcdp-facture-produit-type]", produit.libelle || produit.typabo || "Non renseigné");
    remplirTexte(fragment, "[data-lcdp-facture-produit-debut]", formaterDate(produit.debut));
    remplirTexte(fragment, "[data-lcdp-facture-produit-fin]", formaterDate(produit.fin) + " inclus");

    const rowInvites = fragment.querySelector("[data-lcdp-facture-produit-invites-row]");
    const invites = fragment.querySelector("[data-lcdp-facture-produit-invites]");
    const nbInvites = Number(produit.nbinvit || 0);

    if (rowInvites && invites) {
      rowInvites.hidden = nbInvites <= 0;
      invites.textContent = nbInvites > 0 ? String(nbInvites) : "";
    }

    return fragment;
  }

  async function creerCardPrixFacture(prix) {
    const fragment = await chargerFragmentObjet("/BOX/04-box-card-prix-in-facture.html");
    const listeRemises = fragment.querySelector("[data-lcdp-facture-prix-remises]");
    const estAvoir = String(prix.type || "").trim().toLowerCase() === "avoir";

    if (estAvoir) {
      remplacerTexteExact(fragment, "Prix", "Remboursement");
      remplirTexte(fragment, "[data-lcdp-facture-prix-brut-label]", "Avoir TTC (TVA " + formaterTaux(prix.tva1) + "%) €");
      remplirTexte(fragment, "[data-lcdp-facture-prix-brut]", formaterMontant(prix.montantAvoirTtc ?? prix.montantFactureTtc ?? prix.bruttc));
      remplirTexte(fragment, "[data-lcdp-facture-prix-apayer]", formaterMontant(prix.montantRembourseTtc ?? prix.netnettc));
      remplirTexte(fragment, "[data-lcdp-facture-prix-ht]", formaterMontant(prix.montantRembourseHt ?? prix.ht));
      remplirTexte(fragment, "[data-lcdp-facture-prix-tva]", formaterMontant(prix.montantRembourseTva ?? prix.tva));
      renommerLibelleLigne(fragment, "[data-lcdp-facture-prix-apayer]", "À rembourser (TTC) € *");
      renommerLibelleLigne(fragment, "[data-lcdp-facture-prix-ht]", "Remboursement HT €");
      renommerLibelleLigne(fragment, "[data-lcdp-facture-prix-tva]", "TVA remboursement €");

      if (listeRemises) {
        listeRemises.innerHTML = "";
        ajouterLignePrixAvoir(listeRemises, "Avoir HT €", prix.montantAvoirHt);
        ajouterLignePrixAvoir(listeRemises, "Retenue de garantie (TTC) €", prix.retenueGarantieTtc ?? prix.retenueTtc, { negatif: true });
      }

      return fragment;
    }

    remplirTexte(fragment, "[data-lcdp-facture-prix-brut-label]", "Prix TTC (TVA " + formaterTaux(prix.tva1) + "%) €");
    remplirTexte(fragment, "[data-lcdp-facture-prix-brut]", formaterMontant(prix.bruttc));
    remplirTexte(fragment, "[data-lcdp-facture-prix-apayer]", formaterMontant(prix.netnettc));
    remplirTexte(fragment, "[data-lcdp-facture-prix-ht]", formaterMontant(prix.ht));
    remplirTexte(fragment, "[data-lcdp-facture-prix-tva]", formaterMontant(prix.tva));

    if (listeRemises) {
      listeRemises.innerHTML = "";
      ajouterLigneRemiseFacture(listeRemises, "Remise (TTC) €", prix.valrembrut);
      ajouterLigneRemiseFacture(listeRemises, "Remise paiement 1x (TTC) €", prix.val1x);
      ajouterLigneRemiseFacture(listeRemises, "Remise virement (TTC) €", prix.valvrmt);
    }

    return fragment;
  }

  function ajouterLigneRemiseFacture(liste, libelle, montant) {
    const valeur = nombreOuNull(montant);

    if (!liste || valeur === null || valeur <= 0) return;

    const row = document.createElement("div");
    row.className = "lcdp-box-card-prix-in-facture__row";

    const label = document.createElement("span");
    label.textContent = libelle;

    const prix = document.createElement("strong");
    prix.textContent = "-" + formaterMontant(valeur);

    row.appendChild(label);
    row.appendChild(prix);
    liste.appendChild(row);
  }

  function ajouterLignePrixAvoir(liste, libelle, montant, options = {}) {
    const valeur = nombreOuNull(montant);

    if (!liste || valeur === null) return;

    const row = document.createElement("div");
    row.className = "lcdp-box-card-prix-in-facture__row";

    const label = document.createElement("span");
    label.textContent = libelle;

    const prix = document.createElement("strong");
    prix.textContent = options.negatif ? "-" + formaterMontant(valeur) : formaterMontant(valeur);

    row.appendChild(label);
    row.appendChild(prix);
    liste.appendChild(row);
  }

  async function creerCardPaiementFacture(paiement) {
    const fragment = await chargerFragmentObjet("/BOX/04-box-card-paiement-in-facture.html");
    const echeances = fragment.querySelector("[data-lcdp-facture-paiement-echeances]");
    const ribRow = fragment.querySelector("[data-lcdp-facture-paiement-rib-row]");
    const rib = fragment.querySelector("[data-lcdp-facture-paiement-rib]");

    remplirTexte(fragment, "[data-lcdp-facture-paiement-mode]", paiement.mode || "Non renseigné");

    if (echeances) {
      echeances.innerHTML = "";
      (Array.isArray(paiement.echeances) ? paiement.echeances : []).forEach((echeance) => {
        const row = document.createElement("div");
        row.className = "lcdp-box-card-paiement-in-facture__row";

        const label = document.createElement("span");
        label.textContent = echeance.libelle || ("Échéance " + String(echeance.numero || "") + " :");

        const valeur = document.createElement("strong");
        const montant = nombreOuNull(echeance.montant);
        valeur.textContent = montant === null
          ? formaterDate(echeance.date)
          : formaterDate(echeance.date) + " - " + formaterMontant(montant);

        row.appendChild(label);
        row.appendChild(valeur);
        echeances.appendChild(row);
      });
    }

    if (ribRow && rib) {
      const afficherRib = paiement.afficherRib === true;
      ribRow.hidden = !afficherRib;
      if (afficherRib && paiement.rib) {
        rib.textContent = paiement.rib;
      }
    }

    return fragment;
  }

  async function creerCardMentionsFacture(facture) {
    const fragment = await chargerFragmentObjet("/BOX/04-box-card-mentions-facture.html");

    if (facture && facture.mentions) {
      remplirTexte(fragment, "[data-lcdp-facture-mentions]", facture.mentions);
    }

    return fragment;
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
      "source=" + encodeURIComponent(SOURCE_PAGE) +
      "&session=" +
      encodeURIComponent(motif || "inactive") +
      "&retour=" +
      encodeURIComponent(window.location.href || PAGE_ABONNEMENT_MEMBRE);
  }

  function reponseApiOk(data) {
    return data && (data.ok === true || data.success === true);
  }

  function messageErreurApi(resultat, messageDefaut) {
    return resultat && (resultat.message || resultat.error)
      ? String(resultat.message || resultat.error)
      : messageDefaut;
  }

  function afficherMessage(racine, message) {
    racine.innerHTML = "";
    const p = document.createElement("p");
    p.className = "lcdp-page-facture-a4__message";
    p.textContent = message || "Erreur.";
    racine.appendChild(p);
  }

  function remplirTexte(racine, selecteur, valeur) {
    const element = racine.querySelector(selecteur);

    if (!element) return;

    element.textContent = valeur || "Non renseigné";
  }

  function remplacerTexteExact(racine, ancien, nouveau) {
    if (!racine) return;

    racine.querySelectorAll("h1, h2, h3, h4, p, span, strong").forEach((element) => {
      if (String(element.textContent || "").trim() === ancien) {
        element.textContent = nouveau;
      }
    });
  }

  function renommerLibelleLigne(racine, selecteurValeur, nouveauLibelle) {
    const valeur = racine.querySelector(selecteurValeur);
    const ligne = valeur?.closest(".lcdp-box-card-prix-in-facture__row, .lcdp-box-card-paiement-in-facture__row, div");

    if (!ligne) return;

    const label = Array.from(ligne.children).find((element) => element !== valeur && element.tagName !== "STRONG");

    if (label) {
      label.textContent = nouveauLibelle;
    }
  }

  function lireDateLocale(valeur) {
    const texte = String(valeur || "").trim();
    const match = texte.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) return lireDate(texte);

    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function lireDate(valeur) {
    if (!valeur) return null;

    const date = new Date(valeur);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formaterDate(valeur) {
    if (!valeur) return "Non renseigné";

    const date = lireDateLocale(valeur);

    if (!date || Number.isNaN(date.getTime())) return String(valeur);

    return date.toLocaleDateString("fr-FR", {
      timeZone: "Europe/Paris",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  function nombreOuNull(valeur) {
    if (valeur === null || typeof valeur === "undefined" || valeur === "") return null;

    const nombre = Number(String(valeur).replace(",", "."));

    return Number.isFinite(nombre) ? nombre : null;
  }

  function formaterMontant(valeur) {
    const nombre = nombreOuNull(valeur);

    if (nombre === null) return "Non renseigné";

    return nombre.toLocaleString("fr-FR", {
      style: "currency",
      currency: "EUR"
    });
  }

  function formaterTaux(valeur) {
    const nombre = nombreOuNull(valeur);

    if (nombre === null) return "20";

    return Number.isInteger(nombre) ? String(nombre) : String(nombre).replace(".", ",");
  }

  function nettoyerBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function buildUrl(base, path) {
    return nettoyerBaseUrl(base) + "/" + String(path || "").replace(/^\/+/, "");
  }
})();
