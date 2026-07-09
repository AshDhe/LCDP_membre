const DEFAULT_ALLOWED_ORIGINS = [
  "https://ashdhe.github.io",
  "https://huguespavret.github.io",
  "https://membre.lacleduparc.fr",
  "https://lacleduparc.fr",
  "https://www.lacleduparc.fr",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];

const COOKIE_SESSION_MEMBRE_PRINCIPAL = "idsession_membre";
const COOKIE_SESSION_MEMBRE_COMPATIBLE = "session_membre";
const TYPE_SESSION_MEMBRE = "session_membre";
const DUREE_CACHE_MOTS_INTERDITS_MS = 5 * 60 * 1000;
let cacheMotsInterditsDa = { url: "", expiration: 0, liste: [] };

export default {
  async fetch(request, env) {
    const corsHeaders = construireCorsHeaders(request, env);

    if (!origineAutorisee(request, env)) {
      return json({ ok: false, success: false, message: "Origine non autorisée." }, 403, corsHeaders);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      verifierVariablesEnv(env);
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/contexte") {
        return await traiterContexteDa(request, env, corsHeaders);
      }

      if (request.method === "POST" && url.pathname === "/transmettre") {
        return await traiterTransmissionDa(request, env, corsHeaders);
      }

      return json({ ok: false, success: false, message: "Route DA membre inconnue." }, 404, corsHeaders);
    } catch (error) {
      return json(
        {
          ok: false,
          success: false,
          message: error.message || "Erreur technique. Merci de réessayer."
        },
        error.status || 500,
        corsHeaders
      );
    }
  }
};

async function traiterContexteDa(request, env, corsHeaders) {
  const session = await authentifierMembre(request, env);
  const membre = await chercherMembreValide(env, session.idmembre);

  if (!membre) {
    erreurHttp("Compte membre introuvable.", 404);
  }

  const daActive = await chercherDaActiveMembre(env, session.idmembre);
  const parrain = await chercherParrainMembre(env, session.idmembre);

  return json(
    {
      ok: true,
      success: true,
      statuda: normaliserStatuda(membre.statuda),
      dateda: membre.dateda || null,
      datenext: daActive ? daActive.datenext || null : null,
      membre: {
        idmembre: membre.idmembre,
        nommembre: membre.nommembre || "",
        prenommembre: membre.prenommembre || "",
        emailmembre: membre.emailmembre || "",
        alias: membre.alias || "",
        tel: membre.tel || "",
        autoquali: membre.autoquali || "",
        autoloisir: membre.autoloisir || "",
        autonouschoisir: membre.autonouschoisir || "",
        checkboxvaleurs: false,
        targetfamill: false,
        iban: membre.iban || "",
        swift: membre.swift || "",
        rib: membre.rib || ""
      },
      parrain: {
        emailparrain: parrain ? parrain.emailparrain || "" : ""
      }
    },
    200,
    corsHeaders
  );
}

