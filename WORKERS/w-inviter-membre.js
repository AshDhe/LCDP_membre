export default {
  async fetch(request, env, ctx) {
    const corsHeaders = construireCorsHeaders(request, env);

    if (!origineAutorisee(request, env)) {
      return jsonResponse({ ok: false, message: "Origine non autorisée." }, 403, corsHeaders);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);

      // Historique des relations d'invitation du membre authentifié.
      if (request.method === "GET" && url.pathname.endsWith("/relations-invitations")) {
        verifierConfigurationBase(env, false);
        return await afficherRelationsInvitationsMembre(request, env, corsHeaders);
      }

      // Liens signés de consultation / annulation : aucune session requise.
      if (request.method === "GET" && url.pathname.endsWith("/invitation")) {
        verifierConfigurationBase(env, false);
        return handlePageInvitationEmail(url, env);
      }
      if (request.method === "POST" && url.pathname.endsWith("/invitation/annuler")) {
        verifierConfigurationBase(env, false);
        return handleAnnulerInvitationEmail(request, env);
      }

      // Invitants authentifiés : lecture du carnet puis enregistrement catégorisé.
      if (request.method === "GET" && url.pathname.endsWith("/invites-abonnement/contexte")) {
        verifierConfigurationBase(env, false);
        return await handleContexteInvitesAbonnement(request, env, corsHeaders, url);
      }
      if (request.method === "POST" && url.pathname.endsWith("/invites-abonnement")) {
        verifierConfigurationBase(env, false);
        return await handleEnregistrerInvitesAbonnement(request, env, corsHeaders);
      }

      if (request.method === "POST" && url.pathname.endsWith("/inviter-reservation")) {
        verifierConfigurationBase(env, false);
        return await handleInviterReservation(request, env, corsHeaders, ctx);
      }

      if (request.method === "GET" && url.pathname.endsWith("/reservations-invitables")) {
        verifierConfigurationBase(env, false);
        return await handleReservationsInvitables(request, env, corsHeaders);
      }

      if (request.method === "GET" && url.pathname.endsWith("/annulations")) {
        verifierConfigurationBase(env, false);
        return await handleListeAnnulations(request, env, corsHeaders, url);
      }

      if (request.method === "GET" && url.pathname.endsWith("/invites")) {
        verifierConfigurationBase(env, false);
        return await handleListeInvites(request, env, corsHeaders, url);
      }

      if (request.method === "POST" && url.pathname.endsWith("/invites")) {
        verifierConfigurationBase(env, false);
        return await handleMajInvites(request, env, corsHeaders, ctx);
      }

      return jsonResponse({ ok: false, message: "Route inconnue." }, 404, corsHeaders);
    } catch (error) {
      return jsonResponse(
        { ok: false, success: false, message: extraireMessageErreur(error) },
        error.status || 500,
        corsHeaders
      );
    }
  }
};

// Traitement DUO/FAMILLE : l'identité est toujours celle du cookie signé.
// Le PostgreSQL procède aux contrôles de privilèges et écrit toutes les tables
// dans la même transaction ; aucun quota n'est accepté depuis le navigateur.
async function rpcInvitesAbonnement(env, nom, argumentsRpc) {
  const reponse = await fetch(
    env.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/rpc/" + nom,
    {
      method: "POST",
      headers: supabaseHeaders(env),
      body: JSON.stringify(argumentsRpc)
    }
  );
  const data = await reponse.json().catch(() => null);
  if (!reponse.ok) {
    const erreur = new Error(String(data?.message || "Opération sur les invitations refusée.").slice(0, 240));
    erreur.status = reponse.status >= 500 ? 502 : 409;
    throw erreur;
  }
  return data;
}

async function handleEnregistrerInvitesAbonnement(request, env, corsHeaders) {
  const session = await recupererSessionObligatoire(request, env);
  const membreInvitant = await chercherMembreValideInscription(env, session.idmembre);
  if (!membreInvitant) {
    return jsonResponse({ ok: false, message: "Compte membre invalide." }, 401, corsHeaders);
  }
  const brute = await request.text();
  if (brute.length > 18000) {
    return jsonResponse({ ok: false, message: "Demande trop volumineuse." }, 413, corsHeaders);
  }
  let donnees;
  try { donnees = JSON.parse(brute); } catch (_erreur) { donnees = null; }
  const idflux = String(donnees?.idflux || "").trim();
  const selection = donnees?.selection;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idflux) ||
      !selection || typeof selection !== "object" || Array.isArray(selection) ||
      !["duo", "famille"].every(cat =>
        Array.isArray(selection[cat]?.existants) && Array.isArray(selection[cat]?.nouveaux) &&
        selection[cat].existants.length <= 100 && selection[cat].nouveaux.length <= 100)) {
    return jsonResponse({ ok: false, message: "Sélection d'invités invalide." }, 400, corsHeaders);
  }
  // Ne pas utiliser un quota dans le corps : la RPC le recalcule sur la commande payée.
  const resultat = await rpcInvitesAbonnement(env, "lcdp_enregistrer_invites_abonnement", {
    p_idflux: idflux,
    p_idmembre: session.idmembre,
    p_selection: selection
  });
  if (!resultat?.ok || !resultat?.confirme) {
    return jsonResponse({ ok: false, message: "Enregistrement non confirmé." }, 502, corsHeaders);
  }
  const source = await chercherReservationSource(env, { idflux, idmembre: session.idmembre });
  if (!source) {
    return jsonResponse({ ok: false, confirme: true,
      message: "Invitations enregistrées, vérification de l'envoi indisponible." }, 502, corsHeaders);
  }
  // Une annulation modifie les accès immédiatement et notifie l'invité.
  const annulationsEmails = Array.isArray(resultat.annulationsEmails) ? resultat.annulationsEmails : [];
  let annulationsNonNotifiees = 0;
  for (const email of annulationsEmails) {
    if (!emailValide(email)) continue;
    try {
      await envoyerNotificationAnnulation(env, {
        to: email,
        message: "Votre invitation pour un accès à La Clé du Parc a été annulée par la personne qui vous a invité(e)."
      });
    } catch (erreur) {
      annulationsNonNotifiees += 1;
      console.error("DUO/FAMILLE : notification annulation non confirmée :", erreur?.message || erreur);
    }
  }
  const envois = Array.isArray(resultat.envois) ? resultat.envois : [];
  let envoyes = 0;
  let enAttente = 0;
  for (const cible of envois) {
    if (!cible?.idinviteacces || !cible?.idmembre || !cible?.idfluxInvite || !emailValide(cible.email)) {
      enAttente += 1;
      continue;
    }
    const reclame = await rpcInvitesAbonnement(env, "lcdp_reclamer_envoi_invite", {
      p_idinviteacces: cible.idinviteacces,
      p_idmembre: session.idmembre
    });
    if (reclame !== true) continue; // traité dans une demande concurrente
    let succes = false;
    try {
      if (!env.RESEND_API_KEY) throw new Error("Service d'envoi e-mail non configuré.");
      const membreInvite = await premierResultat(env,
        env.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/membres" +
        "?idmembre=eq." + encodeURIComponent(cible.idmembre) +
        "&select=idmembre,emailmembre,prenommembre,nommembre,emailvalid&limit=1");
      if (!membreInvite || nettoyerEmail(membreInvite.emailmembre) !== nettoyerEmail(cible.email)) {
        throw new Error("Destinataire de l'invitation incohérent.");
      }
      await envoyerEmailInvitation(env, {
        invitant: membreInvitant,
        invite: membreInvite,
        reservationInvitee: { idflux: cible.idfluxInvite, idmembre: cible.idmembre },
        reservationSource: source,
        baseUrl: new URL(request.url).origin
      });
      succes = true;
      envoyes += 1;
    } catch (erreur) {
      enAttente += 1;
      console.error("DUO/FAMILLE : envoi non confirmé :", erreur?.message || erreur);
    } finally {
      try {
        await rpcInvitesAbonnement(env, "lcdp_marquer_envoi_invite", {
          p_idinviteacces: cible.idinviteacces,
          p_idmembre: session.idmembre,
          p_reussi: succes
        });
      } catch (erreur) {
        enAttente += 1;
        console.error("DUO/FAMILLE : statut d'envoi non confirmé :", erreur?.message || erreur);
      }
    }
  }
  const message = enAttente || annulationsNonNotifiees
    ? "Invitations enregistrées. Certains e-mails restent à envoyer : relance possible depuis le formulaire."
    : envoyes
      ? "Invitations enregistrées et e-mails transmis au service d'envoi."
      : "Liste des invités enregistrée.";
  return jsonResponse({
    ok: true, success: true, confirme: true, message,
    nbEnvois: envoyes, nbEnAttente: enAttente, annulationsNonNotifiees,
    contactsAjoutes: Number(resultat.contactsAjoutes || 0),
    annulations: Number(resultat.annulations || 0)
  }, 200, corsHeaders);
}

