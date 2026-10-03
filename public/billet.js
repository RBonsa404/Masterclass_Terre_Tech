// Billet : lecture sur le serveur à partir du code présent dans l'adresse.
const $ = (s) => document.querySelector(s);
const code = decodeURIComponent(location.pathname.split('/').pop() ?? '').toUpperCase();

async function charger() {
  let billet = null;
  try {
    const reponse = await fetch(`/api/billets/${encodeURIComponent(code)}`, { cache: 'no-store' });
    if (reponse.ok) billet = await reponse.json();
  } catch {
    $('[data-attente]').textContent = 'Connexion impossible. Vérifiez votre accès à Internet, puis rechargez la page.';
    return;
  }
  $('[data-attente]').hidden = true;
  if (!billet) return ($('[data-introuvable]').hidden = false);

  $('[data-nom]').textContent = `${billet.prenom} ${billet.nom}`;
  $('[data-etablissement]').textContent = billet.etablissement;
  $('[data-filiere]').textContent = billet.filiere;
  $('[data-code]').textContent = billet.code;
  $('[data-numero]').textContent = String(billet.numero).padStart(3, '0');
  $('[data-capacite]').textContent = billet.capacite;
  $('[data-qr]').src = `/api/billets/${billet.code}/qr.svg`;
  afficherPresence(billet.present);
  document.title = `Billet de ${billet.prenom} ${billet.nom} | Voyage en Terre Tech`;
  for (const s of ['[data-billet]', '[data-actions]', '[data-note]']) $(s).hidden = false;

  // Membre de l'équipe connecté : le billet scanné se valide à l'entrée.
  if (billet.equipe) {
    const bouton = $('[data-presence]');
    bouton.hidden = false;
    let present = billet.present;
    const libelle = () => (bouton.textContent = present ? 'Annuler la présence' : 'Valider la présence');
    libelle();
    bouton.addEventListener('click', async () => {
      bouton.disabled = true;
      const reponse = await fetch(`/api/equipe/inscriptions/${billet.numero}/presence`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ present: !present }) }).catch(() => null);
      bouton.disabled = false;
      if (reponse?.status === 204) {
        present = !present;
        afficherPresence(present);
        libelle();
      }
    });
  }
}

function afficherPresence(present) {
  const etat = $('[data-etat]');
  etat.textContent = present ? 'Présence validée' : 'Place réservée';
  etat.classList.toggle('present', present);
}

$('[data-imprimer]').addEventListener('click', () => print());
$('[data-copier]').addEventListener('click', async (e) => {
  try {
    await navigator.clipboard.writeText(location.href);
    e.target.textContent = 'Lien copié';
  } catch {
    e.target.textContent = 'Copie impossible : copiez l’adresse de la page';
  }
});

charger();
