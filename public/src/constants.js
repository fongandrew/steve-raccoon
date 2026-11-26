// Tunables and data tables. No DOM, no three.js.

export const SHIFT = 300; // seconds per shift
/** Slower than this (and on the ground) and the claws will go for a can. */
export const GRAB_SPEED = 6.5;
/** Tummy level Steve's hunger stops at in practice mode. */
export const PRACTICE_HUNGER = 50;
/** Tummy lost per second. A full tummy lasts about 83 seconds. */
export const HUNGER_DRAIN = 1.2;
export const CAPACITY = 12;
export const MAX_SPEED = 24;
export const ACTIVE_CANS = 7;
export const GRAVITY = 30;
/** Score needed for one, two and three stars. */
export const STAR_SCORES = /** @type {[number, number, number]} */ ([300, 650, 1100]);

/**
 * What Steve might find in a bag. `h` is how much it fills his tummy.
 *
 * @type {{ h: number, msg: string, fx?: 'zoom' | 'hiccups' }[]}
 */
export const SNACKS = [
	{ h: 85, msg: 'Half a burrito. Still warm-ish.' },
	{ h: 50, fx: 'zoom', msg: 'Coffee grounds! Steve is VIBRATING.' },
	{ h: 45, fx: 'hiccups', msg: 'Flat soda. Oh no. Hiccups.' },
	{ h: 50, msg: 'Fish bones! A delicacy.' },
	{ h: 10, msg: '...that was a sock, Steve.' },
	{ h: 80, msg: 'Pizza crust. The best part.' },
	{ h: 100, fx: 'zoom', msg: 'Birthday cake! Happy birthday, Steve!' },
	{ h: 50, msg: 'A banana peel. Vintage.' },
	{ h: 60, fx: 'hiccups', msg: 'Mystery leftovers. Bold choice.' },
	{ h: 60, msg: 'Cold french fries. Perfection.' },
	{ h: 35, msg: 'A single grape. Steve savors it.' },
];

/**
 * Job titles by final score, lowest first.
 *
 * @type {[min: number, name: string][]}
 */
export const RANKS = [
	[0, 'Trash Intern'],
	[250, 'Garbage Gremlin'],
	[550, 'Bin Bandit'],
	[900, 'Dumpster Duke'],
	[1300, 'Supreme Trash Panda'],
];

export const TRASH_COLORS = [0x6d6d6d, 0x8d6e63, 0x4caf50, 0x3f51b5, 0xff7043, 0xffd23f, 0xb0bec5];

export const BOOST_COLORS = [0xffffff, 0x6ec6ff, 0xffa31a, 0xff6bd5];

export const DUMPSTER_BAGS = 6;

export const BEST_KEY = 'steveRaccoonBest';
