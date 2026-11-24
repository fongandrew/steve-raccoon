import * as THREE from '../vendor/three.module.js';
import { $ } from './hud.js';
import { renderer, scene, steve, truck } from './scene.js';
import { state, T } from './state.js';
import { steveAnim } from './truck-anim.js';

const tmpV2 = new THREE.Vector3();

const faceCam = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
const portraitEl = $('portrait');
const _fp = new THREE.Vector3();
const _fh = new THREE.Vector3();
let lastMood = '';
export function renderPortrait() {
	const r = portraitEl.getBoundingClientRect();
	if (r.width < 10) return;
	truck.body.updateMatrixWorld(true);
	steve.head.getWorldPosition(_fh);
	// In front of his face, a bit toward the middle of the cab, looking back at him
	const h = T.heading;
	const fx = Math.sin(h);
	const fz = Math.cos(h);
	// Just inside the windshield, a little above his eye line, nudged toward the middle
	const side = 0.3 - Math.max(0, steveAnim.lean) * 3; // swing outside the doorway as he leans out
	_fp.copy(_fh).add(tmpV2.set(fx * 1.75 + fz * side, 0.3, fz * 1.75 - fx * side));
	faceCam.position.copy(_fp);
	faceCam.lookAt(_fh.x, _fh.y - 0.02, _fh.z);
	// hide what's between him and the camera (the loader arms, the steering wheel)
	truck.loader.pivot.visible = false;
	for (const m of truck.steeringWheel) m.visible = false;
	faceCam.aspect = r.width / r.height;
	faceCam.updateProjectionMatrix();
	const y = window.innerHeight - r.bottom;
	renderer.setScissorTest(true);
	renderer.setScissor(r.left + 3, y + 3, r.width - 6, r.height - 6);
	renderer.setViewport(r.left + 3, y + 3, r.width - 6, r.height - 6);
	renderer.shadowMap.autoUpdate = false;
	renderer.render(scene, faceCam);
	truck.loader.pivot.visible = true;
	for (const m of truck.steeringWheel) m.visible = true;
	renderer.shadowMap.autoUpdate = true;
	renderer.setScissorTest(false);
	renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);

	// Mood frame + label
	let mood;
	if (state.chompT > 0) mood = 'chomp';
	else if (state.hangry) mood = 'hangry';
	else if (state.hunger < 25) mood = 'hungry';
	else if (state.boostT > 0 || state.zoomT > 0) mood = 'zoom';
	else if (state.hicT > 0) mood = 'hic';
	else mood = state.hunger > 60 ? 'happy' : 'peckish';
	if (mood !== lastMood) {
		lastMood = mood;
		portraitEl.className = mood;
		const M = {
			chomp: ['😋', 'nom nom'],
			hangry: ['💢', 'HANGRY! feed me'],
			hungry: ['🍕?', 'hungry'],
			zoom: ['⚡', 'zoomies'],
			hic: ['🫧', 'hic!'],
			happy: ['', 'happy'],
			peckish: ['', 'peckish'],
		};
		$('mood').textContent = M[mood][0];
		$('moodText').textContent = M[mood][1];
	}
	$('portraitFill').style.width = `${state.hunger}%`;
}