async function traiterTransmissionDa(request, env, corsHeaders) {
  const session = await authentifierMembre(request, env);
  const membre = await chercherMembreValide(env, session.idmembre);

  if (!membre) {
    erreurHttp("Compte membre introuvable.", 404);
  }

  const daActive = await chercherDaActiveMembre(env, session.idmembre);
  verifierStatutDaTransmissible(membre, daActive);

  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    erreurHttp("Données manquantes.", 400);
  }

  const donnees = normaliserPayloadDa(payload);
  await verifierPayloadDa(donnees, env);

  const maintenant = new Date().toISOString();

  await desactiverDaActivesMembre(env, session.idmembre);

  const lignesDa = await inserer(env, "damembre", {
    idmembre: session.idmembre,
    dateda: maintenant,
    active: true,
    daterefu: null,
    datenext: null
  });

  const da = Array.isArray(lignesDa) && lignesDa.length ? lignesDa[0] : null;

  const patchMembre = {
    statuda: "encours",
    dateda: maintenant,
    alias: donnees.alias,
    tel: donnees.tel,
    autoquali: donnees.autoquali,
    autoloisir: donnees.autoloisir,
    autonouschoisir: donnees.autonouschoisir,
    checkboxvaleurs: donnees.checkboxvaleurs,
    targetfamill: donnees.targetfamill,
    iban: donnees.iban,
    swift: donnees.swift,
    rib: donnees.rib
  };

  if (donnees.etatcivilmaj) {
    patchMembre.nommembre = donnees.nommembre;
    patchMembre.prenommembre = donnees.prenommembre;
  }

  await patcher(
    env,
    "membres",
    "idmembre=eq." + encodeURIComponent(session.idmembre) +
      "&emailvalid=eq.true" +
      "&emailvalidmode=eq.inscription",
    patchMembre
  );

  return json(
    {
      ok: true,
      success: true,
      message: "Votre DA est envoyée.",
      statuda: "encours",
      dateda: maintenant,
      idda: da ? da.idda || null : null
    },
    200,
    corsHeaders
  );
}

function verifierStatutDaTransmissible(membre, daActive) {
  const statuda = normaliserStatuda(membre?.statuda);

  if (statuda === "oui") {
    erreurHttp("Vous êtes déjà autorisé à souscrire un abonnement.", 403);
  }

  if (statuda === "encours") {
    erreurHttp("Vous avez une DA en cours.", 403);
  }

  if (statuda === "non") {
    const datenext = daActive ? daActive.datenext || null : null;

    if (!dateDaAtteinte(datenext)) {
      erreurHttp("Vous êtes membre invité. Vous pouvez faire une DA à partir du " + formaterDateDa(datenext) + ".", 403);
    }
  }
}

function normaliserPayloadDa(payload) {
  return {
    etatcivilmaj: valeurBooleenneVraie(payload.etatcivilmaj),
    nommembre: nettoyerTexte(payload.nommembre).slice(0, 120),
    prenommembre: nettoyerTexte(payload.prenommembre).slice(0, 120),
    alias: nettoyerTexte(payload.alias).slice(0, 120),
    tel: String(payload.tel || "").replace(/\s+/g, ""),
    autoquali: nettoyerTexte(payload.autoquali),
    autoloisir: nettoyerTexte(payload.autoloisir),
    autonouschoisir: nettoyerTexte(payload.autonouschoisir),
    checkboxvaleurs: payload.checkboxvaleurs === true,
    targetfamill: payload.targetfamill === true,
    iban: String(payload.iban || "").replace(/\s+/g, "").toUpperCase(),
    swift: String(payload.swift || "").replace(/\s+/g, "").toUpperCase(),
    rib: nettoyerTexte(payload.rib).slice(0, 160),
    regleclub_v1: valeurBooleenneVraie(payload.regleclub_v1),
    regleapp_v1: valeurBooleenneVraie(payload.regleapp_v1)
  };
}

async function verifierPayloadDa(payload, env) {
  if (!payload.alias) erreurHttp("Votre alias est obligatoire.", 400);
  if (!/^\d{10}$/.test(payload.tel)) erreurHttp("Votre numéro de mobile doit contenir 10 chiffres, sans espace.", 400);
  if (!payload.autoquali) erreurHttp("Vos trois qualités sont obligatoires.", 400);
  if (!payload.autoloisir) erreurHttp("Vos trois hobbies sont obligatoires.", 400);
  if (!payload.autonouschoisir) erreurHttp("Pourquoi La Clé du Parc ? est obligatoire.", 400);
  if (payload.autoquali.length > 100 || payload.autoloisir.length > 100 || payload.autonouschoisir.length > 100) erreurHttp("Les champs limités ne doivent pas dépasser 100 caractères.", 400);
  if (!/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(payload.iban)) erreurHttp("Votre IBAN est invalide.", 400);
  if (!/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(payload.swift)) erreurHttp("Le SWIFT de votre banque est invalide.", 400);
  if (!payload.rib) erreurHttp("Le nom du titulaire selon RIB est obligatoire.", 400);
  if (!payload.regleclub_v1) erreurHttp("Le règlement du club doit être accepté.", 400);
  if (!payload.regleapp_v1) erreurHttp("Le règlement de l’application doit être accepté.", 400);

  if (await contientMotInterditDa([payload.alias, payload.autoquali, payload.autoloisir, payload.autonouschoisir, payload.rib], env)) {
    erreurHttp("Votre DA contient des mots interdits.", 400);
  }
}

