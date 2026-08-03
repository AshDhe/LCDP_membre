(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};
  const PAGE_CONNEXION_MEMBRE = urlPublic("/ESPACE-PUBLIC/connexion-membre.html");

  const ENDPOINT_FACTUPAIEMENT = construireEndpointApi(
    "workerFactuPaiementUrl",
    "WORKER_FACTUPAIEMENT_URL",
    "factupaiement-api"
  );

  const ENDPOINT_AVOIR_ABO = construireEndpointApi(
    "workerAvoirAboUrl",
    "WORKER_AVOIR_ABO_URL",
    "avoir-abo-api"
  );

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiserPage, { once: true });
  } else {
    initialiserPage();
  }

  async function initialiserPage() {
    try {
      await Promise.all([initialiserBandeau(), initialiserFooter()]);

      const controleurOnglets = await initialiserOngletsFactures();
      const tables = await initialiserTables(controleurOnglets.zones);

      await Promise.all([
        chargerFacturesEtPaiements(tables.factures, tables.paiements),
        chargerRemboursements(tables.remboursements)
      ]);
    } catch (error) {
      console.error("Erreur Mes factures membre :", error);
      await afficherAlerte(String(error?.message || error || "Erreur de chargement."));
    }
  }

  async function initialiserOngletsFactures() {
    const slot = document.getElementById("lcdp-mes-factures-membre-slot");

    if (!slot) throw new Error("Slot Mes factures introuvable.");
    if (!window.LCDP_WRAPER_ONGLETS) {
      throw new Error("Objet générique onglets indisponible.");
    }

    slot.innerHTML = "";
    slot.appendChild(
      await chargerFragmentObjet("/BOX/05-wraper-onglets.html?v=20260803-1650")
    );

    const racine = slot.querySelector("[data-lcdp-wraper-onglets]");
    if (!racine) throw new Error("Objet onglets introuvable.");

    return window.LCDP_WRAPER_ONGLETS.initialiser({
      racine,
      idPrefix: "lcdp-mes-factures",
      ariaLabel: "Navigation des factures du membre",
      navigationAriaLabel: "Sections Mes factures",
      actif: "factures",
      onglets: [
        { key: "factures", label: "Mes factures" },
        { key: "paiements", label: "Mes paiements" },
        { key: "remboursements", label: "Mes remboursements" }
      ]
    });
  }

  async function initialiserTables(zones) {
    const factures = await initialiserTable(zones.factures, {
      ariaLabel: "Liste des factures du membre",
      emptyMessage: "Aucune facture.",
      columns: [
        { key: "commande", label: "Commande" },
        { key: "dateCommande", label: "Date", type: "date" },
        { key: "facture", label: "Facture" },
        { key: "dateFacture", label: "Date", type: "date" }
      ],
      renderCell: ({ column, value }) => {
        if (column.key !== "facture") return null;
        return creerLienFacture(value);
      }
    });

    const paiements = await initialiserTable(zones.paiements, {
      ariaLabel: "Liste des paiements du membre",
      emptyMessage: "Aucun paiement.",
      columns: [
        { key: "facture", label: "Facture" },
        { key: "paiement1", label: "Paiement 1" },
        { key: "paiement2", label: "Paiement 2" },
        { key: "paiement3", label: "Paiement 3" }
      ],
      renderCell: ({ column, value }) => {
        if (column.key !== "facture") return null;
        return creerLienFacture(value);
      }
    });

    const remboursements = await initialiserTable(zones.remboursements, {
      ariaLabel: "Liste des remboursements du membre",
      emptyMessage: "Aucun remboursement.",
      columns: [
        { key: "facture", label: "Facture" },
        { key: "avoir", label: "Avoir dû" },
        { key: "date", label: "Date", type: "date" },
        { key: "paiement", label: "Paiement" }
      ],
      renderCell: ({ column, value }) => {
        if (column.key === "facture") return creerLienFacture(value);
        if (column.key === "avoir") return creerLienAvoir(value);
        return null;
      }
    });

    return { factures, paiements, remboursements };
  }

  async function initialiserTable(zone, options) {
    if (!zone) throw new Error("Zone de tableau introuvable.");
    if (!window.LCDP_TABLE_LECTURE) {
      throw new Error("Objet générique de lecture indisponible.");
    }

    zone.innerHTML = "";
    zone.appendChild(await chargerFragmentObjet("/BOX/05-table-lecture.html"));

    return window.LCDP_TABLE_LECTURE.initialiser({
      slot: zone,
      ariaLabel: options.ariaLabel,
      emptyMessage: options.emptyMessage,
      columns: options.columns,
      rows: [],
      renderCell: options.renderCell
    });
  }

  async function chargerFacturesEtPaiements(tableFactures, tablePaiements) {
    if (!ENDPOINT_FACTUPAIEMENT) {
      const message = "Le service facturation n’est pas configuré.";
      tableFactures.afficherErreur(message);
      tablePaiements.afficherErreur(message);
      return;
    }

    try {
      const data = await lireApi(ENDPOINT_FACTUPAIEMENT + "/mes-factures");

      const factures = (Array.isArray(data.factures) ? data.factures : []).map((ligne) => ({
        commande: ligne.orderid || "—",
        dateCommande: ligne.orderdate || "",
        facture: ligne.orderid || "—",
        dateFacture: ligne.datefacture || ligne.orderdate || ""
      }));

      const paiements = (Array.isArray(data.paiements) ? data.paiements : []).map((ligne) => ({
        facture: ligne.orderid || "—",
        paiement1: libellePaiement(ligne, 1),
        paiement2: Number(ligne.ech || 1) >= 2 ? libellePaiement(ligne, 2) : "—",
        paiement3: Number(ligne.ech || 1) >= 3 ? libellePaiement(ligne, 3) : "—"
      }));

      tableFactures.mettreAJour(factures);
      tablePaiements.mettreAJour(paiements);
    } catch (error) {
      tableFactures.afficherErreur(String(error?.message || error));
      tablePaiements.afficherErreur(String(error?.message || error));
    }
  }

  async function chargerRemboursements(tableRemboursements) {
    if (!ENDPOINT_AVOIR_ABO) {
      tableRemboursements.afficherErreur("Le service des avoirs n’est pas configuré.");
      return;
    }

    try {
      const data = await lireApi(ENDPOINT_AVOIR_ABO + "/mes-remboursements");
      const rows = (Array.isArray(data.remboursements) ? data.remboursements : []).map((ligne) => ({
        facture: ligne.orderid || "—",
        avoir: ligne.avoirid || "—",
        date: ligne.date || "",
        paiement: libelleRemboursement(ligne)
      }));

      tableRemboursements.mettreAJour(rows);
    } catch (error) {
      tableRemboursements.afficherErreur(String(error?.message || error));
    }
  }

  function libellePaiement(ligne, numero) {
    const date = ligne?.["datemois" + String(numero)];
    const etat = String(ligne?.["etatmois" + String(numero)] || "")
      .trim()
      .toLowerCase();

    if (!date) return "—";

    if (etat === "paye") {
      return formaterMontant(ligne?.["valmois" + String(numero)]) +
        " le " + formaterDate(date);
    }

    return (dateFuture(date) ? "À venir" : "Non payé") +
      " le " + formaterDate(date);
  }

  function libelleRemboursement(ligne) {
    const net = nombreOuNull(ligne?.net) ?? 0;
    const montant = Math.abs(Math.min(0, net));

    if (montant === 0) return formaterMontant(0);
    if (ligne?.paiement) {
      return formaterMontant(montant) + " le " + formaterDate(ligne.paiement);
    }

    return formaterMontant(montant) + " à venir";
  }

  function creerLienFacture(orderid) {
    const valeur = String(orderid || "").trim();
    if (!valeur || valeur === "—") return document.createTextNode("—");

    const lien = document.createElement("a");
    lien.href = urlMembre(
      "/ESPACE-MEMBRE/facture-abonnement.html?orderid=" + encodeURIComponent(valeur)
    );
    lien.textContent = valeur;
    lien.addEventListener("click", (event) => {
      event.preventDefault();
      ouvrirFacture(valeur).catch(gererErreurDocument);
    });
    return lien;
  }

  function creerLienAvoir(avoirid) {
    const valeur = String(avoirid || "").trim();
    if (!valeur || valeur === "—") return document.createTextNode("—");

    const lien = document.createElement("a");
    lien.href = urlMembre(
      "/ESPACE-MEMBRE/avoir-abonnement.html?avoirid=" + encodeURIComponent(valeur)
    );
    lien.textContent = valeur;
    lien.addEventListener("click", (event) => {
      event.preventDefault();
      ouvrirAvoir(valeur).catch(gererErreurDocument);
    });
    return lien;
  }

  async function ouvrirFacture(orderid) {
    const data = await lireApi(
      ENDPOINT_FACTUPAIEMENT + "/facture?orderid=" + encodeURIComponent(orderid)
    );

    if (!data.facture) throw new Error("Facture introuvable.");

    await ouvrirDocumentDansBox({
      document: data.facture,
      urlImpression: urlMembre(
        "/ESPACE-MEMBRE/facture-abonnement.html?orderid=" + encodeURIComponent(orderid)
      )
    });
  }

  async function ouvrirAvoir(avoirid) {
    const data = await lireApi(
      ENDPOINT_AVOIR_ABO + "/avoir?avoirid=" + encodeURIComponent(avoirid)
    );

    if (!data.avoir) throw new Error("Avoir introuvable.");

    await ouvrirDocumentDansBox({
      document: data.avoir,
      urlImpression: urlMembre(
        "/ESPACE-MEMBRE/avoir-abonnement.html?avoirid=" + encodeURIComponent(avoirid)
      )
    });
  }

  async function ouvrirDocumentDansBox(options) {
    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!slot) throw new Error("Zone d'affichage du document introuvable.");

    slot.innerHTML = "";
    slot.appendChild(await chargerFragmentObjet("/BOX/04-box-facture.html"));

    const box = slot.querySelector("[data-lcdp-box-facture]");
    const boutonFermer = slot.querySelector("[data-lcdp-facture-close]");
    const boutonImprimer = slot.querySelector("[data-lcdp-facture-print]");

    if (!box || !boutonFermer || !boutonImprimer) {
      slot.innerHTML = "";
      throw new Error("Structure du document incomplète.");
    }

    await remplirFacture(slot, options.document);

    const fermer = () => {
      document.body.classList.remove("lcdp-print-facture-active");
      slot.innerHTML = "";
    };

    boutonFermer.addEventListener("click", fermer, { once: true });
    box.addEventListener("click", (event) => {
      if (event.target === box) fermer();
    });
    boutonImprimer.addEventListener("click", () => {
      window.open(options.urlImpression, "_blank", "noopener");
    });
  }

  async function remplirFacture(racine, facture) {
    remplirTexte(
      racine,
      "[data-lcdp-facture-date]",
      formaterDate(facture.datefacture || facture.date || "")
    );

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
    slotDestinataire.appendChild(
      await creerCardCoordonneesFacture("Destinataire", facture.destinataire || {})
    );
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

    const estAvoir = String(facture?.typeDocument || "").trim().toLowerCase() === "avoir";
    if (estAvoir) remplacerTexteExact(card, "Commande", "Commande annulée");

    slotProduit.appendChild(await creerCardProduitFacture(facture.produit || {}));
    slotPrix.appendChild(await creerCardPrixFacture(facture.prix || {}));
    slotPaiement.appendChild(await creerCardPaiementFacture(facture.paiement || {}));

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
      remplacerTexteExact(fragment, "Prix", "Annulation");
      remplirTexte(fragment, "[data-lcdp-facture-prix-brut-label]", "Paiements pris en compte (TTC) €");
      remplirTexte(fragment, "[data-lcdp-facture-prix-brut]", formaterMontant(prix.montantPayeMoisTtc));
      remplirTexte(fragment, "[data-lcdp-facture-prix-apayer]", formaterMontant(prix.montantRembourseTtc ?? prix.netnettc));
      remplirTexte(fragment, "[data-lcdp-facture-prix-ht]", formaterMontant(prix.montantRembourseHt ?? prix.ht));
      remplirTexte(fragment, "[data-lcdp-facture-prix-tva]", formaterMontant(prix.montantRembourseTva ?? prix.tva));
      renommerLibelleLigne(fragment, "[data-lcdp-facture-prix-apayer]", "Remboursement dû (TTC) €");
      renommerLibelleLigne(fragment, "[data-lcdp-facture-prix-ht]", "Remboursement HT €");
      renommerLibelleLigne(fragment, "[data-lcdp-facture-prix-tva]", "TVA €");

      if (listeRemises) {
        listeRemises.innerHTML = "";
        ajouterLignePrixAvoir(listeRemises, "Frais de traitement (TTC) €", prix.fraistraitementTtc, { negatif: true });
        ajouterLignePrixAvoir(listeRemises, "Remise paiement 1x déduite (TTC) €", prix.remisePaiement1xTtc, { negatif: true, masquerZero: true });
        ajouterLignePrixAvoir(listeRemises, "Remise sur frais de traitement (TTC) €", prix.remiseFraisTraitementTtc, { positif: true, masquerZero: true });
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
    ajouterLignePrix(liste, libelle, "-" + formaterMontant(valeur));
  }

  function ajouterLignePrixAvoir(liste, libelle, montant, options = {}) {
    const valeur = nombreOuNull(montant);
    if (!liste || valeur === null) return;
    if (options.masquerZero === true && valeur === 0) return;

    const prefixe = options.negatif ? "-" : options.positif ? "+" : "";
    ajouterLignePrix(liste, libelle, prefixe + formaterMontant(Math.abs(valeur)));
  }

  function ajouterLignePrix(liste, libelle, valeur) {
    const row = document.createElement("div");
    row.className = "lcdp-box-card-prix-in-facture__row";
    const label = document.createElement("span");
    label.textContent = libelle;
    const prix = document.createElement("strong");
    prix.textContent = valeur;
    row.appendChild(label);
    row.appendChild(prix);
    liste.appendChild(row);
  }

  async function creerCardPaiementFacture(paiement) {
    const fragment = await chargerFragmentObjet("/BOX/04-box-card-paiement-in-facture.html");
    if (String(paiement?.type || "").trim().toLowerCase() === "avoir") {
      remplacerTexteExact(fragment, "Paiement", paiement.titre || "Remboursement");
    }
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

        if (montant === null) valeur.textContent = formaterDate(echeance.date);
        else if (!echeance.date && String(echeance.statut || "") === "a_payer") {
          valeur.textContent = "À venir - " + formaterMontant(montant);
        } else valeur.textContent = formaterDate(echeance.date) + " - " + formaterMontant(montant);

        row.appendChild(label);
        row.appendChild(valeur);
        echeances.appendChild(row);
      });
    }

    if (ribRow) {
      const afficherRib = !paiementParCarteBancaire(paiement) && paiement.afficherRib === true;
      if (!afficherRib) ribRow.remove();
      else if (rib && paiement.rib) rib.textContent = paiement.rib;
    }

    return fragment;
  }

  function paiementParCarteBancaire(paiement) {
    return /^CB\b/i.test(String(paiement?.mode || "").trim());
  }

  async function creerCardMentionsFacture(facture) {
    const fragment = await chargerFragmentObjet("/BOX/04-box-card-mentions-facture.html");
    if (facture && facture.mentions) {
      remplirTexte(fragment, "[data-lcdp-facture-mentions]", facture.mentions);
    }
    return fragment;
  }

  async function lireApi(url) {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    const data = await response.json().catch(() => null);

    if (response.status === 401) {
      redirigerConnexion();
      throw new Error("Session membre inactive.");
    }

    if (!response.ok || !data || !(data.ok === true || data.success === true)) {
      throw new Error(data?.message || data?.error || "Impossible de charger les données.");
    }

    return data;
  }

  function gererErreurDocument(error) {
    console.error("Erreur ouverture document :", error);
    afficherAlerte(error?.message || "Impossible d'ouvrir le document.").catch(console.error);
  }

  async function initialiserBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");
    if (!slot) return;

    slot.innerHTML = "";
    slot.appendChild(await chargerFragmentMembre("/ESPACE-MEMBRE/box-bandeau-nav-membre.html"));
    appliquerRoutesSite(slot);
    await chargerScriptMembreUneFois("/ESPACE-MEMBRE/box-menu-burger-membre.js");

    if (typeof window.LCDP_initialiserMenuBurgerMembre === "function") {
      await window.LCDP_initialiserMenuBurgerMembre();
    }
  }

  async function initialiserFooter() {
    const slot = document.getElementById("lcdp-footer-slot");
    if (!slot) return;
    slot.innerHTML = "";
    slot.appendChild(await chargerFragmentObjet("/BOX/02-box-footer.html"));
    appliquerRoutesSite(slot);
  }

  function appliquerRoutesSite(racine) {
    racine.querySelectorAll("[data-site-href]").forEach((element) => {
      const path = element.dataset.siteHref || "";
      const space = element.dataset.space || "public";
      element.setAttribute("href", space === "membre" ? urlMembre(path) : urlPublic(path));
    });

    racine.querySelectorAll("[data-site-src]").forEach((element) => {
      const path = String(element.dataset.siteSrc || "").replace(/^\/?OBJET\/?/, "/");
      element.setAttribute("src", urlObjet(path));
    });
  }

  async function afficherAlerte(message) {
    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!slot) {
      window.alert(message || "");
      return;
    }

    try {
      slot.innerHTML = "";
      slot.appendChild(await chargerFragmentObjet("/BOX/02-box-alerte.html"));
      const alerte = slot.querySelector("[data-lcdp-box-alerte]");
      const texte = slot.querySelector("[data-lcdp-alerte-message]");
      const fermer = slot.querySelector("[data-lcdp-alerte-close]");
      const ok = slot.querySelector("[data-lcdp-alerte-ok]");

      if (!alerte || !texte || !fermer || !ok) throw new Error("Structure alerte incomplète.");
      texte.textContent = message || "";
      const nettoyer = () => { slot.innerHTML = ""; };
      fermer.addEventListener("click", nettoyer, { once: true });
      ok.addEventListener("click", nettoyer, { once: true });
      alerte.addEventListener("click", (event) => {
        if (event.target === alerte) nettoyer();
      });
    } catch {
      slot.innerHTML = "";
      window.alert(message || "");
    }
  }

  async function chargerFragmentObjet(path) {
    return chargerFragment(urlObjet(path), "Fragment OBJET " + path);
  }

  async function chargerFragmentMembre(path) {
    return chargerFragment(urlMembre(path), "Fragment membre " + path);
  }

  async function chargerFragment(url, label) {
    const response = await fetch(url, {
      method: "GET",
      credentials: "omit",
      cache: "no-cache"
    });
    if (!response.ok) throw new Error(label + " introuvable.");
    const template = document.createElement("template");
    template.innerHTML = (await response.text()).trim();
    return template.content.cloneNode(true);
  }

  function chargerScriptMembreUneFois(path) {
    if (document.querySelector(`script[data-lcdp-script="${path}"]`)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = urlMembre(path);
      script.defer = true;
      script.dataset.lcdpScript = path;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Script membre introuvable : " + path));
      document.body.appendChild(script);
    });
  }

  function construireEndpointApi(cleModerne, cleLegacy, sousDomaineWorker) {
    const depuisConfig = CONFIG_PAGE?.[cleModerne] || CONFIG_PAGE?.[cleLegacy] || "";
    if (depuisConfig) return String(depuisConfig).replace(/\/+$/, "");
    return typeof CONFIG_PAGE.apiUrl === "function"
      ? CONFIG_PAGE.apiUrl(sousDomaineWorker).replace(/\/+$/, "")
      : "";
  }

  function redirigerConnexion() {
    if (typeof window.LCDP_redirigerConnexionMembre === "function") {
      window.LCDP_redirigerConnexionMembre("mes-factures-membre", "inactive");
      return;
    }

    window.location.href = PAGE_CONNEXION_MEMBRE +
      "?source=mes-factures-membre&session=inactive";
  }

  function remplirTexte(racine, selecteur, valeur) {
    const element = racine.querySelector(selecteur);
    if (element) element.textContent = valeur || "Non renseigné";
  }

  function remplacerTexteExact(racine, ancien, nouveau) {
    if (!racine) return;
    racine.querySelectorAll("h1, h2, h3, h4, p, span, strong").forEach((element) => {
      if (String(element.textContent || "").trim() === ancien) element.textContent = nouveau;
    });
  }

  function renommerLibelleLigne(racine, selecteurValeur, nouveauLibelle) {
    const valeur = racine.querySelector(selecteurValeur);
    const ligne = valeur?.closest(
      ".lcdp-box-card-prix-in-facture__row, .lcdp-box-card-paiement-in-facture__row, div"
    );
    if (!ligne) return;
    const label = Array.from(ligne.children).find(
      (element) => element !== valeur && element.tagName !== "STRONG"
    );
    if (label) label.textContent = nouveauLibelle;
  }

  function dateFuture(value) {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
  }

  function formaterDate(value) {
    if (!value) return "Non renseigné";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("fr-FR", {
      timeZone: "Europe/Paris",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  function nombreOuNull(value) {
    if (value === null || typeof value === "undefined" || value === "") return null;
    const nombre = Number(String(value).replace(",", "."));
    return Number.isFinite(nombre) ? nombre : null;
  }

  function formaterMontant(value) {
    const nombre = nombreOuNull(value);
    if (nombre === null) return "Non renseigné";
    return nombre.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  }

  function formaterTaux(value) {
    const nombre = nombreOuNull(value);
    if (nombre === null) return "20";
    return Number.isInteger(nombre) ? String(nombre) : String(nombre).replace(".", ",");
  }

  function urlPublic(path) {
    return typeof window.LCDP_urlPublic === "function" ? window.LCDP_urlPublic(path) : path;
  }

  function urlMembre(path) {
    return typeof window.LCDP_urlMembre === "function" ? window.LCDP_urlMembre(path) : path;
  }

  function urlObjet(path) {
    return typeof window.LCDP_urlObjet === "function" ? window.LCDP_urlObjet(path) : path;
  }
})();
