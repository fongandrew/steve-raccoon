// The corner minimap: the town is painted once into an offscreen canvas, then
// the dump, waiting cans, dumpsters and the truck are drawn over it each frame.
import * as THREE from '../vendor/three.module.js';
import { CAPACITY } from './constants.js';
import { $ } from './hud.js';
import { world } from './scene.js';
import { state, T } from './state.js';
import { BLOCK, HALF, N, ROAD, roadCenter } from './world.js';

const mini = /** @type {HTMLCanvasElement} */ ($('minimap'));
const mctx = /** @type {CanvasRenderingContext2D} */ (mini.getContext('2d'));
const MAP_R = HALF + 6;
/**
 * World (x, z) to minimap pixels.
 *
 * @param {number} x
 * @param {number} z
 * @returns {[number, number]}
 */
const toMap = (x, z) => [
	((-x + MAP_R) / (2 * MAP_R)) * mini.width,
	((-z + MAP_R) / (2 * MAP_R)) * mini.height,
];
const MK = mini.width / 200; // minimap pixel scale (canvas is drawn at 2x)
const mapBg = document.createElement('canvas');
mapBg.width = mini.width;
mapBg.height = mini.height;
(() => {
	const g = /** @type {CanvasRenderingContext2D} */ (mapBg.getContext('2d'));
	const s = mapBg.width / (2 * MAP_R);
	g.fillStyle = '#8fd16a';
	g.fillRect(0, 0, mapBg.width, mapBg.height);
	// Asphalt everywhere inside town, then blocks on top
	const [ax, ay] = toMap(HALF + ROAD / 2, HALF + ROAD / 2);
	g.fillStyle = '#5f6470';
	g.fillRect(ax, ay, (2 * HALF + ROAD) * s, (2 * HALF + ROAD) * s);
	g.strokeStyle = 'rgba(255, 243, 176, 0.7)';
	g.lineWidth = MK;
	g.setLineDash([3 * MK, 3 * MK]);
	for (let i = 0; i <= N; i++) {
		const c = roadCenter(i);
		const [x] = toMap(c, 0);
		const [, y] = toMap(0, c);
		g.beginPath();
		g.moveTo(x, ay);
		g.lineTo(x, ay + (2 * HALF + ROAD) * s);
		g.moveTo(ax, y);
		g.lineTo(ax + (2 * HALF + ROAD) * s, y);
		g.stroke();
	}
	g.setLineDash([]);
	/** @type {Partial<Record<import('./world.js').BlockType, string>>} */
	const lawn = { houses: '#8fd16a', park: '#7cc85c', plaza: '#e8dcc0', dump: '#b39a72' };
	/**
	 * @param {number} x0
	 * @param {number} z0
	 * @param {number} x1
	 * @param {number} z1
	 * @param {string | undefined} col no colour leaves the last fill style in place
	 */
	const rect = (x0, z0, x1, z1, col) => {
		const [px0, py0] = toMap(x1, z1);
		const [px1, py1] = toMap(x0, z0);
		g.fillStyle = /** @type {string} */ (col);
		g.fillRect(px0, py0, px1 - px0, py1 - py0);
	};
	/**
	 * @param {number} x
	 * @param {number} z
	 * @param {number} r
	 * @param {string} col
	 */
	const dot = (x, z, r, col) => {
		const [px, py] = toMap(x, z);
		g.fillStyle = col;
		g.beginPath();
		g.arc(px, py, r * s, 0, Math.PI * 2);
		g.fill();
	};
	for (const b of world.blocks) {
		rect(b.cx - BLOCK / 2, b.cz - BLOCK / 2, b.cx + BLOCK / 2, b.cz + BLOCK / 2, '#d9d4c7');
		rect(
			b.cx - BLOCK / 2 + 1.5,
			b.cz - BLOCK / 2 + 1.5,
			b.cx + BLOCK / 2 - 1.5,
			b.cz + BLOCK / 2 - 1.5,
			lawn[b.type],
		);
		if (b.type === 'houses') dot(b.cx, b.cz, 2.2, '#4fa95a');
		if (b.type === 'plaza') {
			dot(b.cx, b.cz, 5, '#bcb3a0');
			dot(b.cx, b.cz, 4, '#6ec6ff');
		}
		if (b.type === 'dump') dot(b.cx + 6, b.cz - 6, 7, '#8d6e4f');
	}
	for (const r of world.ramps) {
		const ex = r.x + r.dirX * r.len;
		const ez = r.z + r.dirZ * r.len;
		rect(
			Math.min(r.x, ex) - (r.dirZ ? r.w / 2 : 0),
			Math.min(r.z, ez) - (r.dirX ? r.w / 2 : 0),
			Math.max(r.x, ex) + (r.dirZ ? r.w / 2 : 0),
			Math.max(r.z, ez) + (r.dirX ? r.w / 2 : 0),
			'#e0a565',
		);
	}
	for (const h of world.houses) {
		const [px, py] = toMap(h.x, h.z);
		g.save();
		g.translate(px, py);
		g.rotate(-h.facing);
		g.fillStyle = '#' + new THREE.Color(h.roofCol).getHexString();
		g.fillRect(-4.5 * s, -3.6 * s, 9 * s, 7.2 * s);
		g.restore();
	}
})();