// Contrat d'affichage DUO/FAMILLE : lecture seule. Les anciennes routes
// restent inchangées tant que l'enregistrement transactionnel n'est pas prêt.
async function handleContexteInvitesAbonnement(request, env, corsHeaders, url) {
  const session = await recupererSessionObligatoire(request, env);
  const idflux = String(url.searchParams.get("idflux") || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idflux)) {
    return jsonResponse({ok:false,success:false,message:"Réservation invalide."},400,corsHeaders);
  }
  const source = await chercherReservationSource(env, {
    idflux, idmembre: session.idmembre
  });
  if (!source || source.invitation === true || !["bookd","chekd","full"].includes(source.statut)) {
    return jsonResponse({ok:false,success:false,message:"Accès personnel indisponible."},403,corsHeaders);
  }
  const dateAcces = dateParisPourInvitation(source.datebookd);
  if (!dateAcces) {
    return jsonResponse({ok:false,success:false,message:"Date de l'accès indisponible."},409,corsHeaders);
  }
  const abo = await determinerAbonnementInvitation(env, session.idmembre, dateAcces);
  // La sélection est libre à ce stade ; les quotas seront activés plus tard.

  const base = env.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/";
  const carnet = await resultats(env, base + "inviteabo?select=idinviteabo,categorie,email" +
    "&idabo=eq." + encodeURIComponent(abo.idabo) + "&order=datecreation.asc");
  const contacts = {duo:[],famille:[]};
  const idVersCategorie = new Map();
  for (const contact of carnet) {
    if (!["duo","famille"].includes(contact.categorie) ||
        !contact.idinviteabo || !emailValide(contact.email)) {
      throw erreurConfigurationInvitation("Carnet d'invités incohérent.");
    }
    contacts[contact.categorie].push({idinviteabo:contact.idinviteabo,email:contact.email});
    idVersCategorie.set(contact.idinviteabo,contact.categorie);
  }
  const selection = {duo:[],famille:[]};
  if (carnet.length) {
    const ids = carnet.map(c => c.idinviteabo);
    const lignes = await resultats(env,base+"inviteacces?select=idflux,idinviteabo,statut" +
      "&idinviteabo=in.(" + ids.map(encodeURIComponent).join(",") + ")");
    for (const ligne of lignes) {
      if (ligne.statut === "cancd" || ligne.idflux !== idflux) continue;
      const cat = idVersCategorie.get(ligne.idinviteabo);
      if (cat) selection[cat].push(ligne.idinviteabo);
    }
  }
  return jsonResponse({
    ok:true, success:true,
    idflux, idabo:abo.idabo, contacts, selection
  },200,corsHeaders);
}

function dateParisPourInvitation(value) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "";
  return dateIsoAujourdhuiParis(date);
}

function erreurConfigurationInvitation(message) {
  const erreur = new Error(message);
  erreur.status=409;
  return erreur;
}

async function determinerAbonnementInvitation(env,idmembre,dateAcces){
  const base=env.SUPABASE_URL.replace(/\/+$/, "")+"/rest/v1/";
  const lignes=await resultats(env,base+"abo?select=idabo,idmembre,idprixabo,orderid,typabo,debut,fin,statutabo"+
    "&idmembre=eq."+encodeURIComponent(idmembre)+"&statutabo=eq.paye");
  const candidats=lignes.filter(a =>
    dateParisPourInvitation(a.debut)<=dateAcces &&
    dateParisPourInvitation(a.fin)>=dateAcces
  );
  if(candidats.length!==1){
    throw erreurConfigurationInvitation(candidats.length?
      "Plusieurs abonnements couvrent cet accès : vérification nécessaire.":
      "Aucun abonnement payé ne couvre cet accès.");
  }
  if (!candidats[0].idprixabo) {
    throw erreurConfigurationInvitation("Tarif commandé indisponible.");
  }
  return candidats[0];
}


async function handleInviterReservation(request, env, corsHeaders, ctx) {
  const session = await recupererSessionObligatoire(request, env);
  const invitant = await chercherMembreValideInscription(env, session.idmembre);

  if (!invitant) {
    return jsonResponse({ ok: false, success: false, message: "Compte membre invalide." }, 401, corsHeaders);
  }

  const abonnement = await verifierAbonnementActifAujourdhui(env, session.idmembre);

  const body = await request.json().catch(() => null);

  if (!body) {
    return jsonResponse({ ok: false, success: false, message: "Requête invalide." }, 400, corsHeaders);
  }

  const idflux = String(body.idflux || "").trim();
  const emails = normaliserListeEmails(body.emails);
  const maxInvit = lireNbinvitAbonnement(abonnement);

  if (!idflux) {
    return jsonResponse({ ok: false, success: false, message: "Réservation source manquante." }, 400, corsHeaders);
  }

  if (maxInvit <= 0) {
    return jsonResponse({ ok: false, success: false, message: "Votre droit d'invitation n'est pas configuré." }, 403, corsHeaders);
  }

  if (!emails.length) {
    return jsonResponse({ ok: false, success: false, message: "Aucun e-mail invité renseigné." }, 400, corsHeaders);
  }

  const reservationSource = await chercherReservationSource(env, {
    idflux,
    idmembre: session.idmembre
  });

  if (!reservationSource) {
    return jsonResponse({ ok: false, success: false, message: "Réservation source introuvable." }, 404, corsHeaders);
  }

  if (reservationSource.statut === "cancd") {
    return jsonResponse({ ok: false, success: false, message: "Cette réservation est annulée." }, 409, corsHeaders);
  }

  const nbActifsAvant = await compterInvitesActifsInvitation(env, reservationSource.idflux);
  const placesDisponibles = Math.max(0, maxInvit - nbActifsAvant);

  const traitement = await traiterEmailsInvitation(env, {
    emails,
    invitant,
    reservationSource,
    placesDisponibles
  });

  if (!traitement.invitations.length) {
    return jsonResponse(
      {
        ok: false,
        success: false,
        message: "Aucune adresse mail valide pour utiliser la fonction Inviter.",
        emailsInvalides: traitement.emailsInvalides
      },
      409,
      corsHeaders
    );
  }

  planifierEmailsInvitation(ctx, env, {
    invitant,
    invitations: traitement.invitations,
    reservationSource,
    baseUrl: new URL(request.url).origin
  });

  const stats = await calculerStatsInvitation(env, reservationSource.idflux);
  const traitementPartiel = traitement.emailsInvalides.length > 0;
  const message = traitementPartiel
    ? "Tous les emails renseignés ne sont pas valides pour être invités. L'invitation a été envoyée aux adresses mails valides."
    : "L'invitation a été envoyée à tous les invités.";

  return jsonResponse({
    ok: true,
    success: true,
    partiel: traitementPartiel,
    message,
    nbInvitations: traitement.invitations.length,
    nbInvitesActifs: stats.in,
    nbInvitesAnnules: stats.out,
    emailsValides: traitement.invitations.map((item) => item.email),
    emailsInvalides: traitement.emailsInvalides,
    invitations: traitement.invitations.map((item) => ({
      idflux: reservationSource.idflux,
      idfluxInvite: item.reservation.idflux,
      idmembre: item.membre.idmembre,
      emailmembre: item.membre.emailmembre,
      invit: "true",
      dateinvit: item.invitation.dateinvit,
      datecancd: item.invitation.datecancd || null,
      source: item.invitation.source || null
    }))
  }, 200, corsHeaders);
}

