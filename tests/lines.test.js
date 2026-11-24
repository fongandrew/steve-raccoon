import { describe, expect, it } from 'vitest';

import { SNACKS } from '../public/src/constants.js';
import { LINES, pickLine } from '../public/src/lines.js';
import { withRandom } from './helpers.js';

describe('narrator lines', () => {
	it('has something to say for every kind of event', () => {
		for (const [kind, lines] of Object.entries(LINES)) {
			expect(lines.length, kind).toBeGreaterThan(0);
			for (const line of lines) expect(line.trim().length, kind).toBeGreaterThan(0);
			expect(new Set(lines).size, `${kind} has duplicate lines`).toBe(lines.length);
		}
	});

	it('picks from the requested kind', () => {
		expect(withRandom([0], () => pickLine('goose'))).toBe(LINES.goose[0]);
		expect(withRandom([0.999], () => pickLine('goose'))).toBe(LINES.goose.at(-1));
	});
});

describe('snacks', () => {
	it('all feed Steve and only use known side effects', () => {
		for (const s of SNACKS) {
			expect(s.h).toBeGreaterThan(0);
			expect(s.h).toBeLessThanOrEqual(100);
			expect([undefined, 'zoom', 'hiccups']).toContain(s.fx);
			expect(s.msg.length).toBeGreaterThan(0);
		}
	});
});
