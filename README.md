# MCweb

Un jeu de construction en blocs façon Minecraft, **entièrement jouable dans le navigateur**.
Écrit en JavaScript pur avec WebGL2 : aucune dépendance, aucune étape de compilation, aucune image
ni aucun son externe. **Il se joue aussi en LIVE sur TikTok, avec tous les spectateurs à la fois** (voir plus bas). Les textures, les sons, la musique et le monde sont générés par le code.

## Lancer le jeu

Les modules JavaScript doivent être servis en HTTP (ouvrir `index.html` directement depuis le disque ne marche pas).

```bash
npm start            # serveur intégré, sans dépendance → http://localhost:8080
# ou
python3 -m http.server 8080
```

Puis ouvrez <http://localhost:8080>. Il faut un navigateur récent avec WebGL2 (Chrome, Edge, Firefox, Safari 15+).

### Publier sur GitHub Pages

Le projet est 100 % statique : dans *Settings → Pages*, choisissez « Deploy from a branch », la branche `main`
et le dossier `/ (root)`. Le jeu sera servi tel quel.

## Ce qui est jouable

- **Monde infini et procédural** (graine au choix) : océans, plages, plaines, forêts, forêts de bouleaux,
  déserts, taïgas enneigées, montagnes, grottes, lacs de lave en profondeur, minerais (charbon, fer, or, diamant),
  arbres, fleurs, cactus.
- **Lumière** du soleil et des torches qui se propage bloc par bloc, occlusion ambiante, cycle jour/nuit
  (soleil, lune, étoiles, couchers de soleil), nuages, brouillard.
- **Eau et lave qui s'écoulent** (sources infinies, obsidienne et pierre au contact), sable et gravier qui tombent,
  torches et plantes qui ont besoin d'un support, herbe qui pousse, pousses d'arbres qui grandissent.
- **Mode Survie** : santé, faim, air sous l'eau, dégâts de chute, lave, cactus ; minage avec temps et outils
  (bois, pierre, fer, or, diamant) qui s'usent ; objets qui tombent au sol et se ramassent.
- **Artisanat** 2×2 dans l'inventaire et 3×3 sur la table d'artisanat, **four** avec combustible,
  **coffres**, **lit** (dormir pour passer la nuit, point de réapparition), nourriture (cuire la viande),
  TNT et briquet ; les feuilles tombent quand on coupe le tronc.
- **Créatures** : cochons, vaches, moutons, poulets (passifs), zombies qui brûlent au soleil et creepers
  qui explosent (hostiles, la nuit et dans le noir).
- **Mode Créatif** : tous les blocs, vol (double saut), casse instantanée.
- **Sauvegarde automatique** de vos mondes dans le navigateur (IndexedDB), plusieurs mondes.
- **Commandes** (`T` ou `/`) : `/gamemode`, `/time set`, `/tp`, `/give`, `/summon`, `/kill`, `/spawnpoint`, `/seed`…
- **Commandes tactiles** sur téléphone et tablette (joystick, appui court = utiliser, appui long = miner).
- Interface et textes en français, touches ZQSD (AZERTY) ou WASD (QWERTY) reconnues automatiquement.

## Commandes

| Touche | Action |
| --- | --- |
| Z Q S D (ou W A S D) | Se déplacer |
| Souris | Regarder |
| Clic gauche (maintenir) | Miner / attaquer |
| Clic droit | Poser un bloc, ouvrir une table/un four/un coffre, manger (maintenir) |
| Clic molette | Prendre le bloc visé (créatif) |
| Espace | Sauter, nager — double appui : voler en créatif |
| Maj | S'accroupir (ne tombe pas des rebords), descendre en vol |
| Ctrl ou double Z | Courir |
| 1 à 9, molette | Barre d'objets |
| E | Inventaire |
| A (ou Q en QWERTY) | Jeter l'objet tenu (Ctrl : toute la pile) |
| T, / | Discussion et commandes |
| F3 | Informations de débogage |
| F1 | Masquer l'interface |
| Échap | Pause |

