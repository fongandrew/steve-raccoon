import { beforeEach, describe, expect, it } from 'vitest';

import { addScore, resetShiftState, state, T } from '../public/src/state.js';
import { blockCenter, ROAD_Y, roadCenter } from '../public/src/world.js';

beforeEach(() => resetShiftState());

describe('addScore', () => {
	it('adds and docks points', () => {
		addScore(30);
		addScore(-5);
		expect(state.score).toBe(25);
	});

	it('never drops below zero', () => {
		addScore(10);
		addScore(-50);
		expect(state.score).toBe(0);
	});

	it('doubles gains, but not penalties, during Golden Hour', () => {
		state.goldenHour = true;
		addScore(10);
		expect(state.score).toBe(20);
		addScore(-5);
		expect(state.score).toBe(15);
	});
});

describe('resetShiftState', () => {
	it('clears everything a shift accumulates', () => {
		state.time = 200;
		state.score = 900;
		state.load = 7;
		state.hunger = 3;
		state.hangry = true;
		state.goldenHour = true;
		state.stats.cans = 12;
		state.lastBonk = 180;
		state.lastNarration = 190;
		resetShiftState();
		expect(state).toMatchObject({
			time: 0,
			score: 0,
			load: 0,
			hunger: 100,
			hangry: false,
			goldenHour: false,
		});
		expect(state.stats.cans).toBe(0);
		// Rate limiters are in shift time: left over, they'd mute the next shift
		expect(state.lastBonk).toBeLessThan(0);
		expect(state.lastNarration).toBeLessThan(0);
	});

	it('gives each shift its own stats and grab list', () => {
		const { stats, grabs } = state;
		resetShiftState();
		expect(state.stats).not.toBe(stats);
		expect(state.grabs).not.toBe(grabs);
	});

	it('leaves the screen mode alone', () => {
		state.mode = 'playing';
		resetShiftState();
		expect(state.mode).toBe('playing');
		state.mode = 'title';
	});

	it('parks the truck on the road, stopped', () => {
		T.pos.set(99, 0, -99);
		T.vel.set(5, 0, 5);
		T.heading = 2;
		T.grounded = false;
		resetShiftState();
		expect([T.pos.x, T.pos.z]).toEqual([roadCenter(3), blockCenter(2)]);
		expect(T.vel.length()).toBe(0);
		expect(T.heading).toBe(0);
		expect(T.y).toBe(ROAD_Y);
		expect(T.grounded).toBe(true);
	});
});
