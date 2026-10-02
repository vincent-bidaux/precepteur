# Précepteur

Plateforme de révision de leçons pour **Aurelius** et **Livia** : fiche de
révision expliquée, séries d'exercices corrigées (QCM, calculs, réponses
libres…), « Plus loin » (ce qui vient après, au-dessus, ailleurs), suivi de
l'activité et des notes, et un tableau de bord pour les parents.

Ordinateur et mobile (installable sur l'écran d'accueil). Hébergé sur
Netlify, code sur GitHub (`vincent-bidaux/precepteur`).

## Ce que fait l'application

- **Accueil** : un onglet par enfant. Pour chacun : 📚 *Mes matières*
  (leçons, statut, avancement et moyenne par matière ; les autres matières
  enseignées dans sa classe sont listées, un toucher prépare une demande), ✨ *Nouveau* (leçons
  jamais ouvertes), 📌 *À suivre*, 🗄️ *Leçons archivées* (bouton « Archiver »
  sur chaque leçon, « Ressortir » pour la remettre), filtre par matière et tri
  par date, et 📬 *Demander une leçon* aux parents. Chaque leçon affiche sa
  matière (une icône par matière) et sa classe (« 📐 Mathématiques · 5e »).
  Jours d'affilée, XP et niveaux (Discipulus → Philosophus) pour la motivation.
- **Deux notes par test** (et pour la leçon) : la *note initiale* (première
  tentative — c'est elle qui compte dans les moyennes : il faut être concentré
  dès la première fois) et la *note après reprise*, qu'on améliore autant
  qu'on veut avec les boutons de chaque test : « 🔄 Refaire le test » et
  « 🎯 Refaire les questions mal répondues ».
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
  réponse modèle affichée. Si l'enfant pense avoir bien répondu avec d'autres
  mots, il clique « 🙋 J'ai bien répondu, je mérite les points » : la réponse
  est surlignée dans le Suivi parent, qui *valide* ou *refuse* les points. Si une clé
  `ANTHROPIC_API_KEY` est configurée sur Netlify, Claude corrige en plus la
  réponse et écrit un retour personnalisé ; sinon la correction par
  mots-clés s'applique seule, sans erreur.
- **Espace parents › Leçons** (`/#/parent/lecons`) : **créer une leçon avec
  Claude** à partir de photos (cours, fiche, cahier), d'un texte (plan,
  notes) ou simplement d'une partie du programme (« Programme de CM2 : les
  unités de mesure » : Claude consulte le programme officiel). La création
  se fait en arrière-plan : la leçon apparaît « en cours de création » et on
  peut fermer la page (ou arrêter la création). Réglages à la création :
  **modèle** (Haiku 4.5 économique, Sonnet 5 recommandé, Opus 5 qualité
  maximale, avec le coût estimé), **longueur de la fiche** et **nombre de
  questions** (curseurs, avec temps estimés ; par défaut fiche moyenne et
  40 questions), et **correction des réponses libres par l'IA** (interrupteur,
  modifiable ensuite leçon par leçon : sans IA, correction par mots-clés et
  aucun coût), et **illustrations par l'IA** (schémas SVG dans la fiche et
  les questions ; désactivé par défaut, coût supplémentaire affiché). La
  liste « Toutes les leçons » a des onglets Toutes / Aurelius / Livia, un
  filtre par matière, un tri par date et 20 leçons par page ; chaque brique
  est repliée, « Gérer » la déplie pour corriger le titre, la matière et la
  classe, choisir les enfants, publier… Les **demandes des enfants**
  apparaissent en haut : « Créer cette leçon » pré-remplit le formulaire.
- **Coûts IA** : coût réel de chaque création (sur la leçon) et des
  corrections de réponses libres (par leçon et par enfant), dans l'onglet
  Leçons et dans le tableau de bord. Tarifs dans `src/lib/pricing.js`. Claude produit la fiche
  de révision, 5 à 8 séries d'exercices corrigés et la partie « Plus loin ».
  La leçon est vérifiée automatiquement (résultats de calcul recalculés,
  questions mal formées retirées, remarques affichées), puis enregistrée en
  **brouillon** : on la parcourt en **aperçu** (rien n'est enregistré dans
  les statistiques), on choisit **pour quel enfant** elle est, et on la
  **publie** — elle apparaît alors dans « Nouveau » chez l'enfant. On peut
  aussi réattribuer, dépublier ou supprimer n'importe quelle leçon (les
  leçons intégrées au code ne se suppriment pas, mais s'attribuent).
