import { expect, test } from '@playwright/test';

// Software-rendered WebGL draws only a few frames a second in CI, so these
// specs step the simulation with `__game.tick()` instead of waiting on real
// frames, and read `__game.state` instead of pixels.

// Small enough to count as a small device: lighter shadows while the page boots.
test.use({ viewport: { width: 800, height: 450 } });

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await page.waitForFunction(() => !!window.__game);
	await page.evaluate(() => window.__game.setRendering(false));
	await page.click('#startBtn');
	await expect(page.locator('#stats')).toBeVisible();
});

test('starting a shift puts cans out and the truck drives', async ({ page }) => {
	const start = await page.evaluate(() => {
		const g = window.__game;
		return {
			mode: g.state.mode,
			out: g.world.houses.filter((h) => h.state === 'out').length,
			z: g.T.pos.z,
		};
	});
	expect(start.mode).toBe('playing');
	expect(start.out).toBe(7);

	await page.keyboard.down('KeyW');
	const after = await page.evaluate(() => {
		const g = window.__game;
		g.tick(2);
		return { z: g.T.pos.z, fwd: g.T.fwd, time: g.state.time };
	});
	await page.keyboard.up('KeyW');
	// Heading 0 is +z
	expect(after.z).toBeGreaterThan(start.z + 5);
	expect(after.fwd).toBeGreaterThan(5);
	expect(after.time).toBeGreaterThanOrEqual(2);
	await expect(page.locator('#clock')).toHaveText(/^4:5\d$/);
});

test('grab a can, dump the load, finish the shift, go again', async ({ page }) => {
	// Park beside a can that is out; whichever claw is on that side takes it.
	const grabbed = await page.evaluate(() => {
		const g = window.__game;
		const h = g.world.houses.find((x) => x.state === 'out');
		const spots = [
			[3.5, 0, 0],
			[-3.5, 0, 0],
			[0, 3.5, Math.PI / 2],
			[0, -3.5, Math.PI / 2],
		];
		for (const [dx, dz, heading] of spots) {
			g.teleport(h.canX + dx, h.canZ + dz, heading);
			g.tick(4);
			if (g.state.stats.cans > 0) break;
		}
		return { cans: g.state.stats.cans, load: g.state.load, score: g.state.score };
	});
	expect(grabbed.cans).toBe(1);
	expect(grabbed.load).toBeGreaterThan(0);
	expect(grabbed.score).toBeGreaterThan(0);
	await expect(page.locator('#loadText')).toHaveText(`${grabbed.load}/12`);

	// Onto the pad at The Dump: every bag pays out.
	const dumped = await page.evaluate(() => {
		const g = window.__game;
		g.teleport(g.world.dump.x, g.world.dump.z);
		g.tick(3);
		return { load: g.state.load, dumped: g.state.stats.dumped, score: g.state.score };
	});
	expect(dumped.load).toBe(0);
	expect(dumped.dumped).toBe(grabbed.load);
	expect(dumped.score).toBeGreaterThanOrEqual(grabbed.score + grabbed.load * 10);

	// Golden Hour, then the whistle.
	const golden = await page.evaluate(() => {
		const g = window.__game;
		g.skipTo(271);
		g.tick(0.1);
		return g.state.goldenHour;
	});
	expect(golden).toBe(true);
	await page.evaluate(() => {
		const g = window.__game;
		g.skipTo(299.9);
		g.tick(0.5);
	});
	expect(await page.evaluate(() => window.__game.state.mode)).toBe('results');
	await expect(page.locator('#results')).toBeVisible();
	await expect(page.locator('#rank')).not.toBeEmpty();
	await expect(page.locator('#review')).toContainText('"');
	await expect(page.locator('#resultTable tr').first()).toContainText(String(dumped.score));
	expect(await page.evaluate(() => localStorage.getItem('steveRaccoonBest'))).toBe(
		String(dumped.score),
	);

	// Another shift starts clean.
	await page.click('#againBtn');
	await expect(page.locator('#results')).toBeHidden();
	const fresh = await page.evaluate(() => {
		const s = window.__game.state;
		return { mode: s.mode, score: s.score, load: s.load, cans: s.stats.cans, time: s.time };
	});
	expect(fresh).toMatchObject({ mode: 'playing', score: 0, load: 0, cans: 0 });
	expect(fresh.time).toBeLessThan(5);
});

