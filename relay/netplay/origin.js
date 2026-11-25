// GENERATED FILE — do not edit.
// Source: pomelo-penguin/packages/netplay/src/origin.js
// Regenerate with `npm run net:sync`; `npm run net:check` fails on drift.
/**
 * Origin allowlisting.
 *
 * WebSocket upgrades are not subject to CORS, so for a public relay this check
 * is the only thing between a room and the open internet. Shared by both
 * adapters, and deliberately free of any platform types so it type-checks under
 * the browser project and the Workers project alike.
 */

/**
 * Match an `Origin` header against a comma-separated allowlist. Entries may
 * contain a single `*` wildcard, so one entry covers every app subdomain.
 *
 * An empty allowlist means "allow everything" — that's the local-dev default,
 * and it is why production must actually set the var.
 *
 * @param {string | null | undefined} origin
 * @param {string} allowed
 * @returns {boolean}
 */
export function originAllowed(origin, allowed) {
	if (!allowed) return true;
	if (!origin) return false;
	for (const raw of allowed.split(',')) {
		const pattern = raw.trim();
		if (!pattern) continue;
		if (pattern === '*' || pattern === origin) return true;
		const star = pattern.indexOf('*');
		if (star === -1) continue;
		const prefix = pattern.slice(0, star);
		const suffix = pattern.slice(star + 1);
		// A real prefix/suffix match, not a substring search: `includes` would
		// happily accept https://pomelopenguin.com.evil.example.
		if (
			origin.length >= prefix.length + suffix.length &&
			origin.startsWith(prefix) &&
			origin.endsWith(suffix)
		) {
			return true;
		}
	}
	return false;
}
