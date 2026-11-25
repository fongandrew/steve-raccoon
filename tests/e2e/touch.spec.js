import { devices, expect, test } from '@playwright/test';

// A phone held sideways: left thumb steers, right thumb has GAS and BRAKE.
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

/**
 * The middle of a pedal, as a finger would find it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 */
const centre = (page, id) =>
	page.evaluate((elId) => {
		const r = document.getElementById(elId).getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
	}, id);

const touchState = (/** @type {import('@playwright/test').Page} */ page) =>
	page.evaluate(() => ({ ...window.__game.touch }));

test('shows the pedals, and no drift or honk button', async ({ page }) => {
	await expect(page.locator('#btnGas')).toBeVisible();
	await expect(page.locator('#btnBrake')).toBeVisible();
	await expect(page.locator('#wheel')).toBeHidden(); // until a thumb lands
	await expect(page.locator('#btnDrift')).toHaveCount(0);
	await expect(page.locator('#btnHonk')).toHaveCount(0);
	await expect(page.locator('#hint')).toBeHidden();
});

test('GAS goes, the left thumb steers', async ({ page }) => {
	const gas = await centre(page, 'btnGas');
	// Nothing held: the truck stays put.
	await tick(page, 1);
	expect(await page.evaluate(() => window.__game.T.fwd)).toBeCloseTo(0, 1);

	await finger(page, 'pedalZone', 'pointerdown', 2, gas.x, gas.y);
	expect(await touchState(page)).toMatchObject({ gas: true, brake: false });
	await expect(page.locator('#btnGas')).toHaveClass(/on/);
	await tick(page, 1.5);
	const straight = await page.evaluate(() => ({
		fwd: window.__game.T.fwd,
		heading: window.__game.T.heading,
	}));
	expect(straight.fwd).toBeGreaterThan(8);
	expect(straight.heading).toBeCloseTo(0, 2);

	// A wheel appears under the left thumb; sliding right turns right (heading falls).
	await finger(page, 'steerZone', 'pointerdown', 1, 150, 260);
	await expect(page.locator('#wheel')).toBeVisible();
	await finger(page, 'steerZone', 'pointermove', 1, 173, 300);
	expect((await touchState(page)).steer).toBeCloseTo(0.5);
	await tick(page, 0.5);
	expect(await page.evaluate(() => window.__game.T.heading)).toBeLessThan(-0.05);

	// Up and down on the steering thumb does nothing; letting go centres it.
	await finger(page, 'steerZone', 'pointermove', 1, 150, 120);
	expect((await touchState(page)).steer).toBe(0);
	await finger(page, 'steerZone', 'pointerup', 1, 150, 120);
	await expect(page.locator('#wheel')).toBeHidden();

	await finger(page, 'pedalZone', 'pointerup', 2, gas.x, gas.y);
	expect(await touchState(page)).toMatchObject({ gas: false, brake: false });
});

test('BRAKE stops, then reverses; a thumb can roll between the pedals', async ({ page }) => {
	const gas = await centre(page, 'btnGas');
	const brake = await centre(page, 'btnBrake');
	await finger(page, 'pedalZone', 'pointerdown', 2, gas.x, gas.y);
	await tick(page, 1.5);
	// Roll the same thumb across to the brake, without lifting
	await finger(page, 'pedalZone', 'pointermove', 2, brake.x, brake.y);
	expect(await touchState(page)).toMatchObject({ gas: false, brake: true });
	await tick(page, 2.5);
	const s = await page.evaluate(() => ({
		fwd: window.__game.T.fwd,
		drift: window.__game.state.touchDrift,
	}));
	expect(s.drift).toBe(false); // going straight: an ordinary brake
	expect(s.fwd).toBeLessThan(-1);
	await finger(page, 'pedalZone', 'pointermove', 2, gas.x, gas.y);
	expect(await touchState(page)).toMatchObject({ gas: true, brake: false });

	// Two fingers, one on each
	await finger(page, 'pedalZone', 'pointerdown', 3, brake.x, brake.y);
	expect(await touchState(page)).toMatchObject({ gas: true, brake: true });
	await finger(page, 'pedalZone', 'pointerup', 3, brake.x, brake.y);
	await finger(page, 'pedalZone', 'pointerup', 2, gas.x, gas.y);
	expect(await touchState(page)).toMatchObject({ gas: false, brake: false });
});

test('braking through a turn at speed drifts, and letting go boosts', async ({ page }) => {
	const gas = await centre(page, 'btnGas');
	const brake = await centre(page, 'btnBrake');
	await finger(page, 'pedalZone', 'pointerdown', 2, gas.x, gas.y);
	await tick(page, 2);
	await finger(page, 'steerZone', 'pointerdown', 1, 150, 260);
	await finger(page, 'steerZone', 'pointermove', 1, 200, 260);
	await tick(page, 0.2);
	expect(await page.evaluate(() => window.__game.T.fwd)).toBeGreaterThan(8);

	await finger(page, 'pedalZone', 'pointermove', 2, brake.x, brake.y);
	await tick(page, 0.8);
	const drifting = await page.evaluate(() => ({
		drift: window.__game.state.touchDrift,
		charge: window.__game.state.driftCharge,
		fwd: window.__game.T.fwd,
		lit: document.getElementById('btnBrake').dataset.drift,
	}));
	expect(drifting.drift).toBe(true);
	expect(drifting.charge).toBeGreaterThan(0.6);
	expect(drifting.fwd).toBeGreaterThan(8); // it keeps its speed; it doesn't stop
	expect(drifting.lit).toBe('1');

	// Thumb off the brake: boost.
	await finger(page, 'pedalZone', 'pointerup', 2, brake.x, brake.y);
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

test('a quick tap off the buttons honks; holds, slides and pedal dabs do not', async ({ page }) => {
	const honked = async () => {
		const cd = await page.evaluate(() => {
			const g = window.__game;
			g.state.honkCd = 0;
			g.tick(1 / 60);
			return g.state.honkCd;
		});
		return cd > 0;
	};
	const gas = await centre(page, 'btnGas');

	// Tap on the road, right side and left side
	for (const [zone, x, y] of [
		['pedalZone', 560, 150],
		['steerZone', 200, 250],
	]) {
		await finger(page, zone, 'pointerdown', 5, x, y);
		await finger(page, zone, 'pointerup', 5, x, y);
		expect(await honked(), zone).toBe(true);
	}

	// A dab on the gas is not a honk
	await finger(page, 'pedalZone', 'pointerdown', 5, gas.x, gas.y);
	await finger(page, 'pedalZone', 'pointerup', 5, gas.x, gas.y);
	expect(await honked()).toBe(false);

	// Nor is a steering flick
	await finger(page, 'steerZone', 'pointerdown', 5, 200, 250);
	await finger(page, 'steerZone', 'pointermove', 5, 230, 250);
	await finger(page, 'steerZone', 'pointerup', 5, 230, 250);
	expect(await honked()).toBe(false);

	// Nor is resting a thumb
	await finger(page, 'steerZone', 'pointerdown', 5, 200, 250);
	await page.waitForTimeout(350);
	await finger(page, 'steerZone', 'pointerup', 5, 200, 250);
	expect(await honked()).toBe(false);
});
