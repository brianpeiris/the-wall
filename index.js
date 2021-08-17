import "./global";
import { Project, Scene3D, PhysicsLoader, THREE } from "enable3d";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { gsap } from "gsap";
import ThreeMeshUI from "three-mesh-ui";
import Peer from "peerjs";
import { Camera, Renderer } from "holoplay";
import Stats from "three/examples/jsm/libs/stats.module";

import { ParticleEmitter } from "./ParticleEmitter";
import { rand, deadzone } from "./utils";

const queryParams = new URLSearchParams(location.search);

const collisionFlags = {
  dynamic: 0,
  static: 1,
  kinematic: 2,
  ghost: 4,
};

const loadModel = (() => {
  const gltfLoader = new GLTFLoader();
  return (model) => {
    return new Promise((resolve) => {
      gltfLoader.load(model, (gltf) => {
        resolve(gltf.scene.getObjectByProperty("type", "Mesh"));
      });
    });
  };
})();

const stats = new Stats();
document.body.append(stats.dom);

class MainScene extends Scene3D {
  async preload() {
    this.assets = {
      models: {
        separator: await loadModel("separator.glb"),
      },
    };
  }

  async init() {

    window.scene = this;
    this.state = window.state = Object.preventExtensions({
      isHost: !queryParams.has("id"),
      refractorObjects: [],
      star: null,
      starSide: "left",
      repositioningStar: false,
      score: 0,
      timeLeft: 60,
      textBlock: null,
      scoreText: null,
      timeText: null,
      localGame: false,
      gameStarted: false,
      gameOver: false,
      separator: null,
      separatorWall: null,
      localPlayer: null,
      remotePlayer: null,
      remoteConn: null,
      endedGame: false,
      keys: {
        KeyW: false,
        KeyS: false,
        KeyA: false,
        KeyD: false,
        KeyR: false,
        KeyF: false,
        KeyI: false,
        KeyK: false,
        KeyJ: false,
        KeyL: false,
        KeyP: false,
        Semicolon: false,
      },
    });

    const peer = new Peer();

    peer.on("error", (error) => {
      console.log("peer error", error);
    });

    peer.on("open", (id) => {
      if (this.state.isHost) {
        const links = document.getElementById("links");
        links.style.display = "block";
        const shareLink = document.getElementById("shareLink");
        shareLink.href = `?id=${id}`;
        const localLink = document.getElementById("localLink");
        localLink.addEventListener("click", e => {
          this.state.localGame = true;
          this.state.gameStarted = true;
          this.physics.destroy(this.state.remotePlayer);
          this.physics.add.existing(this.state.remotePlayer);
          links.style.display = "none";
          e.preventDefault();
        });
      } else {
        const id = queryParams.get("id");
        // connect to host
        // using json serialization because binarypack can be very slow without blob support (in chrome).
        this.state.remoteConn = peer.connect(id, {serialization: "json"});
        this.state.remoteConn.on("data", (data) => {
          // received data from host
          this.updateRemotePlayer(data.playerPosition);
          if (this.state.score !== data.score) {
            this.state.score = data.score;
            this.state.scoreText.set({ content: this.state.score.toFixed(0) });
          }
          if (
            this.state.star.position.x !== data.starPosition[0] ||
            this.state.star.position.y !== data.starPosition[1] ||
            this.state.star.position.z !== data.starPosition[2]
          ) {
            this.repositionStar(true, data.starPosition);
          }
          this.state.timeLeft = data.timeLeft;
          this.state.gameOver = data.gameOver;
        });
      }
    });

    peer.on("connection", (conn) => {
      // client connected
      const links = document.getElementById("links");
      links.style.display = "none";
      this.state.gameStarted = true;
      this.state.remoteConn = conn;
      this.state.remoteConn.on("data", (data) => {
        // received data from client
        this.updateRemotePlayer(data);
      });
    });

    const validKeys = Object.keys(this.state.keys);
    window.addEventListener("keydown", e => {
      if (!validKeys.includes(e.code)) return;
      this.state.keys[e.code] = true;
    });
    window.addEventListener("keyup", e => {
      if (!validKeys.includes(e.code)) return;
      this.state.keys[e.code] = false;
    });
  }

