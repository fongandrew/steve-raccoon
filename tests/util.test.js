import { describe, expect, it } from 'vitest';

import { boostLevel, cap, ease, fmtCountdown, timeline, wrapAngle } from '../public/src/util.js';

describe('ease', () => {
	it('runs 0 → 1 through the midpoint, symmetrically', () => {
		expect(ease(0)).toBe(0);
		expect(ease(0.5)).toBe(0.5);
		expect(ease(1)).toBe(1);
		expect(ease(0.25) + ease(0.75)).toBeCloseTo(1);
		expect(ease(0.25)).toBeLessThan(0.25); // slow start
	});
});

describe('wrapAngle', () => {
	it('wraps into -PI..PI', () => {
		expect(wrapAngle(0)).toBe(0);
		expect(wrapAngle(Math.PI * 2 + 0.5)).toBeCloseTo(0.5);
		expect(wrapAngle(-Math.PI * 2 - 0.5)).toBeCloseTo(-0.5);
		expect(wrapAngle(Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1);
	});
});

describe('cap', () => {
	it('capitalises the first letter only', () => {
		expect(cap('the Hendersons')).toBe('The Hendersons');
		expect(cap('')).toBe('');
	});
});

describe('boostLevel', () => {
	it('steps up with drift charge', () => {
		expect([0, 0.59, 0.6, 1.19, 1.2, 1.89, 1.9, 2.2].map(boostLevel)).toEqual([
			0, 0, 1, 1, 2, 2, 3, 3,
		]);
	});
});

describe('fmtCountdown', () => {
	it('formats m:ss and rounds up', () => {
		expect(fmtCountdown(240)).toBe('4:00');
		expect(fmtCountdown(59.2)).toBe('1:00');
		expect(fmtCountdown(9)).toBe('0:09');
		expect(fmtCountdown(0.01)).toBe('0:01');
	});

	it('never goes negative', () => {
		expect(fmtCountdown(-3)).toBe('0:00');
	});
});

describe('timeline', () => {
	const tl = timeline({ reach: 0.5, grip: 0.25, lift: 1 });

	it('lays phases end to end', () => {
		expect(tl.end).toEqual({ reach: 0.5, grip: 0.75, lift: 1.75 });
		expect(tl.total).toBe(1.75);
	});

	it('reports clamped progress through a phase', () => {
		expect(tl.phase(0.25, 'reach')).toBe(0.5);
		expect(tl.phase(0.25, 'grip')).toBe(0); // not started
		expect(tl.phase(0.625, 'grip')).toBe(0.5);
		expect(tl.phase(9, 'lift')).toBe(1); // long finished
	});
});
