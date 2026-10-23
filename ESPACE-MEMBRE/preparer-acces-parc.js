(() => {
  "use strict";
  const autoriser = document.getElementById("autoriser-geolocalisation");
  const plusTard = document.getElementById("plus-tard-geolocalisation");
  const statut = document.getElementById("statut-geolocalisation");
  const contenu = document.getElementById("preparation-contenu");
  const confirmation = document.getElementById("confirmation-geolocalisation");
  const lien = new URL(location.href);
  lien.hash = "";
  document.getElementById("qr-geolocalisation").src =
    "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + encodeURIComponent(lien.href);
  const telephone = /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(navigator.userAgent);
  let enCours = false;
  function terminer() {
    contenu.hidden = true;
    statut.textContent = "Vous pouvez fermer cette page.";
  }
  autoriser.addEventListener("click", () => {
    if (enCours) return;
    if (!telephone) {
      statut.textContent = "Scannez le QR code avec votre téléphone pour autoriser sa géolocalisation.";
      return;
    }
    if (!window.isSecureContext || !navigator.geolocation) {
      statut.textContent = "Ouvrez cette page dans le navigateur de votre téléphone pour autoriser la localisation.";
      return;
    }
    enCours = true;
    autoriser.disabled = plusTard.disabled = true;
    statut.textContent = "Autorisez la localisation dans la demande de votre téléphone.";
    function retablir() {
      enCours = false;
      autoriser.disabled = plusTard.disabled = false;
    }
    // Ce test ne transmet et ne conserve aucune coordonnée.
    navigator.geolocation.getCurrentPosition(() => {
      retablir();
      terminer();
      if (typeof confirmation.showModal === "function") confirmation.showModal();
      else statut.textContent = "La géolocalisation est autorisée sur ce téléphone. Vous pouvez fermer cette page.";
    }, erreur => {
      retablir();
      statut.textContent = erreur.code === 1
        ? "La localisation n’est pas autorisée. Vous pouvez l’autoriser dans les réglages du navigateur ou choisir Plus tard."
        : "Position indisponible. Vérifiez la localisation de votre téléphone, puis réessayez.";
    }, {enableHighAccuracy:true, maximumAge:0, timeout:15000});
  });
  plusTard.addEventListener("click", () => { if (!enCours) terminer(); });
  if (location.hash === "#plus-tard") terminer();
})();
