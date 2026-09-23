# MCweb

Un jeu de construction en blocs façon Minecraft, **entièrement jouable dans le navigateur**.
Écrit en JavaScript pur avec WebGL2 : aucune dépendance, aucune étape de compilation, aucune image
ni aucun son externe. Les textures, les sons, la musique et le monde sont générés par le code.

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
  **coffres**, nourriture (cuire la viande), TNT et briquet.
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
tests/                         tests unitaires (node --test)
```

## Tests

```bash
npm test
```

Les tests vérifient notamment que l'éclairage mis à jour bloc par bloc est identique à un recalcul complet,
l'écoulement et le retrait de l'eau, les recettes, l'inventaire, la sauvegarde des chunks et la physique.
