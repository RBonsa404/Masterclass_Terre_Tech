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
    // Clôture des inscriptions (note de cadrage : 16 octobre 2026). Heure d'Ouagadougou = UTC.
    cloture: new Date(env.CLOTURE_INSCRIPTIONS ?? '2026-10-16T23:59:59Z'),
    motDePasseAdmin: env.ADMIN_PASSWORD ?? '',
    secretDeSession: env.SESSION_SECRET ?? '',
    // Adresse publique du site (liens des billets) ; à défaut, celle de la requête.
    adressePublique: (env.PUBLIC_URL ?? '').replace(/\/+$/, ''),
  };
  if (production) {
    if (config.motDePasseAdmin.length < 12) throw new Error('ADMIN_PASSWORD est obligatoire en production (12 caractères au moins).');
    if (config.secretDeSession.length < 32) throw new Error('SESSION_SECRET est obligatoire en production (32 caractères au moins).');
  } else {
    config.motDePasseAdmin ||= 'admin-local-seulement';
    config.secretDeSession ||= 'secret-local-seulement-ne-pas-utiliser-en-ligne';
  }
  return config;
}
