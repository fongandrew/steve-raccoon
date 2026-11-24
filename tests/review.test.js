import { describe, expect, it } from 'vitest';

import { RANKS, STAR_SCORES } from '../public/src/constants.js';
import { brendaSays, rankFor, starsFor } from '../public/src/review.js';
import { newStats } from '../public/src/state.js';

describe('starsFor', () => {
	it('awards a star at each threshold', () => {
		const [one, two, three] = STAR_SCORES;
		expect(starsFor(0)).toBe(0);
		expect(starsFor(one - 1)).toBe(0);
		expect(starsFor(one)).toBe(1);
		expect(starsFor(two)).toBe(2);
		expect(starsFor(three)).toBe(3);
		expect(starsFor(99999)).toBe(3);
	});
});

describe('rankFor', () => {
	it('starts at the bottom rung', () => {
		expect(rankFor(0)).toBe('Trash Intern');
	});

	it('promotes exactly at each threshold', () => {
		for (const [min, name] of RANKS) {
			expect(rankFor(min)).toBe(name);
			if (min > 0) expect(rankFor(min - 1)).not.toBe(name);
		}
	});

	it('tops out at the best rank', () => {
		expect(rankFor(1e6)).toBe('Supreme Trash Panda');
	});
});

describe('brendaSays', () => {
	it('has a different review for each star rating', () => {
		const reviews = [0, 1, 2, 3].map((stars) => brendaSays(stars, newStats()));
		expect(new Set(reviews).size).toBe(4);
		for (const r of reviews) expect(r).toMatch(/^".+"$/);
	});

	it('calls out misbehaviour ahead of the star rating', () => {
		expect(brendaSays(3, { ...newStats(), geese: 3 })).toMatch(/geese/);
		expect(brendaSays(3, { ...newStats(), smashed: 60 })).toMatch(/neighborhood/);
		expect(brendaSays(0, { ...newStats(), snacks: 6 })).toMatch(/cargo/);
		expect(brendaSays(0, { ...newStats(), treasures: 8 })).toMatch(/hoard/);
	});

	it('geese outrank everything', () => {
		const st = { ...newStats(), geese: 5, smashed: 99, snacks: 9, treasures: 10 };
		expect(brendaSays(2, st)).toMatch(/geese/);
	});
});