  updateRemotePlayer = (() => {
    let lastUpdate = performance.now();
    const remotePosition = { x: 0, y: 0, z: 0 };
    return (data) => {
      const delta = performance.now() - lastUpdate;
      remotePosition.x = data[0];
      remotePosition.y = data[1];
      remotePosition.z = data[2];
      remotePosition.duration = delta / 1000;
      gsap.killTweensOf(this.state.remotePlayer.position);
      gsap.to(this.state.remotePlayer.position, remotePosition);
      lastUpdate = performance.now();
    };
  })();

  makeWall(params, invisible) {
    const material = invisible
      ? { lambert: { visible: false } }
      : { standard: { color: 0x111111, roughness: 1, metalness: 0 } };
    const box = this.physics.add.box({ collisionFlags: collisionFlags.static, ...params }, material);
    box.castShadow = false;
    box.body.setRestitution(0.5);
    if (invisible) this.scene.remove(box);
    return box;
  }

  makePlayer(color, x, isRemote) {
    const player = this.physics.add.sphere(
      { x, radius: 0.5, collisionFlags: isRemote ? collisionFlags.kinematic : collisionFlags.dynamic },
      { standard: { metalness: 0.8, roughness: 0.4, color: color, emissive: color, emissiveIntensity: 0.5 } }
    );
    player.userData.tag = "player";
    player.body.setDamping(0, 0);
    player.body.setRestitution(1);
    player.add(new THREE.PointLight(color, 10, 3, 2));
    player.userData.particleEmitter = new ParticleEmitter(this.scene, color);
    player.add(player.userData.particleEmitter);
    return player;
  }

  makeText(content, block) {
    const text = new ThreeMeshUI.Text({
      fontFamily: "mono.json",
      fontTexture: "mono.png",
      fontSize: 0.8,
      content,
    });
    const scoreContainer = new ThreeMeshUI.Block({
      width: 2,
      height: 1,
      justifyContent: "center",
      backgroundOpacity: 0,
    });
    scoreContainer.add(text);
    block.add(scoreContainer);
    return text;
  }