- **Espace parents › Suivi** (`/#/parent`, bouton « Parents » en haut) :
  résumé de chaque enfant (moyenne des notes initiales, temps, **coût IA**),
  coûts IA par leçon (les plus récents d'abord, 15 par page), tableau des
  **matières** (icône, nombre de leçons, notes initiale / après reprise, coût,
  lien vers le **programme officiel** du cycle sur éduscol selon la classe de
  l'enfant, réglable sur place), puis un onglet par enfant : temps sur 28
  jours en heures (gradué au quart d'heure), courbe des notes, leçons (20 par
  page, détail des séries replié), points faibles, journal et réponses libres
  (listes rognées avec « Voir plus » / « Voir tout »).

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
src/lessons/                Leçons intégrées au code (une leçon = un fichier de données)
src/catalog.js              Catalogue complet : leçons intégrées + créées, affectation, statut
src/ui/lessons-admin.js     Espace parents › Leçons (photos → Claude, publication, affectation)
src/lib/lesson-check.js     Vérification / réparation d'une leçon (tests, serveur, aperçu)
src/lib/sse.js, images.js   Lecture du flux de Claude ; redimensionnement des photos
netlify/functions/log.js    GET/POST /api/log   (journal, Netlify Blobs)
netlify/functions/grade.js  POST /api/grade     (correction IA optionnelle)
netlify/functions/lessons.js GET/POST/PUT/DELETE /api/lessons (leçons créées + réglages)
netlify/functions/jobs.js   GET/POST/DELETE /api/jobs (leçons en cours de création)
netlify/functions/jobs-tick.js  fonction planifiée (chaque minute) : fait avancer les créations
netlify/shared/             Handlers testables, accès stockage, liste blanche des enfants
```

**Données** : tout le suivi est un journal d'évènements (`attempt` = série
terminée, avec chaque réponse ; `visit` = temps passé sur une page).
Stockage Netlify Blobs, store `precepteur`, un blob par enfant et par mois
(`log/<enfant>/<AAAA-MM>`), écritures conditionnelles (etag) pour ne rien
perdre si deux appareils écrivent en même temps, cohérence forte.

**Leçons créées avec Claude** : `lessons/<id>` (contenu) et `meta/lessons`
(affectation et statut de toutes les leçons, intégrées comprises).

**Création en arrière-plan** : la demande (photos et/ou texte) part dans
l'**API Batches** d'Anthropic (`jobs/<id>`), traitée sans que la page reste
ouverte — en général quelques minutes, au plus 24 h, et 50 % moins cher. Le
serveur vérifie où elle en est chaque minute (fonction planifiée
`jobs-tick`, uniquement sur le site de production) et à chaque ouverture de
l'espace parents ; quand Claude a fini, la leçon est vérifiée, réparée et
enregistrée en brouillon, avec ses remarques de vérification. On peut
arrêter une création en cours (annulée chez Anthropic) ou relancer une
création échouée. Claude peut consulter le **programme officiel** (recherche
web limitée à education.gouv.fr et eduscol.education.fr), par exemple pour
« Programme de CM2 : les unités de mesure ». Modèle au choix (Sonnet 5 par
défaut) ; corrections des réponses libres avec Haiku 4.5, le moins cher.
(Les fonctions « background » de Netlify, plus rapides à suivre, ne sont pas
disponibles sur l'offre gratuite.)

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
5. *Site configuration → Environment variables* :
   - `ANTHROPIC_API_KEY` (clé sur https://console.anthropic.com) : **nécessaire
     pour créer des leçons avec Claude**, et active aussi la correction IA
     des réponses libres. Sans elle, l'application fonctionne mais ces deux
     fonctions sont désactivées (message explicite).
   - `PRECEPTEUR_CODE_PARENT` *(recommandé)* : un code que l'on demandera
     avant de créer, publier, attribuer ou supprimer une leçon (la génération
     coûte quelques dizaines de centimes par leçon : ce code évite qu'un
     inconnu tombé sur l'adresse ne s'en serve). Il est mémorisé sur
     l'appareil après la première saisie.
   Après avoir ajouté une variable : *Deploys → Trigger deploy*.

Ensuite chaque push sur `main` redéploie.

## Ajouter une leçon

Le plus simple : **Parents › Leçons › Créer une leçon avec Claude**, avec
les photos. Pour une leçon intégrée au code (versionnée dans git) :

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
