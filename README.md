# Précepteur

Plateforme de révision de leçons pour **Aurelius** et **Livia** : fiche de
révision expliquée, séries d'exercices corrigées (QCM, calculs, réponses
libres…), « Plus loin » (ce qui vient après, au-dessus, ailleurs), suivi de
l'activité et des notes, et un tableau de bord pour les parents.

Ordinateur et mobile (installable sur l'écran d'accueil). Hébergé sur
Netlify, code sur GitHub (`vincent-bidaux/precepteur`).

## Ce que fait l'application

- **Accueil** : un onglet par enfant. Pour chacun : ✨ *Nouveau* (leçons
  jamais ouvertes), 📌 *À suivre* (en cours, ou terminées avec moins de
  12/20), 🏛️ *Leçons passées* (réussies, avec la note). Jours d'affilée, XP et
  niveaux (Discipulus → Philosophus) pour la motivation.
- **Leçon** en trois onglets :
  - 📖 *Réviser* : la fiche de cours complète, exemples dévoilés étape par
    étape, pièges, astuces, table des carrés à retourner, exercices du manuel.
  - ✏️ *S'entraîner* : des séries courtes, une question à la fois, correction
    **immédiate et expliquée**, coup de pouce (plafonne la question à 75 %),
    note sur 20, étoiles, confettis, « refaire mes erreurs ».
  - 🔭 *Plus loin* : ce qui vient après (4e, 3e, lycée), pourquoi ces règles
    existent, où on les retrouve ailleurs (informatique, histoire…), avec
    mini-quiz.
- **Types de questions** : QCM, vrai/faux, nombre, expression (clavier
  mathématique ×, ÷, ², ³, parenthèses — corrigée en *calculant*
  l'expression, pas en comparant du texte), texte à trous (tolère une faute
  d'orthographe et la signale), association, remise en ordre, calcul en
  étapes, **réponse libre**.
- **Réponses libres** : corrigées par mots-clés (idées attendues repérées),
  réponse modèle affichée, auto-évaluation de l'enfant. Si une clé
  `ANTHROPIC_API_KEY` est configurée sur Netlify, Claude corrige en plus la
  réponse et écrit un retour personnalisé ; sinon la correction par
  mots-clés s'applique seule, sans erreur.
- **Espace parents** (`/#/parent`, bouton « Parents » en haut) : par enfant,
  moyenne, temps (7 jours / total), jours actifs, graphique du temps sur 28
  jours, courbe des notes, détail par leçon et par série (meilleure et
  dernière note, essais, temps), points faibles (questions les plus ratées et
  dernière réponse donnée), journal d'activité, et **toutes les réponses
  libres** écrites par l'enfant. Ouvert sans mot de passe pour le moment.

## Architecture

```
index.html, src/main.js     Routeur (#/enfant/<id>/lecon/<leçon>/serie/<série>, #/parent)
src/app.js                  État partagé (journal chargé), navigation
src/ui/                     home, lesson, runner (exercices), dashboard, common, fx
src/lib/grading.js          Correction de chaque type de question (fonctions pures)
src/lib/expr.js             Évaluateur d'expressions (priorités, puissances, crochets)
src/lib/text.js             Normalisation, tolérance orthographique, mots-clés
src/lib/stats.js            Progression, statuts, XP, jours d'affilée, points faibles
src/lib/store.js            Journal côté client : file d'attente locale + envoi à /api/log
src/lib/visits.js           Chronométrage des pages (temps visible uniquement)
src/data/children.js        Les enfants (nom, couleur, emblème, devise)
src/lessons/                Une leçon = un fichier de données ; index.js = registre
netlify/functions/log.js    GET/POST /api/log   (journal, Netlify Blobs)
netlify/functions/grade.js  POST /api/grade     (correction IA optionnelle)
netlify/shared/             Handlers testables, accès stockage, liste blanche des enfants
```

**Données** : tout le suivi est un journal d'évènements (`attempt` = série
terminée, avec chaque réponse ; `visit` = temps passé sur une page).
Stockage Netlify Blobs, store `precepteur`, un blob par enfant et par mois
(`log/<enfant>/<AAAA-MM>`), écritures conditionnelles (etag) pour ne rien
perdre si deux appareils écrivent en même temps, cohérence forte.

**Hors ligne** : chaque évènement est d'abord mis en file dans le
`localStorage`, puis envoyé ; le serveur ignore les doublons. Si le réseau
tombe, l'enfant continue, la pastille « Hors ligne » s'affiche, et tout part
au retour de la connexion. Le serveur est la référence partagée : ce qui est
fait sur le téléphone apparaît sur l'ordinateur.

## Développer

```bash
git clone https://github.com/vincent-bidaux/precepteur.git
cd precepteur
npm install
npm run dev          # http://localhost:5173 — l'API tourne aussi, stockée dans .data/
npm test             # tests unitaires (correction, leçons, stats, API)
npm run test:e2e     # parcours complets dans Chromium, ordinateur + mobile
npm run check        # tout : unitaires + build + e2e
```

Pas besoin de `netlify-cli` : un petit plugin Vite (`vite.config.js`) sert
`/api/log` et `/api/grade` avec les mêmes handlers que les fonctions
Netlify, sur un stockage fichier.

## Déployer sur Netlify (une seule fois)

1. Netlify → *Add new site* → *Import an existing project* → GitHub →
   dépôt `vincent-bidaux/precepteur`.
2. Rien à régler : tout est lu dans `netlify.toml` (build `npm run build`,
   publication `dist`, fonctions `netlify/functions`).
3. Nom du site : `precepteur` → https://precepteur.netlify.app
4. Netlify Blobs fonctionne sans configuration.
5. *(Optionnel)* Correction IA des réponses libres : *Site configuration →
   Environment variables* → `ANTHROPIC_API_KEY`. Modèle utilisé :
   `claude-opus-5`, effort réduit (réponses courtes).

Ensuite chaque push sur `main` redéploie.

## Ajouter une leçon

Le plus simple : envoyer à Claude les photos de la leçon en demandant « crée
la leçon suivante dans Précepteur ». À la main :

1. Copier `src/lessons/maths-regles-de-calcul-1.js` en
   `src/lessons/<matiere>-<sujet>.js` et remplacer le contenu : `id` unique,
   `addedAt` (date du jour : la leçon apparaît dans « Nouveau »), `children`
   (`["aurelius"]`, `["livia"]` ou les deux), `course` (fiche), `series`
   (exercices), `beyond` (plus loin).
2. L'importer dans `src/lessons/index.js`.
3. `npm test` : les tests vérifient **automatiquement** chaque leçon —
   identifiants uniques, bonnes réponses recalculées (« Calcule … », étapes,
   exemples de la fiche), QCM valides, et que la réponse modèle de chaque
   question libre obtient bien tous les points.

Mini-balisage dans les textes : `**gras**`, `*italique*`, `5^2` ou `2^{10}`
pour les exposants, `\n` pour un retour à la ligne.

**Ne jamais changer l'`id` d'une leçon, d'une série ou d'une question déjà
utilisée** : l'historique des notes y est rattaché.

## Idées pour plus tard

- Protéger l'espace parents par un mot de passe (variable d'environnement
  Netlify + cookie signé).
- Répétition espacée : reproposer automatiquement les questions ratées
  quelques jours plus tard.