async function authentifierMembre(request, env) {
  const cookies = lireCookies(request.headers.get("Cookie"));
  const tokenSession =
    cookies[COOKIE_SESSION_MEMBRE_PRINCIPAL] ||
    cookies[COOKIE_SESSION_MEMBRE_COMPATIBLE];

  if (!tokenSession) {
    erreurHttp("Session membre absente.", 401);
  }

  const sessionPayload = await verifierTokenSessionMembre(env, tokenSession);

  if (!sessionPayload) {
    erreurHttp("Session membre invalide.", 401);
  }

  const sessionActive = await chercherSessionActive(env, sessionPayload.idsession, sessionPayload.idmembre);

  if (!sessionActive || !sessionActive.idmembre) {
    erreurHttp("Session membre inactive.", 401);
  }

  return {
    idsession: sessionPayload.idsession,
    idmembre: sessionActive.idmembre
  };
}

async function verifierTokenSessionMembre(env, tokenSession) {
  const morceaux = String(tokenSession || "").split(".");

  if (morceaux.length !== 2) return null;

  const payloadEncode = morceaux[0];
  const signature = morceaux[1];
  const signatureAttendue = await signerHmacSha256(env.SESSION_SECRET, payloadEncode);

  if (!comparaisonConstante(signature, signatureAttendue)) return null;

  let payload = null;

  try {
    payload = JSON.parse(base64UrlDecodeString(payloadEncode));
  } catch (_error) {
    return null;
  }

  if (!payload || payload.typ !== TYPE_SESSION_MEMBRE) return null;
  if (!payload.idsession || !payload.idmembre) return null;

  const maintenant = Math.floor(Date.now() / 1000);
  if (!payload.exp || Number(payload.exp) < maintenant) return null;

  return payload;
}

async function chercherSessionActive(env, idsession, idmembre) {
  const supabaseUrl = nettoyerBaseUrl(env.SUPABASE_URL);
  const maintenant = new Date().toISOString();

  const url =
    supabaseUrl +
    "/rest/v1/sessactive" +
    "?idsession=eq." + encodeURIComponent(idsession) +
    "&idmembre=eq." + encodeURIComponent(idmembre) +
    "&dateexpiration=gte." + encodeURIComponent(maintenant) +
    "&select=idsession,idmembre,dateexpiration" +
    "&limit=1";

  return premierResultat(env, url, "Lecture sessactive");
}

async function chercherMembreValide(env, idmembre) {
  const supabaseUrl = nettoyerBaseUrl(env.SUPABASE_URL);

  const url =
    supabaseUrl +
    "/rest/v1/membres" +
    "?idmembre=eq." + encodeURIComponent(idmembre) +
    "&emailvalid=eq.true" +
    "&emailvalidmode=eq.inscription" +
    "&select=idmembre,nommembre,prenommembre,emailmembre,emailvalid,emailvalidmode,statuda,dateda,alias,tel,autoquali,autoloisir,autonouschoisir,checkboxvaleurs,targetfamill,iban,swift,rib" +
    "&limit=1";

  return premierResultat(env, url, "Lecture membres");
}

