import pg from 'pg';

export function ouvrirBase(url, chiffrement) {
  // Réseau privé de l'hébergeur ou base locale : pas de TLS. Adresse publique de la base : TLS (certificat de l'hébergeur non vérifié).
  return new pg.Pool({ connectionString: url, max: 10, ssl: chiffrement ? { rejectUnauthorized: false } : false });
}

/** Schéma : créé au démarrage s'il manque. Une adresse électronique ne s'inscrit qu'une fois. */
export async function preparerSchema(base) {
  await base.query(`
    CREATE TABLE IF NOT EXISTS inscription (
      id            SERIAL PRIMARY KEY,
      code          TEXT NOT NULL UNIQUE,
      nom           TEXT NOT NULL,
      prenom        TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      telephone     TEXT NOT NULL,
      etablissement TEXT NOT NULL,
      filiere       TEXT NOT NULL,
      niveau        TEXT NOT NULL,
      domaine       TEXT,
      source        TEXT,
      inscrit_le    TIMESTAMPTZ NOT NULL DEFAULT now(),
      present_le    TIMESTAMPTZ
    )`);
  // Table vide : la numérotation des billets repart de 001 (les essais retirés ne laissent pas de trou).
  await base.query(`SELECT setval(pg_get_serial_sequence('inscription', 'id'), 1, false) WHERE NOT EXISTS (SELECT 1 FROM inscription)`);
}
