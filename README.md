# BREACH

Multiplayer 3D first-person shooter that runs as a single Cloudflare Worker.

- `src/server.js` is the Worker: it serves the client and the signaling API for peer-to-peer rooms.
- `src/client/index.html` is the page: styles, menus, HUD markup.
- `src/client/js/` is the game itself, split by system. `build.mjs` pastes these files into the page's one module script in
  file-name order, so they share a single scope and the number in front of each name is its load order.
- `build.mjs` then embeds the page into the Worker and writes `dist/worker.js` (and `dist/client.html` for local testing).

| File | What's in it |
| --- | --- |
| `00-setup.js` | imports, renderer, scene, cameras, scope picture-in-picture |
| `01-world.js` | textures, maps, walls and their materials, third-person gun models |
| `02-body-parts.js` | body geometry shared by humanoids and ragdolls, including organs and bones |
| `03-humanoid.js` | animated humanoid, arm IK, cut limbs |
| `04-ragdoll.js` | verlet ragdolls, limbs shot off on the ground, head gibs |
| `05-anatomy.js` | damage model: bones, organs, arteries, bleeding, severing; 2D body panel |
| `06-weapons.js` | weapon stats, viewmodel setup |
| `07-gun-models.js` | modelling kit and the gun models |
| `08-hands.js` | viewmodel hands and arms |
| `09-attachments.js` | optics, grips, muzzles, lasers; medkit and plate viewmodels |
| `10-audio.js` | synthesized sounds |
| `11-fx.js` | decals, particles, impact effects |
| `12-blood.js` | droplets, sprays, wall spatter, gore, muzzle smoke, kill notice |
| `13-third-person.js` | Left Alt third-person camera and body |
| `14-wounds.js` | blood pools, limb clipping, body holes and wound channels, penetration |
| `15-destruction.js` | backpack hits, wall damage, debris, holes through walls |
| `16-ballistics.js` | props, shells, simulated bullets and what they hit |
| `17-dummies.js` | player state, test dummies (stagger, collapse) |
| `18-player.js` | movement, physics, firing, reloading, death and respawn |
| `19-network.js` | WebRTC/WebSocket transport, host room, message handling |
| `20-camera-hud-input.js` | camera, viewmodel animation, HUD, mouse and keys |
| `21-items-inventory.js` | ground items, pickup, backpack grid, toolbar |
| `22-menu-loop.js` | scoreboard, menus, main loop |

## Deploying

Every push to `main` is built and deployed by Cloudflare (Workers Builds). Nothing is deployed from a local machine.

The Worker needs a D1 database bound as `DB`. `TURN_KEY_ID` and `TURN_KEY_API_TOKEN` are optional and stay in the Cloudflare dashboard; they are not stored in this repository.
