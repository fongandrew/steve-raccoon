#!/usr/bin/env node
/**
 * Build the deploy artifact: mirror public/ into dist/, minifying HTML
 * (html-minifier-terser) and each JS/CSS file on its own (esbuild --minify, no
 * bundling: modules ship as separate files, vendored Three.js included). Then
 * stamp the service worker: PRECACHE is every shipped file and VERSION is a
 * sha256 of exactly those bytes, so any change to any file is a new cache.
 *
 * sw.js and _headers are left out of both the hash and PRECACHE: the first
 * would be chicken-and-egg, and Netlify consumes _headers as configuration
 * rather than serving it (a precached 404 fails cache.addAll()).
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	copyFileSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';

import { transform } from 'esbuild';
import { minify } from 'html-minifier-terser';

const SRC = 'public';
const OUT = 'dist';
const EXCLUDED = new Set(['sw.js', '_headers', '_redirects']);

/**
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
	/** @type {string[]} */
	const out = [];
	for (const name of readdirSync(dir)) {
		if (name.startsWith('.') || name.endsWith('.d.ts')) continue;
		const p = join(dir, name);
		if (statSync(p).isDirectory()) out.push(...walk(p));
		else out.push(p);
	}
	return out.sort();
}

// Never ship a Three.js that doesn't match package-lock.json.
execFileSync(process.execPath, ['scripts/vendor.js', '--check'], { stdio: 'inherit' });

rmSync(OUT, { recursive: true, force: true });
for (const file of walk(SRC)) {
	const rel = relative(SRC, file);
	const dest = join(OUT, rel);
	mkdirSync(dirname(dest), { recursive: true });
	const ext = extname(file);
	if (ext === '.html') {
		const html = await minify(readFileSync(file, 'utf8'), {
			collapseWhitespace: true,
			removeComments: true,
			minifyCSS: true,
			minifyJS: true,
		});
		writeFileSync(dest, html);
	} else if ((ext === '.js' || ext === '.css') && rel !== 'sw.js') {
		const res = await transform(readFileSync(file, 'utf8'), {
			loader: ext === '.js' ? 'js' : 'css',
			minify: true,
			format: ext === '.js' ? 'esm' : undefined,
			// Keeps Three.js's @license banner in the minified vendor files.
			legalComments: 'inline',
		});
		writeFileSync(dest, res.code);
	} else {
		copyFileSync(file, dest);
	}
}

const shipped = walk(OUT)
	.map((f) => relative(OUT, f))
	.filter((f) => !EXCLUDED.has(f));
const hash = createHash('sha256');
for (const f of shipped) {
	hash.update(f);
	hash.update(readFileSync(join(OUT, f)));
}
const version = hash.digest('hex').slice(0, 16);

const swPath = join(OUT, 'sw.js');
let sw = readFileSync(swPath, 'utf8');
const precache = ["'./'", ...shipped.map((f) => `'./${f}'`)].map((l) => `\t${l},`).join('\n');
const stamped = sw
	.replace(/const PRECACHE = \[[\s\S]*?\];/, `const PRECACHE = [\n${precache}\n];`)
	.replace(/const VERSION = '[^']+';/, `const VERSION = '${version}';`);
if (stamped === sw) throw new Error('build: sw.js has no VERSION / PRECACHE to stamp');
sw = stamped;
writeFileSync(swPath, sw);
console.log(`build: ${shipped.length} files → ${OUT}/, version ${version}`);
