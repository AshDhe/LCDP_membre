const COOKIE_ABONNE = "abonne";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://ashdhe.github.io",
  "https://huguespavret.github.io",
  "https://membre.lacleduparc.fr",
  "https://lacleduparc.fr",
  "https://www.lacleduparc.fr",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];

export default {
  async fetch(request, env) {
    const corsHeaders = construireCorsHeaders(request, env);

    if (!origineAutorisee(request, env)) {
      return jsonResponse(
        { ok: false, error: "ORIGINE_NON_AUTORISEE" },
        403,
        corsHeaders
      );
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // Every account route is protected, including sessions created before the tunnel.
    try {
      const membre = await authentifierMembreCompte(request, env, corsHeaders);
      if (membre.response) return membre.response;
      const securite = await rpcSecuriteCompte(env, "statut_securite_membre", { p_membre: membre.idmembre });
      const recovery = await rpcSecuriteCompte(env, "recuperation_codr_etat", { p_membre: membre.idmembre });
      const optin = await chercherOptinReglement(env, "optingeolocalisation", membre.idmembre);
      if (securite.complete !== true || !optin || recovery.state !== "normal") {
        return jsonResponse({ ok: false, reason: "inscription_incomplete", message: "Reconnectez-vous pour terminer votre inscription." }, 403, corsHeaders);
      }
    } catch {
      return jsonResponse({ ok: false, message: "Le contrôle de votre inscription est momentanément indisponible." }, 503, corsHeaders);
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/relations-invitations") {
      return afficherRelationsInvitationsMembre(request, env, corsHeaders);
    }

    if (url.pathname === "/bracelet-wifi" && ["GET","POST"].includes(request.method)) {
      return gererWifiBracelet(request,env,corsHeaders);
    }
    if (url.pathname === "/selfie" && ["GET","PUT"].includes(request.method)) {
      return gererSelfie(request,env,corsHeaders);
    }

    if (
      request.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/compte")
    ) {
      return afficherCompteMembre(request, env, corsHeaders);
    }

    if ((request.method === "GET" && url.pathname === "/security-status") ||
        (request.method === "POST" && ["/coda-change","/codr-admin-request"].includes(url.pathname))) {
      try { return await securiteMonCompte(request,env,corsHeaders,url.pathname); }
      catch { return jsonResponse({ ok: false, message: "Le service de sécurité est momentanément indisponible." },503,corsHeaders); }
    }
    if (request.method === "POST" && url.pathname === "/alias") {
      return modifierAliasMembre(request, env, corsHeaders);
    }

    if (request.method === "POST" && url.pathname === "/adresse-facturation") {
      return modifierAdresseFacturationMembre(request, env, corsHeaders);
    }

    if (request.method === "POST" && url.pathname === "/coordonnees-remboursement") {
      return modifierCoordonneesRemboursementMembre(request, env, corsHeaders);
    }

    return jsonResponse(
      { ok: false, error: "ROUTE_INCONNUE" },
      404,
      corsHeaders
    );
  }
};

async function afficherCompteMembre(request, env, corsHeaders) {
  const sessionCookie = await lireSessionMembreDepuisCookie(request, env);

  if (!sessionCookie || !sessionCookie.idsession) {
    return jsonResponse(
      { ok: false, error: "SESSION_ABSENTE" },
      401,
      corsHeaders
    );
  }

  const session = await chercherSessionActive(env, sessionCookie.idsession);

  if (!session || !session.idmembre || session.revoked_reason || session.idmembre !== sessionCookie.idmembre) {
    return jsonResponse(
      { ok: false, error: "SESSION_MEMBRE_INACTIVE" },
      401,
      corsHeaders
    );
  }

  const idmembre = session.idmembre;

  const membre = await chercherMembre(env, idmembre);

  if (!membre) {
    return jsonResponse(
      { ok: false, error: "MEMBRE_INTROUVABLE" },
      404,
      corsHeaders
    );
  }

  const parrain = await chercherParrain(env, idmembre);
  const daActive = await chercherDaActiveMembre(env, idmembre);
  const statuda = normaliserStatuda(membre.statuda);
  const dateDa = membre.dateda || daActive?.dateda || null;
  const dateRefusDa = daActive?.daterefu || null;
  const optinGeolocalisation = await chercherOptinReglement(env, "optingeolocalisation", idmembre);
  const reglementApplication = await chercherOptinReglement(env, "optinreglmtapp", idmembre);
  const reglementClub = await chercherOptinReglement(env, "optinreglmtclub", idmembre);
  const abonnementsActifs = await chercherAbonnementsActifs(env, idmembre);
  const aboSuspendu = await chercherAboSuspendu(env, idmembre);
  const pointsClub = await chercherPointsMembre(env, idmembre);
  const seuilsPointsClub = await chercherDerniersSeuilsPoints(env);
  const prochainReferentPointsClub = construireProchainReferentPoints(
    pointsClub?.statut,
    seuilsPointsClub
  );
  const dateCalculPointsClub =
    seuilsPointsClub?.datepoints ||
    pointsClub?.date ||
    "";

  const statut = abonnementsActifs.length > 0 ? "Abonné" : "Invité";
  const abonnementSuspendu = statut === "Abonné" && valeurBooleenneVraie(aboSuspendu?.abosuspendu);
  const abonnementSuspenduEnCours = abonnementSuspendu ? trouverAbonnementAvecEcheanceNonPayee(abonnementsActifs) : null;
  const paiementSuspension = abonnementSuspenduEnCours ? construirePaiementSuspension(abonnementSuspenduEnCours) : null;

  const response = jsonResponse(
    {
      ok: true,
      compte: {
        idmembre: membre.idmembre,
        nom: membre.nommembre,
        prenom: membre.prenommembre,
        alias: membre.alias || "",
        email: membre.emailmembre,
        departement: membre.dptmtmembre,
        optinGeolocalisation,
        adresse1: membre.adresse1 || "",
        adresse2: membre.adresse2 || "",
        adresse3: membre.adresse3 || "",
        iban: membre.iban || "",
        swift: membre.swift || "",
        rib: membre.rib || "",
        membreDepuis: membre.dateemailvalid || null,
        statuda,
        dateda: membre.dateda || null,
        dateDa,
        dateRefusDa,
        datenext: daActive?.datenext || null,
        statut,
        pointsClub: pointsClub?.points ?? "",
        datePointsClub: pointsClub?.date || "",
        dateCalculPointsClub,
        centilePointsClub: pointsClub?.centile ?? "",
        statutPointsClub: pointsClub?.statut || "",
        prochainReferentPointsClub,
        points: pointsClub ? {
          points: pointsClub.points ?? "",
          date: pointsClub.date || "",
          centile: pointsClub.centile ?? "",
          statut: pointsClub.statut || ""
        } : null,
        abonnementSuspendu,
        suspendu: abonnementSuspendu,
        paiementSuspension,
        parrain: parrain ? parrain.emailparrain : null,
        reglementApplication,
        reglementClub
      }
    },
    200,
    corsHeaders
  );

  if (abonnementsActifs.length > 0) {
    ajouterCookieAbonne(response.headers);
  }

  return response;
}

async function modifierAliasMembre(request, env, corsHeaders) {
  const sessionCookie = await lireSessionMembreDepuisCookie(request, env);

  if (!sessionCookie || !sessionCookie.idsession) {
    return jsonResponse(
      { ok: false, error: "SESSION_ABSENTE" },
      401,
      corsHeaders
    );
  }

  const session = await chercherSessionActive(env, sessionCookie.idsession);

  if (!session || !session.idmembre) {
    return jsonResponse(
      { ok: false, error: "SESSION_MEMBRE_INACTIVE" },
      401,
      corsHeaders
    );
  }

  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return jsonResponse(
      { ok: false, error: "DONNEES_MANQUANTES", message: "Données manquantes." },
      400,
      corsHeaders
    );
  }

  const alias = nettoyerTexteSimple(payload.alias).slice(0, 120);

  await patcher(
    env,
    "membres",
    "idmembre=eq." + encodeURIComponent(session.idmembre) +
      "&emailvalid=eq.true" +
      "&emailvalidmode=eq.inscription",
    { alias: alias || null }
  );

  return jsonResponse(
    {
      ok: true,
      message: "Votre alias est enregistré.",
      compte: {
        alias
      }
    },
    200,
    corsHeaders
  );
}