async function handleReservationsInvitables(request, env, corsHeaders) {
  const session = await recupererSessionObligatoire(request, env);
  const invitant = await chercherMembreValideInscription(env, session.idmembre);

  if (!invitant) {
    return jsonResponse({ ok: false, success: false, message: "Compte membre invalide." }, 401, corsHeaders);
  }

  const abonnement = await verifierAbonnementActifAujourdhui(env, session.idmembre);

  const reservations = await recupererReservationsInvitables(env, session.idmembre);
  const maxInvit = lireNbinvitAbonnement(abonnement);

  return jsonResponse({ ok: true, success: true, reservations, maxInvit }, 200, corsHeaders);
}

async function handleListeAnnulations(request, env, corsHeaders, url) {
  const session = await recupererSessionObligatoire(request, env);
  await verifierAbonnementActifAujourdhui(env, session.idmembre);
  const idflux = String(url.searchParams.get("idflux") || "").trim();

  if (!idflux) {
    return jsonResponse({ ok: false, message: "Réservation source manquante." }, 400, corsHeaders);
  }

  const source = await chercherReservationSource(env, {
    idflux,
    idmembre: session.idmembre
  });

  if (!source) {
    return jsonResponse({ ok: false, message: "Réservation source introuvable." }, 404, corsHeaders);
  }

  const annulations = await recupererAnnulationsInvitation(env, {
    idflux: source.idflux
  });

  return jsonResponse({ ok: true, success: true, annulations }, 200, corsHeaders);
}

async function handleListeInvites(request, env, corsHeaders, url) {
  const session = await recupererSessionObligatoire(request, env);
  const idflux = String(url.searchParams.get("idflux") || "").trim();

  if (!idflux) {
    return jsonResponse({ ok: false, success: false, message: "Réservation source manquante." }, 400, corsHeaders);
  }

  const source = await chercherReservationSource(env, {
    idflux,
    idmembre: session.idmembre
  });

  if (!source) {
    return jsonResponse({ ok: false, success: false, message: "Réservation source introuvable." }, 404, corsHeaders);
  }

  const invites = await recupererInvitesInvitation(env, {
    idflux: source.idflux
  });

  return jsonResponse({ ok: true, success: true, invites }, 200, corsHeaders);
}

async function handleMajInvites(request, env, corsHeaders, ctx) {
  const session = await recupererSessionObligatoire(request, env);
  const invitant = await chercherMembreValideInscription(env, session.idmembre);

  if (!invitant) {
    return jsonResponse({ ok: false, success: false, message: "Compte membre invalide." }, 401, corsHeaders);
  }

  const abonnement = await verifierAbonnementActifAujourdhui(env, session.idmembre);

  const body = await request.json().catch(() => null);

  if (!body) {
    return jsonResponse({ ok: false, success: false, message: "Requête invalide." }, 400, corsHeaders);
  }

  const idflux = String(body.idflux || "").trim();
  const invitesDemandes = Array.isArray(body.invites) ? body.invites : [];
  const emails = normaliserListeEmails(body.emails);

  if (!idflux) {
    return jsonResponse({ ok: false, success: false, message: "Réservation source manquante." }, 400, corsHeaders);
  }

  if (!invitesDemandes.length && !emails.length) {
    return jsonResponse({ ok: false, success: false, message: "Aucun invité à mettre à jour." }, 400, corsHeaders);
  }

  const source = await chercherReservationSource(env, {
    idflux,
    idmembre: session.idmembre
  });

  if (!source) {
    return jsonResponse({ ok: false, success: false, message: "Réservation source introuvable." }, 404, corsHeaders);
  }

  if (delaiAnnulationInvitationDepasse(source.datebookd) &&
      invitesDemandes.some(item => normaliserStatutInvitationDemande(item?.invit) === "cancd")) {
    return jsonResponse({ok:false,success:false,message:"Annulation impossible après 14h"},409,corsHeaders);
  }

  const lignes = await recupererLignesInvitation(env, { idflux: source.idflux });
  const lignesParMembre = new Map();

  lignes.forEach((ligne) => {
    const idmembre = String(ligne.idmembre || "").trim();
    if (idmembre) lignesParMembre.set(idmembre, ligne);
  });

  const dateMaj = new Date().toISOString();
  let nbMaj = 0;
  const annulationsEmail = [];

  for (const item of invitesDemandes) {
    const idmembre = String(item && item.idmembre ? item.idmembre : "").trim();
    const ligneExistante = lignesParMembre.get(idmembre);
    const statutDemande = normaliserStatutInvitationDemande(item && item.invit);

    if (!idmembre || !ligneExistante || !statutDemande) continue;
    if (normaliserTexteTechnique(ligneExistante.invit) === statutDemande) continue;

    const row = statutDemande === "cancd"
      ? { invit: "cancd", datecancd: dateMaj, source: "parrain" }
      : { invit: "true", datecancd: null, source: null };

    await patcher(
      env,
      "invitation",
      "idflux=eq." + encodeURIComponent(source.idflux) + "&idmembre=eq." + encodeURIComponent(idmembre),
      row,
      "idflux,idmembre,invit,dateinvit,datecancd,source"
    );

    await synchroniserFluxInvitationParrain(env, {
      reservationSource: source,
      invitant,
      idmembreInvite: idmembre,
      statut: statutDemande,
      dateMaj
    });

    if (statutDemande === "cancd") annulationsEmail.push(idmembre);
    nbMaj += 1;
  }

  if (annulationsEmail.length) {
    const membres = await chercherMembresPourNotification(env, annulationsEmail);
    const promesse = Promise.all(membres.map(m => envoyerNotificationAnnulation(env, {
      to: m.emailmembre,
      message: "Votre invitation pour un accès à La Clé du Parc a été annulée par la personne qui vous a invité(e)."
    }))).catch(err => console.error("E-mails annulation invitation :", err));
    if (ctx?.waitUntil) ctx.waitUntil(promesse);
  }

  const maxInvit = lireNbinvitAbonnement(abonnement);
  const nbActifsApresMaj = await compterInvitesActifsInvitation(env, source.idflux);
  const placesDisponibles = Math.max(0, maxInvit - nbActifsApresMaj);
  const traitement = emails.length
    ? await traiterEmailsInvitation(env, {
        emails,
        invitant,
        reservationSource: source,
        placesDisponibles
      })
    : { invitations: [], emailsInvalides: [] };

  planifierEmailsInvitation(ctx, env, {
    invitant,
    invitations: traitement.invitations,
    reservationSource: source,
    baseUrl: new URL(request.url).origin
  });

  const stats = await calculerStatsInvitation(env, source.idflux);
  const invites = await recupererInvitesInvitation(env, { idflux: source.idflux }, true);
  const nbAjouts = traitement.invitations.length;

  if (!nbMaj && !nbAjouts) {
    return jsonResponse({ok:true,success:true,message:"Aucune modification de la liste des invités.",
      nbMaj:0,nbAjouts:0,nbInvitesActifs:stats.in,nbInvitesAnnules:stats.out,
      emailsInvalides:traitement.emailsInvalides,invites},200,corsHeaders);
  }

  let message = "Liste des invités mise à jour.";

  if (emails.length && traitement.emailsInvalides.length && traitement.invitations.length) {
    message = "Tous les emails renseignés ne sont pas valides pour être invités. L'invitation a été envoyée aux adresses mails valides.";
  } else if (emails.length && traitement.invitations.length && !traitement.emailsInvalides.length) {
    message = "L'invitation a été envoyée à tous les invités.";
  } else if (emails.length && !traitement.invitations.length && traitement.emailsInvalides.length && nbMaj) {
    message = "Liste des invités mise à jour. Aucune nouvelle adresse mail valide pour utiliser la fonction Inviter.";
  }

  return jsonResponse({
    ok: true,
    success: true,
    message,
    nbMaj,
    nbAjouts,
    nbInvitesActifs: stats.in,
    nbInvitesAnnules: stats.out,
    emailsValides: traitement.invitations.map((item) => item.email),
    emailsInvalides: traitement.emailsInvalides,
    invites
  }, 200, corsHeaders);
}

