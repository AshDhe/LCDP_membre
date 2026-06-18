let lightboxInformationReady = null;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialiserLightboxInformation);
} else {
  initialiserLightboxInformation();
}

function initialiserLightboxInformation() {
  lightboxInformationReady = chargerLightboxInformation();
}

async function chargerLightboxInformation() {
  const container = document.getElementById("lightbox-information-container");

  if (!container) {
    console.error("Conteneur lightbox-information-container introuvable.");
    return false;
  }

  const siteBase = window.SITE_BASE || "";

  try {
    const response = await fetch(siteBase + "/OBJETS/BLOCS/lightbox-information.html");

    if (!response.ok) {
      throw new Error("Impossible de charger la lightbox d'information");
    }

    const html = await response.text();
    container.innerHTML = html;

    return true;
  } catch (error) {
    console.error("Erreur lightbox d'information :", error);
    return false;
  }
}

window.afficherLightboxInformation = async function (
  titre,
  message,
  options = {}
) {
  if (lightboxInformationReady) {
    await lightboxInformationReady;
  }

  const lightbox = document.getElementById("lightbox-information");
  const box = lightbox ? lightbox.querySelector(".lightbox-box") : null;
  const titleElement = document.getElementById("lightbox-information-title");
  const messageElement = document.getElementById("lightbox-information-message");
  const okButton = document.getElementById("lightbox-information-ok");

  if (!lightbox || !box || !titleElement || !messageElement || !okButton) {
    console.error("Lightbox d'information introuvable ou incomplète.");
    return false;
  }

  box.classList.remove(
    "lightbox-erreur",
    "lightbox-validation",
    "lightbox-information-simple"
  );

  if (options.type === "validation") {
    box.classList.add("lightbox-validation");
  } else if (options.type === "erreur") {
    box.classList.add("lightbox-erreur");
  } else {
    box.classList.add("lightbox-information-simple");
  }

  titleElement.textContent = titre;
  messageElement.textContent = message;

  lightbox.hidden = false;

  okButton.onclick = () => {
    lightbox.hidden = true;

    box.classList.remove(
      "lightbox-erreur",
      "lightbox-validation",
      "lightbox-information-simple"
    );

    if (options.redirectUrl) {
      const siteBase = window.SITE_BASE || "";

      if (options.redirectUrl.startsWith("/")) {
        window.location.href = siteBase + options.redirectUrl;
      } else {
        window.location.href = options.redirectUrl;
      }

      return;
    }

    if (typeof options.onClose === "function") {
      options.onClose();
    }
  };

  okButton.focus();

  return true;
};