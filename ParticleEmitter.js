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
    const geometry = new THREE.SphereGeometry();
    this.sprites = [];
    for (let i = 0; i < 20; i++) {
      const sprite = new THREE.Mesh(geometry, material);
      const spriteMeta = {
        duration: 0,
        ttl: 0,
        sprite,
        velocity: new THREE.Vector3(),
      };
      this.sprites.push(spriteMeta);
      scene.add(sprite);
    }
  }
  randomizeSprite = (() => {
    const worldPosition = new THREE.Vector3();
    return (spriteMeta) => {
      this.getWorldPosition(worldPosition);
      spriteMeta.duration = spriteMeta.ttl = rand(1, 2);
      const spread = 0.1;
      spriteMeta.sprite.position.set(
        worldPosition.x + rand(-spread, spread),
        worldPosition.y + rand(-spread, spread),
        worldPosition.z + rand(-spread, spread)
      );
    };
  })();
  burst = (() => {
    const worldPosition = new THREE.Vector3();
    return () => {
      this.getWorldPosition(worldPosition);
      for (const spriteMeta of this.sprites) {
        spriteMeta.sprite.position.copy(worldPosition);
        spriteMeta.ttl = spriteMeta.duration = rand(0.5, 1.5);
        randomUnitVector(spriteMeta.velocity);
        spriteMeta.velocity.multiplyScalar(0.02);
      }
    };
  })();

  tick(delta) {
    for (let i = 0; i < this.sprites.length; i++) {
      const spriteMeta = this.sprites[i];
      if (spriteMeta.ttl > 0) {
        spriteMeta.ttl -= delta;
        spriteMeta.sprite.position.add(spriteMeta.velocity);
      } else {
        if (this.randomize) {
          this.randomizeSprite(spriteMeta);
        }
      }
      spriteMeta.sprite.scale.setScalar((spriteMeta.ttl / spriteMeta.duration) * 0.2 + 0.001);
    }
  }
}

export { ParticleEmitter };