async function recupererSessionObligatoire(request, env) {
  const session = await lireSessionMembreDepuisCookie(request, env);

  if (!session || !session.idmembre) {
    const error = new Error("Session membre inactive.");
    error.status = 401;
    throw error;
  }

  return session;
}

async function verifierAbonnementActifAujourdhui(env, idmembre) {
  const abonnement = await chercherAbonnementActifAujourdhui(env, idmembre);

  if (!abonnement) {
    const error = new Error("Vous devez être membre abonné pour inviter.");
    error.status = 403;
    throw error;
  }

  if (String(abonnement.statutabo || "").trim().toLowerCase() === "impaye") {
    const error = new Error("Votre abonnement est suspendu (impayé). Vous devez régulariser votre abonnement avant de pouvoir utiliser la fonction Inviter.");
    error.status = 403;
    throw error;
  }

  return abonnement;
}

async function chercherAbonnementActifAujourdhui(env, idmembre) {
  const aujourdHui = dateIsoAujourdhuiParis();
  const url =
    env.SUPABASE_URL.replace(/\/+$/, "") +
    "/rest/v1/abo" +
    "?idmembre=eq." + encodeURIComponent(idmembre) +
    "&debut=lte." + encodeURIComponent(aujourdHui) +
    "&fin=gte." + encodeURIComponent(aujourdHui) +
    "&statutabo=neq.cancd" +
    "&select=idabo,idmembre,debut,fin,statutabo,nbinvit" +
    "&limit=1";

  return premierResultat(env, url);
}

async function traiterEmailsInvitation(env, data) {
  const emails = normaliserListeEmails(data.emails);
  const placesDisponibles = Math.max(0, Number(data.placesDisponibles || 0));
  const invitations = [];
  const emailsInvalides = [];

  if (placesDisponibles <= 0) {
    return { invitations, emailsInvalides: emails };
  }

  for (const email of emails) {
    if (invitations.length >= placesDisponibles) {
      emailsInvalides.push(email);
      continue;
    }

    if (!emailValide(email)) {
      emailsInvalides.push(email);
      continue;
    }

    if (email === nettoyerEmail(data.invitant.emailmembre)) {
      emailsInvalides.push(email);
      continue;
    }

    const membreInvite = await chercherOuCreerMembreInvitation(env, email);

    if (!membreInvite) {
      emailsInvalides.push(email);
      continue;
    }
    // Aucune validation de compte ni relation permanente de parrainage exigée.
    // L'adresse est simplement saisie par l'invitant ; emailValide contrôle la syntaxe. 

    const ligneInvitation = await chercherLigneInvitationMembre(env, {
      idflux: data.reservationSource.idflux,
      idmembre: membreInvite.idmembre
    });

    if (normaliserTexteTechnique(ligneInvitation && ligneInvitation.invit) === "true") {
      emailsInvalides.push(email);
      continue;
    }

    const reservationInvitee = await chercherReservationInviteeExistante(env, {
      reservationSource: data.reservationSource,
      idmembreInvite: membreInvite.idmembre,
      idmembreParrain: data.invitant.idmembre
    });

    if (!ligneInvitation && reservationInvitee && normaliserTexteTechnique(reservationInvitee.statut) !== "cancd") {
      emailsInvalides.push(email);
      continue;
    }


    const invitationCreee = await creerOuReactiverInvitationPourMembre(env, {
      reservationSource: data.reservationSource,
      invitant: data.invitant,
      membreInvite,
      ligneInvitation,
      reservationInvitee
    });

    invitations.push({
      email,
      membre: membreInvite,
      reservation: invitationCreee.reservation,
      invitation: invitationCreee.invitation
    });
  }

  return { invitations, emailsInvalides };
}

async function creerOuReactiverInvitationPourMembre(env, data) {
  const reservation = await creerOuReactiverReservationInvitee(env, data);
  const dateInvitation = new Date().toISOString();
  let ligne = data.ligneInvitation || await chercherLigneInvitationMembre(env, {
    idflux: data.reservationSource.idflux,
    idmembre: data.membreInvite.idmembre
  });

  if (ligne) {
    const statut = normaliserTexteTechnique(ligne.invit);

    if (statut === "cancd") {
      ligne = await patcher(
        env,
        "invitation",
        "idflux=eq." + encodeURIComponent(data.reservationSource.idflux) + "&idmembre=eq." + encodeURIComponent(data.membreInvite.idmembre),
        { invit: "true", datecancd: null, source: null },
        "idflux,idmembre,invit,dateinvit,datecancd,source"
      ) || {
        ...ligne,
        invit: "true",
        datecancd: null,
        source: null
      };
    }

    return { reservation, invitation: ligne };
  }

  ligne = await inserer(env, "invitation", {
    idflux: data.reservationSource.idflux,
    idmembre: data.membreInvite.idmembre,
    invit: "true",
    dateinvit: dateInvitation,
    datecancd: null,
    source: null
  }, true);

  return { reservation, invitation: ligne || {
    idflux: data.reservationSource.idflux,
    idmembre: data.membreInvite.idmembre,
    invit: "true",
    dateinvit: dateInvitation,
    datecancd: null,
    source: null
  } };
}

async function creerOuReactiverReservationInvitee(env, data) {
  const existante = data.reservationInvitee || await chercherReservationInviteeExistante(env, {
    reservationSource: data.reservationSource,
    idmembreInvite: data.membreInvite.idmembre,
    idmembreParrain: data.invitant.idmembre
  });

  if (existante) {
    if (normaliserTexteTechnique(existante.statut) === "cancd") {
      return patcher(
        env,
        "fluxm",
        "idflux=eq." + encodeURIComponent(existante.idflux),
        { statut: "bookd", datecancd: null },
        "idflux,idmembre,idparc,idparrain,invitation,dateflux,datebookd,plagebookd,statut,datecancd"
      ) || existante;
    }

    return existante;
  }

  return inserer(env, "fluxm", {
    idmembre: data.membreInvite.idmembre,
    invitation: true,
    idparrain: data.invitant.idmembre,
    idfluxparrain: data.reservationSource.idflux,
    idparc: data.reservationSource.idparc,
    datebookd: data.reservationSource.datebookd,
    plagebookd: data.reservationSource.plagebookd,
    statut: "bookd",
    datecancd: null
  }, true);
}

async function synchroniserFluxInvitationParrain(env, data) {
  const reservationInvitee = await chercherReservationInviteeExistante(env, {
    reservationSource: data.reservationSource,
    idmembreInvite: data.idmembreInvite,
    idmembreParrain: data.invitant.idmembre
  });

  if (data.statut === "cancd") {
    if (!reservationInvitee) return null;

    return patcher(
      env,
      "fluxm",
      "idflux=eq." + encodeURIComponent(reservationInvitee.idflux),
      { statut: "cancd", datecancd: data.dateMaj },
      "idflux,idmembre,idparc,idparrain,invitation,dateflux,datebookd,plagebookd,statut,datecancd"
    );
  }

  if (reservationInvitee) {
    return patcher(
      env,
      "fluxm",
      "idflux=eq." + encodeURIComponent(reservationInvitee.idflux),
      { statut: "bookd", datecancd: null },
      "idflux,idmembre,idparc,idparrain,invitation,dateflux,datebookd,plagebookd,statut,datecancd"
    );
  }

  return inserer(env, "fluxm", {
    idmembre: data.idmembreInvite,
    invitation: true,
    idparrain: data.invitant.idmembre,
    idparc: data.reservationSource.idparc,
    datebookd: data.reservationSource.datebookd,
    plagebookd: data.reservationSource.plagebookd,
    statut: "bookd",
    datecancd: null
  }, true);
}

