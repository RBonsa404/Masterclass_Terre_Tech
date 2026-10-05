// Espace de l'équipe organisatrice : liste, recherche, présence, retrait, exports.
const $ = (s) => document.querySelector(s);
let inscriptions = [];

const cellule = (texte, classe) => {
  const td = document.createElement('td');
  td.textContent = texte ?? '';
  if (classe) td.className = classe;
  return td;
};
const bouton = (libelle, action, classe = 'mini') => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = classe;
  b.textContent = libelle;
  b.addEventListener('click', action);
  return b;
};

function afficher() {
  const filtre = $('[data-recherche]').value.trim().toLowerCase();
  const visibles = inscriptions.filter((i) => !filtre || [i.nom, i.prenom, i.email, i.telephone, i.code, i.etablissement, i.filiere].join(' ').toLowerCase().includes(filtre));
  const corps = $('[data-lignes]');
  corps.replaceChildren(
    ...visibles.map((i) => {
      const ligne = document.createElement('tr');
      if (i.present_le) ligne.className = 'present';
      const lien = document.createElement('a');
      lien.href = `/billet/${i.code}`;
      lien.textContent = i.code;
      lien.className = 'mono';
      const billet = document.createElement('td');
      billet.append(lien);
      const presence = document.createElement('td');
      presence.append(bouton(i.present_le ? 'Présent' : 'Valider', () => marquer(i, !i.present_le)));
      const retrait = document.createElement('td');
      retrait.append(bouton('Retirer', () => retirer(i), 'mini danger'));
      ligne.append(cellule(String(i.id).padStart(3, '0'), 'mono'), cellule(`${i.nom} ${i.prenom}`, 'nom'), cellule(i.telephone), cellule(i.email), cellule(i.etablissement), cellule(i.filiere), cellule(i.niveau), billet, presence, retrait);
      return ligne;
    }),
  );
  $('[data-vide]').hidden = visibles.length > 0;
  $('[data-vide]').textContent = inscriptions.length ? 'Aucune inscription ne correspond à la recherche.' : 'Aucune inscription pour le moment.';
}

async function charger() {
  const reponse = await fetch('/api/equipe/inscriptions', { cache: 'no-store' }).catch(() => null);
  if (!reponse || reponse.status === 401) {
    $('[data-espace]').hidden = true;
    $('[data-connexion]').hidden = false;
    return;
  }
  const donnees = await reponse.json();
  inscriptions = donnees.inscriptions;
  $('[data-inscrits]').textContent = donnees.etat.inscrits;
  $('[data-restantes]').textContent = donnees.etat.restantes;
  $('[data-capacite]').textContent = donnees.etat.capacite;
  $('[data-invites]').textContent = donnees.etat.invites;
  $('[data-presents]').textContent = donnees.presents;
  $('[data-connexion]').hidden = true;
  $('[data-espace]').hidden = false;
  afficher();
}

async function marquer(inscription, present) {
  await fetch(`/api/equipe/inscriptions/${inscription.id}/presence`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ present }) });
  charger();
}

async function retirer(inscription) {
  if (!confirm(`Retirer l’inscription de ${inscription.prenom} ${inscription.nom} ? Sa place sera de nouveau disponible et son billet ne sera plus valable.`)) return;
  await fetch(`/api/equipe/inscriptions/${inscription.id}`, { method: 'DELETE' });
  charger();
}

$('[data-form-connexion]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const alerte = $('[data-alerte]');
  alerte.hidden = true;
  const reponse = await fetch('/api/equipe/connexion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motDePasse: e.target.elements.motDePasse.value }) }).catch(() => null);
  if (reponse?.status === 204) {
    e.target.reset();
    return charger();
  }
  alerte.textContent = reponse?.status === 429 ? 'Trop de tentatives. Réessayez dans quelques minutes.' : 'Mot de passe incorrect.';
  alerte.hidden = false;
});
$('[data-deconnexion]').addEventListener('click', async () => {
  await fetch('/api/equipe/deconnexion', { method: 'POST' });
  charger();
});
$('[data-recherche]').addEventListener('input', afficher);
$('[data-actualiser]').addEventListener('click', charger);

charger();
setInterval(() => !document.hidden && !$('[data-espace]').hidden && charger(), 30000);
