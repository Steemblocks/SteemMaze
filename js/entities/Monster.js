import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GameRules } from "../core/GameRules.js";
import { EntityRegistry } from "../core/EntityRegistry.js";

export class Monster {
  constructor(x, z, maze, cellSize, mazeSize, scene, level = 1, game = null) {
    this.id = `monster_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    this.gridX = x;
    this.gridZ = z;
    this.maze = maze;
    this.cellSize = cellSize;
    this.mazeSize = mazeSize;
    this.scene = scene;
    this.level = level;
    this.game = game;

    // Register position to prevent overlaps
    EntityRegistry.register(this.id, x, z, "monster");

    // Attributes
    this.isBoss = false; // It's a regular monster
    this.killReward = 50;
    this.isDisposed = false;

    // Movement configuration
    this.moveInterval = Math.max(30 - level, 15); // Slightly slower than Boss
    this.moveTimer = 0;
    this.chaseRange = 8; // Reasonable chase range
    this.isChasing = false;
    this.chaseTarget = null;
    this.visualPos = new THREE.Vector3(); // For smooth interpolation

    // Animation state
    this.mixer = null;
    this.animations = [];
    this.activeAction = null;

    // Container Mesh
    this.mesh = new THREE.Group();

    // Debug Placeholder (Purple Box) - visible if model fails to load
    const debugGeo = new THREE.CylinderGeometry(0.5, 0.5, 2, 8);
    const debugMat = new THREE.MeshStandardMaterial({
      color: 0x9333ea, // Purple
      wireframe: true,
    });
    this.placeholder = new THREE.Mesh(debugGeo, debugMat);
    this.placeholder.position.y = 1;
    this.mesh.add(this.placeholder);

    // Initialize visual position at spawn
    this.updateTargetPosition();
    this.mesh.position.copy(this.targetPos);
    this.visualPos.copy(this.targetPos);

    this.scene.add(this.mesh);

    // Initial log
    // Initial log
    // console.log(`Monster Created at Grid[${x},${z}]`);

    // Load Model
    this.loadModel();
  }

  // Caching mechanism
  static cachedModel = null;
  static loadPromise = null;

  loadModel() {
    if (Monster.cachedModel) {
      this.instantiateModel(Monster.cachedModel);
      return;
    }

    if (Monster.loadPromise) {
      Monster.loadPromise.then((model) => this.instantiateModel(model));
      return;
    }

    const loader = new GLTFLoader();
    Monster.loadPromise = new Promise((resolve, reject) => {
      // Note: User specified file name amanda.glb in public/models/
      loader.load(
        "/models/monster.glb",
        (gltf) => {
          const model = gltf.scene;

          // Tune Scale - assuming generic size, adjust if model is tiny/huge
          model.scale.setScalar(1.5);

          model.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              // Prevent culling issues
              child.frustumCulled = false;
            }
          });

          // Store animations on the userdata for cloning
          model.userData.animations = gltf.animations;

          Monster.cachedModel = model;
          resolve(model);
        },
        undefined,
        (error) => {
          console.error("Error loading Monster model:", error);
          reject(error);
        },
      );
    });

    Monster.loadPromise.then((model) => this.instantiateModel(model));
  }

  instantiateModel(sourceModel) {
    if (this.isDisposed) return;

    // DEBUG: KEEP Placeholder for now to visualize position
    if (this.placeholder) {
      this.mesh.remove(this.placeholder);
      this.placeholder.geometry.dispose();
      this.placeholder = null;
    }

    const model = sourceModel.clone();

    // Re-disable frustum culling on clone
    model.traverse((child) => {
      if (child.isMesh) {
        child.frustumCulled = false;
        child.visible = true;

        // Ensure double sided for thin meshes
        if (child.material) {
          child.material.side = THREE.DoubleSide;
          // Ensure opaque to prevent ghosting issues
          child.material.transparent = false;
          child.material.opacity = 1.0;
        }
      }
    });

    // Compute Bounding Box to check for scale/offset issues
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // console.log("Monster Model Debug:", {
    //   size: size,
    //   center: center,
    //   position: model.position,
    // });

    // START AUTO-CORRECTION
    // 1. Center the model (if it's offset from origin)
    model.position.sub(center); // Move center to 0,0,0
    model.position.y += size.y / 2 + 0.5; // Move bottom to 0 + 0.5 offset

    // 2. Normalize Scale (target height ~3.5 units)
    if (size.y > 0) {
      const scaleFactor = 3.5 / size.y;
      model.scale.setScalar(scaleFactor);
      // console.log("Monster Model Debug: Auto-scaled by", scaleFactor);
    }
    // END AUTO-CORRECTION

    // Setup Animation Mixer
    if (
      sourceModel.userData.animations &&
      sourceModel.userData.animations.length > 0
    ) {
      this.mixer = new THREE.AnimationMixer(model);

      // Try to find a "Walk" animation, otherwise default to first
      let clip = sourceModel.userData.animations.find(
        (a) =>
          a.name.toLowerCase().includes("walk") ||
          a.name.toLowerCase().includes("run") ||
          a.name.toLowerCase().includes("move"),
      );
      if (!clip) clip = sourceModel.userData.animations[0];

      if (clip) {
        const action = this.mixer.clipAction(clip);
        action.play();
        this.activeAction = action;
        // console.log("Monster Animation playing:", clip.name);
      }
    }

    this.mesh.add(model);
  }

  calculateWorldPos(gx, gz) {
    const worldX =
      gx * this.cellSize -
      (this.mazeSize * this.cellSize) / 2 +
      this.cellSize / 2;
    const worldZ =
      gz * this.cellSize -
      (this.mazeSize * this.cellSize) / 2 +
      this.cellSize / 2;
    return new THREE.Vector3(worldX, 0, worldZ);
  }

  updateTargetPosition() {
    this.targetPos = this.calculateWorldPos(this.gridX, this.gridZ);
  }

  setPlayerPosition(playerX, playerZ, isLightBoostActive = false) {
    const distance =
      Math.abs(playerX - this.gridX) + Math.abs(playerZ - this.gridZ);

    // Run away if light boost
    if (isLightBoostActive && distance <= this.chaseRange) {
      // Flee logic (simplified)
      // ...
      return;
    }

    if (distance <= this.chaseRange) {
      this.isChasing = true;
      this.chaseTarget = { x: playerX, z: playerZ };
    } else {
      this.isChasing = false;
      this.chaseTarget = null;
    }
  }

  canMove(dx, dz) {
    const newX = this.gridX + dx;
    const newZ = this.gridZ + dz;

    if (newX < 0 || newX >= this.mazeSize || newZ < 0 || newZ >= this.mazeSize)
      return false;

    // Check if cell is occupied by another entity
    if (EntityRegistry.isOccupied(newX, newZ, this.id)) {
      return false;
    }

    const cell = this.maze[this.gridZ]?.[this.gridX];
    if (!cell) return false;

    if (dx === 1 && cell.right) return false;
    if (dx === -1 && cell.left) return false;
    if (dz === 1 && cell.bottom) return false;
    if (dz === -1 && cell.top) return false;

    return true;
  }

  moveTowardTarget() {
    // Basic random movement if not chasing
    if (!this.chaseTarget) {
      const dirs = [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ];
      const dir = dirs[Math.floor(Math.random() * dirs.length)];
      if (this.canMove(dir[0], dir[1])) {
        this.gridX += dir[0];
        this.gridZ += dir[1];
        this.updateTargetPosition();
      }
      return;
    }

    // Chase logic
    const dx = this.chaseTarget.x - this.gridX;
    const dz = this.chaseTarget.z - this.gridZ;

    let moveX = 0,
      moveZ = 0;
    if (Math.abs(dx) > Math.abs(dz)) {
      moveX = Math.sign(dx);
      if (!this.canMove(moveX, 0)) moveX = 0; // Blocked
    } else {
      moveZ = Math.sign(dz);
      if (!this.canMove(0, moveZ)) moveZ = 0;
    }

    if (moveX !== 0 || moveZ !== 0) {
      this.gridX += moveX;
      this.gridZ += moveZ;
      this.updateTargetPosition();
    }
  }

  update(deltaTime) {
    if (this.isDisposed || !this.mesh) return;

    // 1. Game Logic Tick (Movement decision)
    this.moveTimer++;
    if (this.moveTimer >= this.moveInterval) {
      this.moveTimer = 0;
      this.moveTowardTarget();
    }

    // 2. Smooth Visual Interpolation
    const lerpSpeed = 5.0 * deltaTime;
    this.mesh.position.lerp(this.targetPos, lerpSpeed);

    // 3. Rotation (Face movement direction)
    const diff = new THREE.Vector3().subVectors(
      this.targetPos,
      this.mesh.position,
    );
    if (diff.lengthSq() > 0.1) {
      const targetRotation = Math.atan2(diff.x, diff.z);
      // Smooth rotation
      let rotDiff = targetRotation - this.mesh.rotation.y;
      while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
      while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
      this.mesh.rotation.y += rotDiff * 5.0 * deltaTime;
    }

    // 4. Animation Update
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }
  }

  updateTargetPosition() {
    this.targetPos = this.calculateWorldPos(this.gridX, this.gridZ);
    // Update registry with new position
    EntityRegistry.update(this.id, this.gridX, this.gridZ);
  }

  checkCollision(playerX, playerZ) {
    return this.gridX === playerX && this.gridZ === playerZ;
  }

  explode() {
    if (!this.mesh) return;

    const position = this.mesh.position.clone();

    // Monster explosion - Red/Gore theme to match Zombies
    const particleCount = 20;
    const particles = [];

    // Create shared geometry if not exists
    if (!Monster.particleGeo) {
      Monster.particleGeo = new THREE.SphereGeometry(0.12, 4, 4);
    }

    const colors = [0x8b0000, 0x4a0000, 0x2d2d2d, 0x660000, 0x3d0000]; // Bloody Red Palette

    for (let i = 0; i < particleCount; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      const mat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 1.0,
      });

      const particle = new THREE.Mesh(Monster.particleGeo, mat);

      // Start at monster center
      particle.position.copy(position);
      particle.position.y += 1.5; // Upper body

      // Random velocity
      particle.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        0.3 + Math.random() * 0.4,
        (Math.random() - 0.5) * 0.6,
      );

      particle.userData.gravity = -0.02;
      particle.userData.life = 1.0;
      particle.userData.decay = 0.02 + Math.random() * 0.02;

      this.scene.add(particle);
      particles.push(particle);
    }

    // Flash effect
    const flash = new THREE.PointLight(0xff0000, 3.0, 8);
    flash.position.copy(position);
    flash.position.y += 1.5;
    this.scene.add(flash);

    // Interactive Loop
    let flashIntensity = 3.0;
    const animateParticles = () => {
      let activeCount = 0;

      // Animate Flash
      if (flashIntensity > 0) {
        flashIntensity -= 0.3;
        flash.intensity = Math.max(0, flashIntensity);
      } else if (flash.parent) {
        this.scene.remove(flash);
      }

      particles.forEach((p) => {
        if (p.userData.life <= 0) return;

        p.position.add(p.userData.velocity);
        p.userData.velocity.y += p.userData.gravity;
        p.userData.life -= p.userData.decay;

        p.material.opacity = p.userData.life;
        p.scale.setScalar(p.userData.life);

        if (p.userData.life > 0) activeCount++;
      });

      if (activeCount > 0 || flashIntensity > 0) {
        requestAnimationFrame(animateParticles);
      } else {
        particles.forEach((p) => {
          this.scene.remove(p);
          p.geometry.dispose();
          p.material.dispose();
        });
        if (flash.parent) this.scene.remove(flash);
      }
    };
    requestAnimationFrame(animateParticles);

    this.dispose();
  }

  dispose() {
    this.isDisposed = true;
    EntityRegistry.unregister(this.id);
    if (this.mesh) {
      this.scene.remove(this.mesh);
    }
  }
}
