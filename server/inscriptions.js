import { randomInt } from 'node:crypto';

export const NIVEAUX = ['Licence 1', 'Licence 2', 'Licence 3', 'Master 1', 'Master 2', 'Autre'];
export const DOMAINES = ['Intelligence artificielle', 'Data', 'Deep-Tech', 'Développement', 'Cybersécurité', 'Réseaux et systèmes', 'Télécommunications'];
export const SOURCES = ['WhatsApp', 'Facebook', 'LinkedIn', 'TikTok', 'Un ami ou un camarade', 'Autre'];

/** Verrou consultatif : les inscriptions simultanées passent une par une, le quota ne peut pas être dépassé. */
const VERROU_QUOTA = 20261017;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function nouveauCode() {
  const bloc = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `VTT-${bloc()}-${bloc()}`;
}

const propre = (valeur) => (typeof valeur === 'string' ? valeur.normalize('NFC').replace(/\s+/g, ' ').trim() : '');
const NOM = /^[\p{L}][\p{L}\p{M}' .-]*$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Valide une demande d'inscription. @returns {{ donnees?: object, erreurs?: Record<string, string> }} */
export function valider(corps) {
  const erreurs = {};
  const donnees = {
    nom: propre(corps?.nom),
    prenom: propre(corps?.prenom),
    email: propre(corps?.email).toLowerCase(),
    telephone: propre(corps?.telephone).replace(/[\s.-]/g, ''),
    etablissement: propre(corps?.etablissement),
    filiere: propre(corps?.filiere),
    niveau: propre(corps?.niveau),
    domaine: propre(corps?.domaine) || null,
    source: propre(corps?.source) || null,
  };
  const texte = (champ, libelle, min, max, motif) => {
    const valeur = donnees[champ];
    if (valeur.length < min) erreurs[champ] = `${libelle} est obligatoire.`;
    else if (valeur.length > max) erreurs[champ] = `${libelle} ne doit pas dépasser ${max} caractères.`;
    else if (motif && !motif.test(valeur)) erreurs[champ] = `${libelle} contient des caractères non admis.`;
  };
  texte('nom', 'Le nom', 2, 60, NOM);
  texte('prenom', 'Le prénom', 2, 60, NOM);
  texte('etablissement', 'L’établissement', 2, 120);
  texte('filiere', 'La filière', 2, 100);
  if (!EMAIL.test(donnees.email) || donnees.email.length > 120) erreurs.email = 'Indiquez une adresse électronique valide.';
  if (!/^\+?\d{8,15}$/.test(donnees.telephone)) erreurs.telephone = 'Indiquez un numéro de téléphone valide (8 chiffres au moins).';
  if (!NIVEAUX.includes(donnees.niveau)) erreurs.niveau = 'Choisissez votre niveau d’études.';
  if (donnees.domaine && !DOMAINES.includes(donnees.domaine)) erreurs.domaine = 'Choix non reconnu.';
  if (donnees.source && !SOURCES.includes(donnees.source)) erreurs.source = 'Choix non reconnu.';
  if (corps?.consentement !== true) erreurs.consentement = 'Votre accord est nécessaire pour enregistrer l’inscription.';
  return Object.keys(erreurs).length ? { erreurs } : { donnees };
}

export async function etat(base, config) {
  const { rows } = await base.query('SELECT count(*)::int AS inscrits FROM inscription');
  const inscrits = rows[0].inscrits;
  const restantes = Math.max(0, config.capacite - inscrits);
  const cloturees = Date.now() > config.cloture.getTime();
  return { capacite: config.capacite, inscrits, restantes, complet: restantes === 0, cloturees, ouvert: restantes > 0 && !cloturees, cloture: config.cloture.toISOString() };
}

export class Refus extends Error {
  constructor(code, message, statut) {
    super(message);
    this.code = code;
    this.statut = statut;
  }
}

/** Enregistre une inscription si une place reste. Le décompte et l'insertion se font sous le même verrou. */
export async function inscrire(base, config, donnees) {
  if (Date.now() > config.cloture.getTime()) throw new Refus('INSCRIPTIONS_CLOSES', 'Les inscriptions sont closes.', 403);
  const client = await base.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [VERROU_QUOTA]);
    const { rows } = await client.query('SELECT count(*)::int AS inscrits FROM inscription');
    if (rows[0].inscrits >= config.capacite) throw new Refus('COMPLET', 'Toutes les places ont été attribuées.', 409);
    const existe = await client.query('SELECT 1 FROM inscription WHERE email = $1', [donnees.email]);
    if (existe.rowCount) throw new Refus('DEJA_INSCRIT', 'Cette adresse électronique est déjà inscrite.', 409);
    const insertion = await client.query(
      `INSERT INTO inscription (code, nom, prenom, email, telephone, etablissement, filiere, niveau, domaine, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, code`,
      [nouveauCode(), donnees.nom, donnees.prenom, donnees.email, donnees.telephone, donnees.etablissement, donnees.filiere, donnees.niveau, donnees.domaine, donnees.source],
    );
    await client.query('COMMIT');
    return insertion.rows[0];
  } catch (erreur) {
    await client.query('ROLLBACK').catch(() => {});
    throw erreur;
  } finally {
    client.release();
  }
}

export async function billet(base, code) {
  const { rows } = await base.query('SELECT id, code, nom, prenom, etablissement, filiere, inscrit_le, present_le FROM inscription WHERE code = $1', [code]);
  return rows[0] ?? null;
}
