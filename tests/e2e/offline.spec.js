import { expect, test } from '@playwright/test';

test('plays offline once loaded (service worker)', async ({ page, context }) => {
	test.setTimeout(90000);
	// The worker is off on localhost unless ?sw=1.
	await page.goto('/?sw=1');
	await page.evaluate(() => navigator.serviceWorker.ready);
	// One controlled load, so every module passes through the worker's cache.
	await page.reload();
	await page.waitForFunction(() => !!navigator.serviceWorker.controller && !!window.__game);

	await context.setOffline(true);
	await page.goto('/?sw=1');
	await page.waitForFunction(() => !!window.__game);
	await page.click('#startBtn');
	await expect(page.locator('#stats')).toBeVisible();
	expect(await page.evaluate(() => window.__game.state.mode)).toBe('playing');
	await context.setOffline(false);
});

test('the service worker stays off on localhost by default', async ({ page }) => {
	await page.goto('/');
	await page.waitForFunction(() => !!window.__game);
	const regs = await page.evaluate(
		async () => (await navigator.serviceWorker.getRegistrations()).length,
	);
	expect(regs).toBe(0);
});