async function modifierAdresseFacturationMembre(request, env, corsHeaders) {
  const membreSession = await authentifierMembreCompte(request, env, corsHeaders);

  if (membreSession.response) return membreSession.response;

  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return jsonResponse(
      { ok: false, error: "DONNEES_MANQUANTES", message: "Données manquantes." },
      400,
      corsHeaders
    );
  }

  const compte = {
    adresse1: nettoyerTexteSimple(payload.adresse1).slice(0, 180) || null,
    adresse2: nettoyerTexteSimple(payload.adresse2).slice(0, 180) || null,
    adresse3: nettoyerTexteSimple(payload.adresse3).slice(0, 180) || null
  };

  await patcher(
    env,
    "membres",
    "idmembre=eq." + encodeURIComponent(membreSession.idmembre) +
      "&emailvalid=eq.true" +
      "&emailvalidmode=eq.inscription",
    compte
  );

  return jsonResponse(
    {
      ok: true,
      message: "Votre adresse de facturation est enregistrée.",
      compte: {
        adresse1: compte.adresse1 || "",
        adresse2: compte.adresse2 || "",
        adresse3: compte.adresse3 || ""
      }
    },
    200,
    corsHeaders
  );
}

async function modifierCoordonneesRemboursementMembre(request, env, corsHeaders) {
  const membreSession = await authentifierMembreCompte(request, env, corsHeaders);

  if (membreSession.response) return membreSession.response;

  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return jsonResponse(
      { ok: false, error: "DONNEES_MANQUANTES", message: "Données manquantes." },
      400,
      corsHeaders
    );
  }

  const champ = normaliserChampRemboursement(payload.champ);

  if (!champ) {
    return jsonResponse(
      { ok: false, error: "CHAMP_NON_AUTORISE", message: "Champ de remboursement non autorisé." },
      400,
      corsHeaders
    );
  }

  const valeur = nettoyerTexteSimple(payload.valeur).slice(0, 180) || null;
  const ligne = { [champ]: valeur };

  await patcher(
    env,
    "membres",
    "idmembre=eq." + encodeURIComponent(membreSession.idmembre) +
      "&emailvalid=eq.true" +
      "&emailvalidmode=eq.inscription",
    ligne
  );

  return jsonResponse(
    {
      ok: true,
      message: "Vos coordonnées de remboursement sont enregistrées.",
      compte: {
        [champ]: valeur || ""
      }
    },
    200,
    corsHeaders
  );
}

async function authentifierMembreCompte(request, env, corsHeaders) {
  const sessionCookie = await lireSessionMembreDepuisCookie(request, env);

  if (!sessionCookie || !sessionCookie.idsession) {
    return {
      response: jsonResponse(
        { ok: false, error: "SESSION_ABSENTE" },
        401,
        corsHeaders
      )
    };
  }

  const session = await chercherSessionActive(env, sessionCookie.idsession);

  if (!session || !session.idmembre) {
    return {
      response: jsonResponse(
        { ok: false, error: "SESSION_MEMBRE_INACTIVE" },
        401,
        corsHeaders
      )
    };
  }

  return { idmembre: session.idmembre };
}

