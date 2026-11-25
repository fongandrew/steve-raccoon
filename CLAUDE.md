# CLAUDE.md

**Steve Raccoon**: a 3D (Three.js) arcade game about a raccoon driving a trash truck, a static PWA
deployed by uploading `dist/` (built from `public/`) to Netlify. See README.md for gameplay and
the module map.

## Conventions (mirrors pomelo-penguin and penguin-push)

- No bundler, no transpile. ES modules under `public/src/`, relative URLs (`./src/main.js`).
  `scripts/build.js` minifies per-file only.
- JSDoc + `tsc --checkJs` strict (`npm run typecheck`). No `.ts` files, no `@ts-ignore`.
- Prettier: tabs, single quotes, 100 cols. ESLint `--max-warnings 0` (import cycles are errors).
- Vitest uses explicit imports. Playwright reads `window.__game`, never pixel diffs.

## Three.js

- `three` is an npm devDependency. `scripts/vendor.js` (runs on `npm install`) copies it into
  `public/vendor/`, which is **generated and gitignored**. Don't hand-edit or commit it.
- Import it as `../vendor/three.module.js` (and `../vendor/addons/...`), never as bare `three`:
  the browser can't resolve that. Need another addon? Add it to `FILES` in `scripts/vendor.js`.
- To upgrade, bump `three` and `@types/three` together and `npm install`.

## Architecture

- `state.js` holds the shift state (`state`) and the truck body (`T`). Anything a new shift must
  start over goes in `newShift()` there, including rate-limit timestamps (they're in shift time;
  a module-level `let` would carry over and mute the next shift).
- `scene.js` creates the renderer, scene, camera, `world` and truck model once, at import. It
  needs a real DOM and WebGL, so unit tests can only import modules that don't import it
  (`util`, `review`, `constants`, `lines`, `state`, `world`, `models`, `props`).
- One module per system; `main.js` only wires them into `update(dt)` / `render()`. Module-level
  DOM listeners go in an `init*()` function called from `start()`.
- The town is built from seeded RNG (`rng()` in `world.js`) and must come out identical on every
  load; `tests/world.test.js` checks this. Use `rand` there, not `Math.random`.
- Graphics come in three levels (`GFX` in `scene.js`: `high`, `mobile`, `low`). If the browser
  throws the WebGL context away (Chrome's sad-face canvas on phones), the game remembers `low`
  and reloads once. `?gfx=high|mobile|low` forces a level. New effects should check `GFX` before
  adding GPU cost, and should reuse the toon materials rather than new shader types.
- `window.__game` is the test/debug hook. `tick(seconds)` steps the game without drawing: use it
  in specs instead of waiting on frames (software WebGL draws a couple of frames a second).

## Commands

`npm run dev` (port 3000), `npm test`, `npm run test:e2e`, `npm run check`, `npm run build`,
`npm run vendor` / `vendor:check`, `npm run deploy:draft` (preview URL), `npm run deploy`
(production).

Netlify site ID: `3e3fd768-c76d-4518-a20d-bbe3e8cbe9f6` (baked into the deploy scripts). Deploys upload
`dist/` via `npx netlify-cli@27`; needs `netlify login` or `NETLIFY_AUTH_TOKEN`. Nothing deploys
on push (the GitHub Pages workflow is gone).
