// Treasures: floating gems hidden round town for Steve's hoard.
import * as THREE from '../vendor/three.module.js';
import { audio } from './audio.js';
import { JUMP_TREASURE_POINTS, TREASURE_POINTS } from './constants.js';
import { popup, toast } from './hud.js';
import { link, tryClaim } from './link.js';
import { makeTreasure } from './models.js';
import { burst, spawnParticle } from './particles.js';
import { scene, truck, world } from './scene.js';
import { addScore, state, T } from './state.js';
import { LAWN_Y, N, ROAD_Y, roadCenter } from './world.js';

const TREASURE_NAMES = [
	'a rubber duck',
	'a single roller skate',
	"a trophy for 'Most Improved'",
	'a VHS tape of Cats 2',
	'a golden spoon',
	'half a treasure map',
	'a tiny disco ball',
	'a lucky sock (the other one)',
	"somebody's dentures",
	'the TV remote everyone was looking for',
];
// Ground-level jewels. No reds or oranges: those would look like a ruby.
const TREASURE_COLORS = [0xff6bd5, 0x6ec6ff, 0xffd23f, 0x7cf3a0, 0xc77dff];
/** The jewels you have to jump for are all rubies, so you know they're worth it. */
const RUBY = 0xff2a3a;
/** @typedef {import('./world.js').Block} Block */

const sparkleAt = new THREE.Vector3();
const sparkleVel = new THREE.Vector3(0, 0.6, 0);

/**
 * @typedef {import('./models.js').TreasureModel & {
 *   x: number,
 *   y: number,
 *   z: number,
 *   name: string,
 *   found: boolean,
 *   pts: number,
 * }} Treasure
 */

/** @type {Treasure[]} */
export const treasures = [];
{
	/** @type {[number, number, number][]} as [x, z, y] */
	const spots = [];
	// Floating past the end of each park ramp: you have to jump for these
	for (const r of world.ramps) {
		spots.push([r.x + r.dirX * (r.len + 7), r.z + r.dirZ * (r.len + 7), LAWN_Y + 5.0]);
	}
	const jumps = spots.length;
	const dumpBlock = /** @type {Block} */ (world.blocks.find((b) => b.type === 'dump'));
	spots.push([dumpBlock.cx + 15, dumpBlock.cz - 15, LAWN_Y + 1.6]);
	const plaza = /** @type {Block} */ (world.blocks.find((b) => b.type === 'plaza'));
	spots.push([plaza.cx - 12, plaza.cz, LAWN_Y + 1.6]);
	// Tucked into a few backyards
	const yards = world.blocks.filter((b) => b.type === 'houses');
	for (const k of [3, 9, 15]) {
		const b = /** @type {Block} */ (yards[k % yards.length]);
		spots.push([b.cx + 5.5, b.cz + 5.5, LAWN_Y + 1.6]);
	}
	// Far corners of town
	spots.push([roadCenter(0), roadCenter(0), ROAD_Y + 1.6]);
	spots.push([roadCenter(N), roadCenter(N), ROAD_Y + 1.6]);
	spots.forEach(([x, z, y], i) => {
		const jump = i < jumps;
		const t = makeTreasure(
			jump
				? RUBY
				: /** @type {number} */ (TREASURE_COLORS[(i - jumps) % TREASURE_COLORS.length]),
		);
		t.group.position.set(x, y, z);
		scene.add(t.group);
		treasures.push({
			...t,
			x,
			y,
			z,
			name: /** @type {string} */ (TREASURE_NAMES[i % TREASURE_NAMES.length]),
			found: false,
			pts: jump ? JUMP_TREASURE_POINTS : TREASURE_POINTS,
		});
	});
}

export function resetTreasures() {
	for (const t of treasures) {
		t.found = false;
		t.group.visible = true;
	}
}

/** @param {number} dt */
export function updateTreasures(dt) {
	for (const t of treasures) {
		if (t.found) continue;
		t.spin.rotation.y += dt * 2;
		t.spin.position.y = Math.sin(state.time * 2.5 + t.x) * 0.2;
		// A twinkle now and then, so a jewel catches the eye from down the street
		if (Math.random() < dt * 2.5 && Math.hypot(t.x - T.pos.x, t.z - T.pos.z) < 90) {
			sparkleAt.set(
				t.x + (Math.random() - 0.5) * 2.2,
				t.y + (Math.random() - 0.3) * 2,
				t.z + (Math.random() - 0.5) * 2.2,
			);
			spawnParticle({
				pos: sparkleAt,
				vel: sparkleVel,
				color: 0xffffff,
				size: 0.16,
				life: 0.45,
				grow: 1.2,
			});
		}
		const dy = t.y - (T.y + 1.6);
		if (Math.hypot(t.x - T.pos.x, t.z - T.pos.z) < 3.4 && Math.abs(dy) < 2.3) {
			// Online, the room decides who touched it first
			if (link.session) tryClaim({ type: 'gem', i: treasures.indexOf(t) });
			else collectTreasure(t);
		}
	}
}

/**
 * This truck found a treasure.
 *
 * @param {Treasure} t
 */
export function collectTreasure(t) {
	if (t.found) return;
	t.found = true;
	t.group.visible = false;
	state.stats.treasures++;
	addScore(t.pts);
	audio.treasure();
	burst(t.group.position.clone(), 30, {
		colors: [0xffffff, 0xffd23f, 0xff6bd5, 0x6ec6ff],
		size: 0.25,
		life: 1.1,
		grav: 8,
		speed: 10,
		up: 8,
	});
	popup(`TREASURE! +${t.pts}`, truck.group.position, 'gold', 4);
	const n = state.stats.treasures;
	const left = treasures.filter((x) => !x.found).length;
	toast(
		link.session
			? `💎 Steve found ${t.name}! Into the hoard it goes. (${left} still out there)`
			: `💎 Steve found ${t.name}! Into the hoard it goes. (${n}/${treasures.length})`,
		4,
	);
	if (!link.session && n === treasures.length) {
		setTimeout(() => toast('👑 The hoard is complete. Steve weeps with joy.', 4), 1500);
	}
}

/**
 * Online: another truck found this one.
 *
 * @param {Treasure} t
 * @param {string | null} who null to just mark it gone, without a word
 */
export function rivalTookTreasure(t, who) {
	if (t.found) return;
	t.found = true;
	t.group.visible = false;
	if (who && state.mode === 'playing') toast(`💎 ${who} found ${t.name}.`, 3);
}
