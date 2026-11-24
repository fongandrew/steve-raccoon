import { SHIFT } from './constants.js';

export const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export const cap = (s) => s[0].toUpperCase() + s.slice(1);

export function boostLevel(charge) {
	return charge >= 1.9 ? 3 : charge >= 1.2 ? 2 : charge >= 0.6 ? 1 : 0;
}

export function fmtCountdown(left) {
	const s = Math.max(0, Math.ceil(left));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtClock(t) {
	const minutes = 6 * 60 + (t / SHIFT) * 12 * 60;
	let h = Math.floor(minutes / 60);
	const m = Math.floor((minutes % 60) / 5) * 5;
	const ampm = h >= 12 ? 'PM' : 'AM';
	h = h % 12 || 12;
	return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}
