import { expect, test } from '@playwright/test';

// Two real browsers in one room, through the Node relay (`npm run dev:relay`,
// started by playwright.config.js). The shift clock is the relay's, so these
// wait on real time where they have to and step the simulation with `tick()`
// for everything else.

test.use({ viewport: { width: 800, height: 450 } });

/** @typedef {import('@playwright/test').Page} Page */

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {string} [url]
 * @returns {Promise<Page>}
 */
async function open(browser, url = '/') {
	const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
	const page = await ctx.newPage();
	await page.goto(url);
	await page.waitForFunction(() => !!window.__game);
	await page.evaluate(() => window.__game.setRendering(false));
	return page;
}

const live = (/** @type {Page} */ page) =>
	page.waitForFunction(() => window.__game.net.status() === 'live', null, { timeout: 15000 });

const mode = (/** @type {Page} */ page, /** @type {string} */ m) =>
	page.waitForFunction((want) => window.__game.state.mode === want, m, { timeout: 15000 });

/**
 * A makes a room, B joins it with the code, A starts the shift.
 *
 * @param {import('@playwright/test').Browser} browser
 */
async function shiftForTwo(browser) {
	const a = await open(browser);
	await a.click('#friendsBtn');
	await a.click('#lobbyHost');
	await live(a);
	const code = await a.evaluate(() => window.__game.net.code());
	const b = await open(browser);
	await b.click('#friendsBtn');
	await b.fill('#codeInput', code.toLowerCase()); // codes aren't case sensitive
	await b.click('#lobbyGo');
	await live(b);
	await a.waitForFunction(() => window.__game.net.players().length === 2);
	return { a, b, code };
}

test('lobby: a room code, two raccoons, and only the host can start', async ({ browser }) => {
	const { a, b, code } = await shiftForTwo(browser);
	expect(code).toMatch(/^[A-Z0-9]{4,6}$/);
	await expect(a.locator('#roomCode')).toHaveText(code);
	expect(new URL(a.url()).searchParams.get('room')).toBe(code);

	for (const page of [a, b]) {
		await expect(page.locator('#roomPlayers li')).toHaveCount(2);
		await expect(page.locator('#roomPlayers')).toContainText('Steve');
		await expect(page.locator('#roomPlayers')).toContainText('Gary');
	}
	await expect(a.locator('#roomPlayers li').first()).toContainText('(you)');
	await expect(b.locator('#roomPlayers li').nth(1)).toContainText('(you)');
	await expect(a.locator('#roomStart')).toBeVisible();
	await expect(b.locator('#roomStart')).toBeHidden();
	await expect(b.locator('#roomStatus')).toContainText('Waiting for Steve');

	// The link alone gets a third raccoon in
	const c = await open(browser, `/?room=${code}`);
	await live(c);
	await expect(c.locator('#roomPlayers li')).toHaveCount(3);
	await expect(c.locator('#roomPlayers li').nth(2)).toContainText('Lou');
	await expect(a.locator('#roomPlayers li')).toHaveCount(3);

	// ...and leaving takes them out again, back to the title screen
	await c.click('#roomLeave');
	await expect(c.locator('#title')).toBeVisible();
	expect(new URL(c.url()).searchParams.get('room')).toBeNull();
	await expect(a.locator('#roomPlayers li')).toHaveCount(2);
});

test('a bad code says so', async ({ browser }) => {
	const page = await open(browser);
	await page.click('#friendsBtn');
	await page.fill('#codeInput', '!!');
	await page.click('#lobbyGo');
	await expect(page.locator('#lobbyError')).toContainText("doesn't look right");
});