function normaliserChampRemboursement(champ) {
  const valeur = String(champ || "").trim().toLowerCase();
  return ["iban", "swift", "rib"].includes(valeur) ? valeur : "";
}

async function chercherSessionActive(env, idsession) {
  const url =
    env.SUPABASE_URL +
    "/rest/v1/sessactive" +
    "?idsession=eq." + encodeURIComponent(idsession) +
    "&dateexpiration=gt." + encodeURIComponent(new Date().toISOString()) +
    "&select=idsession,idmembre,revoked_reason" +
    "&limit=1";

  return premierResultat(env, url);
}

async function chercherMembre(env, idmembre) {
  const url =
    env.SUPABASE_URL.replace(/\/+$/, "") +
    "/rest/v1/membres" +
    "?idmembre=eq." + encodeURIComponent(idmembre) +
    "&emailvalid=eq.true" +
    "&emailvalidmode=eq.inscription" +
    "&select=idmembre,nommembre,prenommembre,alias,dptmtmembre,emailmembre,dateemailvalid,emailvalid,emailvalidmode,statuda,dateda,adresse1,adresse2,adresse3,iban,swift,rib" +
    "&limit=1";

  return premierResultat(env, url);
}

async function chercherPointsMembre(env, idmembre) {
  const url =
    env.SUPABASE_URL.replace(/\/+$/, "") +
    "/rest/v1/points" +
    "?idmembre=eq." + encodeURIComponent(idmembre) +
    "&select=idpoints,idmembre,points,date,centile,statut,created_at" +
    "&order=date.desc,created_at.desc" +
    "&limit=1";

  return premierResultat(env, url);
}

async function chercherDerniersSeuilsPoints(env) {
  const url =
    env.SUPABASE_URL.replace(/\/+$/, "") +
    "/rest/v1/pointsseuil" +
    "?select=datepoints,calcule_at,population,seuilbronze,seuilargent,seuilor,seuilplatine" +
    "&order=datepoints.desc,calcule_at.desc" +
    "&limit=1";

  return premierResultat(env, url);
}

function construireProchainReferentPoints(statutPoints, seuils) {
  if (!seuils) return null;

  const statut = normaliserStatutPoints(statutPoints);
  const prochain = {
    "": {
      statut: "bronze",
      seuil: seuils.seuilbronze
    },
    bronze: {
      statut: "argent",
      seuil: seuils.seuilargent
    },
    argent: {
      statut: "or",
      seuil: seuils.seuilor
    },
    or: {
      statut: "platine",
      seuil: seuils.seuilplatine
    }
  }[statut];

  if (!prochain) return null;

  const seuil = Number(prochain.seuil);

  if (!Number.isFinite(seuil)) {
    return null;
  }

  return {
    statut: prochain.statut,
    seuil
  };
}

function normaliserStatutPoints(value) {
  const statut = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");

  if (statut === "bronze" || statut === "bronse") {
    return "bronze";
  }

  if (statut === "argent") {
    return "argent";
  }

  if (statut === "or") {
    return "or";
  }

  if (statut === "platine") {
    return "platine";
  }

  return "";
}

async function chercherDaActiveMembre(env, idmembre) {
  const url =
    env.SUPABASE_URL.replace(/\/+$/, "") +
    "/rest/v1/damembre" +
    "?idmembre=eq." + encodeURIComponent(idmembre) +
    "&active=eq.true" +
    "&select=idda,idmembre,dateda,active,daterefu,datenext" +
    "&order=dateda.desc" +
    "&limit=1";

  return premierResultat(env, url);
}

async function chercherParrain(env, idmembre) {
  const url =
    env.SUPABASE_URL +
    "/rest/v1/parrain" +
    "?idmembre=eq." + encodeURIComponent(idmembre) +
    "&select=emailparrain,datemaj" +
    "&limit=1";

  return premierResultat(env, url);
}

async function chercherAbonnementsActifs(env, idmembre) {
  const aujourdHui = dateIsoAujourdhuiParis();
  const url =
    env.SUPABASE_URL.replace(/\/+$/, "") +
    "/rest/v1/abo" +
    "?idmembre=eq." + encodeURIComponent(idmembre) +
    "&debut=lte." + encodeURIComponent(aujourdHui) +
    "&fin=gte." + encodeURIComponent(aujourdHui) +
    "&statutabo=neq.cancd" +
    "&select=idabo,idmembre,debut,fin,statutabo,orderid,ech,etatmois1,datemois1,valmois1,etatmois2,datemois2,valmois2,etatmois3,datemois3,valmois3" +
    "&order=debut.desc";

  return resultats(env, url);
}

async function chercherAboSuspendu(env, idmembre) {
  const url =
    env.SUPABASE_URL.replace(/\/+$/, "") +
    "/rest/v1/v_abosuspendu" +
    "?idmembre=eq." + encodeURIComponent(idmembre) +
    "&select=idmembre,abosuspendu" +
    "&limit=1";

  return premierResultat(env, url);
}


function trouverAbonnementAvecEcheanceNonPayee(abonnements) {
  return (Array.isArray(abonnements) ? abonnements : []).find((abonnement) => {
    return echeancesNonPayeesAbonnement(abonnement).length > 0;
  }) || null;
}


function messageDelaiPaiementDepasse() {
  return "Le délai de paiement est dépassé. Cet abonnement est annulé.";
}

