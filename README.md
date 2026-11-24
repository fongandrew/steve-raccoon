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

You have one four-minute shift (the countdown is top-left; the sun sets as it runs out). Score as many points as you can.

- **Grab trash:** stop near a glowing trash can and the claw on that side grabs it. The truck
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
- **Treasures:** ten shiny lost treasures are hidden around town for Steve's hoard; follow the
  beams of light. The ones floating past the park ramps can only be reached with a jump.
- **Feed Steve:** his tummy empties over time. Press **E** to eat a bag from the truck. Snacks are
  random: coffee grounds give you the zoomies, flat soda gives you hiccups, and sometimes it's a sock.
  If his tummy hits zero, Steve gets **HANGRY** and the truck gets slow and wobbly.
- **Golden Hour:** in the last 30 seconds of the shift, every point counts double.
- **Smash stuff:** the town is very knock-over-able. Light poles and signs tip over (and barely
  slow you down), picket fences splinter, lawn flamingos and garden gnomes go flying, and benches,
  picnic tables, trash bags and tires all tumble. Wreck things in quick succession for a
  **CHAOS** combo. Beach balls in the parks and plaza can be punted around, the plaza pigeons
  scatter when you roll up, and trees and bushes burst into leaves when you bump them.
- **Geese:** they wander the streets and they do not move. Not for you, not for anyone. Hit one
  and the truck bounces off, spills cargo, and gets honked at. Honk at them and they honk back.
- **Citizens:** kittens, puppies, bunnies, hedgehogs, squirrels and the firehouse dalmatian go
  about their day and try to get out of Steve's way. Bounce one and it costs a few points.
  Honk (**H**) to make them jump. Mailboxes and hydrants also cost points.
- **Trees:** hit one hard, or a few times, and it comes down. TIMBERRRRR!
- **Steve cam:** a live view of Steve's face sits in the corner. When he turns red and shaky,
  he's hangry: feed him (or click/tap his face).
- **Around town:** the Rusty Lid bar, Binsville Elementary, Fire Station 9, a community garden
  (whose vegetables are very much in harm's way), parks, the plaza and The Dump.

| Key | Action |
| --- | --- |
| W A S D / arrow keys | Drive |
| Space / Shift | Drift (release to boost) |
| E | Snack |
| H | Honk |
| R | Unstick (snap back onto the road) |
| P / Esc | Pause |
| M | Mute |

On phones and tablets (landscape): drag anywhere on the left half to drive and steer (pull back
to reverse), hold **DRIFT** on the right to drift and release to boost, 📯 honks, tap Steve's
face to snack, and the pause button has unstick and sound options.

## Code layout

- `src/main.js`: game loop, truck physics, cans, dumping, snacks, cats, camera, HUD
- `src/world.js`: builds the seeded town (roads, houses, parks, plaza, dump) and its colliders
- `src/models.js`: low-poly models built from primitives (Steve, the truck, houses, cats...)
- `src/audio.js`: Web Audio sound effects, engine hum, and the background tune

## Deploying

`.github/workflows/pages.yml` builds and publishes the game to GitHub Pages on every push to `main`.
To turn it on, set the repo's Settings → Pages → Source to "GitHub Actions".