Dans l'inventaire : clic gauche pour prendre/poser une pile, clic droit pour en prendre la moitié ou poser un seul
objet, Maj+clic pour ranger rapidement, touches 1–9 pour échanger avec la barre d'objets.

### Premiers pas en survie

1. Frappez un arbre pour récupérer des bûches, transformez-les en planches (inventaire, `E`).
2. 4 planches → table d'artisanat. Posez-la et faites un clic droit dessus.
3. 2 planches en colonne → bâtons ; 3 planches + 2 bâtons → pioche en bois.
4. Minez de la pierre, fabriquez des outils en pierre et un four (8 pierres taillées).
5. Charbon + bâton → 4 torches. Faites cuire le fer dans le four pour des outils en fer.

## Jouer en LIVE sur TikTok

Le mode LIVE transforme une diffusion TikTok en partie **jouée par tous les spectateurs à la fois** :

- **les commentaires pilotent le joueur** : `avance`, `gauche`, `droite`, `saute`, `mine`, `creuse`, `pose`, `attaque`,
  `fabrique pioche`… ;
- **les cadeaux changent la partie** : un zombie ou un creeper qui porte le pseudo du donateur, une pluie de TNT, un kit
  de survie, une pluie de diamants… ;
- **les likes remplissent une jauge** qui soigne le joueur tous les 100 likes, **un abonnement** fait apparaître un animal
  au nom du nouvel abonné, **un partage** donne du pain ;
- un **fil rouge** donne un but commun au LIVE : de la première bûche jusqu'au diamant (10 objectifs), avec le compteur de
  morts et le nom de celui dont le creeper a tué le joueur.

L'écran est pensé pour le format vertical 1080 × 1920 et laisse libres les zones que l'appli TikTok recouvre chez les
spectateurs (haut, commentaires en bas, boutons à droite).

### Essayer tout de suite (sans être en LIVE)