async function chercherLigneInvitationMembre(env, data) {
  const url =
    env.SUPABASE_URL.replace(/\/$/, "") +
    "/rest/v1/invitation" +
    "?idflux=eq." + encodeURIComponent(data.idflux || "") +
    "&idmembre=eq." + encodeURIComponent(data.idmembre || "") +
    "&select=idflux,idmembre,invit,dateinvit,datecancd,source" +
    "&limit=1";

  return premierResultat(env, url);
}

async function chercherReservationInviteeExistante(env, data) {
  const source = data.reservationSource;
  const url =
    env.SUPABASE_URL.replace(/\/$/, "") +
    "/rest/v1/fluxm" +
    "?idmembre=eq." + encodeURIComponent(data.idmembreInvite || "") +
    "&idparrain=eq." + encodeURIComponent(data.idmembreParrain || "") +
    "&idparc=eq." + encodeURIComponent(source.idparc) +
    "&datebookd=eq." + encodeURIComponent(source.datebookd) +
    "&plagebookd=eq." + encodeURIComponent(source.plagebookd) +
    "&invitation=eq.true" +
    "&select=idflux,idmembre,idparc,idparrain,invitation,dateflux,datebookd,plagebookd,statut,datecancd" +
    "&order=dateflux.desc.nullslast" +
    "&limit=1";

  return premierResultat(env, url);
}

async function compterInvitesActifsInvitation(env, idflux) {
  const lignes = await resultats(
    env,
    env.SUPABASE_URL.replace(/\/$/, "") +
      "/rest/v1/invitation" +
      "?idflux=eq." + encodeURIComponent(idflux || "") +
      "&invit=eq.true" +
      "&select=idmembre"
  );

  return lignes.length;
}

async function calculerStatsInvitation(env, idflux) {
  const lignes = await recupererLignesInvitation(env, { idflux });
  const stats = { in: 0, out: 0 };

  lignes.forEach((ligne) => {
    const statut = normaliserTexteTechnique(ligne.invit);

    if (statut === "true") stats.in += 1;
    if (statut === "cancd") stats.out += 1;
  });

  return stats;
}

function delaiAnnulationInvitationDepasse(datebookd) {
  const d = new Date(datebookd || "");
  if (Number.isNaN(d.getTime())) return true;
  const p = partiesDateHeureParis(d);
  const limite = timestampUtcPourHeureParis(p.annee, p.mois, p.jour - 1, 14, 0, 0);
  return Date.now() >= limite;
}

function normaliserListeEmails(value) {
  const source = Array.isArray(value) ? value : [value];

  return [
    ...new Set(
      source
        .map(nettoyerEmail)
        .filter(Boolean)
    )
  ];
}

function lireNbinvitAbonnement(abonnement) {
  const valeur = Number.parseInt(abonnement && abonnement.nbinvit != null ? String(abonnement.nbinvit) : "0", 10);

  if (!Number.isFinite(valeur) || valeur <= 0) return 0;

  return Math.min(valeur, 10);
}

async function chercherReservationSource(env, data) {
  const url =
    env.SUPABASE_URL.replace(/\/$/, "") +
    "/rest/v1/fluxm" +
    "?idflux=eq." + encodeURIComponent(data.idflux) +
    "&idmembre=eq." + encodeURIComponent(data.idmembre) +
    "&select=idflux,idmembre,idparc,idparrain,invitation,dateflux,datebookd,plagebookd,statut" +
    "&limit=1";

  return premierResultat(env, url);
}

async function chercherMembreParEmailValideInscription(env, email) {
  const url =
    env.SUPABASE_URL.replace(/\/$/, "") +
    "/rest/v1/membres" +
    "?emailmembre=eq." + encodeURIComponent(email) +
    "&emailvalid=eq.true" +
    "&emailvalidmode=eq.inscription" +
    "&select=idmembre,nommembre,prenommembre,emailmembre,emailvalid,emailvalidmode" +
    "&order=dateemailvalid.desc.nullslast,datecreation.desc" +
    "&limit=1";

  return premierResultat(env, url);
}

async function chercherOuCreerMembreInvitation(env, email) {
  const adresse = nettoyerEmail(email);
  // Priorité aux comptes existants validés, puis aux fiches préexistantes.
  // Une fiche non validée peut déjà venir d'une liste d'attente ou d'une invitation.
  const base = env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/membres";
  const url = base + "?emailmembre=ilike." + encodeURIComponent(adresse) +
    "&select=idmembre,nommembre,prenommembre,emailmembre,emailvalid,emailvalidmode" +
    "&order=emailvalid.desc,datecreation.desc&limit=20";
  const lignes = await resultats(env, url);
  const existante = lignes.find(x => nettoyerEmail(x.emailmembre) === adresse);
  if (existante) return existante;
  try {
    return await inserer(env, "membres", {
      emailmembre: adresse, emailvalid: false, emailvalidmode: "invitation"
    }, true);
  } catch (erreur) {
    // Relecture en cas d'invitations simultanées pour la même adresse.
    const concurrentes = await resultats(env, url);
    const creee = concurrentes.find(x => nettoyerEmail(x.emailmembre) === adresse);
    if (creee) return creee;
    throw erreur;
  }
}

async function verifierParrainDeclare(env, data) {
  const url =
    env.SUPABASE_URL.replace(/\/$/, "") +
    "/rest/v1/parrain" +
    "?idmembre=eq." + encodeURIComponent(data.idmembreInvite) +
    "&select=idmembre,emailparrain,idparrain,datemaj" +
    "&order=datemaj.desc" +
    "&limit=1";

  const ligne = await premierResultat(env, url);

  if (!ligne) return false;

  if (ligne.idparrain && String(ligne.idparrain) === String(data.idmembreParrain)) {
    return true;
  }

  return nettoyerEmail(ligne.emailparrain) === nettoyerEmail(data.emailParrain);
}

async function chercherReservationActiveIdentique(env, data) {
  const url =
    env.SUPABASE_URL.replace(/\/$/, "") +
    "/rest/v1/fluxm" +
    "?idmembre=eq." + encodeURIComponent(data.idmembre) +
    "&idparc=eq." + encodeURIComponent(data.idparc) +
    "&datebookd=eq." + encodeURIComponent(data.datebookd) +
    "&plagebookd=eq." + encodeURIComponent(data.plagebookd) +
    "&statut=neq.cancd" +
    "&select=idflux,idmembre,idparc,datebookd,plagebookd,statut" +
    "&limit=1";

  return premierResultat(env, url);
}

