import { createHmac, timingSafeEqual } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import express from 'express';
import helmet from 'helmet';
import QRCode from 'qrcode';
import { Refus, billet, etat, inscrire, valider } from './inscriptions.js';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const DUREE_SESSION_MS = 8 * 60 * 60 * 1000;
const CODE = /^VTT-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

/** Limite de débit en mémoire, par adresse : suffisante pour un service à instance unique. */
function limiteur(maximum, fenetreMs) {
  const compteurs = new Map();
  return (req, res, next) => {
    const maintenant = Date.now();
    const cle = req.ip;
    const entree = compteurs.get(cle);
    if (!entree || maintenant > entree.fin) {
      compteurs.set(cle, { n: 1, fin: maintenant + fenetreMs });
      if (compteurs.size > 5000) for (const [k, v] of compteurs) if (maintenant > v.fin) compteurs.delete(k);
      return next();
    }
    if (++entree.n > maximum) {
      res.set('Retry-After', String(Math.ceil((entree.fin - maintenant) / 1000)));
      return res.status(429).json({ code: 'TROP_DE_DEMANDES', message: 'Trop de demandes. Réessayez dans quelques minutes.' });
    }
    next();
  };
}

export function creerApplication(base, config) {
  const app = express();
  app.disable('x-powered-by');
  // Un seul proxy devant le service (celui de l'hébergeur) : l'adresse du visiteur vient de son en-tête.
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '10kb' }));

  const origine = (req) => config.adressePublique || `${req.protocol}://${req.get('host')}`;

  // ----- Session de l'équipe organisatrice : jeton signé, sans stockage côté serveur -----
  const signer = (echeance) => createHmac('sha256', config.secretDeSession).update(String(echeance)).digest('base64url');
  const jeton = () => {
    const echeance = Date.now() + DUREE_SESSION_MS;
    return `${echeance}.${signer(echeance)}`;
  };
  const sessionValide = (req) => {
    const brut = (req.headers.cookie ?? '').split(/;\s*/).find((c) => c.startsWith('equipe='))?.slice(7) ?? '';
    const [echeance, signature] = brut.split('.');
    if (!echeance || !signature || Number(echeance) < Date.now()) return false;
    const attendue = Buffer.from(signer(echeance));
    const recue = Buffer.from(signature);
    return attendue.length === recue.length && timingSafeEqual(attendue, recue);
  };
  const equipe = (req, res, next) => (sessionValide(req) ? next() : res.status(401).json({ code: 'NON_CONNECTE', message: 'Connexion requise.' }));
  const memeMotDePasse = (saisi) => {
    const a = createHmac('sha256', config.secretDeSession).update(String(saisi ?? '')).digest();
    const b = createHmac('sha256', config.secretDeSession).update(config.motDePasseAdmin).digest();
    return timingSafeEqual(a, b);
  };

  // ----- Santé -----
  app.get('/sante', async (_req, res) => {
    try {
      await base.query('SELECT 1');
      res.type('text/plain').send('ok\n');
    } catch {
      res.status(503).type('text/plain').send('base injoignable\n');
    }
  });

  // ----- API publique -----
  app.get('/api/etat', async (_req, res) => {
    res.set('Cache-Control', 'no-store').json(await etat(base, config));
  });

  // Rappel d'agenda : l'ouverture des inscriptions, avec une alerte un quart d'heure avant.
  app.get('/rappel-ouverture.ics', (req, res) => {
    const date = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const fin = new Date(config.ouverture.getTime() + 30 * 60 * 1000);
    const lignes = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Club Informatique de l IST//Voyage en Terre Tech//FR',
      'BEGIN:VEVENT',
      `UID:ouverture-inscriptions@${req.get('host')}`,
      `DTSTAMP:${date(new Date())}`,
      `DTSTART:${date(config.ouverture)}`,
      `DTEND:${date(fin)}`,
      'SUMMARY:Ouverture des inscriptions : Voyage en Terre Tech',
      `DESCRIPTION:Les inscriptions à la masterclass ouvrent maintenant. Réservez votre place : ${origine(req)}/`,
      `URL:${origine(req)}/`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Les inscriptions à la masterclass ouvrent dans 15 minutes',
      'TRIGGER:-PT15M',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ];
    res.type('text/calendar; charset=utf-8').set('Content-Disposition', 'attachment; filename="ouverture-inscriptions-terre-tech.ics"').send(lignes.join('\r\n') + '\r\n');
  });

  app.post('/api/inscriptions', limiteur(8, 10 * 60 * 1000), async (req, res) => {
    // Champ piège : invisible pour un visiteur, rempli par les robots. La demande est ignorée sans le signaler.
    if (typeof req.body?.site === 'string' && req.body.site.trim() !== '') return res.status(201).json({ code: null });
    const { donnees, erreurs } = valider(req.body);
    if (erreurs) return res.status(422).json({ code: 'SAISIE_INVALIDE', message: 'Certains champs sont à corriger.', erreurs });
    try {
      const inscription = await inscrire(base, config, donnees);
      res.status(201).json({ code: inscription.code, billet: `/billet/${inscription.code}` });
    } catch (erreur) {
      if (erreur instanceof Refus) return res.status(erreur.statut).json({ code: erreur.code, message: erreur.message });
      throw erreur;
    }
  });

  app.get('/api/billets/:code', limiteur(120, 10 * 60 * 1000), async (req, res) => {
    const trouve = CODE.test(req.params.code) ? await billet(base, req.params.code) : null;
    if (!trouve) return res.status(404).json({ code: 'INTROUVABLE', message: 'Billet introuvable.' });
    res.set('Cache-Control', 'no-store').json({
      code: trouve.code,
      numero: trouve.id,
      capacite: config.capacite,
      nom: trouve.nom,
      prenom: trouve.prenom,
      etablissement: trouve.etablissement,
      filiere: trouve.filiere,
      present: trouve.present_le !== null,
      equipe: sessionValide(req),
    });
  });

  app.get('/api/billets/:code/qr.svg', limiteur(120, 10 * 60 * 1000), async (req, res) => {
    if (!CODE.test(req.params.code) || !(await billet(base, req.params.code))) return res.status(404).end();
    const svg = await QRCode.toString(`${origine(req)}/billet/${req.params.code}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0B1E3F', light: '#FFFFFF' } });
    res.type('image/svg+xml').set('Cache-Control', 'private, max-age=3600').send(svg);
  });

  // ----- Équipe organisatrice -----
  app.post('/api/equipe/connexion', limiteur(10, 15 * 60 * 1000), (req, res) => {
    if (!memeMotDePasse(req.body?.motDePasse)) return res.status(401).json({ code: 'REFUS', message: 'Mot de passe incorrect.' });
    res.cookie('equipe', jeton(), { httpOnly: true, secure: config.production, sameSite: 'strict', maxAge: DUREE_SESSION_MS, path: '/' });
    res.status(204).end();
  });
  app.post('/api/equipe/deconnexion', (_req, res) => {
    res.clearCookie('equipe', { path: '/' });
    res.status(204).end();
  });

  const LISTE = `SELECT id, code, nom, prenom, email, telephone, etablissement, filiere, niveau, domaine, source, inscrit_le, present_le
                 FROM inscription ORDER BY id`;

  app.get('/api/equipe/inscriptions', equipe, async (_req, res) => {
    const { rows } = await base.query(LISTE);
    res.set('Cache-Control', 'no-store').json({ etat: await etat(base, config), presents: rows.filter((r) => r.present_le).length, inscriptions: rows });
  });

  app.post('/api/equipe/inscriptions/:id/presence', equipe, async (req, res) => {
    const present = req.body?.present !== false;
    const { rowCount } = await base.query('UPDATE inscription SET present_le = CASE WHEN $2 THEN COALESCE(present_le, now()) ELSE NULL END WHERE id = $1', [Number(req.params.id) || 0, present]);
    res.status(rowCount ? 204 : 404).end();
  });

  app.delete('/api/equipe/inscriptions/:id', equipe, async (req, res) => {
    const { rowCount } = await base.query('DELETE FROM inscription WHERE id = $1', [Number(req.params.id) || 0]);
    res.status(rowCount ? 204 : 404).end();
  });

  const date = (valeur) => (valeur ? new Date(valeur).toISOString().replace('T', ' ').slice(0, 16) : '');

  app.get('/api/equipe/export.xlsx', equipe, async (_req, res) => {
    const { rows } = await base.query(LISTE);
    const classeur = new ExcelJS.Workbook();
    const feuille = classeur.addWorksheet('Inscriptions', { views: [{ state: 'frozen', ySplit: 1 }] });
    feuille.columns = [
      { header: 'N°', key: 'id', width: 6 },
      { header: 'Code du billet', key: 'code', width: 18 },
      { header: 'Nom', key: 'nom', width: 22 },
      { header: 'Prénom', key: 'prenom', width: 22 },
      { header: 'Adresse électronique', key: 'email', width: 32 },
      { header: 'Téléphone', key: 'telephone', width: 18 },
      { header: 'Établissement', key: 'etablissement', width: 30 },
      { header: 'Filière', key: 'filiere', width: 28 },
      { header: 'Niveau', key: 'niveau', width: 12 },
      { header: 'Domaine préféré', key: 'domaine', width: 24 },
      { header: 'A connu l’événement par', key: 'source', width: 24 },
      { header: 'Inscrit le (UTC)', key: 'inscrit', width: 18 },
      { header: 'Présent le (UTC)', key: 'present', width: 18 },
    ];
    for (const r of rows) feuille.addRow({ ...r, inscrit: date(r.inscrit_le), present: date(r.present_le) });
    const entete = feuille.getRow(1);
    entete.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    entete.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1E3F' } };
    feuille.autoFilter = { from: 'A1', to: 'M1' };
    // Un téléphone commençant par « + » ou un texte commençant par « = » reste du texte, jamais une formule.
    feuille.eachRow((ligne, n) => n > 1 && ligne.eachCell((cellule) => typeof cellule.value === 'string' && (cellule.numFmt = '@')));
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').set('Content-Disposition', 'attachment; filename="inscriptions-voyage-en-terre-tech.xlsx"').set('Cache-Control', 'no-store');
    await classeur.xlsx.write(res);
    res.end();
  });

  app.get('/api/equipe/export.csv', equipe, async (_req, res) => {
    const { rows } = await base.query(LISTE);
    const champ = (v) => {
      let t = v === null || v === undefined ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
      return `"${t.replace(/"/g, '""')}"`;
    };
    const lignes = [['N°', 'Code', 'Nom', 'Prénom', 'Adresse électronique', 'Téléphone', 'Établissement', 'Filière', 'Niveau', 'Domaine préféré', 'Source', 'Inscrit le (UTC)', 'Présent le (UTC)']];
    for (const r of rows) lignes.push([r.id, r.code, r.nom, r.prenom, r.email, r.telephone, r.etablissement, r.filiere, r.niveau, r.domaine, r.source, date(r.inscrit_le), date(r.present_le)]);
    res.type('text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="inscriptions-voyage-en-terre-tech.csv"').set('Cache-Control', 'no-store');
    res.send('﻿' + lignes.map((l) => l.map(champ).join(';')).join('\r\n') + '\r\n');
  });

  // ----- Pages -----
  const page = (fichier, entetes = {}) => (_req, res) => res.set({ 'Cache-Control': 'no-cache', ...entetes }).sendFile(join(PUBLIC, fichier));
  const privee = { 'X-Robots-Tag': 'noindex, nofollow' };
  app.get('/billet/:code', page('billet.html', privee));
  app.get('/equipe', page('equipe.html', privee));
  app.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /equipe\nDisallow: /billet/\nDisallow: /api/\nSitemap: ${origine(req)}/sitemap.xml\n`));
  app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origine(req)}/</loc></url></urlset>\n`));
  // La page d'accueil porte des adresses absolues (aperçus de lien) : l'origine provisoire devient celle de la requête.
  let accueil = null;
  app.get('/', async (req, res) => {
    accueil ??= await import('node:fs/promises').then((fs) => fs.readFile(join(PUBLIC, 'index.html'), 'utf8'));
    res.set('Cache-Control', 'no-cache').type('html').send(accueil.replaceAll('https://origine-du-site.invalid', origine(req)));
  });
  app.use(express.static(PUBLIC, { index: false, maxAge: '7d', setHeaders: (res, chemin) => /\.(css|js|html)$/.test(chemin) && res.set('Cache-Control', 'no-cache') }));
  app.use((_req, res) => res.status(404).sendFile(join(PUBLIC, '404.html')));

  // eslint-disable-next-line no-unused-vars
  app.use((erreur, _req, res, _next) => {
    if (erreur?.type === 'entity.parse.failed' || erreur?.type === 'entity.too.large') return res.status(400).json({ code: 'DEMANDE_INVALIDE', message: 'Demande invalide.' });
    console.error(JSON.stringify({ niveau: 'erreur', message: erreur?.message, pile: erreur?.stack }));
    res.status(500).json({ code: 'ERREUR', message: 'Une erreur est survenue. Réessayez dans un instant.' });
  });

  return app;
}