async function chercherDaActiveMembre(env, idmembre) {
  const supabaseUrl = nettoyerBaseUrl(env.SUPABASE_URL);

  const url =
    supabaseUrl +
    "/rest/v1/damembre" +
    "?idmembre=eq." + encodeURIComponent(idmembre) +
    "&active=eq.true" +
    "&select=idda,idmembre,dateda,active,daterefu,datenext" +
    "&order=dateda.desc" +
    "&limit=1";

  return premierResultat(env, url, "Lecture DA membre");
}

async function chercherParrainMembre(env, idmembre) {
  const supabaseUrl = nettoyerBaseUrl(env.SUPABASE_URL);

  const url =
    supabaseUrl +
    "/rest/v1/parrain" +
    "?idmembre=eq." + encodeURIComponent(idmembre) +
    "&select=idmembre,emailparrain,datemaj" +
    "&limit=1";

  return premierResultat(env, url, "Lecture parrain").catch(() => null);
}

async function desactiverDaActivesMembre(env, idmembre) {
  await patcher(
    env,
    "damembre",
    "idmembre=eq." + encodeURIComponent(idmembre) + "&active=eq.true",
    { active: false },
    false
  ).catch(() => null);
}

async function premierResultat(env, url, libelleErreur) {
  const lignes = await resultats(env, url, libelleErreur);
  return lignes[0] || null;
}

async function resultats(env, url, libelleErreur) {
  const response = await fetch(url, {
    method: "GET",
    headers: supabaseHeaders(env)
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error((libelleErreur || "Lecture Supabase") + " : " + messageErreurSupabase(data));
    error.status = response.status;
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

async function inserer(env, table, row) {
  const url = nettoyerBaseUrl(env.SUPABASE_URL) + "/rest/v1/" + table + "?select=*";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...supabaseHeaders(env),
      "Prefer": "return=representation"
    },
    body: JSON.stringify(row)
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(messageErreurSupabase(data));
    error.status = response.status;
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

async function patcher(env, table, filtre, row, retour = true) {
  const url = nettoyerBaseUrl(env.SUPABASE_URL) + "/rest/v1/" + table + "?" + filtre + (retour ? "&select=*" : "");

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      ...supabaseHeaders(env),
      "Prefer": retour ? "return=representation" : "return=minimal"
    },
    body: JSON.stringify(row)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const error = new Error(messageErreurSupabase(data));
    error.status = response.status;
    throw error;
  }

  if (!retour) return [];

  const data = await response.json().catch(() => null);
  return Array.isArray(data) ? data : [];
}

function verifierVariablesEnv(env) {
  const manquants = [];

  if (!env.SUPABASE_URL) manquants.push("SUPABASE_URL");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) manquants.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!env.SESSION_SECRET) manquants.push("SESSION_SECRET");

  if (manquants.length) {
    erreurHttp("Variables manquantes : " + manquants.join(", "), 500);
  }
}

function supabaseHeaders(env) {
  return {
    "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
    "Accept": "application/json",
    "Content-Type": "application/json"
  };
}

function construireCorsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigins = lireOriginesAutorisees(env);
  const headers = new Headers();

  if (allowedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie, Accept");
  headers.set("Vary", "Origin");

  return headers;
}

function origineAutorisee(request, env) {
  const origin = request.headers.get("Origin");

  if (!origin) return true;

  return lireOriginesAutorisees(env).includes(origin);
}

function lireOriginesAutorisees(env) {
  const valeur = env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(",");

  return String(valeur)
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function json(payload, status, headers) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders
  });
}

function lireCookies(cookieHeader) {
  const cookies = {};

  if (!cookieHeader) return cookies;

  cookieHeader.split(";").forEach((cookie) => {
    const [nom, ...valeur] = cookie.trim().split("=");

    if (!nom) return;

    cookies[nom] = decodeURIComponent(valeur.join("="));
  });

  return cookies;
}

function erreurHttp(message, status) {
  const error = new Error(message || "Erreur technique.");
  error.status = status || 400;
  throw error;
}

