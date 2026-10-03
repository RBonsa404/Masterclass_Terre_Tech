// Génère les visuels du site à partir du logo officiel (branding/logo.png) : logo, favicon, icônes, image de partage.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const logo = join(racine, 'branding', 'logo.png');
const img = join(racine, 'public', 'img');
const carre = (taille) => sharp(logo).resize(taille, taille, { fit: 'contain', background: '#FFFFFF' });

await carre(88).webp({ quality: 88 }).toFile(join(img, 'logo-88.webp'));
await carre(32).png().toFile(join(img, 'favicon-32.png'));
await carre(180).png().toFile(join(img, 'apple-touch-icon.png'));
writeFileSync(join(racine, 'public', 'favicon.ico'), await pngToIco(await Promise.all([16, 32, 48].map((t) => carre(t).png().toBuffer()))));

// Image de partage 1200 x 630 : ce que montrent WhatsApp, Facebook et LinkedIn quand le lien est envoyé.
const COTE = 300;
const arrondi = Buffer.from(`<svg width="${COTE}" height="${COTE}"><rect width="${COTE}" height="${COTE}" rx="40" ry="40"/></svg>`);
const logoArrondi = await sharp(await carre(COTE).png().toBuffer()).composite([{ input: arrondi, blend: 'dest-in' }]).png().toBuffer();
const POLICE = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const fond = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="halo" cx="85%" cy="0%" r="80%"><stop offset="0" stop-color="#1D4ED8" stop-opacity="0.75"/><stop offset="1" stop-color="#060B1A" stop-opacity="0"/></radialGradient>
    <linearGradient id="titre" x1="0" x2="1"><stop offset="0" stop-color="#38BDF8"/><stop offset="0.75" stop-color="#FBBF24"/></linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#060B1A"/>
  <rect width="1200" height="630" fill="url(#halo)"/>
  <rect width="1200" height="8" fill="#FBBF24"/>
  <g fill="none" stroke="#38BDF8" stroke-opacity="0.28" stroke-width="2">
    <path d="M1200 120 H1080 L1030 170 H960"/><circle cx="954" cy="170" r="6"/>
    <path d="M0 540 H130 L180 490 H250"/><circle cx="256" cy="490" r="6"/>
    <path d="M1200 500 H1110 L1070 540 H1010"/><circle cx="1004" cy="540" r="6"/>
  </g>
  <text x="430" y="150" font-family="${POLICE}" font-size="26" font-weight="600" fill="#FBBF24" letter-spacing="4">MASTERCLASS · ENTRÉE GRATUITE</text>
  <text x="426" y="262" font-family="${POLICE}" font-size="92" font-weight="800" fill="#FFFFFF">Voyage en</text>
  <text x="426" y="362" font-family="${POLICE}" font-size="92" font-weight="800" fill="url(#titre)">Terre Tech</text>
  <text x="430" y="424" font-family="${POLICE}" font-size="32" fill="#CBD5E1">Décoder le monde du numérique</text>
  <rect x="430" y="462" width="96" height="5" rx="2.5" fill="#38BDF8"/>
  <text x="430" y="520" font-family="${POLICE}" font-size="30" font-weight="700" fill="#FFFFFF">Samedi 17 octobre 2026</text>
  <text x="430" y="562" font-family="${POLICE}" font-size="25" fill="#94A3B8">Amphithéâtre de l’UBS, campus de Tampouy · Ouagadougou</text>
</svg>`);
await sharp(fond)
  .composite([{ input: logoArrondi, left: 80, top: Math.round((630 - COTE) / 2) }])
  .png({ compressionLevel: 9 })
  .toFile(join(img, 'partage.png'));
console.log('Visuels générés.');