async function recupererReservationsInvitables(env, idmembre) {
  const urlFlux =
    env.SUPABASE_URL.replace(/\/$/, "") +
    "/rest/v1/fluxm" +
    "?idmembre=eq." + encodeURIComponent(idmembre) +
    "&statut=neq.cancd" +
    "&select=idflux,idmembre,idparc,idparrain,invitation,dateflux,datebookd,plagebookd,statut" +
    "&order=datebookd.asc";

  const flux = await resultats(env, urlFlux);

  if (!flux.length) return [];

  const idsParcs = [...new Set(flux.map((item) => item.idparc).filter(Boolean))];
  const idsFlux = [...new Set(flux.map((item) => item.idflux).filter(Boolean))];

  const parcsParId = new Map();
  const statsParFlux = new Map();

  if (idsParcs.length) {
    const parcs = await resultats(
      env,
      env.SUPABASE_URL.replace(/\/$/, "") +
        "/rest/v1/parcs" +
        "?idparc=in.(" + idsParcs.map(encodeURIComponent).join(",") + ")" +
        "&select=idparc,nom,dptmt"
    );

    parcs.forEach((parc) => parcsParId.set(String(parc.idparc), parc));
  }

  if (idsFlux.length) {
    const lignes = await resultats(
      env,
      env.SUPABASE_URL.replace(/\/$/, "") +
        "/rest/v1/invitation" +
        "?idflux=in.(" + idsFlux.map(encodeURIComponent).join(",") + ")" +
        "&select=idflux,idmembre,invit,dateinvit,datecancd,source"
    );

    lignes.forEach((ligne) => {
      const key = String(ligne.idflux);
      const actuel = statsParFlux.get(key) || { in: 0, out: 0 };
      const statutInvitation = normaliserTexteTechnique(ligne.invit);

      if (statutInvitation === "true") {
        actuel.in += 1;
      }

      if (statutInvitation === "cancd") {
        actuel.out += 1;
      }

      statsParFlux.set(key, actuel);
    });
  }

  return flux.map((item) => ({
    ...item,
    parc: parcsParId.get(String(item.idparc)) || null,
    invitationStats: statsParFlux.get(String(item.idflux)) || { in: 0, out: 0 }
  }));
}

async function recupererAnnulationsInvitation(env, data) {
  const lignes = await resultats(
    env,
    env.SUPABASE_URL.replace(/\/$/, "") +
      "/rest/v1/invitation" +
      "?idflux=eq." + encodeURIComponent(data.idflux || "") +
      "&invit=eq.cancd" +
      "&select=idflux,idmembre,invit,dateinvit,datecancd,source"
  );

  if (!lignes.length) return [];

  const idsMembres = [...new Set(lignes.map((item) => item.idmembre).filter(Boolean))];

  const membres = idsMembres.length
    ? await resultats(
        env,
        env.SUPABASE_URL.replace(/\/$/, "") +
          "/rest/v1/membres" +
          "?idmembre=in.(" + idsMembres.map(encodeURIComponent).join(",") + ")" +
          "&select=idmembre,emailmembre,nommembre,prenommembre"
      )
    : [];

  const membresParId = new Map();

  membres.forEach((membre) => {
    membresParId.set(String(membre.idmembre), membre);
  });

  return lignes.map((item) => {
    const membre = membresParId.get(String(item.idmembre)) || null;

    return {
      idflux: item.idflux,
      idmembre: item.idmembre,
      invit: item.invit,
      dateinvit: item.dateinvit,
      datecancd: item.datecancd,
      source: item.source || null,
      emailmembre: membre ? membre.emailmembre : "",
      nommembre: membre ? membre.nommembre : "",
      prenommembre: membre ? membre.prenommembre : ""
    };
  });
}

async function recupererLignesInvitation(env, data) {
  return resultats(
    env,
    env.SUPABASE_URL.replace(/\/$/, "") +
      "/rest/v1/invitation" +
      "?idflux=eq." + encodeURIComponent(data.idflux || "") +
      "&select=idflux,idmembre,invit,dateinvit,datecancd,source"
  );
}

function normaliserStatutInvitationDemande(value) {
  const statut = normaliserTexteTechnique(value);

  if (statut === "true" || statut === "oui" || statut === "on" || statut === "1") return "true";
  if (statut === "cancd" || statut === "cancelled" || statut === "annule" || statut === "annulé" || statut === "false" || statut === "non" || statut === "off" || statut === "0") return "cancd";

  return "";
}

async function recupererInvitesInvitation(env, data, actifsSeulement = true) {
  const filtreStatut = actifsSeulement ? "&invit=eq.true" : "";
  const lignes = await resultats(
    env,
    env.SUPABASE_URL.replace(/\/$/, "") +
      "/rest/v1/invitation" +
      "?idflux=eq." + encodeURIComponent(data.idflux || "") +
      filtreStatut +
      "&select=idflux,idmembre,invit,dateinvit,datecancd,source" +
      "&order=dateinvit.asc"
  );

  if (!lignes.length) return [];

  const idsMembres = [...new Set(lignes.map((item) => item.idmembre).filter(Boolean))];

  const membres = idsMembres.length
    ? await resultats(
        env,
        env.SUPABASE_URL.replace(/\/$/, "") +
          "/rest/v1/membres" +
          "?idmembre=in.(" + idsMembres.map(encodeURIComponent).join(",") + ")" +
          "&select=idmembre,emailmembre,nommembre,prenommembre"
      )
    : [];

  const membresParId = new Map();

  membres.forEach((membre) => {
    membresParId.set(String(membre.idmembre), membre);
  });

  return lignes.map((item) => {
    const membre = membresParId.get(String(item.idmembre)) || null;

    return {
      idflux: item.idflux,
      idmembre: item.idmembre,
      invit: item.invit,
      dateinvit: item.dateinvit,
      datecancd: item.datecancd,
      source: item.source || null,
      emailmembre: membre ? membre.emailmembre : "",
      nommembre: membre ? membre.nommembre : "",
      prenommembre: membre ? membre.prenommembre : ""
    };
  });
}

async function chercherMembresPourNotification(env, ids) {
  if (!ids.length) return [];
  return resultats(env, env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/membres" +
    "?idmembre=in.(" + ids.map(encodeURIComponent).join(",") + ")" +
    "&select=idmembre,emailmembre,prenommembre");
}

async function envoyerNotificationAnnulation(env, {to, message}) {
  if (!to) return;
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY manquant.");
  const reponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json"},
    body: JSON.stringify({
      from: env.RESEND_FROM || "La Clé du Parc <noreply@lacleduparc.fr>",
      to: [to], subject: "La Clé du Parc | Annulation d'invitation",
      text: "Bonjour,\n\n" + message + "\n\nL'équipe La Clé du Parc."
    })
  });
  if (!reponse.ok) throw new Error("Resend annulation " + reponse.status);
}

function planifierEmailsInvitation(ctx, env, data) {
  const invitations = Array.isArray(data?.invitations) ? data.invitations : [];

  if (!invitations.length) return;

  const promesse = envoyerEmailsInvitationValides(env, data).catch((error) => {
    console.error("Erreur envoi e-mail invitation :", error);
  });

  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(promesse);
    return;
  }

  promesse.catch(() => {});
}

async function envoyerEmailsInvitationValides(env, data) {
  const invitations = Array.isArray(data?.invitations) ? data.invitations : [];

  if (!invitations.length) return;

  if (!env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY manquant : e-mails invitation non envoyés.");
    return;
  }

  await Promise.all(invitations.map(async (item) => {
    try {
      await envoyerEmailInvitation(env, {
        invitant: data.invitant,
        invite: item.membre,
        reservationInvitee: item.reservation,
        baseUrl: data.baseUrl,
        reservationSource: data.reservationSource
      });
    } catch (error) {
      console.error("Erreur e-mail invitation " + String(item.email || item.membre?.emailmembre || "") + " :", error);
    }
  }));
}

