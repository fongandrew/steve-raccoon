import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 800, height: 450 } });

test('a lost WebGL context drops to low graphics and reloads once', async ({ page }) => {
	await page.goto('/');
	await page.waitForFunction(() => !!window.__game);
	expect(await page.evaluate(() => window.__game.gfx)).not.toBe('low');

	// What Chrome does when the GPU runs out of memory or its driver crashes.
	await page.evaluate(() => {
		window.__marker = true;
		const gl = window.__game.renderer.getContext();
		gl.getExtension('WEBGL_lose_context').loseContext();
	});
	await page.waitForFunction(() => !window.__marker && !!window.__game);
	expect(await page.evaluate(() => window.__game.gfx)).toBe('low');
	expect(await page.evaluate(() => window.__game.renderer.shadowMap.enabled)).toBe(false);
	await expect(page.locator('#portrait')).toHaveClass(/still/);

	// Still playable, and a second loss doesn't start a reload loop.
	await page.evaluate(() => {
		const g = window.__game;
		g.setRendering(false);
		g.startShift();
		g.tick(1);
		window.__marker = true;
		g.renderer.getContext().getExtension('WEBGL_lose_context').loseContext();
	});
	await page.waitForTimeout(1500);
	expect(await page.evaluate(() => window.__marker)).toBe(true);
	expect(await page.evaluate(() => window.__game.state.mode)).toBe('playing');
});

test('?gfx= forces and remembers a graphics level', async ({ page }) => {
	await page.goto('/?gfx=low');
	await page.waitForFunction(() => !!window.__game);
	expect(await page.evaluate(() => window.__game.gfx)).toBe('low');
	await page.goto('/');
	await page.waitForFunction(() => !!window.__game);
	expect(await page.evaluate(() => window.__game.gfx)).toBe('low');
	await page.goto('/?gfx=high');
	await page.waitForFunction(() => !!window.__game);
	expect(await page.evaluate(() => window.__game.gfx)).toBe('high');
});