function delaiPaiementDepasseAbonnement(abonnement) {
  const fin = String(abonnement?.fin || "").trim().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fin)) return false;

  const p = partiesDateHeureParis(new Date());
  const dateParis = String(p.annee).padStart(4, "0") + "-" +
    String(p.mois).padStart(2, "0") + "-" +
    String(p.jour).padStart(2, "0");

  if (dateParis > fin) return true;
  if (dateParis < fin) return false;

  return p.heure >= 14;
}

function construirePaiementSuspension(abonnement) {
  const echeances = echeancesNonPayeesAbonnement(abonnement);
  const premiere = echeances[0] || {
    numero: 1,
    date: abonnement?.datemois1 || "",
    montant: abonnement?.valmois1 ?? ""
  };

  const delaiPaiementDepasse = delaiPaiementDepasseAbonnement(abonnement);

  return {
    idabo: abonnement?.idabo || "",
    orderid: abonnement?.orderid || "",
    debut: abonnement?.debut || "",
    fin: abonnement?.fin || "",
    echeance: premiere.numero,
    montant: premiere.montant,
    date: premiere.date,
    statutabo: abonnement?.statutabo || "",
    delaiPaiementDepasse,
    abonnementAnnuleNonPaye: delaiPaiementDepasse,
    messageDelaiPaiement: delaiPaiementDepasse ? messageDelaiPaiementDepasse() : "",
    echeances
  };
}

function echeancesNonPayeesAbonnement(abonnement) {
  const echeances = [];

  ajouterEcheanceNonPayee(echeances, 1, abonnement?.etatmois1, abonnement?.datemois1, abonnement?.valmois1);
  ajouterEcheanceNonPayee(echeances, 2, abonnement?.etatmois2, abonnement?.datemois2, abonnement?.valmois2);
  ajouterEcheanceNonPayee(echeances, 3, abonnement?.etatmois3, abonnement?.datemois3, abonnement?.valmois3);

  return echeances;
}

function ajouterEcheanceNonPayee(liste, numero, etatEcheance, date, montant) {
  const etatTexte = String(etatEcheance || "").trim().toLowerCase();

  if (etatTexte !== "du" && etatTexte !== "impaye") return;

  liste.push({
    numero,
    date: date || "",
    montant: montant ?? "",
    etat: etatTexte
  });
}

async function chercherOptinReglement(env, table, idmembre) {
  const url =
    env.SUPABASE_URL +
    "/rest/v1/" + table +
    "?idmembre=eq." + encodeURIComponent(idmembre) +
    "&select=dateoptin" +
    "&order=dateoptin.desc" +
    "&limit=1";

  const optin = await premierResultat(env, url);

  if (!optin) return null;

  return optin.dateoptin || null;
}

async function resultats(env, url) {
  const response = await fetch(url, {
    method: "GET",
    headers: supabaseHeaders(env)
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json().catch(() => null);
  return Array.isArray(data) ? data : [];
}

async function patcher(env, table, filtre, row) {
  const url = env.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/" + table + "?" + filtre;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      ...supabaseHeaders(env),
      "Prefer": "return=minimal"
    },
    body: JSON.stringify(row)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message || data?.error || "Erreur Supabase.");
  }
}

async function premierResultat(env, url) {
  const data = await resultats(env, url);
  return data[0] || null;
}

async function lireSessionMembreDepuisCookie(request, env) {
  const cookies = lireCookies(request.headers.get("Cookie"));
  const sessionToken = cookies.idsession_membre;

  if (!sessionToken || !env.SESSION_SECRET) {
    return null;
  }

  const parties = sessionToken.split(".");

  if (parties.length !== 2) {
    return null;
  }

  const payloadEncode = parties[0];
  const signatureRecue = parties[1];

  const signatureAttendue = await signerHmacSha256(
    env.SESSION_SECRET,
    payloadEncode
  );

  if (signatureRecue !== signatureAttendue) {
    return null;
  }

  let payload;

  try {
    payload = JSON.parse(base64UrlDecodeToString(payloadEncode));
  } catch {
    return null;
  }

  if (payload.typ !== "session_membre") {
    return null;
  }

  const maintenant = Math.floor(Date.now() / 1000);

  if (!payload.exp || payload.exp < maintenant) {
    return null;
  }

  return payload;
}

function supabaseHeaders(env) {
  return {
    "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
    "Accept": "application/json",
    "Content-Type": "application/json"
  };
}

function lireCookies(cookieHeader) {
  const cookies = {};

  if (!cookieHeader) {
    return cookies;
  }

  cookieHeader.split(";").forEach((cookie) => {
    const [nom, ...valeur] = cookie.trim().split("=");

    if (!nom) return;

    cookies[nom] = decodeURIComponent(valeur.join("="));
  });

  return cookies;
}

async function signerHmacSha256(secret, message) {
  const encodeur = new TextEncoder();

  const cle = await crypto.subtle.importKey(
    "raw",
    encodeur.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    cle,
    encodeur.encode(message)
  );

  return base64Url(new Uint8Array(signature));
}

