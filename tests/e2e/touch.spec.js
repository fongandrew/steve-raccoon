import { devices, expect, test } from '@playwright/test';

// A phone held sideways: left thumb steers, right thumb is the pedal.
test.use({ ...devices['Pixel 7 landscape'] });

/**
 * Fire a pointer event at a zone, as a finger would.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} zone
 * @param {string} type
 * @param {number} id
 * @param {number} x
 * @param {number} y
 */
const finger = (page, zone, type, id, x, y) =>
	page.evaluate(
		([zoneId, t, pid, cx, cy]) => {
			document.getElementById(zoneId).dispatchEvent(
				new PointerEvent(t, {
					pointerId: pid,
					clientX: cx,
					clientY: cy,
					bubbles: true,
					cancelable: true,
					pointerType: 'touch',
				}),
			);
		},
		[zone, type, id, x, y],
	);

const tick = (/** @type {import('@playwright/test').Page} */ page, /** @type {number} */ s) =>
	page.evaluate((sec) => window.__game.tick(sec), s);

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await page.waitForFunction(() => !!window.__game);
	await page.evaluate(() => window.__game.setRendering(false));
	await page.tap('#startBtn');
	await expect(page.locator('#stats')).toBeVisible();
});

test('shows the two-thumb controls and no drift button', async ({ page }) => {
	await expect(page.locator('#stick')).toBeVisible();
	await expect(page.locator('#pedal')).toBeVisible();
	await expect(page.locator('#btnHonk')).toBeVisible();
	await expect(page.locator('#btnDrift')).toHaveCount(0);
	await expect(page.locator('#hint')).toBeHidden();
});

test('right thumb is the throttle, left thumb steers', async ({ page }) => {
	// Nothing held: the truck stays put.
	await tick(page, 1);
	expect(await page.evaluate(() => window.__game.T.fwd)).toBeCloseTo(0, 1);

	// Hold the pedal: off we go, straight.
	await finger(page, 'pedalZone', 'pointerdown', 2, 760, 250);
	expect(await page.evaluate(() => window.__game.touch)).toMatchObject({
		gas: true,
		brake: false,
	});
	await tick(page, 1.5);
	const straight = await page.evaluate(() => ({
		fwd: window.__game.T.fwd,
		heading: window.__game.T.heading,
	}));
	expect(straight.fwd).toBeGreaterThan(8);
	expect(straight.heading).toBeCloseTo(0, 2);

	// Slide the left thumb right: the truck turns right (heading falls).
	await finger(page, 'steerZone', 'pointerdown', 1, 150, 260);
	await finger(page, 'steerZone', 'pointermove', 1, 190, 300);
	expect(await page.evaluate(() => window.__game.touch.steer)).toBeCloseTo(0.8);
	await tick(page, 0.5);
	expect(await page.evaluate(() => window.__game.T.heading)).toBeLessThan(-0.05);

	// Up and down on the steering thumb does nothing; letting go centres it.
	await finger(page, 'steerZone', 'pointermove', 1, 150, 120);
	expect(await page.evaluate(() => window.__game.touch.steer)).toBe(0);
	await finger(page, 'steerZone', 'pointerup', 1, 150, 120);

	// Lift the pedal thumb: no throttle.
	await finger(page, 'pedalZone', 'pointerup', 2, 760, 250);
	expect(await page.evaluate(() => window.__game.touch)).toMatchObject({
		gas: false,
		brake: false,
	});
});

test('pulling the pedal down brakes, then reverses', async ({ page }) => {
	await finger(page, 'pedalZone', 'pointerdown', 2, 760, 220);
	await tick(page, 1.5);
	await finger(page, 'pedalZone', 'pointermove', 2, 760, 260);
	expect(await page.evaluate(() => window.__game.touch)).toMatchObject({
		gas: false,
		brake: true,
	});
	await expect(page.locator('#pedal')).toHaveClass(/brake/);
	await tick(page, 2.5);
	const s = await page.evaluate(() => ({
		fwd: window.__game.T.fwd,
		drift: window.__game.state.touchDrift,
	}));
	expect(s.drift).toBe(false); // going straight: an ordinary brake
	expect(s.fwd).toBeLessThan(-1);

	// Back up a little and it's the gas again.
	await finger(page, 'pedalZone', 'pointermove', 2, 760, 240);
	expect(await page.evaluate(() => window.__game.touch)).toMatchObject({
		gas: true,
		brake: false,
	});
});

test('braking through a turn at speed drifts, and letting go boosts', async ({ page }) => {
	await finger(page, 'pedalZone', 'pointerdown', 2, 760, 220);
	await tick(page, 2);
	await finger(page, 'steerZone', 'pointerdown', 1, 150, 260);
	await finger(page, 'steerZone', 'pointermove', 1, 200, 260);
	await tick(page, 0.2);
	const before = await page.evaluate(() => window.__game.T.fwd);
	expect(before).toBeGreaterThan(8);

	await finger(page, 'pedalZone', 'pointermove', 2, 760, 260);
	await tick(page, 0.8);
	const drifting = await page.evaluate(() => ({
		drift: window.__game.state.touchDrift,
		charge: window.__game.state.driftCharge,
		fwd: window.__game.T.fwd,
		pedal: document.getElementById('pedal').dataset.drift,
	}));
	expect(drifting.drift).toBe(true);
	expect(drifting.charge).toBeGreaterThan(0.6);
	expect(drifting.fwd).toBeGreaterThan(8); // it keeps its speed; it doesn't stop
	expect(drifting.pedal).toBe('1');

	// Thumb off the brake: boost.
	await finger(page, 'pedalZone', 'pointerup', 2, 760, 260);
	await tick(page, 0.1);
	const after = await page.evaluate(() => ({
		drift: window.__game.state.touchDrift,
		boostT: window.__game.state.boostT,
		boosts: window.__game.state.stats.boosts,
	}));
	expect(after.drift).toBe(false);
	expect(after.boostT).toBeGreaterThan(0);
	expect(after.boosts).toBe(1);
});
