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

    const url = new URL(request.url);

    if (
      request.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/compte")
    ) {
      return afficherCompteMembre(request, env, corsHeaders);
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

  if (!session || !session.idmembre) {
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
  const reglementApplication = await chercherReglement(env, "regleapp", idmembre);
  const reglementClub = await chercherReglement(env, "regleclub", idmembre);
  const abonnement = await chercherAbonnementActif(env, idmembre);

  const statut =
    abonnement && valeurBooleenneVraie(abonnement.aboactif)
      ? "Abonné"
      : "Invité";

  return jsonResponse(
    {
      ok: true,
      compte: {
        idmembre: membre.idmembre,
        nom: membre.nommembre,
        prenom: membre.prenommembre,
        email: membre.emailmembre,
        departement: membre.dptmtmembre,
        membreDepuis: membre.dateemailvalid || null,
        statut,
        parrain: parrain ? parrain.emailparrain : null,
        reglementApplication,
        reglementClub
      }
    },
    200,
    corsHeaders
  );
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

async function chercherMembre(env, idmembre) {
  const url =
    env.SUPABASE_URL +
    "/rest/v1/membres" +
    "?idmembre=eq." + encodeURIComponent(idmembre) +
    "&select=idmembre,nommembre,prenommembre,dptmtmembre,emailmembre,dateemailvalid" +
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

async function chercherAbonnementActif(env, idmembre) {
  const url =
    env.SUPABASE_URL +
    "/rest/v1/aboactif" +
    "?idmembre=eq." + encodeURIComponent(idmembre) +
    "&select=idmembre,aboactif" +
    "&limit=1";

  return premierResultat(env, url);
}

async function chercherReglement(env, table, idmembre) {
  const url =
    env.SUPABASE_URL +
    "/rest/v1/" + table +
    "?idmembre=eq." + encodeURIComponent(idmembre) +
    "&select=v1,datevalidv1,v2,datevalidv2" +
    "&limit=1";

  const reglement = await premierResultat(env, url);

  if (!reglement) return null;

  if (valeurBooleenneVraie(reglement.v2)) {
    return reglement.datevalidv2 || null;
  }

  if (valeurBooleenneVraie(reglement.v1)) {
    return reglement.datevalidv1 || null;
  }

  return null;
}

async function premierResultat(env, url) {
  const response = await fetch(url, {
    method: "GET",
    headers: supabaseHeaders(env)
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json().catch(() => null);

  if (!Array.isArray(data)) {
    return null;
  }

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

function valeurBooleenneVraie(valeur) {
  return valeur === true || valeur === "true" || valeur === 1 || valeur === "1";
}

function construireCorsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigins = lireOriginesAutorisees(env);
  const headers = new Headers();

  if (allowedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
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