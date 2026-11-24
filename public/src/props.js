// Instanced batches for props that appear many times (lamps, fences, lawn
// ornaments). Each prop is one instance; moving or hiding a prop just
// updates its matrix, so hundreds of them cost a handful of draw calls.
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import * as THREE from '../vendor/three.module.js';

export class PropBatch {
	/**
	 * @param {THREE.Object3D} scene parent the instanced meshes are added to
	 * @param {THREE.Object3D} template one copy of the prop, at the origin
	 * @param {number} capacity most instances this batch can hold
	 */
	constructor(scene, template, capacity) {
		template.updateMatrixWorld(true);
		/** @type {Map<THREE.Material, THREE.BufferGeometry[]>} */
		const buckets = new Map();
		template.traverse((obj) => {
			if (!(/** @type {THREE.Mesh} */ (obj).isMesh)) return;
			const o = /** @type {THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial>} */ (obj);
			const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
			const keep = o.material.map ? ['position', 'normal', 'uv'] : ['position', 'normal'];
			for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
			g.clearGroups();
			g.applyMatrix4(o.matrixWorld);
			if (!buckets.has(o.material)) buckets.set(o.material, []);
			/** @type {THREE.BufferGeometry[]} */ (buckets.get(o.material)).push(g);
		});
		/** @type {THREE.InstancedMesh[]} */
		this.meshes = [];
		for (const [mat, geos] of buckets) {
			const im = new THREE.InstancedMesh(mergeGeometries(geos), mat, capacity);
			im.count = 0;
			im.castShadow = true;
			im.receiveShadow = true;
			im.frustumCulled = false;
			scene.add(im);
			this.meshes.push(im);
		}
		this.count = 0;
	}

	reset() {
		this.count = 0;
		for (const m of this.meshes) m.count = 0;
	}

	/** @returns {number} the new instance's index */
	add() {
		const i = this.count++;
		for (const m of this.meshes) m.count = this.count;
		return i;
	}

	/**
	 * @param {number} i instance index from `add()`
	 * @param {THREE.Matrix4} matrix
	 */
	set(i, matrix) {
		for (const m of this.meshes) {
			m.setMatrixAt(i, matrix);
			m.instanceMatrix.needsUpdate = true;
		}
	}
}
