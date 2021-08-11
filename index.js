import { Project, Scene3D, PhysicsLoader, THREE } from "enable3d";

function map(v, a, b, c, d) {
  return ((v - a) / (b - a)) * (d - c) + c;
}
function deadzone(v, z = 0.05) {
  const s = Math.sign(v);
  const av = Math.abs(v);
  v = av < z ? z : av;
  return s * map(v, z, 1, 0, 1);
}
const collisionFlags = {
  dynamic: 0,
  static: 1,
  kinematic: 2,
  ghost: 4,
};

class MainScene extends Scene3D {
  async init() {
    this.state = Object.preventExtensions({
      group: null,
      box: null,
      obs: null,
      resetting: false,
      jumpWasUp: true,
    });
    //this.physics.debug.enable();
  }
  async create() {
    this.warpSpeed();
    this.camera.position.set(0, 10, 30);
    this.state.group = new THREE.Group();
    this.state.group.rotation.y = Math.PI;
    this.scene.add(this.state.group);
    this.physics.addExisting(this.state.group, { shape: "capsule", radius: 0.5, height: 1.5, ignoreScale: true });
    this.state.group.body.setAngularFactor(0, 1, 0);
    this.state.group.body.setDamping(0.8, 0.99);

    this.state.box = this.add.box({ height: 2.5 }, { lambert: { color: "hotpink" } });
    this.state.box.add(this.make.sphere({ z: 0.5, y: 1.2, radius: 0.2 }));
    this.state.group.add(this.state.box);

    this.physics.add.box({ z: -2, width: 10, height: 30, collisionFlags: collisionFlags.static });
    this.physics.add.box({ z: -2, x: -3, y: 3, depth: 4, collisionFlags: collisionFlags.static });
    this.physics.add.box({ z: -2, x: 0, y: 6, depth: 4, collisionFlags: collisionFlags.static });
    this.physics.add.box({ z: -2, x: 3, y: 9, depth: 4, collisionFlags: collisionFlags.static });
    this.physics.add.box({ z: -2, x: 0, y: 12, depth: 4, collisionFlags: collisionFlags.static });

    /*
    const obs = this.add.cylinder({height: 10, radius: 0.25, radiusTop: 0.25, radiusBottom: 0.25 });
    obs.rotation.z = Math.PI / 2;
    this.physics.add.existing(obs, {collisionFlags: 1});
    */
  }
  getGamepad() {
    const gamepads = navigator.getGamepads();
    if (gamepads.length && gamepads[0]) return gamepads[0];
  }
  update() {
    const gamepad = this.getGamepad();
    if (!this.state.resetting) {
      if (gamepad) {
        const ax = deadzone(-gamepad.axes[0]);
        const ay = deadzone(-gamepad.axes[1]);
        const bx = deadzone(-gamepad.axes[2]);
        this.state.group.body.applyCentralLocalForce(10 * ax, 0, 10 * ay);
        this.state.group.body.applyTorqueImpulse(0, 0.03 * bx, 0);
        const bv = this.state.group.body.velocity;
        if (this.state.jumpWasUp && gamepad.buttons[0].pressed && Math.abs(bv.y) < 0.01) {
          this.state.group.body.applyCentralImpulse(0, 15, 0);
          this.state.jumpWasUp = false;
        }
      }

      const vy = Math.abs(this.state.group.body.velocity.y);
      this.state.box.scale.x = map(vy, 0, 30, 1, 0.3);
      this.state.box.scale.z = map(vy, 0, 30, 1, 0.3);
      this.state.box.scale.y = map(vy, 0, 30, 1, 2);
      if (this.state.group.position.y < -5 || this.state.group.position.y > 50) {
        this.state.group.body.setCollisionFlags(2);
        this.state.group.body.setPosition(0, 3, 0);
        this.state.group.body.setRotation(0, 0, 0);
        this.state.group.body.refresh();
        this.state.box.scale.setScalar(1);
        this.state.box.position.y = 0;
        this.state.resetting = true;
        setInterval(() => {
          this.state.group.body.setCollisionFlags(0);
          this.state.resetting = false;
        }, 200);
      }
    }
    if (gamepad && !gamepad.buttons[0].pressed) {
      this.state.jumpWasUp = true;
    }
  }
}

PhysicsLoader(
  "/lib",
  () =>
    new Project({
      antialias: true,
      gravity: { x: 0, y: -15, z: 0 },
      scenes: [MainScene],
    })
);