async function envoyerEmailInvitation(env, data) {
  const from = env.RESEND_FROM || "La Clé du Parc <noreply@lacleduparc.fr>";
  const prenomInvite = nettoyerTexteEmail(data?.invite?.prenommembre) || "";
  const nomInvitant = nettoyerTexteEmail([data?.invitant?.prenommembre, data?.invitant?.nommembre].filter(Boolean).join(" ")) || "Un membre";
  const destinataire = nettoyerEmail(data?.invite?.emailmembre || "");

  if (!destinataire) {
    throw new Error("E-mail invité manquant.");
  }

  const token = await fabriquerJetonInvitation(env, {
    idfluxInvite: data.reservationInvitee.idflux,
    idmembre: data.invite.idmembre,
    idfluxSource: data.reservationSource.idflux,
    expiration: new Date(data.reservationSource.datebookd).getTime() + 86400000
  });
  const lienBase = String(data.baseUrl || "").replace(/\/$/, "") + "/invitation?token=" + encodeURIComponent(token);
  const lienConsulter = lienBase;
  const lienAnnuler = lienBase + "&action=annuler";
  const parc = await premierResultat(env, env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/parcs" +
    "?idparc=eq." + encodeURIComponent(data.reservationSource.idparc) +
    "&select=nom,dptmt&limit=1");
  const nomParc = nettoyerTexteEmail(parc?.nom || "Parc");
  const dateAcces = new Date(data.reservationSource.datebookd).toLocaleDateString("fr-FR", {
    timeZone:"Europe/Paris",day:"numeric",month:"long",year:"numeric"
  });
  const conflits = await rechercherConflitsInvitation(env, data.reservationInvitee);
  const salutation = prenomInvite ? "Bonjour " + prenomInvite + "," : "Bonjour,";
  const texteInvitation = nomInvitant + " vous a invité(e) au " + nomParc + " le " + dateAcces + ".";
  const texteConflit = conflits.length
    ? "Attention : vous avez déjà " + conflits.length + " autre(s) accès sur ce créneau. Consultez le lien de l'invitation pour choisir quel accès conserver."
    : "";
  const compteExistant = data.invite?.emailvalid === true;
  const texteCompte = compteExistant
    ? "Vous pouvez consulter cette invitation depuis votre espace membre."
    : "Vous pouvez finaliser une inscription à La Clé du Parc, sans obligation pour recevoir cette invitation.";
  const signature = "À bientôt dans les parcs,\n\nL'équipe La Clé du Parc.";
  const texte = [
    salutation,
    "",
    texteInvitation,
    "",
    ...(texteConflit ? [texteConflit, ""] : []),
    texteCompte,
    "",
    "Consulter l'invitation : " + lienConsulter,
    "Annuler cette invitation : " + lienAnnuler,
    compteExistant ? "" : "Créer un compte (facultatif) : https://lacleduparc.fr/ESPACE-PUBLIC/inscription.html",
    "",
    signature
  ].join("\n");

  const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#ffffff;font-family:Arial,system-ui,sans-serif;color:#1f2a24;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeHtml(texteInvitation)}
    </div>
    <div style="max-width:620px;margin:0 auto;padding:32px 18px;">
      <div style="border:1px solid rgba(31,42,36,0.22);border-radius:22px;padding:30px;background:#ffffff;">
        <p style="margin:0 0 24px;font-size:18px;line-height:1.45;color:#1f2a24;font-weight:700;">
          ${escapeHtml(salutation)}
        </p>
        <p style="margin:0 0 18px;font-size:16px;line-height:1.55;color:#5f6861;">
          ${escapeHtml(texteInvitation)}
        </p>
        ${texteConflit ? '<p style="margin:0 0 16px;color:#8a4814;">' + escapeHtml(texteConflit) + '</p>' : ''}
        <p style="margin:0 0 24px;font-size:16px;line-height:1.55;color:#5f6861;">
          ${escapeHtml(texteCompte)}
        </p>
        <p style="margin:0 0 16px;font-size:16px;line-height:1.55;">
          <a href="${escapeHtml(lienConsulter)}">Voir mon invitation</a> ·
          <a href="${escapeHtml(lienAnnuler)}">Annuler mon invitation</a>
        </p>
        ${compteExistant ? '' : '<p style="margin:0 0 16px"><a href="https://lacleduparc.fr/ESPACE-PUBLIC/inscription.html">Finaliser mon inscription (facultatif)</a></p>'}
        <p style="margin:0;font-size:16px;line-height:1.55;color:#1f2a24;">
          À bientôt dans les parcs,<br><br>
          L'équipe La Clé du Parc.
        </p>
      </div>
    </div>
  </body>
</html>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: destinataire,
      subject: "La Clé du Parc - invitation",
      text: texte,
      html
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error("Resend invitation : " + response.status + " - " + detail);
  }
}

async function fabriquerJetonInvitation(env, details) {
  const payload = {
    v: 1, f: String(details.idfluxInvite), m: String(details.idmembre),
    s: String(details.idfluxSource), exp: Number(details.expiration)
  };
  const part = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signerHmacSha256(env.SESSION_SECRET, part);
  return part + "." + signature;
}

