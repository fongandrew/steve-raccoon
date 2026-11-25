// Entry point: wires every system into `update(dt)` / `render()`, runs the
// frame loop and installs the `window.__game` test hook.
import { audio } from './audio.js';
import { updateBalls } from './balls.js';
import { setCameraOverride, updateCamera } from './camera.js';
import { SHIFT } from './constants.js';
import { cats, updateCats } from './critters.js';
import { updateGameplay } from './gameplay.js';
import { geese, updateGeese } from './geese.js';
import { updateGuide } from './guide.js';
import { toast, updateHud, updatePopups } from './hud.js';
import { initInput, keys, pressed } from './input.js';
import { drawMinimap } from './minimap.js';
import { updateParticles } from './particles.js';
import { updatePigeons } from './pigeons.js';
import { updatePile } from './pile.js';
import { renderPortrait } from './portrait.js';
import { camera, GFX, gpu, renderer, scene, world } from './scene.js';
import {
	endPractice,
	endShift,
	initScreens,
	resetGame,
	setPaused,
	startShift,
	syncMuteBtn,
} from './shift.js';
import { updateAmbient, updateSky } from './sky.js';
import { updateBushes, updateProps } from './smash.js';
import { state, T } from './state.js';
import { treasures } from './treasures.js';
import { updateTruck } from './truck.js';
import { animateTruck } from './truck-anim.js';
import { groundHeight } from './world.js';

/** Longest step the simulation takes in one go, however slow the frame was. */
const MAX_DT = 1 / 30;

let lastNow = 0;
/** Off while a test steps the game by hand: software WebGL takes ~0.5s a frame. */
let drawing = true;
let elapsed = 0;

/**
 * Advance the game by `dt` seconds: input, simulation, animation, camera and
 * HUD. Draws nothing, so tests can step it without a GPU (see `tick` below).
 *
 * @param {number} dt
 */
function update(dt) {
	elapsed += dt;

	// global keys
	if (pressed.has('mute')) {
		const m = audio.toggleMute();
		syncMuteBtn();
		toast(m ? '🔇 Muted' : '🔊 Sound on', 1.5);
	}
	if (pressed.has('pause')) setPaused(state.mode === 'playing');
	if (pressed.has('enter') && (state.mode === 'title' || state.mode === 'results')) startShift();
	else if (pressed.has('enter') && state.mode === 'paused') setPaused(false);

	if (state.mode === 'playing') {
		updateTruck(dt);
		updateGameplay(dt);
		updateProps(dt);
		updateBushes();
		updateGeese(dt, elapsed);
		updateCats(dt, elapsed);
	} else if (state.mode === 'title' || state.mode === 'results') {
		updateCats(dt, elapsed);
		updateProps(dt);
		T.steer = Math.sin(elapsed * 0.8) * 0.3;
	}
	if (state.mode !== 'paused') {
		updateParticles(dt);
		animateTruck(dt, elapsed);
		updateAmbient(dt, elapsed);
		updateBalls(dt);
		updatePigeons(dt, elapsed);
		updatePile(dt);
	}
	// On the title screen, shift the view so Steve shows beside the menu card
	if (state.mode === 'title' && window.innerWidth > 900) {
		camera.setViewOffset(
			window.innerWidth,
			window.innerHeight,
			-window.innerWidth * 0.2,
			0,
			window.innerWidth,
			window.innerHeight,
		);
	} else if (camera.view && camera.view.enabled) {
		camera.clearViewOffset();
	}
	// Practice has no sunset to race: it stays a bright mid-morning
	const day = state.mode === 'title' || state.practice ? 0.3 : state.time / SHIFT;
	updateSky(Math.min(1, day));
	updateCamera(dt, elapsed);
	updateGuide(elapsed);
	updatePopups(dt);
	if (state.mode === 'playing' || state.mode === 'paused') {
		updateHud();
		drawMinimap(elapsed);
	}
	audio.setEngine(T.fwd, keys.has('gas') ? 1 : 0, state.mode === 'playing');
	audio.updateMusic(state.mode === 'playing');
	pressed.clear();
}

function render() {
	renderer.render(scene, camera);
	if (state.mode === 'playing' || state.mode === 'paused') renderPortrait();
}

function frame() {
	requestAnimationFrame(frame);
	const now = performance.now();
	const dt = Math.min((now - lastNow) / 1000, MAX_DT);
	lastNow = now;
	update(dt);
	if (drawing && !gpu.lost) render();
}

/** Boot the game: wire the DOM, park the truck on the title screen, start the loop. */
export function start() {
	initInput();
	initScreens();
	resetGame();
	state.mode = 'title';
	lastNow = performance.now();
	registerServiceWorker();
	frame();

	// Test/debug hook: read state, drive deterministic scenarios. Playwright
	// specs and screenshot scripts go through this, never through pixels.
	/** @type {any} */ (window).__game = {
		state,
		T,
		keys,
		world,
		renderer,
		geese,
		cats,
		treasures,
		startShift,
		endPractice,
		endShift,
		setPaused,
		/**
		 * Put the truck somewhere, stopped. `heading` is in radians (0 = +z).
		 *
		 * @param {number} x
		 * @param {number} z
		 * @param {number} [heading]
		 */
		teleport: (x, z, heading = T.heading) => {
			T.pos.set(x, 0, z);
			T.vel.set(0, 0, 0);
			T.heading = heading;
			T.y = groundHeight(world, x, z);
			T.vy = 0;
			T.grounded = true;
		},
		/**
		 * Jump the shift clock (seconds into the shift), e.g. to Golden Hour.
		 *
		 * @param {number} t
		 */
		skipTo: (t) => {
			state.time = t;
		},
		/**
		 * Run the game forward `seconds` in fixed 60 Hz steps without drawing,
		 * so a spec doesn't depend on how fast the machine renders.
		 *
		 * @param {number} seconds
		 */
		tick: (seconds) => {
			for (let t = 0; t < seconds - 1e-9; t += 1 / 60) update(1 / 60);
		},
		/**
		 * Stop (or resume) drawing frames; the simulation keeps running either way.
		 *
		 * @param {boolean} on
		 */
		setRendering: (on) => {
			drawing = on;
		},
		/** Photo-mode camera: `{ pos: [x, y, z], look: [x, y, z], fov? }`, or `null` to release. */
		setCamera: setCameraOverride,
		/** Graphics level in use: 'high', 'mobile' or 'low' (see scene.js). */
		gfx: GFX,
	};
}

function registerServiceWorker() {
	const host = location.hostname;
	const local = host === 'localhost' || host === '127.0.0.1';
	// Off on localhost so dev edits show up immediately; ?sw=1 turns it on to test.
	const forced = new URLSearchParams(location.search).get('sw') === '1';
	if (!('serviceWorker' in navigator) || (local && !forced)) return;
	navigator.serviceWorker
		.register('./sw.js')
		.then((reg) => {
			// Look for a new deploy now and whenever the game comes back into
			// view (phones keep a tab open for days). The worker installs it in
			// the background; it's used from the next time the game opens.
			const check = () => void reg.update().catch(() => {});
			check();
			document.addEventListener('visibilitychange', () => {
				if (!document.hidden) check();
			});
		})
		.catch(() => {
			// Works without a worker; just not offline.
		});
}

start();
