import { creerApplication } from './app.js';
import { lireConfiguration } from './config.js';
import { ouvrirBase, preparerSchema } from './db.js';

const config = lireConfiguration();
const base = ouvrirBase(config.baseDeDonnees, config.chiffrementBase);

// La base peut démarrer après le service : quelques tentatives avant d'abandonner.
for (let essai = 1; ; essai++) {
  try {
    await preparerSchema(base);
    break;
  } catch (erreur) {
    if (essai >= 10) throw erreur;
    console.warn(`Base indisponible (tentative ${essai}) : ${erreur.message}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}

const serveur = creerApplication(base, config).listen(config.port, () => {
  console.log(`Masterclass « Voyage en Terre Tech » : service démarré sur le port ${config.port} (${config.capacite} places).`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => serveur.close(() => base.end().finally(() => process.exit(0))));
}
