// Tests sur un PostgreSQL réel (compose.dev.yml), dans une base réservée aux tests et recréée à chaque exécution.
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import pg from 'pg';
import { creerApplication } from '../server/app.js';
import { preparerSchema } from '../server/db.js';
import { nouveauCode, valider } from '../server/inscriptions.js';

const ADMIN = process.env.TEST_DATABASE_ADMIN ?? 'postgresql://postgres:postgres@localhost:5434/postgres';
const NOM_BASE = 'masterclass_test';

const personne = (n, extra = {}) => ({
  nom: 'Ouedraogo',
  prenom: 'Awa',
  email: `participant${n}@exemple.test`,
  telephone: '+226 70 00 00 00',
  etablissement: 'Institut Supérieur de Technologie (IST)',
  filiere: 'Génie logiciel',
  niveau: 'Licence 2',
  consentement: true,
  ...extra,
});

let base, serveur, url;
const config = { production: false, capacite: 5, cloture: new Date(Date.now() + 86400000), motDePasseAdmin: 'mot-de-passe-de-test', secretDeSession: 'secret-de-test-secret-de-test-secret', adressePublique: '' };

const appel = (chemin, options = {}) => fetch(url + chemin, options);
const envoyer = (corps) => appel('/api/inscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
async function session() {
  const reponse = await appel('/api/equipe/connexion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motDePasse: config.motDePasseAdmin }) });
  assert.equal(reponse.status, 204);
  return reponse.headers.get('set-cookie').split(';')[0];
}

before(async () => {
  const admin = new pg.Client({ connectionString: ADMIN });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${NOM_BASE} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${NOM_BASE}`);
  await admin.end();
  base = new pg.Pool({ connectionString: ADMIN.replace(/\/[^/]*$/, `/${NOM_BASE}`), max: 20 });
  await preparerSchema(base);
  const app = creerApplication(base, config);
  // La limite de débit protège la production ; les tests envoient volontairement des rafales depuis une seule adresse.
  app.set('trust proxy', true);
  serveur = app.listen(0);
  url = `http://127.0.0.1:${serveur.address().port}`;
});

after(async () => {
  serveur.close();
  await base.end();
});

let adresse = 0;
beforeEach(async () => {
  await base.query('TRUNCATE inscription RESTART IDENTITY');
  config.capacite = 5;
  config.cloture = new Date(Date.now() + 86400000);
});
// Chaque requête se présente sous une adresse différente : la limite de débit par adresse n'interfère pas.
const origine = () => ({ 'Content-Type': 'application/json', 'X-Forwarded-For': `10.0.${Math.floor(adresse / 250)}.${(adresse++ % 250) + 1}` });
const inscrireDepuis = (corps) => appel('/api/inscriptions', { method: 'POST', headers: origine(), body: JSON.stringify(corps) });

describe('validation', () => {
  it('accepte une saisie correcte et normalise les valeurs', () => {
    const { donnees, erreurs } = valider(personne(1, { email: '  Awa.O@Exemple.TEST ', nom: '  Ouedraogo   Kaboré ' }));
    assert.equal(erreurs, undefined);
    assert.equal(donnees.email, 'awa.o@exemple.test');
    assert.equal(donnees.nom, 'Ouedraogo Kaboré');
    assert.equal(donnees.telephone, '+22670000000');
  });

  it('signale chaque champ fautif', () => {
    const { erreurs } = valider({ nom: 'A', prenom: '', email: 'pas-une-adresse', telephone: '12', etablissement: '', filiere: '', niveau: 'Doctorat', consentement: false });
    assert.deepEqual(Object.keys(erreurs).sort(), ['consentement', 'email', 'etablissement', 'filiere', 'niveau', 'nom', 'prenom', 'telephone']);
  });

  it('produit des codes de billet au format attendu', () => {
    assert.match(nouveauCode(), /^VTT-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });
});

describe('inscription', () => {
  it('enregistre, délivre un billet et met le compteur à jour', async () => {
    const reponse = await inscrireDepuis(personne(1));
    assert.equal(reponse.status, 201);
    const { code, billet } = await reponse.json();
    assert.match(code, /^VTT-/);
    assert.equal(billet, `/billet/${code}`);

    const etat = await (await appel('/api/etat')).json();
    assert.deepEqual({ inscrits: etat.inscrits, restantes: etat.restantes, ouvert: etat.ouvert }, { inscrits: 1, restantes: 4, ouvert: true });

    const lu = await (await appel(`/api/billets/${code}`)).json();
    assert.equal(lu.prenom, 'Awa');
    assert.equal(lu.numero, 1);
    assert.equal(lu.email, undefined, 'le billet ne révèle ni adresse ni téléphone');
    const qr = await appel(`/api/billets/${code}/qr.svg`);
    assert.equal(qr.status, 200);
    assert.match(await qr.text(), /<svg/);
  });

  it('refuse une saisie invalide avec le détail par champ', async () => {
    const reponse = await inscrireDepuis(personne(1, { email: 'faux', consentement: false }));
    assert.equal(reponse.status, 422);
    const corps = await reponse.json();
    assert.ok(corps.erreurs.email && corps.erreurs.consentement);
  });

  it('refuse une seconde inscription avec la même adresse, quelle que soit la casse', async () => {
    assert.equal((await inscrireDepuis(personne(1))).status, 201);
    const reponse = await inscrireDepuis(personne(1, { email: 'PARTICIPANT1@exemple.test' }));
    assert.equal(reponse.status, 409);
    assert.equal((await reponse.json()).code, 'DEJA_INSCRIT');
  });

  it('ignore sans le dire une demande qui remplit le champ piège', async () => {
    const reponse = await inscrireDepuis(personne(1, { site: 'https://exemple.test' }));
    assert.equal(reponse.status, 201);
    assert.equal((await (await appel('/api/etat')).json()).inscrits, 0);
  });

  it('n’attribue jamais plus de places que la capacité, même sous des demandes simultanées', async () => {
    config.capacite = 200;
    // 260 demandes pour 200 places, par vagues de 52 demandes simultanées (le poste de test n'accepte pas 260 connexions d'un coup).
    const statuts = [];
    for (let vague = 0; vague < 5; vague++) {
      const reponses = await Promise.all(Array.from({ length: 52 }, (_, i) => inscrireDepuis(personne(vague * 52 + i))));
      statuts.push(...reponses.map((r) => r.status));
    }
    assert.equal(statuts.filter((s) => s === 201).length, 200);
    assert.equal(statuts.filter((s) => s === 409).length, 60);
    const etat = await (await appel('/api/etat')).json();
    assert.deepEqual({ inscrits: etat.inscrits, restantes: etat.restantes, complet: etat.complet, ouvert: etat.ouvert }, { inscrits: 200, restantes: 0, complet: true, ouvert: false });
    const refus = await inscrireDepuis(personne(999));
    assert.equal((await refus.json()).code, 'COMPLET');
  });

  it('refuse toute inscription après la clôture', async () => {
    config.cloture = new Date(Date.now() - 1000);
    const reponse = await inscrireDepuis(personne(1));
    assert.equal(reponse.status, 403);
    assert.equal((await reponse.json()).code, 'INSCRIPTIONS_CLOSES');
    assert.equal((await (await appel('/api/etat')).json()).cloturees, true);
  });

  it('répond 404 pour un billet inconnu ou mal formé', async () => {
    assert.equal((await appel('/api/billets/VTT-AAAA-BBBB')).status, 404);
    assert.equal((await appel('/api/billets/nimporte-quoi')).status, 404);
  });
});

describe('équipe organisatrice', () => {
  it('refuse l’accès sans session et un mot de passe erroné', async () => {
    assert.equal((await appel('/api/equipe/inscriptions')).status, 401);
    assert.equal((await appel('/api/equipe/export.xlsx')).status, 401);
    const refus = await appel('/api/equipe/connexion', { method: 'POST', headers: origine(), body: JSON.stringify({ motDePasse: 'erreur' }) });
    assert.equal(refus.status, 401);
    assert.equal((await appel('/api/equipe/inscriptions', { headers: { Cookie: 'equipe=9999999999999.fausse-signature' } })).status, 401);
  });

  it('liste les inscriptions, valide une présence, retire une inscription et libère la place', async () => {
    await inscrireDepuis(personne(1));
    await inscrireDepuis(personne(2, { prenom: 'Issa' }));
    const Cookie = await session();

    let liste = await (await appel('/api/equipe/inscriptions', { headers: { Cookie } })).json();
    assert.equal(liste.inscriptions.length, 2);
    assert.equal(liste.inscriptions[0].email, 'participant1@exemple.test');

    assert.equal((await appel('/api/equipe/inscriptions/1/presence', { method: 'POST', headers: { Cookie, 'Content-Type': 'application/json' }, body: '{"present":true}' })).status, 204);
    liste = await (await appel('/api/equipe/inscriptions', { headers: { Cookie } })).json();
    assert.equal(liste.presents, 1);

    assert.equal((await appel('/api/equipe/inscriptions/2', { method: 'DELETE', headers: { Cookie } })).status, 204);
    assert.equal((await (await appel('/api/etat')).json()).restantes, 4);
  });

  it('exporte la liste en Excel et en CSV', async () => {
    await inscrireDepuis(personne(1, { nom: 'Kaboré', filiere: '=1+1' }));
    const Cookie = await session();

    const excel = await appel('/api/equipe/export.xlsx', { headers: { Cookie } });
    assert.equal(excel.status, 200);
    assert.match(excel.headers.get('content-type'), /spreadsheetml/);
    const octets = Buffer.from(await excel.arrayBuffer());
    assert.equal(octets.subarray(0, 2).toString(), 'PK', 'un fichier .xlsx est une archive ZIP');

    const csv = await (await appel('/api/equipe/export.csv', { headers: { Cookie } })).text();
    assert.match(csv, /Kaboré/);
    assert.match(csv, /"'=1\+1"/, 'une valeur commençant par « = » est neutralisée');
  });
});

describe('pages', () => {
  it('sert la page d’accueil avec des adresses absolues pour les aperçus de lien', async () => {
    config.adressePublique = 'https://masterclass.exemple.test';
    const html = await (await appel('/')).text();
    config.adressePublique = '';
    assert.match(html, /property="og:image" content="https:\/\/masterclass\.exemple\.test\/img\/partage\.png"/);
    assert.doesNotMatch(html, /origine-du-site\.invalid/);
  });

  it('répond sur la sonde de santé et protège les pages privées de l’indexation', async () => {
    assert.equal((await appel('/sante')).status, 200);
    assert.equal((await appel('/equipe')).headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal((await appel('/page-inexistante')).status, 404);
  });
});
