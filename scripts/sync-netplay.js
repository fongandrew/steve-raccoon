#!/usr/bin/env node
/**
 * Copy the netplay multiplayer engine in from the pomelo-penguin repo.
 *
 * Steve Raccoon lives in its own repository, but its multiplayer runs on the
 * shared netplay relay that lives in pomelo-penguin (`packages/netplay/` +
 * `server/`). Same reasoning as pomelo-penguin's own `scripts/sync-netplay.js`:
 * there is no bundler, the site deploys from one directory, and the service
 * worker hashes exactly the bytes shipped — so the engine is *copied*, not
 * shared at runtime.
 *
 * Two destinations:
 * - `public/src/net/`  — the browser half (what the game imports).
 * - `relay/`           — the server core plus the Node `ws` adapter, so
 *                        `npm run dev:relay` and the Playwright suite can run a
 *                        real relay locally without the other repo.
 *
 * Source defaults to a sibling checkout at `../pomelo-penguin` (the GitHub name)
 * or `../pomelopenguin.com` (the site name); override with
 * `NETPLAY_REPO=/path/to/pomelo-penguin`. When the source repo isn't there
 * (e.g. CI that only checks out this repo), `--check` warns and passes — the
 * checked-in copies are the build input either way.
 *
 * Usage:
 *   node scripts/sync-netplay.js            # write
 *   node scripts/sync-netplay.js --check    # verify, exit 1 on drift
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const NETPLAY_DIR = 'packages/netplay/src';
const override = process.env['NETPLAY_REPO'];
const candidates = override ? [override] : ['../pomelo-penguin', '../pomelopenguin.com'];
const REPO = resolve(candidates.find((dir) => existsSync(join(dir, NETPLAY_DIR))) ?? candidates[0]);
const SRC = join(REPO, NETPLAY_DIR);
const check = process.argv.includes('--check');

const CLIENT_MODULES = [
	'clock.js',
	'client.js',
	'codes.js',
	'events.js',
	'index.js',
	'owned.js',
	'pack.js',
	'protocol.js',
	'rng.js',
];

/** Server-side modules the Node relay needs (core + what core imports). */
const RELAY_MODULES = ['codes.js', 'core.js', 'origin.js', 'protocol.js', 'rng.js'];

/**
 * @param {string} source Path relative to the pomelo-penguin repo.
 */
const banner = (source) => `// GENERATED FILE — do not edit.
// Source: pomelo-penguin/${source}
// Regenerate with \`npm run net:sync\`; \`npm run net:check\` fails on drift.
`;

if (!existsSync(SRC)) {
	const tried = candidates.map((dir) => resolve(dir, NETPLAY_DIR)).join(' or ');
	const msg = `sync-netplay: no netplay source at ${tried} (set NETPLAY_REPO)`;
	if (check) {
		console.warn(`${msg} — skipping drift check`);
		process.exit(0);
	}
	console.error(msg);
	process.exit(1);
}

/** @type {{ target: string, body: string }[]} */
const files = [];
for (const name of CLIENT_MODULES) {
	files.push({
		target: join('public/src/net', name),
		body: banner(`packages/netplay/src/${name}`) + readFileSync(join(SRC, name), 'utf8'),
	});
}
for (const name of RELAY_MODULES) {
	files.push({
		target: join('relay/netplay', name),
		body: banner(`packages/netplay/src/${name}`) + readFileSync(join(SRC, name), 'utf8'),
	});
}
const nodeServer = readFileSync(join(REPO, 'server/dev/node-server.js'), 'utf8')
	.replace(/^#!.*\n/, '')
	.replaceAll('../../packages/netplay/src/', './netplay/');
files.push({
	target: 'relay/node-server.js',
	body: banner('server/dev/node-server.js') + nodeServer,
});

/** @type {string[]} */
const drift = [];
let written = 0;
for (const { target, body } of files) {
	const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
	if (current === body) continue;
	if (check) {
		drift.push(target);
		continue;
	}
	mkdirSync(join(target, '..'), { recursive: true });
	writeFileSync(target, body);
	written++;
}

for (const dir of ['public/src/net', 'relay/netplay']) {
	if (!existsSync(dir)) continue;
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (files.some((f) => f.target === path)) continue;
		if (check) drift.push(`${path} (not part of netplay)`);
		else console.warn(`sync-netplay: unexpected file left in place: ${path}`);
	}
}

if (check) {
	if (drift.length) {
		console.error('sync-netplay: generated copies are out of date:');
		for (const path of drift) console.error(`  ${path}`);
		console.error('\nRun `npm run net:sync` and commit the result.');
		process.exit(1);
	}
	console.log('sync-netplay: copies match pomelo-penguin');
} else {
	console.log(`sync-netplay: ${written} file(s) written from ${REPO}`);
}