function base64Url(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecodeToString(value) {
  let base64 = String(value)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  while (base64.length % 4 !== 0) {
    base64 += "=";
  }

  return atob(base64);
}

function ajouterCookieAbonne(headers) {
  headers.append(
    "Set-Cookie",
    [
      `${COOKIE_ABONNE}=1`,
      "Domain=.lacleduparc.fr",
      "Secure",
      "SameSite=None",
      "Path=/",
      `Max-Age=${secondesAvantFinJourParis()}`
    ].join("; ")
  );
}

function dateIsoAujourdhuiParis(date = new Date()) {
  const p = partiesDateHeureParis(date);
  return String(p.annee).padStart(4, "0") + "-" +
    String(p.mois).padStart(2, "0") + "-" +
    String(p.jour).padStart(2, "0");
}

function secondesAvantFinJourParis() {
  const maintenant = new Date();
  const p = partiesDateHeureParis(maintenant);
  const demainUtc = new Date(Date.UTC(p.annee, p.mois - 1, p.jour + 1, 0, 0, 0));
  const finJourUtc = timestampUtcPourHeureParis(
    demainUtc.getUTCFullYear(),
    demainUtc.getUTCMonth() + 1,
    demainUtc.getUTCDate(),
    0,
    0,
    0
  ) - 1;

  return Math.max(1, Math.floor((finJourUtc - Date.now()) / 1000));
}

function timestampUtcPourHeureParis(annee, mois, jour, heure, minute, seconde) {
  const cibleCommeUtc = Date.UTC(annee, mois - 1, jour, heure, minute, seconde);
  let estimation = cibleCommeUtc;

  for (let i = 0; i < 4; i++) {
    const p = partiesDateHeureParis(new Date(estimation));
    const obtenuCommeUtc = Date.UTC(p.annee, p.mois - 1, p.jour, p.heure, p.minute, p.seconde);
    estimation += cibleCommeUtc - obtenuCommeUtc;
  }

  return estimation;
}

function partiesDateHeureParis(date) {
  const morceaux = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23"
  }).formatToParts(date);

  const valeur = (type) => Number(morceaux.find((item) => item.type === type)?.value || 0);

  return {
    annee: valeur("year"),
    mois: valeur("month"),
    jour: valeur("day"),
    heure: valeur("hour"),
    minute: valeur("minute"),
    seconde: valeur("second")
  };
}

function nettoyerTexteSimple(valeur) {
  return String(valeur || "")
    .trim()
    .replace(/\s+/g, " ");
}

function valeurBooleenneVraie(valeur) {
  return valeur === true || valeur === "true" || valeur === 1 || valeur === "1";
}

function normaliserStatuda(value) {
  const statut = String(value || "").trim().toLowerCase();
  return ["encours", "oui", "non"].includes(statut) ? statut : null;
}

function construireCorsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigins = lireOriginesAutorisees(env);
  const headers = new Headers();

  if (allowedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie, Accept");
  headers.set("Vary", "Origin");

  return headers;
}

function origineAutorisee(request, env) {
  const origin = request.headers.get("Origin");

  if (!origin) {
    return true;
  }

  return lireOriginesAutorisees(env).includes(origin);
}

function lireOriginesAutorisees(env) {
  const valeur = env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(",");

  return String(valeur)
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function jsonResponse(data, status, corsHeaders) {
  const headers = new Headers(corsHeaders);

  headers.set("Content-Type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(data), {
    status,
    headers
  });
}
async function securiteMonCompte(request,env,cors,chemin) {
  const cookie = await lireSessionMembreDepuisCookie(request,env);
  const session = cookie?.idsession ? await chercherSessionActive(env,cookie.idsession) : null;
  if (!cookie?.idmembre || !session || session.idmembre !== cookie.idmembre || session.revoked_reason) {
    return jsonResponse({ ok: false, message: "Reconnectez-vous à votre compte." },401,cors);
  }
  const membre = session.idmembre;
  const securite = await rpcSecuriteCompte(env,"statut_securite_membre",{p_membre:membre});
  if (!securite.complete) return jsonResponse({ok:false,reason:"security_setup_required",message:"Créez vos deux codes avant d’accéder à l’espace membre."},403,cors);
  if (chemin === "/security-status") {
    const resultat=await rpcSecuriteCompte(env,"statut_controle_codr",{p_membre:membre});
    return jsonResponse({ok:true,...resultat},200,cors);
  }
  if (chemin === "/codr-admin-request") {
    const base = new URL(String(env.W_EMAILTOKENZ_URL || ""));
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || !env.W_EMAILTOKENZ) throw new Error("Configuration email manquante.");
    const demande=await rpcSecuriteCompte(env,"demander_modification_codr_admin",{p_membre:membre});
    if (!demande.success) return jsonResponse({ok:false,...demande},demande.status||400,cors);
    if (demande.notifiee) return jsonResponse({ok:true,message:"Votre demande de modification du CODR a déjà été transmise par email à l’administrateur."},200,cors);
    try {
      const reponse=await fetch(base.href.replace(/\/+$/,"")+"/codr-admin-request",{
        method:"POST",headers:{Authorization:"Bearer "+env.W_EMAILTOKENZ,"Content-Type":"application/json"},
        body:JSON.stringify({demande:demande.demande})
      });
      const resultat=await reponse.json().catch(()=>null);
      if (reponse.ok && resultat?.success===true) return jsonResponse({ok:true,simulation:resultat.simulation===true,
        message:resultat.simulation ? "Simulation : votre demande est enregistrée. Aucun email n’a été envoyé à l’administrateur." : "Votre demande de modification du CODR a été transmise par email à l’administrateur."},200,cors);
    } catch { /* La demande reste conservée pour une nouvelle tentative. */ }
    return jsonResponse({ok:false,demandeEnregistree:true,message:"Votre demande est enregistrée, mais l’envoi de la notification à l’administrateur n’a pas pu être confirmé. Réessayez dans une minute."},503,cors);
  }
  // Changement direct : le CODR authentifie la demande et le CODA est enregistré
  // dans la même transaction SQL, sans e-mail ni jeton de modification.
  const data = await request.json().catch(() => null);
  const mots = Array.isArray(data?.mots) ? data.mots : [];
  const coda = String(data?.coda || "");
  if (mots.length !== 4 || mots.some(m => typeof m !== "string" || !/^[A-Z]{4}$/.test(m)) || !/^[0-9]{4}$/.test(coda)) {
    return jsonResponse({ok:false,message:"Saisissez votre nouveau CODA et les quatre mots du CODR."},422,cors);
  }
  const empreinteNavigateur = await empreinteNavigateurCompte(request);
  const resultat = await rpcSecuriteCompte(env,"modifier_coda_direct",{
    p_membre:membre,
    p_session:String(cookie.idsession),
    p_empreinte:empreinteNavigateur,
    p_codr:mots.join("-"),
    p_nouveau_coda:coda
  });
  return jsonResponse({ok:resultat.success===true,...resultat},resultat.success ? 200 : resultat.status||403,cors);
}

