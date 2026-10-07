<div align="center">

<img src="branding/logo.png" alt="Logo du Club Informatique de l'IST" width="104" />

# Voyage en Terre Tech

Site d'inscription à la masterclass « Voyage en Terre Tech : Décoder le Monde du Numérique »
Club Informatique de l'IST · samedi 17 octobre 2026 · Ouagadougou

![Node.js](https://img.shields.io/badge/Node.js-24-5FA04E?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Railway](https://img.shields.io/badge/D%C3%A9ploiement-Railway-0B0D0E?logo=railway&logoColor=white)

</div>

---

## Ce que fait le site

| Fonction | Détail |
|---|---|
| Page de l'événement | présentation, sept escales et leurs intervenants, programme de la matinée, informations pratiques |
| Inscription gratuite | formulaire court ; une seule inscription par adresse électronique |
| Quota | 200 places, dont 35 réservées aux invités : 165 sont ouvertes à l'inscription ; compteur en direct ; une fois ces places prises, l'événement est affiché complet et le formulaire se ferme |
| Ouverture programmée | avant la date d'ouverture, la page affiche un compte à rebours, propose un rappel d'agenda et le partage du lien ; à l'heure dite, le formulaire apparaît de lui-même |
| Clôture | les inscriptions s'arrêtent à la date fixée (16 octobre 2026 par défaut) |
| Billet | carte d'embarquement nominative avec code et code QR, imprimable ou enregistrable en PDF |
| Espace de l'équipe | liste des inscrits, recherche, validation des présences, retrait d'une inscription, export Excel et CSV |
| Partage | aperçu du lien (titre, description, image) sur WhatsApp, Facebook, LinkedIn |

Le site tient en un seul service : un serveur Node.js qui sert les pages et l'API, relié à une base PostgreSQL.

## Démarrer en local

Prérequis : Node.js 22 ou plus récent, Docker.

1. Installer les dépendances :

   ```bash
   npm ci
   ```

2. Démarrer la base PostgreSQL (port 5434) :

   ```bash
   docker compose -f compose.dev.yml up -d
   ```

3. Démarrer le site :

   ```bash
   npm run dev
   ```

| Adresse | Contenu |
|---|---|
| http://localhost:3000 | page de l'événement et formulaire |
| http://localhost:3000/equipe | espace de l'équipe (mot de passe local : `admin-local-seulement`) |
| http://localhost:3000/sante | sonde de santé |

Le schéma de la base se crée au premier démarrage.

## Variables d'environnement

Le fichier [`.env.example`](.env.example) les liste toutes. Aucun secret n'est écrit dans le dépôt.

| Variable | Production | Défaut | Description |
|---|:---:|---|---|
| `NODE_ENV` | requise | | `production` en ligne (déjà fixée dans l'image) |
| `PORT` | fournie par l'hébergeur | `3000` | port d'écoute |
| `DATABASE_URL` | requise | base locale | adresse de la base PostgreSQL |
| `DATABASE_SSL` | facultative | `false` | `true` seulement si la base est jointe par son adresse publique |
| `ADMIN_PASSWORD` | requise | | mot de passe de l'espace de l'équipe, 12 caractères au moins |
| `SESSION_SECRET` | requise | | secret de signature des sessions, 32 caractères aléatoires au moins |
| `CAPACITE` | facultative | `200` | nombre de places |
| `PLACES_INVITES` | facultative | `35` | places retenues pour les invités, comptées dans la capacité |
| `OUVERTURE_INSCRIPTIONS` | facultative | `2026-10-07T00:00:00Z` | date et heure d'ouverture (heure d'Ouagadougou = UTC) |
| `CLOTURE_INSCRIPTIONS` | facultative | `2026-10-16T23:59:59Z` | date et heure de clôture (heure d'Ouagadougou = UTC) |
| `PUBLIC_URL` | facultative | adresse de la requête | adresse publique du site, sans barre finale ; à renseigner avec un domaine personnalisé |

En production, le service refuse de démarrer si `ADMIN_PASSWORD` ou `SESSION_SECRET` manquent ou sont trop courts.

Pour produire un secret de session :

```bash
openssl rand -base64 48
```

## Déploiement sur Railway

1. Créer un projet, puis **+ New → Database → PostgreSQL**.
2. **+ New → GitHub Repo** : choisir ce dépôt. Railway lit `railway.toml` (construction par le `Dockerfile`, sonde `/sante`).
3. Dans le service, onglet **Variables** :

   | Variable | Valeur |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `ADMIN_PASSWORD` | mot de passe de l'équipe, 12 caractères au moins |
   | `SESSION_SECRET` | chaîne aléatoire de 32 caractères au moins |

4. **Settings → Networking → Generate Domain**. Le port cible est celui de la variable `PORT` fournie par Railway.
5. Vérifier : `https://<domaine>/sante` répond `ok`, la page d'accueil affiche « 200 places restantes ».

`Postgres` est le nom du service de base dans le projet ; l'adapter s'il porte un autre nom.

## Ouverture et numérotation

- **Changer l'heure d'ouverture** : modifier `OUVERTURE_INSCRIPTIONS` dans les variables du service, au format `AAAA-MM-JJTHH:MM:SSZ`. Minuit dans la nuit de mercredi à jeudi 8 octobre s'écrit `2026-10-08T00:00:00Z` ; minuit dans la nuit de jeudi à vendredi s'écrit `2026-10-09T00:00:00Z`.
- **Ouvrir tout de suite** : donner à cette variable une date passée.
- **Numérotation des billets** : quand la table des inscriptions est vide au démarrage du service, la numérotation repart de 001. Après avoir retiré des inscriptions d'essai, il suffit donc de redémarrer le service.
- **Invités** : leurs places ne passent pas par le formulaire. Elles sont simplement retirées des places ouvertes et signalées sur la page.

## Le jour de l'événement

1. Sur un téléphone, ouvrir `https://<domaine>/equipe` et se connecter.
2. Scanner le code QR d'un billet avec l'appareil photo : la page du billet s'ouvre avec un bouton **Valider la présence**, visible seulement pour l'équipe connectée.
3. Sans code QR, rechercher le participant par son nom dans la liste et cliquer sur **Valider**.
4. L'export Excel contient la date de validation de chaque présence.

## Tests

```bash
npm test
```

Les tests utilisent la base de `compose.dev.yml`, dans une base séparée (`masterclass_test`) recréée à chaque exécution. Ils couvrent la validation, les doublons, l'ouverture programmée, les places des invités, la clôture, la numérotation des billets, les exports, l'accès de l'équipe et le quota : 260 demandes simultanées pour 200 places donnent exactement 200 inscriptions.

## Organisation

```
.
├── server/
│   ├── index.js          démarrage : configuration, base, écoute
│   ├── app.js            routes, sécurité, session de l'équipe, exports
│   ├── inscriptions.js   validation, quota sous verrou, billets
│   ├── db.js             connexion et schéma
│   └── config.js         lecture de l'environnement
├── public/               pages, styles, scripts, polices, images
├── scripts/              génération des visuels à partir du logo
├── test/                 tests d'intégration
├── Dockerfile            image de production
└── railway.toml          réglages de déploiement
```

## Données personnelles

Les informations saisies (nom, prénom, adresse électronique, téléphone, établissement, filière, niveau) servent uniquement à organiser la masterclass. Elles ne sont visibles que dans l'espace de l'équipe. Les fichiers exportés contiennent des données personnelles : ils se conservent dans un espace à accès restreint, jamais dans le dépôt. Après l'événement, la base peut être supprimée avec le projet Railway.

## Contact

Club Informatique de l'IST, Institut Supérieur de Technologie, Ouagadougou
[clubinformatique.ist@gmail.com](mailto:clubinformatique.ist@gmail.com)
