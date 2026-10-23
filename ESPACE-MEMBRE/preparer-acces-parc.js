(() => {
  "use strict";
  const autoriser=document.getElementById("autoriser-geolocalisation");
  const plusTard=document.getElementById("plus-tard-geolocalisation");
  const statut=document.getElementById("statut-geolocalisation");
  let enCours=false;
  autoriser.addEventListener("click",()=>{
    if(enCours)return;
    if(!window.isSecureContext || !navigator.geolocation){statut.textContent="La géolocalisation n’est pas disponible. Ouvrez cette page en HTTPS dans le navigateur de votre téléphone.";return;}
    enCours=true;autoriser.disabled=true;plusTard.disabled=true;
    statut.textContent="Répondez à la demande du navigateur, puis attendez la vérification de la position.";
    function terminer(message){enCours=false;autoriser.disabled=false;plusTard.disabled=false;statut.textContent=message;}
    // La position reçue pour ce test est ignorée : aucune coordonnée n'est envoyée
    // ou enregistrée par cette page. L'autorisation reste gérée par le navigateur.
    navigator.geolocation.getCurrentPosition(
      ()=>terminer("La géolocalisation fonctionne dans ce navigateur. Une nouvelle position sera demandée lors de vos contrôles au parc. Votre navigateur pourra redemander l’autorisation."),
      erreur=>terminer(erreur.code===1
        ?"La géolocalisation n’a pas été autorisée. Vous pouvez continuer comme invité et être pointé par votre parrain. Pour un contrôle personnel, modifiez l’autorisation du site dans votre navigateur."
        :"La position n’a pas pu être obtenue. Cela ne signifie pas nécessairement un refus d’autorisation. Vérifiez la localisation du téléphone puis réessayez."),
      {enableHighAccuracy:true,maximumAge:0,timeout:15000}
    );
  });
  plusTard.addEventListener("click",()=>{if(!enCours)statut.textContent="Vous pourrez revenir sur cette page pour préparer votre accès. Votre choix dans le navigateur n’a pas été modifié.";});
})();
