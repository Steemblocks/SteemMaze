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
    // 1. Red Eye Glow
    // Guessing head position relative to scaled model height (approx 2units * 3.5 = 7 units high)
    const eyeHeight = 5.5;

    const leftEye = new THREE.PointLight(0xff0000, 2, 8);
    leftEye.position.set(-0.5, eyeHeight, 1.0);
    this.mesh.add(leftEye);

    const rightEye = new THREE.PointLight(0xff0000, 2, 8);
    rightEye.position.set(0.5, eyeHeight, 1.0);
    this.mesh.add(rightEye);

    // 2. Ambient boss light (so he is never fully dark)
    const auraLight = new THREE.PointLight(0xff4400, 1, 15);
    auraLight.position.set(0, 4, 0);
    this.mesh.add(auraLight);
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

  explode() {
    // Reuse boss explosion visual
    if (!this.mesh) return;

    const position = this.mesh.position.clone();
    const particleCount = 40;
    const particles = [];
    const colors = [0x8b0000, 0x4a0000, 0x2d2d2d, 0x1a0000, 0x660000];

    const sharedGeo = new THREE.SphereGeometry(1, 6, 6);

    for (let i = 0; i < particleCount; i++) {
      const size = 0.12 + Math.random() * 0.2;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const mat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 1.0,
      });

      const particle = new THREE.Mesh(sharedGeo, mat);
      particle.position.copy(position);
      particle.position.y += 1.2 + Math.random() * 0.8;

      // Scale based on random size
      particle.scale.setScalar(size);
      particle.userData.initialScale = size;

      particle.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        0.3 + Math.random() * 0.4,
        (Math.random() - 0.5) * 0.6,
      );

      particle.userData.gravity = -0.012;
      particle.userData.life = 1.0;
      particle.userData.decay = 0.015 + Math.random() * 0.015;

      this.scene.add(particle);
      particles.push(particle);
    }

    // Simple particle animation loop for explosion
    const animateParticles = () => {
      let activeCount = 0;
      particles.forEach((p) => {
        if (p.userData.life <= 0) return;
        p.position.add(p.userData.velocity);
        p.userData.velocity.y += p.userData.gravity;
        p.userData.life -= p.userData.decay;
        p.material.opacity = Math.max(0, p.userData.life);

        // Scale relative to initial size
        const scale = Math.max(0.1, p.userData.life) * p.userData.initialScale;
        p.scale.setScalar(scale);

        if (p.userData.life > 0) activeCount++;
      });
      if (activeCount > 0) {
        requestAnimationFrame(animateParticles);
      } else {
        particles.forEach((p) => {
          this.scene.remove(p);
          // Only dispose material, geometry is shared
          p.material.dispose();
        });
        // Dispose shared geometry once
        sharedGeo.dispose();
      }
    };
    animateParticles();

    // Flash
    const flash = new THREE.PointLight(0xff0000, 5, 12);
    flash.position.copy(position);
    flash.position.y += 1.5;
    this.scene.add(flash);
    let flashIntensity = 5;
    const fadeFlash = () => {
      flashIntensity -= 0.1;
      if (flashIntensity > 0) {
        flash.intensity = flashIntensity;
        requestAnimationFrame(fadeFlash);
      } else {
        this.scene.remove(flash);
      }
    };
    fadeFlash();
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
        if (child.material) child.material.dispose();
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
