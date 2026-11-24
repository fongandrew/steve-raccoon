import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: true,
	// Each spec drives software-rendered WebGL: more than two at once starves
	// the CPU and the frame loop crawls.
	workers: 2,
	forbidOnly: !!process.env['CI'],
	retries: process.env['CI'] ? 2 : 0,
	reporter: 'list',
	use: {
		baseURL: 'http://localhost:3000',
		trace: 'off',
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: 'npm run dev',
		url: 'http://localhost:3000',
		reuseExistingServer: !process.env['CI'],
		stdout: 'ignore',
		stderr: 'pipe',
	},
});