async function verifierJetonInvitation(env, token) {
  const parties = String(token || "").split(".");
  if (parties.length !== 2 || parties[0].length > 4096) throw new Error("Lien d'invitation invalide.");
  const encoder = new TextEncoder();
  const cle = await crypto.subtle.importKey("raw",encoder.encode(env.SESSION_SECRET),
    {name:"HMAC",hash:"SHA-256"},false,["verify"]);
  const base64 = parties[1].replace(/-/g,"+").replace(/_/g,"/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length/4)*4,"="));
  const bytes = Uint8Array.from(binary,x=>x.charCodeAt(0));
  const valide = await crypto.subtle.verify("HMAC",cle,bytes,encoder.encode(parties[0]));
  if (!valide) throw new Error("Lien d'invitation invalide.");
  const payload = JSON.parse(base64UrlDecodeToString(parties[0]));
  if (payload.v !== 1 || !payload.f || !payload.m || !payload.s || !Number.isFinite(payload.exp) || Date.now() >= payload.exp)
    throw new Error("Ce lien d'invitation a expiré.");
  return payload;
}

function pageEmail(titre, message, contenu="") {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(titre)} - La Clé du Parc</title>
    <style>body{font-family:Arial,sans-serif;background:#f7f8f5;color:#1f2a24;margin:0;padding:28px 14px}
    main{max-width:540px;margin:20px auto;background:white;border:1px solid #d7dfd0;border-radius:20px;padding:26px}
    button,.lien{display:inline-block;border:1px solid #4b6333;border-radius:14px;background:#4b6333;color:white;font-weight:bold;padding:12px 16px;margin:6px 8px 0 0;text-decoration:none;cursor:pointer}
    .secondaire{color:#4b6333;background:white}p{line-height:1.6}</style></head><body>
    <main><h1>${escapeHtml(titre)}</h1><p>${escapeHtml(message)}</p>${contenu}</main></body></html>`;
  return new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8",
    "Cache-Control":"no-store","Referrer-Policy":"no-referrer",
    "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
}

async function rechercherAccesJeton(env, payload) {
  const url = env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/fluxm" +
    "?idflux=eq." + encodeURIComponent(payload.f) +
    "&idmembre=eq." + encodeURIComponent(payload.m) +
    "&invitation=eq.true" +
    "&select=idflux,idmembre,idparc,idparrain,idfluxparrain,datebookd,plagebookd,statut,datecancd&limit=1";
  const reservation = await premierResultat(env,url);
  if (!reservation || String(reservation.idfluxparrain) !== payload.s)
    throw new Error("Invitation introuvable.");
  return reservation;
}

async function rechercherConflitsInvitation(env, reservation) {
  const d = new Date(reservation.datebookd);
  const day = dateIsoAujourdhuiParis(d);
  const start = new Date(d.getTime()-86400000).toISOString();
  const end = new Date(d.getTime()+86400000).toISOString();
  const url = env.SUPABASE_URL.replace(/\/$/,"") + "/rest/v1/fluxm" +
    "?idmembre=eq."+encodeURIComponent(reservation.idmembre)+
    "&datebookd=gte."+encodeURIComponent(start)+
    "&datebookd=lte."+encodeURIComponent(end)+
    "&plagebookd=eq."+encodeURIComponent(reservation.plagebookd)+
    "&statut=neq.cancd&select=idflux,datebookd,plagebookd,statut";
  const lignes = await resultats(env,url);
  return lignes.filter(x=>x.idflux!==reservation.idflux && dateIsoAujourdhuiParis(new Date(x.datebookd))===day);
}

async function handlePageInvitationEmail(url, env) {
  try {
    const token = url.searchParams.get("token");
    const payload = await verifierJetonInvitation(env,token);
    const acces = await rechercherAccesJeton(env,payload);
    if (acces.statut === "cancd") return pageEmail("Invitation annulée","Cette invitation a déjà été annulée.");
    const conflits = await rechercherConflitsInvitation(env, acces);
    const limite = delaiAnnulationInvitationDepasse(acces.datebookd);
    const message = conflits.length
      ? "Cette invitation est enregistrée, mais vous avez déjà " + conflits.length + " autre(s) accès sur le même créneau. Un seul accès doit être conservé."
      : "Votre invitation est enregistrée pour cet accès.";
    const entree = limite ? "<p>Annulation impossible après 14h.</p>" :
      `<form method="post" action="/invitation/annuler"><input type="hidden" name="token" value="${escapeHtml(token)}">
      <button type="submit">Confirmer l'annulation de cette invitation</button></form>`;
    return pageEmail("Mon invitation",message,entree +
      `<p><a class="lien secondaire" href="https://membre.lacleduparc.fr/">Mon espace membre</a></p>`);
  } catch (err) { return pageEmail("Lien indisponible",err.message || "Impossible d'ouvrir l'invitation."); }
}

async function handleAnnulerInvitationEmail(request, env) {
  try {
    const form = await request.formData();
    const payload = await verifierJetonInvitation(env,form.get("token"));
    const acces = await rechercherAccesJeton(env,payload);
    if (acces.statut === "cancd") return pageEmail("Invitation annulée","Cette invitation a déjà été annulée.");
    if (delaiAnnulationInvitationDepasse(acces.datebookd))
      return pageEmail("Annulation refusée","Annulation impossible après 14h.");
    const timestamp = new Date().toISOString();
    const ligne = await patcher(env,"invitation",
      "idflux=eq."+encodeURIComponent(payload.s)+"&idmembre=eq."+encodeURIComponent(payload.m)+"&invit=eq.true",
      {invit:"cancd",datecancd:timestamp,source:null},"idflux,idmembre,invit,datecancd");
    if (!ligne) return pageEmail("Invitation annulée","Cette invitation a déjà été annulée.");
    await patcher(env,"fluxm","idflux=eq."+encodeURIComponent(payload.f)+"&idmembre=eq."+encodeURIComponent(payload.m),
      {statut:"cancd",datecancd:timestamp},"idflux,statut,datecancd");
    const source = await premierResultat(env,env.SUPABASE_URL.replace(/\/$/,"") + "/rest/v1/fluxm" +
      "?idflux=eq."+encodeURIComponent(payload.s)+"&select=idflux,idmembre&limit=1");
    if (source?.idmembre) {
      const destinataire = await premierResultat(env,env.SUPABASE_URL.replace(/\/$/,"") + "/rest/v1/membres" +
        "?idmembre=eq."+encodeURIComponent(source.idmembre)+"&select=emailmembre&limit=1");
      const invite = await premierResultat(env,env.SUPABASE_URL.replace(/\/$/,"") + "/rest/v1/membres" +
        "?idmembre=eq."+encodeURIComponent(payload.m)+"&select=emailmembre&limit=1");
      try { await envoyerNotificationAnnulation(env,{
        to:destinataire?.emailmembre,
        message:"Votre invité(e) " + (invite?.emailmembre || "") + " a annulé sa participation à l'accès prévu. Votre liste des invités a été actualisée."
      }); } catch (erreur) { console.error("E-mail invitant après annulation",erreur); }
    }
    return pageEmail("Invitation annulée","Votre invitation est annulée. L'organisateur a été informé.");
  } catch (err) { return pageEmail("Annulation impossible",err.message || "La demande n'a pas pu être enregistrée."); }
}

function nettoyerTexteEmail(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const DEFAULT_ALLOWED_ORIGINS = [
  "https://ashdhe.github.io",
  "https://huguespavret.github.io",
  "https://membre.lacleduparc.fr",
  "https://lacleduparc.fr",
  "https://www.lacleduparc.fr",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];

function verifierConfigurationBase(env, avecResend = false) {
  const manquants = [];

  if (!env.SUPABASE_URL) manquants.push("SUPABASE_URL");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) manquants.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!env.SESSION_SECRET) manquants.push("SESSION_SECRET");
  if (avecResend && !env.RESEND_API_KEY) manquants.push("RESEND_API_KEY");

  if (manquants.length) {
    const error = new Error("Variables manquantes : " + manquants.join(", "));
    error.status = 500;
    throw error;
  }
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
  if (origin === new URL(request.url).origin) return true;
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

function supabaseHeaders(env, prefer = "") {
  const headers = {
    "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
    "Accept": "application/json",
    "Content-Type": "application/json"
  };

  if (prefer) {
    headers.Prefer = prefer;
  }

  return headers;
}

async function resultats(env, url) {
  const response = await fetch(url, {
    method: "GET",
    headers: supabaseHeaders(env)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error("Supabase select : " + response.status + " - " + detail);
  }

  const data = await response.json().catch(() => null);

  return Array.isArray(data) ? data : [];
}

async function premierResultat(env, url) {
  const rows = await resultats(env, url);
  return rows[0] || null;
}

async function inserer(env, table, row, returnData = false) {
  const url =
    env.SUPABASE_URL.replace(/\/$/, "") +
    "/rest/v1/" + table +
    (returnData ? "?select=*" : "");

  const response = await fetch(url, {
    method: "POST",
    headers: supabaseHeaders(env, returnData ? "return=representation" : "return=minimal"),
    body: JSON.stringify(row)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error("Supabase insert " + table + " : " + response.status + " - " + detail);
  }

  if (!returnData) return null;

  const data = await response.json().catch(() => null);
  return Array.isArray(data) ? data[0] || null : null;
}

async function patcher(env, table, filtre, row, select = "*") {
  const url =
    env.SUPABASE_URL.replace(/\/$/, "") +
    "/rest/v1/" + table +
    "?" + filtre +
    "&select=" + encodeURIComponent(select);

  const response = await fetch(url, {
    method: "PATCH",
    headers: supabaseHeaders(env, "return=representation"),
    body: JSON.stringify(row)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error("Supabase patch " + table + " : " + response.status + " - " + detail);
  }

  const data = await response.json().catch(() => null);
  return Array.isArray(data) ? data[0] || null : null;
}

async function lireSessionMembreDepuisCookie(request, env) {
  const cookies = lireCookies(request.headers.get("Cookie"));
  const sessionToken = cookies.idsession_membre || cookies.session_membre;

  if (!sessionToken || !env.SESSION_SECRET) return null;

  const parties = sessionToken.split(".");
  if (parties.length !== 2) return null;

  const payloadEncode = parties[0];
  const signatureRecue = parties[1];
  const signatureAttendue = await signerHmacSha256(env.SESSION_SECRET, payloadEncode);

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
    env.SUPABASE_URL.replace(/\/$/, "") +
    "/rest/v1/sessactive" +
    "?idsession=eq." + encodeURIComponent(idsession) +
    "&select=idsession,idmembre" +
    "&limit=1";

  return premierResultat(env, url);
}

async function chercherMembreValideInscription(env, idmembre) {
  const url =
    env.SUPABASE_URL.replace(/\/$/, "") +
    "/rest/v1/membres" +
    "?idmembre=eq." + encodeURIComponent(idmembre) +
    "&emailvalid=eq.true" +
    "&emailvalidmode=eq.inscription" +
    "&select=idmembre,nommembre,prenommembre,emailmembre,emailvalid,emailvalidmode" +
    "&limit=1";

  return premierResultat(env, url);
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

function nettoyerEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function emailValide(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normaliserTexteTechnique(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "");
}

function extraireMessageErreur(error) {
  return error && error.message ? error.message : "Erreur technique. Merci de réessayer.";
}

async function afficherRelationsInvitationsMembre(request, env, corsHeaders) {
  const session = await recupererSessionObligatoire(request, env);

  try {
    const compte = await chercherMembreValideInscription(env, session.idmembre);
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