async function rpcSecuriteCompte(env, nom, params) {
  const cle = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE;
  const reponse = await fetch(String(env.SUPABASE_URL).replace(/\/+$/, "") + "/rest/v1/rpc/" + nom, {
    method: "POST", headers: { apikey: cle, Authorization: "Bearer " + cle, "Content-Type": "application/json" },
    body: JSON.stringify(params)
  });
  const data = await reponse.json().catch(() => null);
  if (!reponse.ok || !data || typeof data.success !== "boolean") throw new Error("Vérification de sécurité indisponible.");
  return data;
}
async function empreinteNavigateurCompte(request) {
  const cookies = lireCookies(request.headers.get("Cookie"));
  const secret = String(cookies.lcdp_navigateur_proprietaire || "");
  if (!/^[a-f0-9]{64}$/.test(secret)) return null;
  const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");
}

async function empreinteSecuriteCompte(texte) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,"0")).join("");
}
function jetonSecuriteCompte() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2,"0")).join("");
}

// Une seule photo par membre, accessible exclusivement via sa session active.
async function gererSelfie(request,env,cors) {
  const headers=new Headers(cors);headers.set("Cache-Control","no-store");headers.set("X-Content-Type-Options","nosniff");
  try {
    const cookie=await lireSessionMembreDepuisCookie(request,env);
    const session=cookie?.idsession ? await chercherSessionActive(env,cookie.idsession) : null;
    if(!cookie?.idmembre || !session || session.idmembre!==cookie.idmembre || session.revoked_reason)
      return jsonResponse({ok:false,message:"Reconnectez-vous à votre compte."},401,headers);
    const base=String(env.SUPABASE_URL).replace(/\/+$/,"")+"/rest/v1/selfie";
    if(request.method==="GET") {
      const r=await fetch(base+"?idmembre=eq."+encodeURIComponent(session.idmembre)+"&select=photo_base64&limit=1",{headers:supabaseHeaders(env)});
      if(!r.ok)throw Error("Lecture impossible");
      const rows=await r.json();
      if(!rows[0])return jsonResponse({ok:false,message:"Aucun selfie."},404,headers);
      const bytes=Uint8Array.from(atob(rows[0].photo_base64),c=>c.charCodeAt(0));
      headers.set("Content-Type","image/jpeg");
      return new Response(bytes,{status:200,headers});
    }
    if(!request.headers.get("Origin") || !origineAutorisee(request,env))return jsonResponse({ok:false},403,headers);
    if(request.headers.get("Content-Type")?.split(";")[0].trim()!=="image/jpeg")
      return jsonResponse({ok:false,message:"Une photo JPEG est requise."},415,headers);
    const limite=300000;
    if(Number(request.headers.get("Content-Length"))>limite)return jsonResponse({ok:false,message:"Photo trop volumineuse."},413,headers);
    const reader=request.body?.getReader();
    if(!reader)return jsonResponse({ok:false,message:"Photo absente."},400,headers);
    const morceaux=[];let taille=0;
    while(true){const {done,value}=await reader.read();if(done)break;taille+=value.length;if(taille>limite){await reader.cancel();return jsonResponse({ok:false,message:"Photo trop volumineuse."},413,headers);}morceaux.push(value);}
    const bytes=new Uint8Array(taille);let position=0;for(const m of morceaux){bytes.set(m,position);position+=m.length;}
    if(!selfieJpegValide(bytes))return jsonResponse({ok:false,message:"Photo JPEG invalide ou dimensions trop grandes."},400,headers);
    let binaire="";for(let i=0;i<bytes.length;i+=8192)binaire+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const r=await fetch(base+"?on_conflict=idmembre",{method:"POST",headers:{...supabaseHeaders(env),Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({idmembre:session.idmembre,photo_base64:btoa(binaire),date_modification:new Date().toISOString()})});
    if(!r.ok)throw Error("Enregistrement impossible");
    return jsonResponse({ok:true},200,headers);
  }catch{return jsonResponse({ok:false,message:"Le service selfie est momentanément indisponible."},503,headers);}
}
function selfieJpegValide(b) {
  if(b.length<4 || b[0]!==255 || b[1]!==216 || b[b.length-2]!==255 || b[b.length-1]!==217)return false;
  let p=2;
  while(p+3<b.length){
    if(b[p++]!==255)return false;
    while(b[p]===255)p++;
    const marqueur=b[p++];
    if(marqueur===218 || marqueur===217)return false;
    const n=(b[p]<<8)|b[p+1];if(n<2 || p+n>b.length)return false;
    if(marqueur===192 || marqueur===194){
      if(n<8)return false;
      const hauteur=(b[p+3]<<8)|b[p+4],largeur=(b[p+5]<<8)|b[p+6];
      return largeur>0 && hauteur>0 && largeur<=1024 && hauteur<=1024;
    }
    p+=n;
  }
  return false;
}

async function gererWifiBracelet(request,env,cors) {
  const headers=new Headers(cors);headers.set("Cache-Control","no-store");
  try {
    const cookie=await lireSessionMembreDepuisCookie(request,env);
    const session=cookie?.idsession ? await chercherSessionActive(env,cookie.idsession) : null;
    if(!cookie?.idmembre || !session || session.idmembre!==cookie.idmembre || session.revoked_reason)
      return jsonResponse({ok:false,message:"Reconnectez-vous à votre compte."},401,headers);
    const reponse=await fetch(String(env.SUPABASE_URL).replace(/\/+$/,"")+"/rest/v1/clemembre?"+new URLSearchParams({idmembre:"eq."+session.idmembre,actif:"eq.true",select:"idclemembre,idbracelet,brac",limit:"2"}),{headers:supabaseHeaders(env)});
    if(!reponse.ok)throw Error("Lecture indisponible");
    const rows=await reponse.json();
    if(!Array.isArray(rows))throw Error("Lecture invalide");
    if(rows.length===0)return jsonResponse({ok:false,reason:"bracelet_missing",message:"Aucun bracelet actif ne vous est attribué. Contactez le club."},404,headers);
    if(rows.length!==1)return jsonResponse({ok:false,reason:"bracelet_ambiguous",message:"Plusieurs bracelets actifs sont attribués à votre compte. Contactez le club."},409,headers);
    const bracelet=rows[0];
    if(request.method==="GET") {
      const r=await fetch(String(env.SUPABASE_URL).replace(/\/+$/,"")+"/rest/v1/bracelet_wifi?"+new URLSearchParams({idclemembre:"eq."+bracelet.idclemembre,idmembre:"eq."+session.idmembre,select:"wifi_ssid,wifi_modifie_le",limit:"1"}),{headers:supabaseHeaders(env)});
      if(!r.ok)throw Error("Lecture Wi-Fi indisponible");
      const configurations=await r.json();if(!Array.isArray(configurations))throw Error("Lecture invalide");
      const wifi=configurations[0];
      return jsonResponse({ok:true,bracelet:{brac:bracelet.brac,ssid:wifi?.wifi_ssid || "",configured:Boolean(wifi),updatedAt:wifi?.wifi_modifie_le || null,hardwareIntegrated:false}},200,headers);
    }
    if(!request.headers.get("Origin") || !origineAutorisee(request,env))return jsonResponse({ok:false},403,headers);
    if(request.headers.get("Content-Type")?.split(";")[0].trim()!=="application/json")return jsonResponse({ok:false,message:"Demande invalide."},415,headers);
    const reader=request.body?.getReader();if(!reader)return jsonResponse({ok:false},400,headers);
    let taille=0;const morceaux=[];
    while(true){const {done,value}=await reader.read();if(done)break;taille+=value.length;if(taille>4096){await reader.cancel();return jsonResponse({ok:false,message:"Demande trop volumineuse."},413,headers);}morceaux.push(value);}
    const octets=new Uint8Array(taille);let pos=0;for(const m of morceaux){octets.set(m,pos);pos+=m.length;}
    let body;try{body=JSON.parse(new TextDecoder().decode(octets));}catch{return jsonResponse({ok:false,message:"Demande invalide."},400,headers);}
    const ssid=body?.ssid,motDePasse=body?.password,coda=body?.coda;
    if(typeof ssid!=="string" || new TextEncoder().encode(ssid).length<1 || new TextEncoder().encode(ssid).length>32 || /[\x00-\x1f\x7f]/.test(ssid))return jsonResponse({ok:false,message:"Le nom du réseau doit contenir entre 1 et 32 octets, sans caractère de contrôle."},400,headers);
    if(typeof motDePasse!=="string" || !(/^[\x20-\x7e]{8,63}$/.test(motDePasse) || /^[a-f0-9]{64}$/i.test(motDePasse)))return jsonResponse({ok:false,message:"Mot de passe Wi-Fi attendu : 8 à 63 caractères ASCII, ou une clé de 64 caractères hexadécimaux."},400,headers);
    if(typeof coda!=="string" || !/^[0-9]{4}$/.test(coda))return jsonResponse({ok:false,message:"Saisissez les quatre chiffres."},400,headers);
    const secretChiffre=await chiffrerWifiBracelet(env,motDePasse,session.idmembre,bracelet.idbracelet);
    const r=await rpcSecuriteCompte(env,"modifier_wifi_bracelet",{p_membre:session.idmembre,p_idclemembre:bracelet.idclemembre,p_ssid:ssid,p_secret_chiffre:secretChiffre,p_coda:coda});
    return jsonResponse({ok:r.success,reason:r.reason,message:r.message},r.success?200:r.status || 403,headers);
  }catch{return jsonResponse({ok:false,message:"La configuration Wi-Fi est momentanément indisponible."},503,headers);}
}
async function chiffrerWifiBracelet(env,password,membre,bracelet) {
  const hex=String(env.BRACELET_WIFI_KEY || "");
  if(!/^[a-f0-9]{64}$/i.test(hex) || !bracelet)throw Error("Chiffrement non configuré");
  const key=await crypto.subtle.importKey("raw",Uint8Array.from(hex.match(/../g),x=>parseInt(x,16)),"AES-GCM",false,["encrypt"]);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const chiffre=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:new TextEncoder().encode("LCDP-WIFI-V1|"+membre+"|"+bracelet)},key,new TextEncoder().encode(password)));
  const b64=b=>btoa(String.fromCharCode(...b));
  return "v1."+b64(iv)+"."+b64(chiffre);
}

