/**
 * Where the netplay relay lives, and which game we claim to be. Same
 * conventions as the pomelo-penguin games: the production relay is the shared
 * Cloudflare Worker (its origin allowlist covers *.pomelopenguin.com), local
 * dev talks to the Node relay from `npm run dev:relay`, and `?server=`
 * overrides both.
 */

export const GAME_ID = 'steve-raccoon';

const PRODUCTION_SERVER = 'https://pomelo-play.pomelopenguin.workers.dev';
const LOCAL_SERVER = 'http://127.0.0.1:8788';

/** @returns {string} */
export function serverUrl() {
	const fromQuery = new URLSearchParams(location.search).get('server');
	if (fromQuery) return fromQuery;
	const host = location.hostname;
	const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
	return local ? LOCAL_SERVER : PRODUCTION_SERVER;
}

/**
 * The build hash rooms pin on, from version.json (stamped at deploy time by
 * scripts/build.js). 'dev' locally.
 *
 * @returns {Promise<string>}
 */
export async function buildId() {
	try {
		const res = await fetch('./version.json', { cache: 'no-store' });
		if (!res.ok) return 'dev';
		const json = await res.json();
		return typeof json.buildId === 'string' ? json.buildId : 'dev';
	} catch {
		return 'dev';
	}
}