function messageErreurSupabase(data) {
  if (data && typeof data === "object") {
    return data.message || data.error || "Erreur Supabase.";
  }

  return "Erreur Supabase.";
}

function nettoyerBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function nettoyerTexte(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function valeurBooleenneVraie(valeur) {
  return valeur === true || valeur === "true" || valeur === 1 || valeur === "1";
}

function normaliserStatuda(value) {
  const statut = String(value || "").trim().toLowerCase();

  return ["encours", "oui", "non"].includes(statut) ? statut : null;
}

function dateDaAtteinte(value) {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  return date.getTime() <= Date.now();
}

function formaterDateDa(value) {
  if (!value) return "une date communiquée par le club";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

  return date.toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function normaliserTexteControle(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function construireUrlMotsInterditsDa(env) {
  const urlDirecte = String(env.MOTS_INTERDITS_DA_URL || env.LISTE_MOTS_INTERDITS_DA_URL || "").trim();
  if (urlDirecte) return urlDirecte;

  const base = nettoyerBaseUrl(env.SITE_PUBLIC_URL || env.PUBLIC_SITE_URL || env.PUBLIC_BASE_URL || "https://lacleduparc.fr");
  return base + "/OBJET/LISTE/mot-interdit.txt";
}

async function chargerMotsInterditsDa(env) {
  const url = construireUrlMotsInterditsDa(env);
  const maintenant = Date.now();

  if (cacheMotsInterditsDa.url === url && cacheMotsInterditsDa.expiration > maintenant) {
    return cacheMotsInterditsDa.liste;
  }

  let texte = "";

  try {
    const reponse = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { "Accept": "text/plain" }
    });

    if (reponse.ok) {
      texte = await reponse.text();
    }
  } catch (_error) {
    texte = "";
  }

  const liste = texte
    .split(/[\n,;|]+/g)
    .map((valeur) => String(valeur || "").trim())
    .filter((valeur) => valeur && !valeur.startsWith("#"));

  cacheMotsInterditsDa = {
    url,
    expiration: maintenant + DUREE_CACHE_MOTS_INTERDITS_MS,
    liste
  };

  return liste;
}

function normaliserRegleMotInterdit(value) {
  const source = String(value || "").trim();
  const prefixe = source.endsWith("*");
  const base = prefixe ? source.slice(0, -1) : source;
  const valeur = normaliserTexteControle(base);

  return { valeur, prefixe };
}

function texteContientRegleInterdite(value, regleSource) {
  const texteNormalise = normaliserTexteControle(value);
  if (!texteNormalise) return false;

  const regle = normaliserRegleMotInterdit(regleSource);
  if (!regle.valeur) return false;

  const motsTexte = texteNormalise.split(" ").filter(Boolean);

  if (regle.prefixe && !regle.valeur.includes(" ")) {
    return motsTexte.some((motTexte) => motTexte.startsWith(regle.valeur));
  }

  return (" " + motsTexte.join(" ") + " ").includes(" " + regle.valeur + " ");
}

async function contientMotInterditDa(valeurs, env) {
  const liste = await chargerMotsInterditsDa(env);
  if (!liste.length) return false;

  return (Array.isArray(valeurs) ? valeurs : [valeurs]).some((valeur) => {
    return liste.some((regle) => texteContientRegleInterdite(valeur, regle));
  });
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

  const signature = await crypto.subtle.sign("HMAC", cle, encodeur.encode(message));

  return base64Url(new Uint8Array(signature));
}

function comparaisonConstante(a, b) {
  const aa = String(a || "");
  const bb = String(b || "");

  if (aa.length !== bb.length) return false;

  let diff = 0;

  for (let i = 0; i < aa.length; i += 1) {
    diff |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  }

  return diff === 0;
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

function base64UrlDecodeString(value) {
  let base64 = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  while (base64.length % 4 !== 0) {
    base64 += "=";
  }

  return atob(base64);
}