/** @param {number} time seconds, for the blinking dump marker */
export function drawMinimap(time) {
	mctx.drawImage(mapBg, 0, 0);
	// dump
	const [dx, dy] = toMap(world.dump.x, world.dump.z);
	mctx.fillStyle =
		state.load >= CAPACITY ? (Math.sin(time * 8) > 0 ? '#ff7a1a' : '#ffd23f') : '#ff7a1a';
	mctx.beginPath();
	mctx.arc(dx, dy, 6 * MK, 0, Math.PI * 2);
	mctx.fill();
	mctx.strokeStyle = '#2b2d33';
	mctx.lineWidth = 1.5 * MK;
	mctx.stroke();
	mctx.fillStyle = '#fff';
	mctx.font = `bold ${9 * MK}px sans-serif`;
	mctx.textAlign = 'center';
	mctx.lineWidth = 3 * MK;
	mctx.strokeText('DUMP', dx, dy - 9 * MK);
	mctx.fillText('DUMP', dx, dy - 9 * MK);
	// cans
	for (const h of world.houses) {
		if (h.state !== 'out') continue;
		const [x, y] = toMap(h.canX, h.canZ);
		mctx.fillStyle = h.golden ? '#ffd23f' : '#2ecc71';
		mctx.strokeStyle = '#2b2d33';
		mctx.lineWidth = 1.5 * MK;
		mctx.beginPath();
		mctx.arc(x, y, (h.golden ? 5 : 4) * MK, 0, Math.PI * 2);
		mctx.fill();
		mctx.stroke();
	}
	for (const b of world.bins) {
		if (b.state !== 'out') continue;
		const [x, y] = toMap(b.x, b.z);
		mctx.fillStyle = '#ffa31a';
		mctx.strokeStyle = '#2b2d33';
		mctx.lineWidth = 1.5 * MK;
		mctx.fillRect(x - 5 * MK, y - 4 * MK, 10 * MK, 8 * MK);
		mctx.strokeRect(x - 5 * MK, y - 4 * MK, 10 * MK, 8 * MK);
	}
	// truck
	const [tx, ty] = toMap(T.pos.x, T.pos.z);
	mctx.save();
	mctx.translate(tx, ty);
	mctx.rotate(-T.heading);
	mctx.scale(MK, MK);
	mctx.fillStyle = '#fff';
	mctx.strokeStyle = '#2b2d33';
	mctx.lineWidth = 2;
	mctx.beginPath();
	mctx.moveTo(0, -8);
	mctx.lineTo(6, 6);
	mctx.lineTo(0, 3);
	mctx.lineTo(-6, 6);
	mctx.closePath();
	mctx.fill();
	mctx.stroke();
	mctx.restore();
}
