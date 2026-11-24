// Instanced batches for props that appear many times (lamps, fences, lawn
// ornaments). Each prop is one instance; moving or hiding a prop just
// updates its matrix, so hundreds of them cost a handful of draw calls.
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import * as THREE from '../vendor/three.module.js';

export class PropBatch {
	constructor(scene, template, capacity) {
		template.updateMatrixWorld(true);
		const buckets = new Map();
		template.traverse((o) => {
			if (!o.isMesh) return;
			const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
			const keep = o.material.map ? ['position', 'normal', 'uv'] : ['position', 'normal'];
			for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
			g.clearGroups();
			g.applyMatrix4(o.matrixWorld);
			if (!buckets.has(o.material)) buckets.set(o.material, []);
			buckets.get(o.material).push(g);
		});
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

	add() {
		const i = this.count++;
		for (const m of this.meshes) m.count = this.count;
		return i;
	}

	set(i, matrix) {
		for (const m of this.meshes) {
			m.setMatrixAt(i, matrix);
			m.instanceMatrix.needsUpdate = true;
		}
	}
}
