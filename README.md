# Steve Raccoon 🦝🚛

It's a lovely day and you're a raccoon driving a trash truck.

A small, cute 3D arcade game built with [three.js](https://threejs.org/). Every model, sound, and
the music are generated in code, so there are no asset files.

## Running it

```bash
npm install          # also copies Three.js into public/vendor/ (see below)
npm run dev          # http://localhost:3000
npm run dev:relay    # netplay relay on :8788, only needed for "Play with friends" locally
```

```bash
npm run check        # vendor:check + net:check + lint + typecheck + unit tests + Playwright e2e
npm run build        # dist/: minified, service worker precache stamped
```

### Deploying

The game deploys to Netlify site `3e3fd768-c76d-4518-a20d-bbe3e8cbe9f6` by uploading `dist/`. Netlify
doesn't build anything itself, and nothing deploys on push. The Netlify command-line tool runs
through `npx`, so there's nothing to install globally.

```bash
npx netlify-cli@27 login     # once per machine (or set NETLIFY_AUTH_TOKEN for CI)
npm run deploy:draft         # build + a private preview URL; the live site is untouched
npm run deploy               # build + publish to production
```

Online play needs the site served from a `*.pomelopenguin.com` address (e.g.
`steve-raccoon.pomelopenguin.com`): the shared multiplayer relay only accepts pages from there. On a
plain `*.netlify.app` address, solo play works but "Play with friends" can't connect. Set the custom
domain in Netlify under Domain management.

### Offline and updates

`public/sw.js` is a service worker. `npm run build` stamps it with a version hash and the full
list of shipped files. The first visit caches the whole game, so it then plays **offline** and can
be installed to a phone's home screen (`site.webmanifest`, landscape). On each visit, and whenever
the tab comes back into view, the page checks for a new deploy. The new version installs in the
background and is used from the next launch, but never while you're in a room with friends. The worker is off on `localhost` so dev edits show up
immediately; add `?sw=1` to test it locally.

## How to play

You have one five-minute shift (the countdown is top-left; the sun sets as it runs out). Score as many points as you can.

- **Play with friends:** up to four trucks share one town. _Play with friends_ on the title screen
  starts a room with a short code; friends join with the code, or just open the link in your
  address bar. Each player is a different raccoon with their own truck colour: **Steve**,
  **Gary**, **Lou** and **Barb**. Cans, dumpsters and treasures go to whoever gets there first,
  trucks bump off each other, and the best score at sundown wins. Whoever made the room (or the
  next raccoon down, if they leave) starts each shift. A shared shift can't be paused.
- **Practice:** _Practice (no clock)_ on the title screen is the same town with no timer, no
  results and no best score, and Steve never gets hangry. Pause and pick _End practice_ to leave.
- **Grab trash:** stop near a glowing trash can and the claw on that side grabs it. You don't
  have to park neatly: a can that's too close, or even under the truck, gets scooted out. The truck
  has a claw on each side: stop between cans on both sides of the street for a **double grab**.
  Grabbing cans back to back builds a **streak** bonus.
- **Dumpsters:** a few overflowing dumpsters (orange on the minimap) wait at the curb. Line up
  roughly head-on (the forks are forgiving) and the truck's front loader hoists them over the cab into the hopper for 6 bags at once.
- **Dump it:** the truck holds 12 bags (you can see the pile in the open hopper). Each bag you
  unload arcs onto the trash mountain, which grows over the shift. Unload on the
  yellow pad at **The Dump** (orange dot on the minimap). Each bag is worth 10 points, and a
  completely full load earns a **+100 bonus**.
- **Drift boost:** hold **Space** while turning at speed to drift. The sparks go blue, then
  orange, then pink as the drift charges. Let go to boost.
- **Treasures:** ten shiny lost treasures are hidden around town for Steve's hoard. They're
  spinning jewels that twinkle, so keep your eyes open. The ones floating past the park ramps can only be reached with a jump.
- **Feed Steve:** his tummy empties over time. Press **E** to eat a bag from the truck. One bag
  keeps him going for a good while, so a few snacks a shift is plenty. Snacks are random: coffee
  grounds give you the zoomies, flat soda gives you hiccups, and sometimes it's a sock. If his
  tummy hits zero, Steve gets **HANGRY** and the truck gets slow and wobbly.
- **Golden Hour:** in the last 30 seconds of the shift, every point counts double.
- **Smash stuff:** the town is very knock-over-able. Light poles and signs tip over (and barely
  slow you down), picket fences splinter, lawn flamingos and garden gnomes go flying, and benches,
  picnic tables, trash bags and tires all tumble. Wreck things in quick succession for a
  **CHAOS** combo. Beach balls in the parks and plaza can be punted around, the plaza pigeons
  scatter when you roll up, and trees and bushes burst into leaves when you bump them.
- **Geese:** they wander the streets and they do not move. Not for you, not for anyone. Hit one
  and the truck bounces off, spills cargo, and gets honked at. Honk at them and they honk back.
- **Townsfolk:** Binsville's residents are out and about: a bear farmer, a fox jogger, a bunny
  lady, a frog kid, a badger granny, a mole mail carrier and a pig baker, plus kittens, a puppy,
  squirrels, garden bunnies and the firehouse dalmatian. They wave at Steve when he's driving
  politely and run for it (arms flailing) when he isn't. Bounce one and it costs a few points.
  Honk (**H**) to make them jump. Mailboxes and hydrants also cost points.
- **Around town:** the Rusty Lid bar, Binsville Elementary, Fire Station 9, a community garden
  (whose vegetables are very much in harm's way), parks, the plaza and The Dump.

| Key                  | Action                            |
| -------------------- | --------------------------------- |
| W A S D / arrow keys | Drive                             |
| Space / Shift        | Drift (release to boost)          |
| E                    | Snack                             |
| H                    | Honk                              |
| R                    | Unstick (snap back onto the road) |
| P / Esc              | Pause                             |
| M                    | Mute                              |

On phones and tablets (landscape): slide your left thumb sideways to steer (a wheel appears where
it lands). Your right thumb has **GAS** and **BACK**, which brakes and then, once stopped, reverses. There
is no drift button: hold BACK while turning at speed and the truck drifts instead, then let go to
boost. Tap anywhere else to honk, tap Steve's face to snack, and the pause button has unstick and
sound options.

## How it's built

There is no bundler: it's static files. `public/` is the site, with a thin `index.html` and
`styles.css` and ES modules under `public/src/`. The code uses JSDoc types checked by
`tsc --checkJs`, the same conventions as the
[pomelo-penguin](https://github.com/fongandrew/pomelo-penguin) games and
[penguin-push](https://github.com/fongandrew/penguin-push).

### Three.js

Three.js is an npm dependency, pinned in `package.json`. Because the browser can't resolve a bare
`import 'three'` without a bundler, `scripts/vendor.js` copies the three files the game uses out of
`node_modules/three` into `public/vendor/` and points the addon's `three` import at the copy. It
runs on every `npm install`. `public/vendor/` is generated and gitignored, so don't edit it; source
files import `../vendor/three.module.js`. Types come from `@types/three` through small generated
`.d.ts` files beside each copy.

To upgrade: bump `three` and `@types/three` in `package.json`, then `npm install`.
`npm run vendor:check` (part of `npm run check` and `npm run build`) fails if the copies don't match
the installed package.

### Multiplayer

Rooms run on **netplay**, the multiplayer engine from pomelo-penguin, under game id `steve-raccoon`.
`npm run net:sync` copies its browser half into `public/src/net/`, and the server core plus the
Node `ws` adapter into `relay/` for local dev and tests. It reads from a sibling checkout at
`../pomelo-penguin` (override with `NETPLAY_REPO=...`). Don't hand-edit those copies. Production uses
the shared relay at `pomelo-play.pomelopenguin.workers.dev`; a new game needs no server changes.

How the game maps onto netplay's three kinds of state (`public/src/multi.js`):

- **Seed-derived**: the town. It is built from a fixed seed, so every screen already has the same
  streets and none of it is sent. The shift clock is the relay's time minus the agreed start.
- **Owned**: each truck. Its player simulates it and sends about 20 snapshots a second (position,
  heading, velocity, load, score); other screens draw it a moment in the past. Trucks are solid to
  each other: each game moves only its own truck and takes its own half of the bounce.
- **Contested**: cans, dumpsters and treasures. They change only through relay events, applied on
  every screen in the relay's order by the pure reducer in `contest.js`, so two trucks reaching for
  the same can always agree who got it. The host (lowest connected slot) starts shifts and decides
  which house puts a can out next, as events like any other.

What is **not** shared: geese, townsfolk, pigeons, beach balls and knocked-over props are simulated
separately on each screen, so two players can see a goose in different places.

### Modules

Each system is one module. The shift's state (`state`) and the truck's body (`T`) live in
`state.js`; the Three.js scene, camera, renderer, town and truck model are created once in
`scene.js`. Modules import what they need from those two.

| File                                                                    | What                                                                                                                   |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `main.js`                                                               | `start()`: wires input and screens, runs the frame loop (`update(dt)` then `render()`), exposes `window.__game`        |
| `state.js`                                                              | shift state, truck body, `resetShiftState()`, `addScore()`                                                             |
| `constants.js` / `lines.js`                                             | tunables and data tables / the narrator's lines                                                                        |
| `util.js` / `review.js`                                                 | pure helpers (easing, timelines, formatting) / stars, rank and Brenda's review                                         |
| `scene.js`                                                              | renderer, scene, camera, the built `world`, the truck model                                                            |
| `world.js`                                                              | builds the seeded town (roads, houses, parks, plaza, dump) and its colliders                                           |
| `models.js` / `props.js`                                                | low-poly models built from primitives / instanced batches for repeated props                                           |
| `truck.js` / `truck-anim.js`                                            | driving physics, drifting, collisions / the truck's and Steve's animation                                              |
| `cans.js` / `loader.js` / `pile.js`                                     | curbside cans and the side grabber arms / dumpsters and the front loader / the trash mountain                          |
| `gameplay.js`                                                           | the per-frame rules of a shift: hunger, snacks, can spawning, dumping, the clock                                       |
| `smash.js`                                                              | everything knock-over-able: props, trees, bushes                                                                       |
| `critters.js` / `geese.js` / `pigeons.js` / `balls.js` / `treasures.js` | the town's residents and toys                                                                                          |
| `sky.js` / `camera.js` / `guide.js` / `particles.js`                    | day cycle and ambient life / chase camera / the guide arrow / particles                                                |
| `hud.js` / `minimap.js` / `portrait.js` / `shift.js`                    | HUD, toasts and popups / minimap / Steve cam / title, pause and results screens, shift reset                           |
| `multi.js` / `lobby.js` / `rivals.js`                                   | the room session (events, snapshots, host duties) / making, joining and leaving rooms / the other trucks               |
| `contest.js` / `wire.js` / `roster.js` / `link.js`                      | who-got-there-first rules / what goes over the relay / the four raccoons / the seam game modules call the room through |
| `input.js` / `audio.js`                                                 | keyboard, touch stick and buttons / synthesized sound effects and music                                                |

### Graphics levels

`scene.js` picks one of three levels: `high` on desktops (antialiasing, 4096 shadow map), `mobile`
on phones and tablets (no antialiasing, 1024 shadow map, 1.5x pixel ratio) and `low` (no shadows,
1x pixel ratio, a still picture instead of the live Steve cam). If the browser ever takes the WebGL
context away, which shows up as a sad-face icon where the town should be, the game switches that
device to `low` and reloads once. Add `?gfx=high`, `?gfx=mobile` or `?gfx=low` to the URL to force a
level; the choice is remembered.

### Tests

- `tests/*.test.js` (Vitest, jsdom) cover the pure modules: helpers, scoring and reviews, state
  reset, narrator data, and town generation (the same town every time, cans at the curb, ramps that
  rise).
- `tests/e2e/*.spec.js` (Playwright) boot the real game, play a shift, check it works offline, drive
  the touch controls, and put two real browsers in one room through the local relay.

The test hook `window.__game` exposes `state`, `T`, `world` and the entity lists, plus drivers:
`startShift`, `endShift`, `setPaused`, `teleport(x, z, heading)`, `skipTo(seconds)`,
`tick(seconds)` (steps the simulation at 60 Hz without drawing), `setRendering(on)` and
`setCamera({ pos, look, fov })` for screenshots. `window.__game.net` has the room: `hostRoom`,
`joinRoom(code)`, `start`, `leave`, `players`, `table` and `fastForward(seconds)`. Specs read state through it, not through pixels.