test('a shift for two: same town, shared cans, bumps and a leaderboard', async ({ browser }) => {
	test.setTimeout(120000);
	const { a, b } = await shiftForTwo(browser);
	await a.click('#roomStart');
	for (const page of [a, b]) await mode(page, 'countdown');
	// Parked on the grid in their own colours, not yet allowed to drive
	const grid = await Promise.all(
		[a, b].map((page) =>
			page.evaluate(() => {
				const g = window.__game;
				g.keys.add('gas');
				g.tick(0.5);
				g.keys.delete('gas');
				return { slot: g.state.slot, x: g.T.pos.x, fwd: g.T.fwd };
			}),
		),
	);
	expect(grid[0]).toMatchObject({ slot: 0, fwd: 0 });
	expect(grid[1]).toMatchObject({ slot: 1, fwd: 0 });
	expect(grid[0].x).not.toBe(grid[1].x);
	await expect(b.locator('#clockLabel')).toHaveText('Starting in');

	for (const page of [a, b]) await mode(page, 'playing');
	await expect(a.locator('#board div')).toHaveCount(2);

	// Everyone sees the same cans out, and each other
	await a.waitForFunction(
		() => window.__game.world.houses.filter((h) => h.state === 'out').length >= 10,
	);
	const cans = (/** @type {Page} */ page) =>
		page.evaluate(() => {
			const g = window.__game;
			return g.world.houses.flatMap((h, i) => (h.state === 'out' ? [i] : []));
		});
	await expect.poll(() => cans(b)).toEqual(await cans(a));
	await a.waitForFunction(() => window.__game.rivals.get(1)?.seen);
	await b.waitForFunction(() => window.__game.rivals.get(0)?.seen);
	await expect(a.locator('.nameTag')).toHaveText('Gary');

	// Gary parks by a can and gets it; Steve sees it go, and Gary's score arrive
	const target = (await cans(b))[0];
	await b.evaluate((i) => {
		const g = window.__game;
		const h = g.world.houses[i];
		const alongX = Math.abs(h.canX - h.x) < Math.abs(h.canZ - h.z);
		if (alongX) g.teleport(h.canX, h.canZ + 3.5, Math.PI / 2);
		else g.teleport(h.canX + 3.5, h.canZ, 0);
	}, target);
	await expect
		.poll(
			() =>
				b.evaluate(() => {
					window.__game.tick(0.5);
					return window.__game.state.stats.cans;
				}),
			{ timeout: 15000 },
		)
		.toBe(1);
	const garyScore = await b.evaluate(() => window.__game.state.score);
	expect(garyScore).toBeGreaterThan(0);
	await a.waitForFunction((i) => window.__game.world.houses[i].state !== 'out', target);
	expect(await a.evaluate(() => window.__game.state.stats.cans)).toBe(0);
	await a.waitForFunction((s) => window.__game.net.table()[0].score === s, garyScore);
	expect(await a.evaluate(() => window.__game.net.table().map((p) => p.name))).toEqual([
		'Gary',
		'Steve',
	]);

	// Two trucks reach for the same can at once: exactly one gets it
	const contested = (await cans(a)).find((i) => i !== target);
	const park = (/** @type {Page} */ page, /** @type {number} */ side) =>
		page.evaluate(
			([i, s]) => {
				const g = window.__game;
				const h = g.world.houses[i];
				const alongX = Math.abs(h.canX - h.x) < Math.abs(h.canZ - h.z);
				if (alongX) g.teleport(h.canX, h.canZ + 3.5 * s, Math.PI / 2);
				else g.teleport(h.canX + 3.5 * s, h.canZ, 0);
				g.tick(0.05);
			},
			[contested, side],
		);
	const before = await Promise.all(
		[a, b].map((p) => p.evaluate(() => window.__game.state.stats.cans)),
	);
	await Promise.all([park(a, 1), park(b, -1)]);
	await expect
		.poll(
			async () => {
				const got = await Promise.all(
					[a, b].map((p) =>
						p.evaluate(() => {
							window.__game.tick(0.5);
							return window.__game.state.stats.cans;
						}),
					),
				);
				return got[0] - before[0] + (got[1] - before[1]);
			},
			{ timeout: 15000 },
		)
		.toBe(1);
	for (const page of [a, b]) {
		await page.waitForFunction((i) => window.__game.world.houses[i].state !== 'out', contested);
	}

	// Steve drives into the back of Gary's parked truck, in real time on both
	// screens. Steve never passes through, and Gary's truck is shunted forwards.
	await b.evaluate(() => window.__game.teleport(27, -80, 0));
	await a.waitForFunction(() => Math.abs((window.__game.rivals.get(1)?.z ?? 0) + 80) < 0.5);
	await a.evaluate(() => {
		const g = window.__game;
		g.teleport(27, -100, 0);
		g.keys.add('gas');
	});
	await a.waitForFunction(() => window.__game.state.stats.bumps > 0, null, { timeout: 20000 });
	const bump = await a.evaluate(() => {
		const g = window.__game;
		g.keys.delete('gas');
		return { z: g.T.pos.z, garyZ: g.rivals.get(1).z };
	});
	expect(bump.z).toBeLessThan(bump.garyZ - 2.5); // nose to tail, not overlapping
	await expect
		.poll(() => b.evaluate(() => window.__game.T.pos.z), { timeout: 10000 })
		.toBeGreaterThan(-79.7);
	expect(await b.evaluate(() => window.__game.state.stats.bumps)).toBeGreaterThan(0);

	// The whistle: each screen ends on its own clock and shows the same table
	for (const page of [a, b]) await page.evaluate(() => window.__game.net.fastForward(600));
	for (const page of [a, b]) {
		await expect
			.poll(
				() =>
					page.evaluate(() => {
						window.__game.tick(0.1);
						return window.__game.state.mode;
					}),
				{ timeout: 15000 },
			)
			.toBe('results');
		await expect(page.locator('#leaderboard tr')).toHaveCount(2);
	}
	const finalTable = await a.evaluate(() =>
		window.__game.net.table().map((p) => [p.name, p.score]),
	);
	await expect
		.poll(() => b.evaluate(() => window.__game.net.table().map((p) => [p.name, p.score])))
		.toEqual(finalTable);
	await expect(a.locator('#againBtn')).toBeVisible();
	await expect(b.locator('#againBtn')).toBeHidden();
	await expect(b.locator('#waitHost')).toContainText('Waiting for Steve');

	// The host goes again: a fresh shift for both
	await a.click('#againBtn');
	for (const page of [a, b]) {
		await page.waitForFunction(() => window.__game.net.shift() === 2, null, { timeout: 15000 });
		expect(await page.evaluate(() => window.__game.state.score)).toBe(0);
	}

	// Gary leaves: back to the title for him, and Steve's room carries on without him
	await mode(b, 'playing');
	await b.keyboard.press('KeyP');
	await b.evaluate(() => window.__game.tick(0.1));
	await b.click('#leaveBtn');
	await expect(b.locator('#title')).toBeVisible();
	expect(await b.evaluate(() => window.__game.state.online)).toBe(false);
	await a.waitForFunction(() => window.__game.net.players().length === 1);
	await a.waitForFunction(() => !window.__game.rivals.get(1)?.seen);
	expect(await a.evaluate(() => window.__game.state.mode)).toBe('playing');

	// ...and Gary can still play a shift on his own afterwards
	await b.click('#startBtn');
	expect(
		await b.evaluate(() => {
			const g = window.__game;
			g.tick(1);
			return {
				mode: g.state.mode,
				online: g.state.online,
				slot: g.state.slot,
				t: g.state.time,
			};
		}),
	).toMatchObject({ mode: 'playing', online: false, slot: 0 });
});