async function afficherRelationsInvitationsMembre(request, env, corsHeaders) {
  const session = await authentifierMembreCompte(request, env, corsHeaders);
  if (session.response) return session.response;

  try {
    const compte = await chercherMembre(env, session.idmembre);
    if (!compte || !compte.emailmembre) {
      return jsonResponse(
        { ok: false, message: "Compte membre non validé." },
        403,
        corsHeaders
      );
    }
    const idmembre = session.idmembre;
    const email = String(compte.emailmembre).trim().toLowerCase();
    const jour = dateIsoAujourdhuiParis();

    // La commande courante est identifiée côté serveur, jamais par le navigateur.
    const abonnements = await lireRestRelationsInvitant(env, "abo", {
      idmembre: "eq." + idmembre,
      debut: "lte." + jour,
      fin: "gte." + jour,
      statutabo: "neq.cancd",
      select: "idabo,debut,fin",
      order: "debut.desc",
      limit: "1"
    });
    const abonnement = abonnements[0] || null;

    const [invitesHistoriqueAbo, personnesLiees, invitationsEmail] = await Promise.all([
      abonnement ? lireToutesRelationsInvitant(env, "invitant", {
        idmembre_invitant: "eq." + idmembre,
        idabo: "eq." + abonnement.idabo,
        select: "idinvitant,idmembre_invite,emailinvite,dateinvitation",
        order: "dateinvitation.desc"
      }) : Promise.resolve([]),
      lireToutesRelationsInvitant(env, "invitant", {
        idmembre_invite: "eq." + idmembre,
        select: "idinvitant,idmembre_invitant,dateinvitation",
        order: "dateinvitation.desc"
      }),
      lireToutesRelationsInvitant(env, "invitant", {
        emailinvite: "eq." + email,
        idmembre_invite: "is.null",
        select: "idinvitant,idmembre_invitant,dateinvitation",
        order: "dateinvitation.desc"
      })
    ]);

    const evenementsInvitants = new Map();
    for (const ligne of [...personnesLiees, ...invitationsEmail]) {
      evenementsInvitants.set(ligne.idinvitant, ligne);
    }

    const idContacts = new Set([
      ...invitesHistoriqueAbo.map(ligne => ligne.idmembre_invite),
      ...Array.from(evenementsInvitants.values(), ligne => ligne.idmembre_invitant)
    ].filter(Boolean));
    const identites = await chargerIdentitesRelationsInvitant(env, [...idContacts]);

    const invites = [];
    const invitesVus = new Set();
    const sortDesc = (a, b) => String(b.dateinvitation || "").localeCompare(String(a.dateinvitation || ""));
    for (const ligne of invitesHistoriqueAbo.sort(sortDesc)) {
      const adresse = String(ligne.emailinvite || "").toLowerCase().trim();
      const cle = adresse || String(ligne.idmembre_invite || "");
      if (!cle || invitesVus.has(cle)) continue;
      invitesVus.add(cle);
      const membre = identites.get(ligne.idmembre_invite) || {};
      invites.push({
        nom: membre.nommembre || "",
        prenom: membre.prenommembre || "",
        email: adresse,
        date: ligne.dateinvitation
      });
    }

    const invitants = [];
    const invitantsVus = new Set();
    for (const ligne of [...evenementsInvitants.values()].sort(sortDesc)) {
      const cle = String(ligne.idmembre_invitant || "");
      if (!cle || invitantsVus.has(cle)) continue;
      invitantsVus.add(cle);
      const membre = identites.get(cle) || {};
      invitants.push({
        nom: membre.nommembre || "",
        prenom: membre.prenommembre || "",
        email: membre.emailmembre || "",
        date: ligne.dateinvitation
      });
    }

    return jsonResponse({
      ok: true,
      abonnementEnCours: Boolean(abonnement),
      invites,
      invitants
    }, 200, corsHeaders);
  } catch (erreur) {
    console.error("Lecture relations d'invitation :", erreur);
    return jsonResponse({
      ok: false,
      message: "Les listes d'invitations sont temporairement indisponibles."
    }, 503, corsHeaders);
  }
}

