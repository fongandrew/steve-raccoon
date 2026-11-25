import { describe, expect, it } from 'vitest';

import { applyClaim, freshContest, standings } from '../public/src/contest.js';
import {
	activeCansFor,
	MAX_PLAYERS,
	raccoonFor,
	RACCOONS,
	startOffset,
} from '../public/src/roster.js';

describe('applyClaim', () => {
	it('lets only the first truck take a can', () => {
		const c = freshContest(4, 2, 2);
		expect(applyClaim(c, { type: 'can', i: 1 }, 0)).toBe(false); // nothing out yet
		expect(applyClaim(c, { type: 'out', i: 1 }, 0)).toBe(true);
		expect(applyClaim(c, { type: 'out', i: 1 }, 0)).toBe(false); // already out
		expect(applyClaim(c, { type: 'can', i: 1 }, 2)).toBe(true);
		expect(applyClaim(c, { type: 'can', i: 1 }, 1)).toBe(false); // beaten to it
		expect(c.cans).toEqual([false, false, false, false]);
		// ...and the house can put another one out later
		expect(applyClaim(c, { type: 'out', i: 1 }, 0)).toBe(true);
	});

	it('treats dumpsters the same way', () => {
		const c = freshContest(1, 2, 0);
		expect(applyClaim(c, { type: 'bin', i: 0 }, 1)).toBe(false);
		expect(applyClaim(c, { type: 'binOut', i: 0 }, 0)).toBe(true);
		expect(applyClaim(c, { type: 'bin', i: 0 }, 1)).toBe(true);
		expect(applyClaim(c, { type: 'bin', i: 0 }, 3)).toBe(false);
		expect(c.bins).toEqual([false, false]);
	});

	it('gives a treasure to whoever found it first, for good', () => {
		const c = freshContest(0, 0, 3);
		expect(applyClaim(c, { type: 'gem', i: 2 }, 3)).toBe(true);
		expect(applyClaim(c, { type: 'gem', i: 2 }, 0)).toBe(false);
		expect(c.gems).toEqual([-1, -1, 3]);
	});

	it('ignores an index that does not exist', () => {
		const c = freshContest(2, 1, 1);
		for (const type of /** @type {const} */ (['out', 'can', 'binOut', 'bin', 'gem'])) {
			expect(applyClaim(c, { type, i: 99 }, 0)).toBe(false);
		}
		expect(c).toEqual(freshContest(2, 1, 1));
	});

	it('comes out the same on every client given the same order', () => {
		/** @type {[import('../public/src/contest.js').Claim, number][]} */
		const log = [
			[{ type: 'out', i: 0 }, 0],
			[{ type: 'can', i: 0 }, 1],
			[{ type: 'can', i: 0 }, 2],
			[{ type: 'gem', i: 0 }, 2],
			[{ type: 'gem', i: 0 }, 1],
			[{ type: 'binOut', i: 0 }, 0],
		];
		const run = () => {
			const c = freshContest(1, 1, 1);
			return { c, accepted: log.map(([claim, slot]) => applyClaim(c, claim, slot)) };
		};
		expect(run()).toEqual(run());
		expect(run().accepted).toEqual([true, true, false, true, false, true]);
	});
});

describe('standings', () => {
	it('sorts best first and breaks ties by slot', () => {
		const table = standings([
			{ slot: 2, score: 300 },
			{ slot: 0, score: 120 },
			{ slot: 3, score: 300 },
			{ slot: 1, score: 450 },
		]);
		expect(table.map((p) => p.slot)).toEqual([1, 2, 3, 0]);
	});
});

describe('roster', () => {
	it('has four raccoons with different names and colours', () => {
		expect(MAX_PLAYERS).toBe(4);
		expect(RACCOONS.map((r) => r.name)).toEqual(['Steve', 'Gary', 'Lou', 'Barb']);
		expect(new Set(RACCOONS.map((r) => r.body)).size).toBe(4);
		expect(new Set(RACCOONS.map((r) => r.css)).size).toBe(4);
	});

	it('maps slots to raccoons, wrapping', () => {
		expect(raccoonFor(0).name).toBe('Steve');
		expect(raccoonFor(3).name).toBe('Barb');
		expect(raccoonFor(4).name).toBe('Steve');
	});

	it('puts out more cans for more trucks', () => {
		expect(activeCansFor(1, 7)).toBe(7);
		expect(activeCansFor(2, 7)).toBe(10);
		expect(activeCansFor(4, 7)).toBe(16);
		expect(activeCansFor(9, 7)).toBe(16);
	});

	it('starts every truck clear of the others', () => {
		const spots = [0, 1, 2, 3].map(startOffset);
		for (const [a, p] of spots.entries()) {
			for (const q of spots.slice(a + 1)) {
				expect(Math.hypot(p.dx - q.dx, p.dz - q.dz)).toBeGreaterThan(4);
			}
		}
		expect(startOffset(0)).toEqual({ dx: 0, dz: 0 }); // solo start is unchanged
	});
});
