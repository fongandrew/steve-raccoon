# Steve Raccoon 🦝🚛

It's a lovely day and you're a raccoon driving a trash truck.

A small, cute 3D arcade game built with [three.js](https://threejs.org/). Every model, sound, and
the music are generated in code, so there are no asset files.

## Play

```bash
npm install
npm run dev
```

Then open the URL Vite prints. To build a static copy, run `npm run build`; the output goes in `dist/`.

## How to play

You have one shift, from 6 AM to 6 PM, which takes three real minutes. Score as many points as you can.

- **Grab trash:** pull up with a glowing trash can on your **right** (the claw side) and slow down. The claw grabs it automatically.
  Grabbing cans back to back builds a **streak** bonus. **Golden cans** are worth a lot more.
- **Dump it:** the truck holds 12 bags. Unload on the yellow pad at **The Dump** (orange dot on the
  minimap). Each bag is worth 10 points, and a completely full load earns a **+100 bonus**.
- **Feed Steve:** his tummy empties over time. Press **E** to eat a bag from the truck. Snacks are
  random: coffee grounds give you the zoomies, flat soda gives you hiccups, and sometimes it's a sock.
  If his tummy hits zero, Steve gets **HANGRY** and the truck gets slow and wobbly.
- **Style points:** each park has a ramp. Air time scores points, and so does knocking over traffic cones.
- **Be nice:** mailboxes, fire hydrants and cats cost you points. Honk (**H**) to make cats jump out of the way.

| Key | Action |
| --- | --- |
| W A S D / arrow keys | Drive |
| Space / Shift | Handbrake drift |
| E | Snack |
| H | Honk |
| R | Unstick (snap back onto the road) |
| P / Esc | Pause |
| M | Mute |

On touchscreens, on-screen buttons appear instead.

## Code layout

- `src/main.js`: game loop, truck physics, cans, dumping, snacks, cats, camera, HUD
- `src/world.js`: builds the seeded town (roads, houses, parks, plaza, dump) and its colliders
- `src/models.js`: low-poly models built from primitives (Steve, the truck, houses, cats...)
- `src/audio.js`: Web Audio sound effects, engine hum, and the background tune

## Deploying

`.github/workflows/pages.yml` builds and publishes the game to GitHub Pages on every push to `main`.
To turn it on, set the repo's Settings → Pages → Source to "GitHub Actions".
