import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GameRules } from "../core/GameRules.js";
import { EntityRegistry } from "../core/EntityRegistry.js";

export class BossZombie {
  constructor(x, z, maze, cellSize, mazeSize, scene, level = 1) {
    this.id = `boss_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    this.gridX = x;
    this.gridZ = z;
    this.maze = maze;
    this.cellSize = cellSize;
    this.mazeSize = mazeSize;
    this.scene = scene;
    this.level = level;

    // Register to prevent overlaps
    EntityRegistry.register(this.id, x, z, "boss");

    // Attributes
    this.isBoss = true;
    this.killReward = GameRules.BOSS_KILL_REWARD_BASE || 150;
    this.isDisposed = false;

    // Movement
    // FASTER: 20 frames (approx 3 moves per second) for a Horde Boss!
    this.moveInterval = Math.max(20 - level, 10);
    this.moveTimer = 0;
    this.chaseRange = mazeSize * 2; // Infinite range
    this.isChasing = true;
    this.isFleeing = false;
    this.chaseTarget = null;
    this.fleeTarget = null;

    // Animation
    this.mixer = null;
    this.animations = [];
    this.activeAction = null;
    this.animationTime = 0;

    // Container Mesh
    this.mesh = new THREE.Group();
    this.scene.add(this.mesh);

    // DEBUG: Force visible and log
    this.mesh.visible = true;
    this.updatePosition();

    this.updatePosition();

    // console.log(`BossZombie Created at Grid[${x},${z}]`);
    // console.log("BossZombie World Position:", this.mesh.position);

    // Safety check for NaN
    if (isNaN(this.mesh.position.x) || isNaN(this.mesh.position.z)) {
      console.error(
        "CRITICAL: Boss Spawn Incorrect! Position is NaN. Defaulting to 0,0",
      );
      this.mesh.position.set(20, 0, 20); // Safety defaults
    }

    // 1. Create Aura (Immediate)
    this.createAura();

    // 2. Load Model (Async)
    this.loadModel();
  }

  // ... (createAura method remains unchanged, but we replace loadModel)

  // Caching mechanism to prevent lag on spawn
  static cachedModel = null;
  static loadPromise = null;

  loadModel() {
    // 1. Use cached model if available
    if (BossZombie.cachedModel) {
      if (!this.isDisposed) {
        this.instantiateModel(BossZombie.cachedModel);
      }
      return;
    }

    // 2. Wait for existing load if in progress
    if (BossZombie.loadPromise) {
      BossZombie.loadPromise.then((model) => {
        if (!this.isDisposed) {
          this.instantiateModel(model);
        }
      });
      return;
    }

    // 3. Load from disk (only once)
    const loader = new GLTFLoader();
    BossZombie.loadPromise = new Promise((resolve, reject) => {
      loader.load(
        "/models/boss_angel.glb",
        (gltf) => {
          const model = gltf.scene;

          // Process Model ONCE during load
          model.scale.setScalar(7.0);
          model.rotation.y = Math.PI;

          model.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.frustumCulled = false; // Prevent culling

              if (child.material) {
                child.material.side = THREE.DoubleSide;
                child.material.emissiveMap = child.material.map;
                child.material.emissive = new THREE.Color(0x330000);
                child.material.emissiveIntensity = 0.8;
                child.material.roughness = 0.4;
                child.material.metalness = 0.6;
              }
            }
          });

          // Store animations
          model.userData.animations = gltf.animations;

          BossZombie.cachedModel = model;
          resolve(model);
        },
        undefined,
        (error) => {
          console.error("Error loading Boss model:", error);
          reject(error);
        },
      );
    });

    BossZombie.loadPromise.then((model) => {
      if (!this.isDisposed) {
        this.instantiateModel(model);
      }
    });
  }

  instantiateModel(sourceModel) {
    if (this.isDisposed) return;

    // Fast clone of the cached model
    const model = sourceModel.clone();

    // Re-bind animations from stored data
    if (
      sourceModel.userData.animations &&
      sourceModel.userData.animations.length > 0
    ) {
      this.mixer = new THREE.AnimationMixer(model);
      const action = this.mixer.clipAction(sourceModel.userData.animations[0]);
      action.play();
      this.activeAction = action;
    }

    this.model = model;
    this.mesh.add(model);

    this.addGlowingEyes(model);
  }

  createAura() {
    // Intense Crimson Aura
    const auraGeo = new THREE.PlaneGeometry(6.0, 6.0);
    this.auraMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color(0xff0000) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 color;
        varying vec2 vUv;
        
        // Simplex Noise
        vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
        float snoise(vec2 v) {
            const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
            vec2 i  = floor(v + dot(v, C.yy));
            vec2 x0 = v - i + dot(i, C.xx);
            vec2 i1;
            i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
            vec4 x12 = x0.xyxy + C.xxzz;
            x12.xy -= i1;
            i = mod(i, 289.0);
            vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
            vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
            m = m*m; m = m*m;
            vec3 x = 2.0 * fract(p * C.www) - 1.0;
            vec3 h = abs(x) - 0.5;
            vec3 a0 = x - floor(x + 0.5);
            m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
            vec3 g;
            g.x  = a0.x  * x0.x  + h.x  * x0.y;
            g.yz = a0.yz * x12.xz + h.yz * x12.yw;
            return 130.0 * dot(m, g);
        }

        void main() {
            vec2 center = vec2(0.5, 0.5);
            float dist = distance(vUv, center);
            
            float noise = snoise(vUv * 5.0 - time * 1.5);
            float pulse = 0.8 + 0.2 * sin(time * 3.0);
            
            float alpha = (1.0 - smoothstep(0.0, 0.5, dist)) * (0.5 + 0.5 * noise) * pulse;
            alpha = smoothstep(0.1, 0.8, alpha);
            
            gl_FragColor = vec4(color * 1.5, alpha * 0.8);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.aura = new THREE.Mesh(auraGeo, this.auraMaterial);
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.position.y = 0.05;
    this.mesh.add(this.aura);
  }

  // Legacy loadModel removed

  addBossEffects() {
    // Optimization: Replaced expensive PointLights with Sprites and centralized aura
    // Real-time lights per entity kill performance (3 lights * 6 bosses = 18 extra lights!)

    // 1. Red Eye Glow (Visual only, no lighting calculation)
    const eyeGlowTexture = this.createGlowTexture();
    const eyeMaterial = new THREE.SpriteMaterial({
      map: eyeGlowTexture,
      color: 0xff0000,
      transparent: true,
      blending: THREE.AdditiveBlending,
      opacity: 0.8,
      depthWrite: false,
    });

    // Left Eye
    const leftEye = new THREE.Sprite(eyeMaterial.clone());
    leftEye.scale.set(1.5, 1.5, 1.0);
    leftEye.position.set(-0.3, 1.8, 0.5); // Adjust pos for model
    this.mesh.add(leftEye);

    // Right Eye
    const rightEye = new THREE.Sprite(eyeMaterial);
    rightEye.scale.set(1.5, 1.5, 1.0);
    rightEye.position.set(0.3, 1.8, 0.5);
    this.mesh.add(rightEye);

    this.eyeGlow = leftEye; // Keep ref to one for pulsing
  }

  createGlowTexture() {
    // Simple cached texture generation helper could be moved to static
    if (BossZombie.glowTexture) return BossZombie.glowTexture;

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255, 255, 255, 1)");
    g.addColorStop(0.2, "rgba(255, 255, 255, 0.8)");
    g.addColorStop(0.5, "rgba(128, 0, 0, 0.2)");
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);

    BossZombie.glowTexture = new THREE.CanvasTexture(canvas);
    return BossZombie.glowTexture;
  }

  updatePosition() {
    // Update registry first
    EntityRegistry.update(this.id, this.gridX, this.gridZ);

    const worldX =
      this.gridX * this.cellSize -
      (this.mazeSize * this.cellSize) / 2 +
      this.cellSize / 2;
    const worldZ =
      this.gridZ * this.cellSize -
      (this.mazeSize * this.cellSize) / 2 +
      this.cellSize / 2;
    this.mesh.position.set(worldX, 0, worldZ);
  }

  setPlayerPosition(playerX, playerZ, isLightBoostActive = false) {
    const distance =
      Math.abs(playerX - this.gridX) + Math.abs(playerZ - this.gridZ);

    // Boss flees from light boost
    if (isLightBoostActive && distance <= this.chaseRange) {
      this.isChasing = false;
      this.isFleeing = true;
      this.fleeTarget = { x: playerX, z: playerZ };
      return;
    }

    this.isFleeing = false;

    // Boss always chases if player is anywhere in range
    if (distance <= this.chaseRange) {
      this.isChasing = true;
      this.chaseTarget = { x: playerX, z: playerZ };
    }
  }

  canMove(dx, dz) {
    const newX = this.gridX + dx;
    const newZ = this.gridZ + dz;

    if (
      newX < 0 ||
      newX >= this.mazeSize ||
      newZ < 0 ||
      newZ >= this.mazeSize
    ) {
      return false;
    }

    // Entity overlap check
    if (EntityRegistry.isOccupied(newX, newZ, this.id)) {
      return false;
    }

    // Check wall properties like other entities do
    const cell = this.maze[this.gridZ]?.[this.gridX];
    if (!cell) return false;

    if (dx === 1 && cell.right) return false;
    if (dx === -1 && cell.left) return false;
    if (dz === 1 && cell.bottom) return false;
    if (dz === -1 && cell.top) return false;

    return true;
  }

  moveTowardTarget() {
    if (!this.chaseTarget) return;

    const dx = this.chaseTarget.x - this.gridX;
    const dz = this.chaseTarget.z - this.gridZ;

    // Prioritize larger difference
    let moveX = 0,
      moveZ = 0;

    if (Math.abs(dx) > Math.abs(dz)) {
      moveX = dx > 0 ? 1 : -1;
      if (!this.canMove(moveX, 0)) {
        moveX = 0;
        moveZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
      }
    } else {
      moveZ = dz > 0 ? 1 : -1;
      if (!this.canMove(0, moveZ)) {
        moveZ = 0;
        moveX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
      }
    }

    if (this.canMove(moveX, moveZ)) {
      this.gridX += moveX;
      this.gridZ += moveZ;
      this.updatePosition();
    }

    // Always face the target (Player) instead of movement direction
    if (this.chaseTarget) {
      const dx = this.chaseTarget.x - this.gridX;
      const dz = this.chaseTarget.z - this.gridZ;
      if (Math.abs(dx) > 0.1 || Math.abs(dz) > 0.1) {
        const targetAngle = Math.atan2(dx, dz);
        this.targetRotation = targetAngle;
      }
    } else if (moveX !== 0 || moveZ !== 0) {
      const targetAngle = Math.atan2(moveX, moveZ);
      this.targetRotation = targetAngle;
    }
  }

  fleeFromPlayer() {
    if (!this.fleeTarget) return;

    const dx = this.gridX - this.fleeTarget.x;
    const dz = this.gridZ - this.fleeTarget.z;

    let moveX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    let moveZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

    if (this.canMove(moveX, moveZ)) {
      this.gridX += moveX;
      this.gridZ += moveZ;
      this.updatePosition();
    } else if (this.canMove(moveX, 0)) {
      this.gridX += moveX;
      this.updatePosition();
    } else if (this.canMove(0, moveZ)) {
      this.gridZ += moveZ;
      this.updatePosition();
    }
  }

  update(deltaTime = 0.016) {
    if (this.isDisposed || !this.mesh) return;

    // Movement Logic
    this.moveTimer++;
    if (this.moveTimer >= this.moveInterval) {
      this.moveTimer = 0;
      if (this.isFleeing) this.fleeFromPlayer();
      else if (this.isChasing) this.moveTowardTarget();
    }

    // Animation
    // Use passed deltaTime for proper time scaling
    if (this.mixer) this.mixer.update(deltaTime);

    // Shader
    if (this.auraMaterial) {
      this.auraMaterial.uniforms.time.value += deltaTime;
    }

    // Smooth Rotation
    if (this.targetRotation !== undefined) {
      // Simple Lerp
      let diff = this.targetRotation - this.mesh.rotation.y;
      // Normalize angle
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.mesh.rotation.y += diff * 0.15; // Increased responsiveness
    }
  }

  checkCollision(playerX, playerZ) {
    const dx = playerX - this.gridX;
    const dz = playerZ - this.gridZ;
    const dist = Math.abs(dx) + Math.abs(dz);

    if (dist === 0) return true;
    if (dist === 1) {
      // Large hitbox
      const cell = this.maze[this.gridZ]?.[this.gridX];
      if (!cell) return false;
      if (dx === 1) return !cell.right;
      if (dx === -1) return !cell.left;
      if (dz === 1) return !cell.bottom;
      if (dz === -1) return !cell.top;
    }
    return false;
  }

  /**
   * Disassemble boss body parts for explosion effect
   * Generates generic "meat chunks" since we can't easily break the GLB model
   */
  disassembleForExplosion(explosionForce = 1.0) {
    if (!this.mesh || this.isDisposed) return [];

    const bodyParts = [];
    const centerPos = this.mesh.position.clone();
    centerPos.y += 2.0;

    // Generate random chunks
    const chunkCount = 12; // More for boss
    const chunkGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6); // Bigger chunks
    const chunkMat = new THREE.MeshStandardMaterial({
      color: 0x550000,
      roughness: 0.8,
      metalness: 0.2,
      transparent: true,
      opacity: 1.0,
    });

    for (let i = 0; i < chunkCount; i++) {
      const chunk = new THREE.Mesh(chunkGeo, chunkMat.clone());

      chunk.position.copy(centerPos);
      chunk.position.x += (Math.random() - 0.5) * 2.0;
      chunk.position.y += (Math.random() - 0.5) * 2.5;
      chunk.position.z += (Math.random() - 0.5) * 2.0;

      chunk.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );

      this.scene.add(chunk);

      const direction = chunk.position.clone().sub(centerPos).normalize();
      if (direction.lengthSq() === 0) direction.set(0, 1, 0);

      const velocity = direction.multiplyScalar(0.45 * explosionForce);
      velocity.y += 0.3 * explosionForce;

      bodyParts.push({
        mesh: chunk,
        velocity: velocity,
        life: 180,
        maxLife: 180,
      });
    }

    return bodyParts;
  }

  explode() {
    // Particle effects are now handled by centralized Game.createEntityExplosion()
    // called from CombatSystem. This method is kept for compatibility but
    // no longer creates particles directly.
    if (!this.mesh) return;
    // All particle effects handled externally
  }

  dispose() {
    this.isDisposed = true;
    EntityRegistry.unregister(this.id);
    if (this.mesh) {
      this.scene.remove(this.mesh);
      // Traverse and dispose geometry/material
      this.mesh.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          else c.material.dispose();
        }
      });
    }
  }
}
