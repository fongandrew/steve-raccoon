// GENERATED FILE — do not edit.
// Source: pomelo-penguin/packages/netplay/src/events.js
// Regenerate with `npm run net:sync`; `npm run net:check` fails on drift.
/**
 * Contested state: the things two players can try to take at the same instant —
 * a powerup, a card off the deck, the finish line.
 *
 * Clients apply their own attempt immediately and undo it if the server's total
 * order says someone else got there first. A brief wrong-looking moment is the
 * accepted cost; the alternative is a round-trip of hesitation on every grab,
 * which on cellular is a quarter-second of the game feeling dead.
 */

/**
 * @template T
 * @typedef {object} PendingEvent
 * @property {number} localId
 * @property {T} detail What the game needs to undo this.
 * @property {number} sentAt
 */

/**
 * @template T
 * @typedef {object} EventLogOptions
 * @property {(detail: T) => void} apply Called to enact an event locally.
 * @property {(detail: T) => void} undo Called when this client lost the race.
 * @property {(detail: T) => string} keyOf Contested resource id — two events
 *   with the same key are competing for the same thing.
 * @property {() => number} [now]
 */

/**
 * Tracks optimistic local events and reconciles them against server order.
 *
 * @template T
 */
export class ContestedLog {
	/**
	 * @param {EventLogOptions<T>} opts
	 */
	constructor(opts) {
		this.applyFn = opts.apply;
		this.undoFn = opts.undo;
		this.keyOf = opts.keyOf;
		this.now = opts.now ?? (() => Date.now());
		/** @type {Map<number, PendingEvent<T>>} Local events awaiting their order. */
		this.pending = new Map();
		/** @type {Map<string, number>} Winning slot per resolved key. */
		this.winners = new Map();
		this.nextLocalId = 1;
	}

	/**
	 * Apply an event optimistically. Returns a local id to correlate with the
	 * echo the server sends back.
	 *
	 * @param {T} detail
	 * @returns {number}
	 */
	predict(detail) {
		const localId = this.nextLocalId++;
		this.pending.set(localId, { localId, detail, sentAt: this.now() });
		this.applyFn(detail);
		return localId;
	}

	/**
	 * Fold in a server-ordered event — our own echo or somebody else's.
	 *
	 * @param {object} args
	 * @param {number} args.slot Who sent it.
	 * @param {number} args.order Server-assigned global order.
	 * @param {T} args.detail
	 * @param {boolean} args.mine True if this is the echo of our own predict.
	 * @param {number} [args.localId] Required when `mine`.
	 * @returns {'won' | 'lost' | 'applied' | 'ignored'}
	 */
	resolve({ slot, order, detail, mine, localId }) {
		void order;
		const key = this.keyOf(detail);
		const winner = this.winners.get(key);

		if (winner !== undefined) {
			// Already decided. If we were the loser and still have it applied
			// locally, take it back now.
			if (mine && localId !== undefined) {
				const p = this.pending.get(localId);
				if (p) {
					this.pending.delete(localId);
					if (winner !== slot) {
						this.undoFn(p.detail);
						return 'lost';
					}
					return 'won';
				}
				// The winner's event already reconciled this key and dropped our
				// prediction. Report the verdict anyway — a caller asking about its
				// own grab wants 'won' or 'lost', never a shrug.
				return winner === slot ? 'won' : 'lost';
			}
			return 'ignored';
		}

		// First event to reach this key in server order wins it, for everyone.
		this.winners.set(key, slot);

		if (mine && localId !== undefined) {
			this.pending.delete(localId);
			return 'won';
		}

		// Somebody else won a key we also tried for: undo our prediction.
		let lost = false;
		for (const [id, p] of this.pending) {
			if (this.keyOf(p.detail) !== key) continue;
			this.pending.delete(id);
			this.undoFn(p.detail);
			lost = true;
		}
		this.applyFn(detail);
		return lost ? 'lost' : 'applied';
	}

	/**
	 * Drop predictions that never came back — a disconnect during the round trip
	 * would otherwise leave them applied forever.
	 *
	 * @param {number} [timeoutMs]
	 * @returns {number} How many were rolled back.
	 */
	expire(timeoutMs = 5000) {
		const cutoff = this.now() - timeoutMs;
		let count = 0;
		for (const [id, p] of this.pending) {
			if (p.sentAt > cutoff) continue;
			this.pending.delete(id);
			this.undoFn(p.detail);
			count++;
		}
		return count;
	}

	/** Forget everything — used on a hard resync, where the keyframe is truth. */
	reset() {
		for (const [id, p] of this.pending) {
			this.pending.delete(id);
			this.undoFn(p.detail);
		}
		this.winners.clear();
	}

	/**
	 * @param {string} key
	 * @returns {number | undefined}
	 */
	winnerOf(key) {
		return this.winners.get(key);
	}
}