Ouvrez le jeu avec `?live=demo` (par exemple <http://localhost:8080/?live=demo>, ou sur GitHub Pages) : des spectateurs
simulés envoient des commandes, des cadeaux et des likes. Le bouton « Jouer en LIVE sur TikTok » de l'écran titre y mène aussi.

### Pendant un vrai LIVE

Il faut Node.js 20 ou plus récent sur l'ordinateur qui diffuse.

```bash
npm install                       # une seule fois : installe tiktok-live-connector
npm run live -- @votre_pseudo     # relaie votre chat TikTok au jeu → http://localhost:8080/?live
npm run live -- --demo            # même chose avec des spectateurs simulés, pour régler la scène
```

1. Dans **TikTok LIVE Studio** ou **OBS**, ajoutez une source « Navigateur » (ou « Lien ») pointant vers
   `http://localhost:8080/?live`, en **1080 × 1920**.
2. Lancez votre LIVE. Le pont se connecte tout seul à votre chat (et réessaie si vous n'êtes pas encore en direct) ;
   l'état de la connexion s'affiche en haut de l'écran du jeu.
3. Le monde « LIVE TikTok » est sauvegardé dans le navigateur : le LIVE suivant reprend là où le précédent s'est arrêté.

Options d'adresse (à ajouter après `?live`) :

| Option | Effet |
| --- | --- |
| `&vote` | Mode démocratie : toutes les 3 s, la commande la plus écrite l'emporte (conseillé au-delà de ~50 spectateurs) |
| `&controle=streamer` | Vous jouez au clavier ; le chat n'agit qu'avec ses cadeaux, ses likes et ses abonnements |
| `&nouveau` | Repart d'un monde neuf (`&graine=…` pour choisir la graine, `&mode=creatif` pour le créatif) |

Pour tester un effet en jeu sans attendre un cadeau, tapez dans la discussion du jeu (`T`) : `/live gift 99 pseudo`,
`/live chat avance`, `/live like 100`, `/live follow pseudo`.

À savoir :

- TikTok impose des conditions pour diffuser en LIVE (âge, nombre d'abonnés, accès à LIVE Studio ou à une clé de
  diffusion) qui varient selon les pays.
- La lecture du chat passe par [tiktok-live-connector](https://github.com/zerodytrash/TikTok-Live-Connector), une
  bibliothèque non officielle : TikTok peut la casser à tout moment. Elle utilise le service de signature Euler Stream,
  gratuit avec des limites ; une clé (`EULER_API_KEY=… npm run live -- @pseudo`) relève ces limites.
- Le jeu continue même quand la page n'a pas le focus, mais le navigateur met en pause les onglets cachés : utilisez une
  source « Navigateur » d'OBS/LIVE Studio plutôt qu'une capture d'une fenêtre réduite.

#### Commandes du chat

| Écrire | Effet |
| --- | --- |
| `avance` / `recule` (+ nombre de blocs) · `cours` | Se déplacer (saut automatique des marches) |
| `gauche` / `droite` (+ degrés, 90 par défaut) · `demi-tour` | Tourner |
| `haut` / `bas` / `droit` | Lever, baisser ou redresser le regard |
| `saute` · `pilier` | Sauter en avant · monter d'un bloc en posant un bloc sous ses pieds |
| `mine` · `creuse` (+ nombre) | Casser le bloc visé (meilleur outil choisi tout seul) · creuser un tunnel droit devant |
| `pose` · `attaque` · `mange` | Poser un bloc · frapper la créature la plus proche · manger |
| `fabrique <objet>` · `cuis` | Fabriquer avec l'inventaire (une table doit être à côté pour les recettes 3×3) · cuire au four |
| `prends <objet>` · `1` à `9` | Prendre un objet en main |

Les accents, majuscules et emojis (⬆️ ⬅️ ➡️ ⛏️ ⚔️) sont acceptés ; une même personne ne peut envoyer qu'une commande
toutes les 1,2 s.

#### Cadeaux (valeur d'un cadeau, en pièces TikTok)

| Pièces | Effet | Pièces | Effet |
| --- | --- | --- | --- |
| 1 | 🧟 Zombie à ton nom | 99 | ☠️ Horde de monstres |
| 5 | 💚 Creeper à ton nom | 199 | 🚀 Décollage du joueur |
| 10 | 🧨 Pluie de TNT | 299 | 💎 Pluie de diamants |
| 30 | 🎁 Kit de survie | 500 | ☢️ Méga TNT |

Un cadeau envoyé en série (« ×10 ») déclenche son effet autant de fois (jusqu'à 10). Les paliers se règlent dans
`src/live/commands.js` (`GIFT_TIERS`).

## Structure du code

```
index.html, css/style.css      page et interface
src/main.js                    démarrage
src/game.js                    boucle de jeu, interactions, créatures, explosions, commandes, sauvegarde
src/world/                     génération (generator.js), chunks, lumière (lighting.js), monde et liquides (world.js)
src/render/                    WebGL2 : maillage des chunks (mesher.js), shaders, modèles, moteur de rendu
src/entity/                    joueur, créatures, objets au sol, physique
src/ui/                        menus et HUD, inventaires, icônes, commandes tactiles
src/textures.js                toutes les textures 16×16 peintes par le code
src/blocks.js, src/items.js    registres des blocs et objets ; src/crafting.js : recettes
src/audio.js                   sons et musique synthétisés (Web Audio)
src/live/                      mode LIVE TikTok : commandes du chat et cadeaux (commands.js), actions et effets (live.js),
                               habillage vertical (overlay.js), artisanat à la voix (autocraft.js), spectateurs simulés (demo.js)
tools/live.js                  pont TikTok LIVE → jeu (Server-Sent Events) ; tools/tiktok-events.js : format des événements
tests/                         tests unitaires (node --test)
```

## Tests

```bash
npm test
```

Les tests vérifient notamment que l'éclairage mis à jour bloc par bloc est identique à un recalcul complet,
l'écoulement et le retrait de l'eau, les recettes, l'inventaire, la sauvegarde des chunks et la physique.
