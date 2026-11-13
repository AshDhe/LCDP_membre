/*
 * La Clé du Parc — raccordement sécurisé « Invité / Invitant ».
 * EXTRAIT À FUSIONNER dans le Worker mon-compte-membre-api EXISTANT.
 * Ce fichier n'est PAS un Worker autonome et n'est PAS déployé.
 *
 * Ajouter dans fetch(), après la vérification globale de sécurité du compte :
 *
 *   if (request.method === "GET" && url.pathname === "/relations-invitations") {
 *     return afficherRelationsInvitationsMembre(request, env, corsHeaders);
 *   }
 *
 * Les dépendances ci-dessous EXISTENT dans le Worker connu du 11/11/2026 :
 * authentifierMembreCompte, chercherMembre, supabaseHeaders, jsonResponse,
 * dateIsoAujourdhuiParis.
 * La table public.parrain n'est jamais utilisée ici.
 */

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
