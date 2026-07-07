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
        { ok: false, message: "Origine non autorisée." },
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

    const url = new URL(request.url);

    if (request.method !== "POST" || url.pathname !== "/") {
      return jsonResponse(
        { ok: false, message: "Route inconnue." },
        404,
        corsHeaders
      );
    }

    try {
      verifierVariablesEnv(env);

      return await handleMajEmailMembre(request, env, corsHeaders);
    } catch (error) {
      return jsonResponse(
        { ok: false, message: "Erreur technique. Merci de réessayer." },
        500,
        corsHeaders
      );
    }
  }
};

function verifierVariablesEnv(env) {
  if (!env.SUPABASE_URL) {
    throw new Error("SUPABASE_URL manquant.");
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant.");
  }

  if (!env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET manquant.");
  }

  if (!env.W_EMAILTOKENZ) {
    throw new Error("W_EMAILTOKENZ manquant.");
  }

  if (!env.W_EMAILTOKENZ_URL) {
    throw new Error("W_EMAILTOKENZ_URL manquant.");
  }
}

async function handleMajEmailMembre(request, env, corsHeaders) {
  const data = await request.json().catch(() => null);

  if (!data) {
    return jsonResponse(
      { ok: false, message: "Requête invalide." },
      400,
      corsHeaders
    );
  }

  const nouveauEmail = nettoyerEmail(data.emailmembre);

  if (!nouveauEmail) {
    return jsonResponse(
      { ok: false, message: "Le nouveau mail est obligatoire." },
      400,
      corsHeaders
    );
  }

  if (!emailValide(nouveauEmail)) {
    return jsonResponse(
      { ok: false, message: "L’adresse e-mail saisie est invalide." },
      400,
      corsHeaders
    );
  }

  const session = await lireSessionMembreDepuisCookie(request, env);

  if (!session || !session.idmembre) {
    return jsonResponse(
      { ok: false, message: "Session membre inactive." },
      401,
      corsHeaders
    );
  }

  const membre = await selectMembreValideParId(env, session.idmembre);

  if (!membre) {
    return jsonResponse(
      { ok: false, message: "Compte membre introuvable." },
      404,
      corsHeaders
    );
  }

  const emailActuel = nettoyerEmail(membre.emailmembre);

  if (nouveauEmail === emailActuel) {
    return jsonResponse(
      { ok: false, message: "Ce mail est déjà celui de votre compte." },
      400,
      corsHeaders
    );
  }

  const emailDejaUtilise = await selectMembreValideParEmail(env, nouveauEmail);

  if (emailDejaUtilise && String(emailDejaUtilise.idmembre) !== String(membre.idmembre)) {
    return jsonResponse(
      { ok: false, message: "Cette adresse e-mail est déjà utilisée." },
      409,
      corsHeaders
    );
  }

  await demanderEmailValidationMajEmail(env, {
    idmembre: membre.idmembre,
    prenommembre: membre.prenommembre,
    emailmembre: nouveauEmail
  });

  return jsonResponse(
    {
      ok: true,
      message: "Un mail de validation a été envoyé. Votre e-mail actuel reste inchangé tant que votre nouvel e-mail n'est pas validé."
    },
    200,
    corsHeaders
  );
}

async function demanderEmailValidationMajEmail(env, payload) {
  const emailtokenzUrl = String(env.W_EMAILTOKENZ_URL || "").replace(/\/+$/, "");

  const response = await fetch(emailtokenzUrl + "/maj-email-membre", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.W_EMAILTOKENZ}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      idmembre: payload.idmembre,
      prenommembre: payload.prenommembre,
      emailmembre: payload.emailmembre
    })
  });

  const texte = await response.text();

  let resultat = null;

  try {
    resultat = JSON.parse(texte);
  } catch {
    resultat = null;
  }

  if (!response.ok || !resultat || resultat.ok !== true) {
    throw new Error("Erreur worker emailtokenz : " + texte);
  }

  return resultat;
}

async function lireSessionMembreDepuisCookie(request, env) {
  const cookies = lireCookies(request.headers.get("Cookie"));
  const sessionToken = cookies.idsession_membre;

  if (!sessionToken || !env.SESSION_SECRET) return null;

  const parties = sessionToken.split(".");

  if (parties.length !== 2) return null;

  const payloadEncode = parties[0];
  const signatureRecue = parties[1];

  const signatureAttendue = await signerHmacSha256(
    env.SESSION_SECRET,
    payloadEncode
  );

  if (signatureRecue !== signatureAttendue) return null;

  let payload;

  try {
    payload = JSON.parse(base64UrlDecodeToString(payloadEncode));
  } catch {
    return null;
  }

  if (payload.typ !== "session_membre") return null;

  const maintenant = Math.floor(Date.now() / 1000);

  if (!payload.exp || payload.exp < maintenant) return null;

  const session = await chercherSessionActive(env, payload.idsession);

  if (!session || !session.idmembre) return null;

  return session;
}

async function chercherSessionActive(env, idsession) {
  const url =
    env.SUPABASE_URL +
    "/rest/v1/sessactive" +
    "?idsession=eq." + encodeURIComponent(idsession) +
    "&select=idsession,idmembre" +
    "&limit=1";

  return premierResultat(env, url);
}

async function selectMembreValideParId(env, idmembre) {
  const url =
    env.SUPABASE_URL.replace(/\/+$/, "") +
    "/rest/v1/membres" +
    "?idmembre=eq." + encodeURIComponent(idmembre) +
    "&emailvalid=eq.true" +
    "&emailvalidmode=eq.inscription" +
    "&select=idmembre,prenommembre,emailmembre,emailvalid,emailvalidmode" +
    "&limit=1";

  return premierResultat(env, url);
}

async function selectMembreValideParEmail(env, emailmembre) {
  const url =
    env.SUPABASE_URL.replace(/\/+$/, "") +
    "/rest/v1/membres" +
    "?emailmembre=eq." + encodeURIComponent(emailmembre) +
    "&emailvalid=eq.true" +
    "&emailvalidmode=eq.inscription" +
    "&select=idmembre,emailmembre,emailvalid,emailvalidmode" +
    "&limit=1";

  return premierResultat(env, url);
}

async function premierResultat(env, url) {
  const response = await fetch(url, {
    method: "GET",
    headers: supabaseHeaders(env)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error("Lecture Supabase impossible : " + detail);
  }

  const data = await response.json().catch(() => null);

  if (!Array.isArray(data)) {
    return null;
  }

  return data[0] || null;
}

function supabaseHeaders(env) {
  return {
    "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
    "Accept": "application/json",
    "Content-Type": "application/json"
  };
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

function nettoyerEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function emailValide(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function construireCorsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigins = lireOriginesAutorisees(env);
  const headers = new Headers();

  if (allowedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
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

function jsonResponse(data, status, corsHeaders) {
  const headers = new Headers(corsHeaders);

  headers.set("Content-Type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(data), {
    status,
    headers
  });
}