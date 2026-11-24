// The narrator: a detached, slightly ironic voice describing Steve's day.
export const LINES = {
	ambient: [
		'Steve thinks this is the best job in the world.',
		"One raccoon's trash is... also this raccoon's treasure.",
		'Steve has been told, again, not to eat on the job.',
		'Steve waves at a pigeon. The pigeon does not wave back.',
		'Fun fact: Steve has never passed a driving test.',
		'Steve is humming the trash truck song. There is no trash truck song.',
		'Steve would like to remind you that the claw is not a toy. (It is.)',
		"Steve's mom would be so proud. She lives in a dumpster.",
		'A reminder that Steve technically has no license.',
	],
	pickup: [
		'Steve declares the contents "vintage."',
		'Steve sniffs the can. Is that... lasagna?',
		"One man's trash is Steve's lunch.",
		'Steve whispers "jackpot." It is coffee grounds.',
		'Finders keepers, Steve reminds no one in particular.',
		'Still warm. Steve is delighted.',
	],
	crash: [
		'Steve maintains the house came out of nowhere.',
		'Steve would describe the brakes as "more of a suggestion."',
		'Steve was parallel parking. Allegedly.',
		'Insurance, Steve notes, is a human concept.',
		'Steve meant to do that.',
	],
	dump: [
		'Goodbye, beautiful garbage.',
		'Steve tells each bag to go be free.',
		"Another honest day's work, by raccoon standards.",
		'The trash mountain grows stronger. Steve feels a strange pride.',
	],
	idle: [
		'Steve has stopped to smell the air. It smells like heaven (garbage).',
		'Steve washed his hands earlier. In a puddle.',
		'Steve wonders, briefly, whether this counts as a break.',
		'The trash will not collect itself, Steve. Well. Mostly not.',
	],
	honk: [
		'Steve honks. It is mostly for his own enjoyment.',
		'Beep beep. Steve is coming through.',
		'Make way, says the horn, for garbage.',
	],
	goose: [
		'Geese have the right of way. Always.',
		'The goose is fine. The goose is always fine.',
		'Steve apologizes to the goose. The goose does not accept.',
		'Please do not tell the other geese.',
		'Steve has learned nothing about geese.',
	],
	critter: [
		'The citizen is fine. Furious, but fine.',
		'Steve would like to remind pedestrians that he has the right of way. He does not.',
		'Everyone in Binsville has learned to jump. It is a survival skill now.',
		'Steve waves an apology. It is not accepted.',
	],
	timber: [
		'TIMBERRRRR! The tree had it coming. Probably.',
		'Steve is now also in the logging business.',
		'The squirrels will be filing a complaint.',
	],
	garden: [
		'The community garden club will hear about this.',
		'Steve is harvesting. Aggressively.',
		'Those were prize-winning cabbages. Were.',
	],
	frontload: [
		"Steve's truck also has a front loader. Truly the most capable of trucks.",
		'Up and over! Steve ducks. Steve always ducks.',
		'The dumpster goes over the cab. Steve does not look up.',
	],
	prop: [
		'Steve insists that was like that already.',
		'Steve calls it "abstract landscaping."',
		'Nobody saw that. (Everybody saw that.)',
		'That mailbox, says Steve, had it coming.',
		"Steve has tiny hands. He'd like that noted.",
	],
};
/** @typedef {keyof typeof LINES} LineKind */

/**
 * A random line for an event.
 *
 * @param {LineKind} kind
 */
export const pickLine = (kind) => {
	const lines = LINES[kind];
	return /** @type {string} */ (lines[(Math.random() * lines.length) | 0]);
};