  async create() {
    const warp = window.warp = await this.warpSpeed("-ground", "-sky", "-orbitControls");
    warp.lights.ambientLight.intensity = 0.3;
    warp.lights.directionalLight.intensity = 0.3;

    const camY = 5
    this.camera.position.set(0, camY, 70);
    this.camera.lookAt(new THREE.Vector3(0, camY, 0));

    this.makeWall({ z: -2, y: 5, width: 10, height: 15, depth: 0.5 });
    this.makeWall({ z: 2, y: 5, width: 10, height: 15, depth: 0.5 }, true);
    this.makeWall({ x: -5, y: 5, width: 0.5, height: 15, depth: 4 }, true);
    this.makeWall({ x: 5, y: 5, width: 0.5, height: 15, depth: 4 }, true);
    this.state.separatorWall = this.makeWall({ x: 0, y: 5, width: 0.5, height: 15, depth: 4 }, true);
    this.makeWall({ x: 0, y: 12.5, width: 10, height: 0.5, depth: 4 }, true);
    this.makeWall({ x: 0, y: -2.5, width: 10, height: 0.5, depth: 4 });
    this.makeWall({ x: 0, y: -2.5, width: 10, height: 0.5, depth: 4 });

    this.state.separator = this.assets.models.separator;
    Object.assign(this.state.separator.material, {
      transparent: true,
      opacity: 0.8,
      metalness: 0,
      roughness: 0,
    });
    this.state.separator.material.color.setHex(0x222222);
    this.state.separator.rotation.y = Math.PI / 2;
    this.state.separator.position.y = 5;
    this.scene.add(this.state.separator);
    this.state.refractorObjects.push(this.state.separator);

    if (this.state.isHost) {
      this.state.localPlayer = this.makePlayer("red", -2);
      this.state.remotePlayer = this.makePlayer("blue", 2, true);
    } else {
      this.state.localPlayer = this.makePlayer("blue", 2);
      this.state.remotePlayer = this.makePlayer("red", -2, true);
    }

    this.state.star = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.5),
      new THREE.MeshStandardMaterial({
        color: "gold",
        roughness: 0.3,
        metalness: 0.7,
        emissive: "gold",
        emissiveIntensity: 0.2,
      })
    );
    this.state.star.castShadow = true;
    this.state.star.userData.particleEmitter = new ParticleEmitter(this.scene, "gold");
    this.state.star.userData.particleEmitter.randomize = false;
    this.state.star.add(this.state.star.userData.particleEmitter);
    this.scene.add(this.state.star);
    this.physics.add.existing(this.state.star, {
      shape: "convex",
      collisionFlags: collisionFlags.kinematic,
      mass: 0.000001,
    });
    if (this.state.isHost) {
      this.state.star.body.on.collision((other, event) => {
        if (
          this.state.gameStarted &&
          !this.state.gameOver &&
          !this.state.repositioningStar &&
          event === "start" &&
          other.userData.tag === "player"
        ) {
          this.state.score++;
          this.state.scoreText.set({ content: this.state.score.toFixed(0) });
          this.state.starSide = this.state.starSide === "left" ? "right" : "left";
          this.repositionStar(true);
        }
      });
      this.repositionStar();
    }

    this.state.textBlock = new ThreeMeshUI.Block({
      width: 2,
      height: 2,
      alignContent: "center",
      justifyContent: "center",
    });
    this.state.textBlock.position.z = 3;
    this.scene.add(this.state.textBlock);

    this.state.scoreText = this.makeText("0", this.state.textBlock);
    this.state.timeText = this.makeText("", this.state.textBlock);
  }

  async repositionStar(burst, pos) {
    if (!pos) {
      const offset = this.state.starSide === "left" ? -2.5 : 2.5;
      const margin = 0.7;
      pos = [
        rand(offset - 2.5 + margin, offset + 2.5 - margin),
        rand(-2.5 + margin, 12.5 - margin),
        rand(-2 + margin, 2 - margin),
      ];
    }
    this.state.repositioningStar = true;
    if (burst) {
      this.state.star.userData.particleEmitter.burst();
    }
    await gsap.to(this.state.star.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.2 }).then();
    this.state.star.position.set(...pos);
    await gsap.to(this.state.star.scale, { x: 1, y: 1, z: 1, duration: 0.2 }).then();
    this.state.repositioningStar = false;
  }

  getGamepad(i) {
    const gamepads = navigator.getGamepads();
    if (gamepads.length && gamepads[i]) return gamepads[i];
  }

  update = (() => {
    const syncData = {
      playerPosition: [],
      timeLeft: 0,
      score: 0,
      gameOver: false,
      starPosition: [],
    };
    return (time, delta) => {
      stats.update();

      this.state.localPlayer.position.toArray(syncData.playerPosition);
      syncData.timeLeft = this.state.timeLeft;
      syncData.score = this.state.score;
      syncData.gameOver = this.state.gameOver;
      this.state.star.position.toArray(syncData.starPosition);

      if (this.state.remoteConn) {
        if (this.state.isHost) {
          this.state.remoteConn.send(syncData);
        } else {
          this.state.remoteConn.send(syncData.playerPosition);
        }
      }

      const deltaSecs = delta / 1000;

      if (this.state.isHost && this.state.gameStarted) {
        this.state.timeLeft -= deltaSecs;

        if (this.state.timeLeft <= 0) {
          this.state.gameOver = true;
        }
      }

      if (!this.state.gameOver) {
        this.state.timeText.set({ content: this.state.timeLeft.toFixed(0) });
      }

      if (this.state.gameOver && !this.state.endedGame) {
        this.state.endedGame = true;
        (async () => {
          this.state.timeText.set({ fontSize: 0.4 });
          this.state.timeText.set({ content: "game over" });

          gsap.to(this.state.star.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.5 });

          gsap.to(this.state.textBlock.position, { y: 5, duration: 0.5 });
          await gsap.to(this.state.textBlock.scale, { x: 2, y: 2, z: 2, duration: 0.5 }).then();

          this.physics.destroy(this.state.separatorWall);
          await gsap.to(this.state.separator.scale, { x: 0.001, z: 0.001, duration: 1 }).then();
          this.scene.remove(this.state.separator);
        })();
      }

      ThreeMeshUI.update();

      this.state.localPlayer.userData.particleEmitter.tick(deltaSecs);
      const gamepad = this.getGamepad(0);
      if (gamepad) {
        const ax = deadzone(gamepad.axes[0]);
        const ay = deadzone(gamepad.axes[1]);
        const by = deadzone(-gamepad.axes[3]);
        this.state.localPlayer.body.applyCentralForce(10 * ax, 10 * by, 10 * ay);
      } else {
        const ax = this.state.keys.KeyA ? -1 : this.state.keys.KeyD ? 1 : 0;
        const ay = this.state.keys.KeyS ? 1 : this.state.keys.KeyW ? -1 : 0;
        const by = this.state.keys.KeyF ? -1 : this.state.keys.KeyR ? 1 : 0;
        this.state.localPlayer.body.applyCentralForce(10 * ax, 10 * by, 10 * ay);
      }

      if (this.state.localGame) {
        this.state.remotePlayer.userData.particleEmitter.tick(deltaSecs);
        const gamepad = this.getGamepad(1);
        if (gamepad) {
          const ax = deadzone(gamepad.axes[0]);
          const ay = deadzone(gamepad.axes[1]);
          const by = deadzone(-gamepad.axes[3]);
          this.state.remotePlayer.body.applyCentralForce(10 * ax, 10 * by, 10 * ay);
        } else {
          const ax = this.state.keys.KeyJ ? -1 : this.state.keys.KeyL ? 1 : 0;
          const ay = this.state.keys.KeyK ? 1 : this.state.keys.KeyI ? -1 : 0;
          const by = this.state.keys.Semicolon ? -1 : this.state.keys.KeyP ? 1 : 0;
          this.state.remotePlayer.body.applyCentralForce(10 * ax, 10 * by, 10 * ay);
        }
      } else {
        this.state.remotePlayer.userData.particleEmitter.tick(deltaSecs);
        this.state.remotePlayer.body.needUpdate = true;
      }

      this.state.star.userData.particleEmitter.tick(deltaSecs);
      this.state.star.rotation.y += 0.6 * deltaSecs;
      this.state.star.rotation.x += 1.2 * deltaSecs;
      this.state.star.body.needUpdate = true;
    };
  })();
}

const renderer = new Renderer({ disableFullscreenUi: queryParams.has("2d") });
//renderer.renderQuilt = true;
renderer.render2d = queryParams.has("2d");
renderer.setSize = (width, height) => {
  return renderer.webglRenderer.setSize(width, height);
};
renderer.setPixelRatio = (ratio) => {
  return renderer.webglRenderer.setPixelRatio(ratio);
};
renderer.setAnimationLoop = (func) => {
  return renderer.webglRenderer.setAnimationLoop(func);
};
Object.defineProperty(renderer, "shadowMap", {
  get() {
    return renderer.webglRenderer.shadowMap;
  },
});

PhysicsLoader(
  "lib",
  () =>
    new Project({
      renderer,
      camera: new Camera(),
      gravity: { x: 0, y: 0, z: 0 },
      scenes: [MainScene],
    })
);
