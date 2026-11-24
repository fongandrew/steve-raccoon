import { expect, test } from '@playwright/test';

test('boots to the title screen with no errors', async ({ page }) => {
	/** @type {string[]} */
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	page.on('requestfailed', (r) => errors.push(`failed: ${r.url()}`));

	const response = await page.goto('/');
	expect(response?.status()).toBe(200);
	await expect(page).toHaveTitle('Steve Raccoon');
	await page.waitForFunction(() => !!window.__game);

	await expect(page.locator('#title')).toBeVisible();
	await expect(page.locator('#stats')).toBeHidden();
	await expect(page.locator('#game canvas')).toBeVisible();
	expect(await page.evaluate(() => window.__game.state.mode)).toBe('title');

	// The town is built and populated before anyone presses Start.
	const town = await page.evaluate(() => {
		const g = window.__game;
		return {
			houses: g.world.houses.length,
			geese: g.geese.length,
			citizens: g.cats.length,
			treasures: g.treasures.length,
		};
	});
	expect(town.houses).toBeGreaterThan(20);
	expect(town.geese).toBe(6);
	expect(town.citizens).toBeGreaterThan(10);
	expect(town.treasures).toBe(10);

	expect(errors).toEqual([]);
});

test('ships a manifest and icons at relative URLs', async ({ page, request }) => {
	await page.goto('/');
	const href = await page.locator('link[rel="manifest"]').getAttribute('href');
	expect(href).toBe('./site.webmanifest');
	const manifest = await (await request.get('/site.webmanifest')).json();
	expect(manifest.name).toBe('Steve Raccoon');
	expect(manifest.start_url).toBe('./');
	for (const icon of manifest.icons) {
		expect(icon.src.startsWith('./')).toBe(true);
		expect((await request.get(`/${icon.src.slice(2)}`)).status()).toBe(200);
	}
});
