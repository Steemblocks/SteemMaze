/**
 * BigfootBoss Entity Class
 * A massive boss monster loaded from a GLB model
 *
 * Features:
 * - Loads 'bigfoot.glb' model
 * - Animated walking/running
 * - Uses BossZombie logic for chasing and stats
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export class BigfootBoss {
  constructor(x, z, maze, cellSize, mazeSize, scene, level = 1) {
    this.gridX = x;
    this.gridZ = z;
    this.startX = x;
    this.startZ = z;
    this.maze = maze;
    this.cellSize = cellSize;
    this.mazeSize = mazeSize;
    this.scene = scene;
    this.level = level;

    // Boss attributes
    this.isBoss = true;
    this.killReward = 500; // Massive reward

    // Movement settings
    this.moveInterval = Math.max(30 - level * 1.5, 15); // Faster: Move every 0.5s or less
    this.moveTimer = 0;

    // Chase/Flee logic
    this.chaseRange = mazeSize * 2; // Always chase
    this.isChasing = true;
    this.chaseTarget = null;
    this.lastKnownPlayerPos = null;

    // Animation / Model
    this.mixer = null;
    this.animations = {};
    this.activeAction = null;
    this.modelReady = false;

    // Smooth Movement logic
    this.targetPos = new THREE.Vector3();
    this.isMoving = false;

    // Create the container mesh immediately so Game can position it
    this.mesh = new THREE.Group();

    // Placeholder: Big Red Box (so it's visible if model fails)
    const placeholderGeo = new THREE.BoxGeometry(1.5, 3.0, 1.5);
    const placeholderMat = new THREE.MeshStandardMaterial({
      color: 0x880000,
      wireframe: true,
    });
    this.placeholder = new THREE.Mesh(placeholderGeo, placeholderMat);
    this.placeholder.position.y = 1.5; // Stand on ground
    this.mesh.add(this.placeholder);

    // Initial position
    this.updateTargetPosition();
    this.mesh.position.copy(this.targetPos);

    // Add to scene IMMEDIATELY to ensure tracking and proper disposal
    this.scene.add(this.mesh);
    this.isDisposed = false;

    // Start loading the model
    this.loadModel();
  }

  static modelTemplate = null;
  static textureCache = null;

  loadModel() {
    // If template exists, clone it immediately
    if (BigfootBoss.modelTemplate) {
      this.initFromTemplate(BigfootBoss.modelTemplate);
      return;
    }

    // Check if we are already loading (simple lock to prevent parallel loads of same asset)
    if (BigfootBoss.isLoading) {
      // Wait retry
      setTimeout(() => this.loadModel(), 100);
      return;
    }

    BigfootBoss.isLoading = true;
    const loader = new GLTFLoader();

    loader.load(
      "/models/bigfoot.glb",
      (gltf) => {
        BigfootBoss.modelTemplate = gltf; // Cache the whole gltf result
        BigfootBoss.isLoading = false;

        // Init this instance
        this.initFromTemplate(gltf);
      },
      undefined,
      (error) => {
        console.error("Error loading Bigfoot:", error);
        BigfootBoss.isLoading = false;
      },
    );
  }

  initFromTemplate(gltf) {
    // If entity was destroyed while loading, abort and cleanup
    if (this.isDisposed) return;

    // Remove debug placeholder
    if (this.placeholder) {
      this.mesh.remove(this.placeholder);
    }

    // CLONE the scene to get a unique instance
    this.model = gltf.scene.clone();

    // SCALE: Adjusted to 3.75 (25% bigger)
    const scale = 3.75;
    this.model.scale.set(scale, scale, scale);

    // Pivot adjustment (center it)
    this.model.position.y = 0;

    // Re-bind materials/shadows (clone loses castShadow on generic traverse usually unless set)
    this.model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Boost material brightness
        if (child.material) {
          // We need to clone material if we want unique emissive blinking per boss?
          // The original code set emissive directly.
          // If we share cached materials from the clone, blinking one makes all blink (if they share the material object).
          // Scene.clone() usually clones materials? No, Three.js clone() shares materials by default.
          // So we MUST clone materials to have independent "hit" effects or emissive changes.
          child.material = child.material.clone();

          child.material.emissive = new THREE.Color(0x222222);
          child.material.metalness = 0.3;
          child.material.roughness = 0.7;
        }

        // Disable frustum culling to prevent disappearance at edges or during animations
        child.frustumCulled = false;
      }
    });

    this.mesh.add(this.model);

    if (gltf.animations && gltf.animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(this.model);
      this.animations = gltf.animations;

      // Try to find a walk, run, or generic move animation
      let moveAnim = gltf.animations.find((a) =>
        /walk|run|move|action/i.test(a.name),
      );
      if (!moveAnim) moveAnim = gltf.animations[0]; // Fallback

      if (moveAnim) {
        this.activeAction = this.mixer.clipAction(moveAnim);
        this.activeAction.timeScale = 1.5; // Speed up animation
        this.activeAction.play();
      }
    }

    this.modelReady = true;
    this.addBossEffects();
  }

  addBossEffects() {
    // 1. Red Eye Glow with Sprites (Performance Optimization)
    // Guessing head position relative to scaled model height (approx 2units * 3.5 = 7 units high)
    const eyeHeight = 5.5;

    const eyeGlowTexture = this.createGlowTexture();
    const eyeMaterial = new THREE.SpriteMaterial({
      map: eyeGlowTexture,
      color: 0xff0000,
      transparent: true,
      blending: THREE.AdditiveBlending,
      opacity: 0.9,
      depthWrite: false,
    });

    // Left Eye
    const leftEye = new THREE.Sprite(eyeMaterial.clone());
    leftEye.scale.set(1.2, 1.2, 1.0);
    leftEye.position.set(-0.5, eyeHeight, 1.0);
    this.mesh.add(leftEye);

    // Right Eye
    const rightEye = new THREE.Sprite(eyeMaterial);
    rightEye.scale.set(1.2, 1.2, 1.0);
    rightEye.position.set(0.5, eyeHeight, 1.0);
    this.mesh.add(rightEye);

    // 2. Ambient boss light - Removed for performance
    // Sprites are enough for "glowing eyes" look
  }

  createGlowTexture() {
    // Simple cached texture generation helper
    if (BigfootBoss.glowTexture) return BigfootBoss.glowTexture;

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

    BigfootBoss.glowTexture = new THREE.CanvasTexture(canvas);
    return BigfootBoss.glowTexture;
  }

  // Calculates the target world position based on grid coordinates
  updateTargetPosition() {
    const worldX =
      this.gridX * this.cellSize -
      (this.mazeSize * this.cellSize) / 2 +
      this.cellSize / 2;
    const worldZ =
      this.gridZ * this.cellSize -
      (this.mazeSize * this.cellSize) / 2 +
      this.cellSize / 2;

    this.targetPos.set(worldX, 0, worldZ);
  }

  // Renamed from updatePosition to just updating the target logic
  // When teleporting (e.g., clearSafeZone), we need to snap mesh immediately
  updatePosition() {
    this.updateTargetPosition();

    // IMPORTANT: When grid position is changed externally (like clearSafeZone),
    // we need to snap the mesh IMMEDIATELY to the new position to prevent
    // the boss from appearing to be in two places at once or "disappearing"
    // because the old position is far from the new targetPos
    if (this.mesh && this.targetPos) {
      this.mesh.position.x = this.targetPos.x;
      this.mesh.position.z = this.targetPos.z;
      this.mesh.position.y = 0;
    }
  }

  setPlayerPosition(playerX, playerZ, isLightBoostActive = false) {
    const distance =
      Math.abs(playerX - this.gridX) + Math.abs(playerZ - this.gridZ);

    if (isLightBoostActive && distance <= this.chaseRange) {
      this.isChasing = false;
      this.isFleeing = true;
      this.fleeTarget = { x: playerX, z: playerZ };
      return;
    }

    this.isFleeing = false;
    // Boss can smell you from anywhere
    this.isChasing = true;
    this.chaseTarget = { x: playerX, z: playerZ };
  }

  canMove(dx, dz) {
    if (
      this.gridX < 0 ||
      this.gridX >= this.mazeSize ||
      this.gridZ < 0 ||
      this.gridZ >= this.mazeSize
    )
      return false;

    // Bounds check for target
    const newX = this.gridX + dx;
    const newZ = this.gridZ + dz;
    if (newX < 0 || newX >= this.mazeSize || newZ < 0 || newZ >= this.mazeSize)
      return false;

    // Correct Maze Wall Checks using Objects
    const cell = this.maze[this.gridZ][this.gridX];

    if (dx === 1) return !cell.right;
    if (dx === -1) return !cell.left;
    if (dz === 1) return !cell.bottom;
    if (dz === -1) return !cell.top;

    return false;
  }

  moveTowardTarget() {
    if (!this.chaseTarget) return;

    const dx = this.chaseTarget.x - this.gridX;
    const dz = this.chaseTarget.z - this.gridZ;

    let moveX = 0,
      moveZ = 0;

    // Prioritize larger distance
    if (Math.abs(dx) > Math.abs(dz)) {
      moveX = dx > 0 ? 1 : -1;
      if (!this.canMove(moveX, 0)) {
        moveX = 0;
        moveZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
        if (moveZ !== 0 && !this.canMove(0, moveZ)) moveZ = 0;
      }
    } else {
      moveZ = dz > 0 ? 1 : -1;
      if (!this.canMove(0, moveZ)) {
        moveZ = 0;
        moveX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
        if (moveX !== 0 && !this.canMove(moveX, 0)) moveX = 0;
      }
    }

    if (moveX !== 0 || moveZ !== 0) {
      this.gridX += moveX;
      this.gridZ += moveZ;
      // For normal movement, just update targetPos (lerp will handle smooth movement)
      this.updateTargetPosition();

      // Smooth Rotation
      const targetRot = Math.atan2(moveX, moveZ);
      let rotDiff = targetRot - this.mesh.rotation.y;
      // Normalize angle
      while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
      while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;

      // Simple turn
      this.mesh.rotation.y = targetRot;
    }
  }

  fleeFromPlayer() {
    if (!this.fleeTarget) return;

    // Move AWAY from the player
    const dx = this.gridX - this.fleeTarget.x;
    const dz = this.gridZ - this.fleeTarget.z;

    let moveX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    let moveZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

    // Try to flee in the direction away from player
    if (moveX !== 0 && this.canMove(moveX, 0)) {
      this.gridX += moveX;
      this.updateTargetPosition();
      this.mesh.rotation.y = Math.atan2(moveX, 0);
    } else if (moveZ !== 0 && this.canMove(0, moveZ)) {
      this.gridZ += moveZ;
      this.updateTargetPosition();
      this.mesh.rotation.y = Math.atan2(0, moveZ);
    } else if (this.canMove(moveX, moveZ)) {
      this.gridX += moveX;
      this.gridZ += moveZ;
      this.updateTargetPosition();
      this.mesh.rotation.y = Math.atan2(moveX, moveZ);
    }
  }

  update(deltaTime = 0.016) {
    // Guard: Skip update if disposed
    if (this.isDisposed) return;

    // CRITICAL: If mesh was removed from scene, re-add it
    if (this.mesh && !this.mesh.parent) {
      this.scene.add(this.mesh);
    }

    // If mesh doesn't exist, we can't do anything
    if (!this.mesh) return;

    // 1. Logic Timer
    this.moveTimer++;
    if (this.moveTimer >= this.moveInterval) {
      this.moveTimer = 0;
      // Re-evaluate state
      if (this.isFleeing) {
        this.fleeFromPlayer();
      } else if (this.isChasing) {
        this.moveTowardTarget();
      }
    }

    // 2. Animation Mixer
    if (this.mixer) this.mixer.update(deltaTime);

    // 3. Smooth Movement Interpolation with stability safeguards
    if (this.mesh && this.targetPos) {
      // Validate targetPos to prevent NaN issues
      if (isNaN(this.targetPos.x) || isNaN(this.targetPos.z)) {
        this.updateTargetPosition();
        // DON'T return early - continue to ensure mesh is in valid state
      }

      // Only do lerp if targetPos is valid
      if (!isNaN(this.targetPos.x) && !isNaN(this.targetPos.z)) {
        // Clamp interpolation factor to prevent overshooting/instability during lag spikes
        const lerpSpeed = 5.0 * deltaTime;
        const factor = Math.min(lerpSpeed, 1.0);

        // Calculate new positions
        const newX =
          this.mesh.position.x +
          (this.targetPos.x - this.mesh.position.x) * factor;
        const newZ =
          this.mesh.position.z +
          (this.targetPos.z - this.mesh.position.z) * factor;

        // Check for NaN or Infinity before applying
        if (!isNaN(newX) && !isNaN(newZ) && isFinite(newX) && isFinite(newZ)) {
          this.mesh.position.x = newX;
          this.mesh.position.z = newZ;
        } else {
          // If position would be invalid, snap to target
          this.mesh.position.x = this.targetPos.x;
          this.mesh.position.z = this.targetPos.z;
        }

        // Check for excessive divergence (boss too far from target)
        const divergence =
          Math.abs(this.mesh.position.x - this.targetPos.x) +
          Math.abs(this.mesh.position.z - this.targetPos.z);
        if (divergence > this.cellSize * 3) {
          this.mesh.position.x = this.targetPos.x;
          this.mesh.position.z = this.targetPos.z;
        }
      }

      // ALWAYS ensure mesh Y position is valid
      if (isNaN(this.mesh.position.y) || this.mesh.position.y !== 0) {
        this.mesh.position.y = 0;
      }

      // ALWAYS ensure mesh is visible
      if (!this.mesh.visible) {
        this.mesh.visible = true;
      }
    }
  }

  checkCollision(playerX, playerZ) {
    const dx = playerX - this.gridX;
    const dz = playerZ - this.gridZ;
    const dist = Math.abs(dx) + Math.abs(dz);

    // 1. Exact match
    if (dist === 0) return true;

    // 2. Adjacent match (Orthogonal only)
    // Since boss is large (Scale 3.0), getting close means collision
    // BUT we must check walls to prevent unfair hits through walls
    if (dist === 1) {
      const cell = this.maze[this.gridZ][this.gridX];
      if (dx === 1) return !cell.right; // Player is Right, check Right wall
      if (dx === -1) return !cell.left; // Player is Left, check Left wall
      if (dz === 1) return !cell.bottom; // Player is Down, check Bottom wall
      if (dz === -1) return !cell.top; // Player is Up, check Top wall
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
    centerPos.y += 2.0; // Center of mass (approx)

    // Generate random chunks
    const chunkCount = 10;
    const chunkGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const chunkMat = new THREE.MeshStandardMaterial({
      color: 0x550000, // Dark red flesh
      roughness: 0.8,
      metalness: 0.1,
      transparent: true, // Allow fading
      opacity: 1.0,
    });

    for (let i = 0; i < chunkCount; i++) {
      const chunk = new THREE.Mesh(chunkGeo, chunkMat.clone());

      // Random position around center
      chunk.position.copy(centerPos);
      chunk.position.x += (Math.random() - 0.5) * 1.5;
      chunk.position.y += (Math.random() - 0.5) * 2.0;
      chunk.position.z += (Math.random() - 0.5) * 1.5;

      // Random rotation
      chunk.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );

      this.scene.add(chunk);

      // Calculate explosion velocity
      const direction = chunk.position.clone().sub(centerPos).normalize();
      // Failsafe for zero vector
      if (direction.lengthSq() === 0) direction.set(0, 1, 0);

      const velocity = direction.multiplyScalar(0.4 * explosionForce);
      velocity.y += 0.3 * explosionForce; // Upward bias

      bodyParts.push({
        mesh: chunk,
        velocity: velocity,
        life: 150, // Longer life than blood
        maxLife: 150,
      });
    }

    return bodyParts;
  }

  explode() {
    // Particle effects are now handled by centralized Game.createEntityExplosion()
  }

  dispose() {
    this.isDisposed = true;
    if (this.mesh) {
      if (this.mesh.parent) {
        this.mesh.parent.remove(this.mesh);
      } else {
        this.scene.remove(this.mesh);
      }

      this.mesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material))
            child.material.forEach((m) => m.dispose());
          else child.material.dispose();
        }
      });
      this.mesh = null;
    }

    // Clear animation mixer
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
  }
}