test('pause stops the clock; snacking eats cargo', async ({ page }) => {
	await page.keyboard.press('KeyP');
	const paused = await page.evaluate(() => {
		const g = window.__game;
		g.tick(0.1);
		const t = g.state.time;
		g.tick(2);
		return { mode: g.state.mode, moved: g.state.time - t };
	});
	expect(paused).toEqual({ mode: 'paused', moved: 0 });
	await expect(page.locator('#pause')).toBeVisible();
	await page.click('#resumeBtn');
	await expect(page.locator('#pause')).toBeHidden();

	// Hungry raccoon, loaded truck: E eats one bag.
	await page.evaluate(() => {
		const s = window.__game.state;
		s.load = 3;
		s.hunger = 20;
	});
	await page.keyboard.press('KeyE');
	const fed = await page.evaluate(() => {
		const g = window.__game;
		g.tick(0.1);
		return { load: g.state.load, hunger: g.state.hunger, snacks: g.state.stats.snacks };
	});
	expect(fed.load).toBe(2);
	expect(fed.hunger).toBeGreaterThan(20);
	expect(fed.snacks).toBe(1);
});

test('the claws still take a can the truck has parked too close to', async ({ page }) => {
	// Right up against the can, then right on top of it: neither is reachable
	// as it stands, so the arm has to scoot the can out first.
	for (const offset of [1.2, 0]) {
		const got = await page.evaluate((dx) => {
			const g = window.__game;
			g.startShift();
			const h = g.world.houses.find((x) => x.state === 'out');
			// Park in line with the road so the can is square to the truck's side
			const alongX = Math.abs(h.canX - h.x) < Math.abs(h.canZ - h.z);
			if (alongX) g.teleport(h.canX, h.canZ + dx, Math.PI / 2);
			else g.teleport(h.canX + dx, h.canZ, 0);
			g.tick(4);
			return { cans: g.state.stats.cans, load: g.state.load, state: h.state };
		}, offset);
		expect(got.cans, `offset ${offset}`).toBe(1);
		expect(got.load).toBeGreaterThan(0);
		expect(got.state).toBe('done');
	}
});

test('practice mode has no clock and ends from the pause menu', async ({ page }) => {
	await page.reload();
	await page.waitForFunction(() => !!window.__game);
	await page.evaluate(() => window.__game.setRendering(false));
	await page.click('#practiceBtn');
	await expect(page.locator('#stats')).toBeVisible();

	// Well past where a shift would have ended, and long enough to get hangry
	const later = await page.evaluate(() => {
		const g = window.__game;
		g.tick(100);
		g.skipTo(900);
		g.tick(1);
		const s = g.state;
		return {
			mode: s.mode,
			practice: s.practice,
			goldenHour: s.goldenHour,
			hangry: s.hangry,
			hunger: s.hunger,
		};
	});
	expect(later).toMatchObject({
		mode: 'playing',
		practice: true,
		goldenHour: false,
		hangry: false,
	});
	expect(later.hunger).toBe(50);
	await expect(page.locator('#clock')).toHaveText('∞');
	await expect(page.locator('#clockLabel')).toHaveText('Practice');

	await page.keyboard.press('KeyP');
	await page.evaluate(() => window.__game.tick(0.1));
	await page.click('#endBtn');
	await expect(page.locator('#title')).toBeVisible();
	await expect(page.locator('#stats')).toBeHidden();
	expect(await page.evaluate(() => window.__game.state.mode)).toBe('title');
	expect(await page.evaluate(() => localStorage.getItem('steveRaccoonBest'))).toBeNull();

	// A real shift afterwards has its clock back and no way to "end practice"
	await page.click('#startBtn');
	await page.evaluate(() => window.__game.tick(0.1));
	await expect(page.locator('#clock')).toHaveText(/^\d:\d\d$/);
	await page.keyboard.press('KeyP');
	await page.evaluate(() => window.__game.tick(0.1));
	await expect(page.locator('#endBtn')).toBeHidden();
});
