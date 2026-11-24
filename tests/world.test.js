import { beforeAll, describe, expect, it } from 'vitest';

import * as THREE from '../public/vendor/three.module.js';
import {
	BLOCK,
	blockCenter,
	buildWorld,
	groundHeight,
	HALF,
	isOnLawn,
	LAWN_Y,
	N,
	rng,
	ROAD_Y,
	roadCenter,
	surfaceHeight,
	WALK_Y,
} from '../public/src/world.js';
import { stubCanvas } from './helpers.js';

/** @type {ReturnType<typeof buildWorld>} */
let world;

beforeAll(() => {
	stubCanvas();
	world = buildWorld(new THREE.Scene());
});

describe('rng', () => {
	it('is deterministic per seed and stays in 0..1', () => {
		const a = rng(42);
		const b = rng(42);
		const c = rng(43);
		const seq = Array.from({ length: 50 }, () => a());
		expect(Array.from({ length: 50 }, () => b())).toEqual(seq);
		expect(Array.from({ length: 50 }, () => c())).not.toEqual(seq);
		for (const v of seq) {
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});
});

describe('grid', () => {
	it('centres the town on the origin', () => {
		expect(roadCenter(0)).toBe(-HALF);
		expect(roadCenter(N)).toBe(HALF);
		expect(blockCenter(0) + blockCenter(N - 1)).toBeCloseTo(0);
	});

	it('steps up from road to sidewalk to lawn', () => {
		const cx = blockCenter(1);
		const cz = blockCenter(1);
		expect(surfaceHeight(roadCenter(1), cz)).toBe(ROAD_Y);
		expect(surfaceHeight(cx + BLOCK / 2 - 0.5, cz)).toBe(WALK_Y);
		expect(surfaceHeight(cx, cz)).toBe(LAWN_Y);
		expect(ROAD_Y).toBeLessThan(WALK_Y);
		expect(WALK_Y).toBeLessThan(LAWN_Y);
	});
});

describe('buildWorld', () => {
	it('builds the same town every time', () => {
		const again = buildWorld(new THREE.Scene());
		const key = (/** @type {typeof world} */ w) => ({
			blocks: w.blocks.map((b) => [b.type, b.cx, b.cz]),
			houses: w.houses.map((h) => [h.x, h.z, h.canX, h.canZ, h.name, h.street]),
			props: w.props.map((p) => [p.kind, p.x, p.z]),
			bins: w.bins.map((b) => [b.x, b.z]),
			colliders: [w.boxes.length, w.circles.length],
		});
		expect(key(again)).toEqual(key(world));
	});

	it('fills every block and has the landmarks the game needs', () => {
		expect(world.blocks).toHaveLength(N * N);
		const types = world.blocks.map((b) => b.type);
		expect(types.filter((t) => t === 'dump')).toHaveLength(1);
		expect(types).toContain('plaza');
		expect(types).toContain('park');
		expect(world.houses.length).toBeGreaterThan(20);
		expect(world.bins.length).toBeGreaterThanOrEqual(2);
		expect(world.ramps.length).toBeGreaterThan(0);
		expect(world.dump.r).toBeGreaterThan(0);
	});

	it('puts every trash can at the curb, clear of the road', () => {
		for (const h of world.houses) {
			expect(Math.abs(h.canX)).toBeLessThan(HALF);
			expect(Math.abs(h.canZ)).toBeLessThan(HALF);
			expect(surfaceHeight(h.canX, h.canZ), h.name).not.toBe(ROAD_Y);
		}
	});

	it('names every household and street', () => {
		for (const h of world.houses) {
			expect(h.name.length).toBeGreaterThan(0);
			expect(h.street.length).toBeGreaterThan(0);
		}
	});

	it('leaves the shift start position clear of colliders', () => {
		const x = roadCenter(3);
		const z = blockCenter(2);
		for (const off of [1.9, -1.9]) {
			for (const b of world.boxes) {
				const inside =
					x > b.minX - 1.6 &&
					x < b.maxX + 1.6 &&
					z + off > b.minZ - 1.6 &&
					z + off < b.maxZ + 1.6;
				expect(inside).toBe(false);
			}
			for (const c of world.circles) {
				expect(Math.hypot(x - c.x, z + off - c.z)).toBeGreaterThan(c.r + 1.6);
			}
		}
	});
});

describe('ground', () => {
	it('is flat road height on the streets and off the lawn', () => {
		const x = roadCenter(2);
		const z = blockCenter(2);
		expect(groundHeight(world, x, z)).toBe(ROAD_Y);
		expect(isOnLawn(world, x, z)).toBe(false);
	});

	it('counts a house block interior as lawn', () => {
		const b = world.blocks.find((bl) => bl.type === 'houses');
		expect(b).toBeDefined();
		if (b) expect(isOnLawn(world, b.cx, b.cz)).toBe(true);
	});

	it('rises along a ramp', () => {
		const r = /** @type {(typeof world.ramps)[number]} */ (world.ramps[0]);
		const at = (/** @type {number} */ k) =>
			groundHeight(world, r.x + r.dirX * r.len * k, r.z + r.dirZ * r.len * k);
		expect(at(0.9)).toBeGreaterThan(at(0.5));
		expect(at(0.5)).toBeGreaterThan(at(0.1));
		expect(at(0.9)).toBeGreaterThan(LAWN_Y + 1);
	});
});
