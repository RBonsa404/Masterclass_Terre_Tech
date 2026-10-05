// Configuration : tout vient de l'environnement, aucune valeur sensible n'est écrite dans le dépôt.

const entier = (valeur, defaut) => {
  const n = Number.parseInt(valeur ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : defaut;
};

export function lireConfiguration(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const config = {
    production,
    port: entier(env.PORT, 3000),
    baseDeDonnees: env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5434/masterclass',
    // Connexion chiffrée à la base : utile seulement si elle est jointe par son adresse publique.
    chiffrementBase: env.DATABASE_SSL === 'true' || (env.DATABASE_URL ?? '').includes('proxy.rlwy.net'),
    // Nombre de places : au-delà, l'événement est complet.
    capacite: entier(env.CAPACITE, 200),
    // Places retenues pour les invités : elles comptent dans la capacité, mais ne sont pas ouvertes à l'inscription.
    placesInvites: Math.max(0, env.PLACES_INVITES === undefined ? 35 : Number.parseInt(env.PLACES_INVITES, 10) || 0),
    // Ouverture des inscriptions : avant cette date, la page annonce l'ouverture et le formulaire reste fermé.
    ouverture: new Date(env.OUVERTURE_INSCRIPTIONS ?? '2026-10-08T00:00:00Z'),
    // Clôture des inscriptions (note de cadrage : 16 octobre 2026). Heure d'Ouagadougou = UTC.
    cloture: new Date(env.CLOTURE_INSCRIPTIONS ?? '2026-10-16T23:59:59Z'),
    motDePasseAdmin: env.ADMIN_PASSWORD ?? '',
    secretDeSession: env.SESSION_SECRET ?? '',
    // Adresse publique du site (liens des billets) ; à défaut, celle de la requête.
    adressePublique: (env.PUBLIC_URL ?? '').replace(/\/+$/, ''),
  };
  if (config.placesInvites >= config.capacite) throw new Error('PLACES_INVITES doit être inférieur à CAPACITE.');
  if (Number.isNaN(config.ouverture.getTime()) || Number.isNaN(config.cloture.getTime())) throw new Error('OUVERTURE_INSCRIPTIONS et CLOTURE_INSCRIPTIONS doivent être des dates ISO 8601.');
  if (production) {
    if (config.motDePasseAdmin.length < 12) throw new Error('ADMIN_PASSWORD est obligatoire en production (12 caractères au moins).');
    if (config.secretDeSession.length < 32) throw new Error('SESSION_SECRET est obligatoire en production (32 caractères au moins).');
  } else {
    config.motDePasseAdmin ||= 'admin-local-seulement';
    config.secretDeSession ||= 'secret-local-seulement-ne-pas-utiliser-en-ligne';
  }
  return config;
}
