import { THREE } from "enable3d";

import { rand } from "./utils";

function randomUnitVector(vec) {
  const u = (Math.random() - 0.5) * 2;
  const t = Math.random() * Math.PI * 2;
  const f = Math.sqrt(1 - u ** 2);
  vec.x = f * Math.cos(t);
  vec.y = f * Math.sin(t);
  vec.z = u;
}

class ParticleEmitter extends THREE.Object3D {
  randomize = true;
  constructor(scene, color) {
    super();
    const material = new THREE.MeshBasicMaterial({ color });
    const geometry = new THREE.SphereGeometry(1, 16, 8);
    this.particlesMesh = new THREE.InstancedMesh(geometry, material, 20);
    scene.add(this.particlesMesh);
    this.particles = [];
    for (let i = 0; i < 20; i++) {
      const particleMeta = {
        duration: 0,
        ttl: 0,
        index: i,
        obj: new THREE.Object3D(),
        velocity: new THREE.Vector3(),
      };
      this.particles.push(particleMeta);
    }
  }
  randomizeParticle = (() => {
    const worldPosition = new THREE.Vector3();
    return (particleMeta) => {
      this.getWorldPosition(worldPosition);
      particleMeta.duration = particleMeta.ttl = rand(1, 2);
      const spread = 0.1;
      particleMeta.obj.position.set(
        worldPosition.x + rand(-spread, spread),
        worldPosition.y + rand(-spread, spread),
        worldPosition.z + rand(-spread, spread)
      );
      particleMeta.obj.updateMatrix();
      this.particlesMesh.setMatrixAt(particleMeta.index, particleMeta.obj.matrix);
    };
  })();
  burst = (() => {
    const worldPosition = new THREE.Vector3();
    return () => {
      this.getWorldPosition(worldPosition);
      for (const particleMeta of this.particles) {
        particleMeta.obj.position.copy(worldPosition);
        particleMeta.obj.updateMatrix();
        this.particlesMesh.setMatrixAt(particleMeta.index, particleMeta.obj.matrix);
        particleMeta.ttl = particleMeta.duration = rand(0.5, 1.5);
        randomUnitVector(particleMeta.velocity);
        particleMeta.velocity.multiplyScalar(1.2);
      }
    };
  })();

  tick(delta) {
    for (let i = 0; i < this.particles.length; i++) {
      const particleMeta = this.particles[i];
      if (particleMeta.ttl > 0) {
        particleMeta.ttl -= delta;
        particleMeta.obj.position.x += particleMeta.velocity.x * delta;
        particleMeta.obj.position.y += particleMeta.velocity.y * delta;
        particleMeta.obj.position.z += particleMeta.velocity.z * delta;
      } else {
        if (this.randomize) {
          this.randomizeParticle(particleMeta);
        }
      }
      const scale = Math.max(0.00001, (particleMeta.ttl / particleMeta.duration) * 0.2);
      particleMeta.obj.scale.setScalar(scale);
      particleMeta.obj.updateMatrix();
      this.particlesMesh.setMatrixAt(particleMeta.index, particleMeta.obj.matrix);
    }
    this.particlesMesh.instanceMatrix.needsUpdate = true;
  }
}

export { ParticleEmitter };