async function lireRestRelationsInvitant(env, table, parametres) {
  const url = new URL(env.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/" + table);
  for (const [cle, valeur] of Object.entries(parametres)) {
    url.searchParams.set(cle, String(valeur));
  }
  const reponse = await fetch(url, {
    headers: supabaseHeaders(env)
  });
  if (!reponse.ok) {
    throw new Error("Requête invitations indisponible (" + reponse.status + ").");
  }
  const donnees = await reponse.json();
  if (!Array.isArray(donnees)) throw new Error("Réponse invitations invalide.");
  return donnees;
}

// Pagination explicite : ne pas afficher un faux historique limité aux 1000 premières lignes.
async function lireToutesRelationsInvitant(env, table, parametres) {
  const lignes = [];
  const taillePage = 500;
  for (let page = 0; page < 200; page += 1) {
    const lot = await lireRestRelationsInvitant(env, table, {
      ...parametres,
      limit: String(taillePage),
      offset: String(page * taillePage)
    });
    lignes.push(...lot);
    if (lot.length < taillePage) return lignes;
  }
  throw new Error("Historique trop volumineux pour une lecture complète.");
}

async function chargerIdentitesRelationsInvitant(env, ids) {
  const identites = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const groupe = ids.slice(i, i + 100);
    const membres = await lireRestRelationsInvitant(env, "membres", {
      idmembre: "in.(" + groupe.join(",") + ")",
      select: "idmembre,nommembre,prenommembre,emailmembre",
      limit: "100"
    });
    for (const membre of membres) identites.set(membre.idmembre, membre);
  }
  return identites;
}
