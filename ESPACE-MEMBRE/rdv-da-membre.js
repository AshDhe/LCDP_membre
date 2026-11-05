(() => {
  "use strict";
  const config = window.SITE_CONFIG || {};
  const baseApi = String(config.workerDaMembreUrl || config.WORKER_DA_MEMBRE_URL ||
    (typeof config.apiUrl === "function" ? config.apiUrl("da-membre-api") : "") || "").replace(/\/+$/, "");
  const baseCompte = String(config.workerMonCompteMembreUrl || config.WORKER_MON_COMPTE_MEMBRE_URL ||
    (typeof config.apiUrl === "function" ? config.apiUrl("mon-compte-membre-api") : "") || "").replace(/\/+$/, "");
  let demarre = false;
  let requeteEnCours = false;

  async function installer() {
    if (demarre || !baseApi || !baseCompte) return;
    const input = document.getElementById("champ-statut-membre");
    const champ = input?.closest("[data-lcdp-box-champ-formulaire]");
    if (!champ) return;
    demarre = true;
    try {
      const reponse = await fetch(baseCompte + "/compte", {
        credentials: "include", cache: "no-store", headers: {Accept: "application/json"}
      });
      const donnees = await reponse.json().catch(() => null);
      if (!reponse.ok || !donnees?.ok || !donnees.compte) return;
      const etat = String(donnees.compte.statuda || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (etat !== "encours") return;
      const bloc = document.createElement("div");
      bloc.className = "lcdp-compte-rdv-da";
      bloc.innerHTML = `<span class="lcdp-compte-rdv-da__label">RDV DA</span>
        <div class="lcdp-compte-rdv-da__control">
          <span class="lcdp-compte-rdv-da__value" id="lcdp-compte-rdv-da-texte">Demander un RDV</span>
          <button type="button" class="lcdp-compte-rdv-da__button" id="lcdp-compte-rdv-da-ouvrir"
            aria-label="Demander un rendez-vous visio pour votre DA" title="Demander un RDV">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/>
              <path d="M7 3v4M17 3v4M3 10h18"/><path d="M9 15h6M12 12v6"/></svg>
          </button>
        </div>`;
      champ.insertAdjacentElement("afterend", bloc);
      const bouton = bloc.querySelector("#lcdp-compte-rdv-da-ouvrir");
      bouton.addEventListener("click", ouvrirDialogue);
    } catch (erreur) { console.error("RDV DA : chargement impossible", erreur?.name || "Erreur"); }
  }

  function creerDialogue() {
    let dialogue = document.getElementById("lcdp-rdv-da-dialogue");
    if (dialogue) return dialogue;
    dialogue = document.createElement("dialog");
    dialogue.id = "lcdp-rdv-da-dialogue";
    dialogue.setAttribute("aria-labelledby", "lcdp-rdv-da-titre");
    dialogue.innerHTML = `<form id="lcdp-rdv-da-formulaire">
      <h2 id="lcdp-rdv-da-titre">Demander un rendez-vous</h2>
      <p>Pour échanger en visioconférence au sujet de votre demande d'abonnement.</p>
      <label for="lcdp-rdv-da-disponibilites">Vos disponibilités (facultatif)</label>
      <textarea id="lcdp-rdv-da-disponibilites" name="disponibilites" maxlength="1000"
        placeholder="Jours et horaires qui vous conviendraient"></textarea>
      <p data-rdv-da-resultat role="status" aria-live="polite"></p>
      <div data-rdv-da-actions>
        <button type="button" data-rdv-da-annuler>Annuler</button>
        <button type="submit" data-rdv-da-envoyer>Envoyer la demande</button>
      </div></form>`;
    document.body.appendChild(dialogue);
    dialogue.querySelector("[data-rdv-da-annuler]").addEventListener("click", () => dialogue.close());
    dialogue.querySelector("form").addEventListener("submit", transmettreDemande);
    return dialogue;
  }
  function ouvrirDialogue() {
    const dialogue = creerDialogue();
    dialogue.querySelector("[data-rdv-da-resultat]").textContent = "";
    if (!dialogue.open) dialogue.showModal();
  }
  async function transmettreDemande(event) {
    event.preventDefault();
    if (requeteEnCours) return;
    const dialog = creerDialogue();
    const resultat = dialog.querySelector("[data-rdv-da-resultat]");
    const bouton = dialog.querySelector("[data-rdv-da-envoyer]");
    requeteEnCours = true;
    bouton.disabled = true;
    resultat.textContent = "Enregistrement…";
    try {
      const reponse = await fetch(baseApi + "/rdv-da", {
        method: "POST", credentials: "include", cache: "no-store",
        headers: {"Content-Type": "application/json", "Accept": "application/json"},
        body: JSON.stringify({disponibilites: dialog.querySelector("textarea").value.trim()})
      });
      const donnees = await reponse.json().catch(() => null);
      if (!reponse.ok || !donnees?.ok) throw new Error(donnees?.message || "Impossible d'enregistrer votre RDV.");
      resultat.textContent = donnees.message || "Votre demande de RDV est enregistrée.";
      document.getElementById("lcdp-compte-rdv-da-texte").textContent = "RDV demandé";
      window.setTimeout(() => { if(dialog.open) dialog.close(); }, 1300);
    } catch (err) {
      resultat.textContent = err.message || "Enregistrement impossible. Réessayez.";
    } finally {
      bouton.disabled = false;
      requeteEnCours = false;
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
  else demarrer();
  function demarrer() {
    const cible = document.getElementById("lcdp-mes-informations-slot") || document.body;
    const observer = new MutationObserver(() => {
      if (demarre) observer.disconnect();
      else installer();
    });
    observer.observe(cible, {childList:true, subtree:true});
    installer();
  }
})();
