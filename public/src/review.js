// End-of-shift verdicts: stars, rank, and what Brenda has to say about it.
import { RANKS, STAR_SCORES } from './constants.js';

/** Stars (0-3) for a final score. */
export function starsFor(score) {
	return STAR_SCORES.filter((x) => score >= x).length;
}

/** Job title for a final score. */
export function rankFor(score) {
	let rank = RANKS[0][1];
	for (const [min, name] of RANKS) if (score >= min) rank = name;
	return rank;
}

/** Brenda's review. Notable misbehaviour outranks the star rating. */
export function brendaSays(stars, st) {
	if (st.geese >= 3) return '"Please stop hitting the geese. They have retained counsel."';
	if (st.smashed >= 60) return '"The neighborhood association would like a word. Several words."';
	if (st.snacks >= 6) return '"You ate more of the cargo than you delivered. Bold."';
	if (st.treasures >= 8) return '"Impressive hoard. HR will be asking where it came from."';
	return [
		'"I have seen raccoons drive better. I have seen raccoons not drive at all, and that was also better."',
		'"Surprisingly adequate. Suspicious."',
		'"Fine work. I am docking you for the flamingos anyway."',
		'"Exemplary. I am legally required to say I did not see the mailboxes."',
	][stars];
}
