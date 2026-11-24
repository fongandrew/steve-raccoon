import { audio } from './audio.js';
import { popup, toast } from './hud.js';
import { makeTreasure } from './models.js';
import { burst } from './particles.js';
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
export const treasures = [];
{
	const spots = [];
	// Floating past the end of each park ramp: you have to jump for these
	for (const r of world.ramps) {
		spots.push([r.x + r.dirX * (r.len + 7), r.z + r.dirZ * (r.len + 7), LAWN_Y + 5.0]);
	}
	const dumpBlock = world.blocks.find((b) => b.type === 'dump');
	spots.push([dumpBlock.cx + 15, dumpBlock.cz - 15, LAWN_Y + 1.6]);
	const plaza = world.blocks.find((b) => b.type === 'plaza');
	spots.push([plaza.cx - 12, plaza.cz, LAWN_Y + 1.6]);
	// Tucked into a few backyards
	const yards = world.blocks.filter((b) => b.type === 'houses');
	for (const k of [3, 9, 15]) {
		const b = yards[k % yards.length];
		spots.push([b.cx + 5.5, b.cz + 5.5, LAWN_Y + 1.6]);
	}
	// Far corners of town
	spots.push([roadCenter(0), roadCenter(0), ROAD_Y + 1.6]);
	spots.push([roadCenter(N), roadCenter(N), ROAD_Y + 1.6]);
	spots.forEach(([x, z, y], i) => {
		const t = makeTreasure(TREASURE_COLORS[i % TREASURE_COLORS.length]);
		t.group.position.set(x, y, z);
		t.beam.position.y = 20 - (y - 1.6);
		scene.add(t.group);
		treasures.push({
			...t,
			x,
			y,
			z,
			name: TREASURE_NAMES[i % TREASURE_NAMES.length],
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

export function updateTreasures(dt) {
	for (const t of treasures) {
		if (t.found) continue;
		t.spin.rotation.y += dt * 2;
		t.spin.position.y = Math.sin(state.time * 2.5 + t.x) * 0.2;
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
