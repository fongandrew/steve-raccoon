// Treasures: floating gems hidden round town for Steve's hoard.
import * as THREE from '../vendor/three.module.js';
import { audio } from './audio.js';
import { popup, toast } from './hud.js';
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
const TREASURE_COLORS = [0xff6bd5, 0x6ec6ff, 0xffd23f, 0x7cf3a0, 0xc77dff, 0xff8c42];
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
		const t = makeTreasure(/** @type {number} */ (TREASURE_COLORS[i % TREASURE_COLORS.length]));
		t.group.position.set(x, y, z);
		scene.add(t.group);
		treasures.push({
			...t,
			x,
			y,
			z,
			name: /** @type {string} */ (TREASURE_NAMES[i % TREASURE_NAMES.length]),
			found: false,
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
			t.found = true;
			t.group.visible = false;
			state.stats.treasures++;
			addScore(50);
			audio.treasure();
			burst(t.group.position.clone(), 30, {
				colors: [0xffffff, 0xffd23f, 0xff6bd5, 0x6ec6ff],
				size: 0.25,
				life: 1.1,
				grav: 8,
				speed: 10,
				up: 8,
			});
			popup('TREASURE! +50', truck.group.position, 'gold', 4);
			const n = state.stats.treasures;
			toast(
				`💎 Steve found ${t.name}! Into the hoard it goes. (${n}/${treasures.length})`,
				4,
			);
			if (n === treasures.length)
				setTimeout(() => toast('👑 The hoard is complete. Steve weeps with joy.', 4), 1500);
		}
	}
}
