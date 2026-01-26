/**
 * ZombieDog Entity Class
 * Fast, aggressive patrol enemy that guards corridors
 * Faster than zombies but less health/reward
 */

import * as THREE from "three";
import { GameRules } from "../core/GameRules.js";

export class ZombieDog {
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
    this.moveCounter = 0;

    // FAST movement - dogs are quicker than zombies, scales with level
    const baseInterval = GameRules.getZombieDogSpeed(level);
    const variance = Math.floor(baseInterval * 0.3);
    this.moveInterval = Math.floor(Math.random() * variance) + baseInterval;
    this.baseInterval = baseInterval;
    this.variance = variance;

    // Patrol behavior - dogs patrol specific corridors (range scales with level)
    this.patrolRange = Math.ceil(mazeSize / 4) + Math.floor(level / 3);
    this.minX = Math.max(0, this.startX - this.patrolRange);
    this.maxX = Math.min(mazeSize - 1, this.startX + this.patrolRange);
    this.minZ = Math.max(0, this.startZ - this.patrolRange);
    this.maxZ = Math.min(mazeSize - 1, this.startZ + this.patrolRange);

    // Simple patrol path - back and forth
    this.patrolDirection = { dx: 0, dz: 0 };
    this.initPatrolDirection();

    // Chase behavior - dogs are aggressive chasers (chase range scales with level)
    this.canChase = true;
    this.chaseRange = GameRules.getZombieDogChaseRange(level);
    this.isChasing = false;
    this.isFleeing = false; // Fleeing from light boost
    this.chaseTarget = null;
    this.alertLevel = 0;

    // Animation
    this.animationTime = Math.random() * 10;
    this.targetRotation = 0;
    this.currentRotation = Math.random() * Math.PI * 2;
    this.runCycle = 0;

    // Body parts for animation
    this.body = null;
    this.head = null;
    this.frontLeftLeg = null;
    this.frontRightLeg = null;
    this.backLeftLeg = null;
    this.backRightLeg = null;
    this.tail = null;

    // Create mesh
    this.mesh = this.createMesh();
    this.updatePosition();
    this.scene.add(this.mesh);
    this.isDisposed = false;
  }

  initPatrolDirection() {
    // Pick a random initial direction
    const directions = [
      { dx: 1, dz: 0 },
      { dx: -1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: 0, dz: -1 },
    ];
    this.patrolDirection =
      directions[Math.floor(Math.random() * directions.length)];
  }

  /**
   * Create zombie dog mesh - decayed canine form
   */
  /**
   * Static assets to prevent creating duplicate geometries and materials
   */
  static assets = null;
  static masterMesh = null;

  static getAssets() {
    if (!ZombieDog.assets) {
      const rottenColor = 0x3d3d2d;
      const bloodColor = 0x660000;

      ZombieDog.assets = {
        bodyMat: new THREE.MeshStandardMaterial({
          color: rottenColor,
          emissive: 0x111111,
          emissiveIntensity: 0.15,
          roughness: 0.85,
        }),
        bloodMat: new THREE.MeshStandardMaterial({
          color: bloodColor,
          emissive: 0x220000,
          emissiveIntensity: 0.2,
          roughness: 0.7,
        }),
        eyeMat: new THREE.MeshBasicMaterial({ color: 0xff0000 }),
        ribMat: new THREE.MeshStandardMaterial({ color: 0xccccaa }),

        // Geometries
        bodyGeo: new THREE.BoxGeometry(0.5, 0.35, 0.9),
        headGeo: new THREE.BoxGeometry(0.25, 0.25, 0.35),
        snoutGeo: new THREE.BoxGeometry(0.15, 0.12, 0.2),
        eyeGeo: new THREE.SphereGeometry(0.04, 6, 6),
        legGeo: new THREE.CylinderGeometry(0.06, 0.04, 0.4, 6),
        tailGeo: new THREE.CylinderGeometry(0.03, 0.01, 0.4, 4),
        ribGeo: new THREE.BoxGeometry(0.52, 0.02, 0.04),
      };

      // Create glow texture if missing
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext("2d");
      const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, "rgba(255, 200, 200, 1)");
      gradient.addColorStop(0.2, "rgba(255, 0, 0, 1)");
      gradient.addColorStop(0.5, "rgba(100, 0, 0, 0.4)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(canvas);
      ZombieDog.assets.glowMat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
    }
    return ZombieDog.assets;
  }

  static initMasterMesh() {
    if (ZombieDog.masterMesh) return;

    const assets = ZombieDog.getAssets();
    const group = new THREE.Group();

    // Body
    const body = new THREE.Mesh(assets.bodyGeo, assets.bodyMat);
    body.position.y = 0.5;
    body.castShadow = true;
    body.name = "body";
    group.add(body);

    // Head
    const head = new THREE.Mesh(assets.headGeo, assets.bodyMat);
    head.position.set(0, 0.6, 0.55);
    head.castShadow = true;
    head.name = "head";
    group.add(head);

    // Snout
    const snout = new THREE.Mesh(assets.snoutGeo, assets.bloodMat);
    snout.position.set(0, 0.55, 0.75);
    group.add(snout);

    // Eyes
    const leftEye = new THREE.Mesh(assets.eyeGeo, assets.eyeMat);
    leftEye.position.set(-0.08, 0.65, 0.7);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(assets.eyeGeo, assets.eyeMat);
    rightEye.position.set(0.08, 0.65, 0.7);
    group.add(rightEye);

    // Glows
    const eyeScale = 0.15;
    const lGlow = new THREE.Sprite(assets.glowMat);
    lGlow.scale.set(eyeScale, eyeScale, 1);
    lGlow.position.set(0, 0, 0.05);
    leftEye.add(lGlow);

    const rGlow = new THREE.Sprite(assets.glowMat);
    rGlow.scale.set(eyeScale, eyeScale, 1);
    rGlow.position.set(0, 0, 0.05);
    rightEye.add(rGlow);

    // Front legs
    const frontLeftLegPivot = new THREE.Group();
    frontLeftLegPivot.position.set(-0.18, 0.4, 0.3);
    frontLeftLegPivot.name = "frontLeftLegPivot";
    const frontLeftLeg = new THREE.Mesh(assets.legGeo, assets.bodyMat);
    frontLeftLeg.position.y = -0.2;
    frontLeftLegPivot.add(frontLeftLeg);
    group.add(frontLeftLegPivot);

    const frontRightLegPivot = new THREE.Group();
    frontRightLegPivot.position.set(0.18, 0.4, 0.3);
    frontRightLegPivot.name = "frontRightLegPivot";
    const frontRightLeg = new THREE.Mesh(assets.legGeo, assets.bodyMat);
    frontRightLeg.position.y = -0.2;
    frontRightLegPivot.add(frontRightLeg);
    group.add(frontRightLegPivot);

    // Back legs
    const backLeftLegPivot = new THREE.Group();
    backLeftLegPivot.position.set(-0.18, 0.4, -0.3);
    backLeftLegPivot.name = "backLeftLegPivot";
    const backLeftLeg = new THREE.Mesh(assets.legGeo, assets.bodyMat);
    backLeftLeg.position.y = -0.2;
    backLeftLegPivot.add(backLeftLeg);
    group.add(backLeftLegPivot);

    const backRightLegPivot = new THREE.Group();
    backRightLegPivot.position.set(0.18, 0.4, -0.3);
    backRightLegPivot.name = "backRightLegPivot";
    const backRightLeg = new THREE.Mesh(assets.legGeo, assets.bodyMat);
    backRightLeg.position.y = -0.2;
    backRightLegPivot.add(backRightLeg);
    group.add(backRightLegPivot);

    // Tail
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.55, -0.45);
    tailPivot.name = "tailPivot";
    const tail = new THREE.Mesh(assets.tailGeo, assets.bodyMat);
    tail.position.y = -0.15;
    tail.rotation.x = 0.5;
    tailPivot.add(tail);
    group.add(tailPivot);

    // Ribs
    for (let i = 0; i < 3; i++) {
      const rib = new THREE.Mesh(assets.ribGeo, assets.ribMat);
      rib.position.set(0, 0.55, 0.15 - i * 0.15);
      group.add(rib);
    }

    ZombieDog.masterMesh = group;
  }

  /**
   * Create zombie dog mesh using optimized cloning
   */
  createMesh() {
    ZombieDog.initMasterMesh();

    // Quick clone
    const group = ZombieDog.masterMesh.clone();

    // Re-bind references
    this.body = group.getObjectByName("body");
    this.head = group.getObjectByName("head");
    this.frontLeftLegPivot = group.getObjectByName("frontLeftLegPivot");
    this.frontRightLegPivot = group.getObjectByName("frontRightLegPivot");
    this.backLeftLegPivot = group.getObjectByName("backLeftLegPivot");
    this.backRightLegPivot = group.getObjectByName("backRightLegPivot");
    this.tailPivot = group.getObjectByName("tailPivot");

    // Animations references:
    this.frontLeftLeg = this.frontLeftLegPivot.children[0];
    this.frontRightLeg = this.frontRightLegPivot.children[0];
    this.backLeftLeg = this.backLeftLegPivot.children[0];
    this.backRightLeg = this.backRightLegPivot.children[0];
    this.tail = this.tailPivot.children[0];

    return group;
  }

  /**
   * Update grid position to world position
   */
  updatePosition() {
    const worldX = (this.gridX - this.mazeSize / 2 + 0.5) * this.cellSize;
    const worldZ = (this.gridZ - this.mazeSize / 2 + 0.5) * this.cellSize;
    this.mesh.position.set(worldX, 0, worldZ);
  }

  /**
   * Set player position for chase behavior
   * Also handles fleeing when player has light boost active
   */
  setPlayerPosition(playerX, playerZ, isLightBoostActive = false) {
    const dx = Math.abs(this.gridX - playerX);
    const dz = Math.abs(this.gridZ - playerZ);
    const distance = dx + dz;

    // FLEE from light boost!
    if (isLightBoostActive && distance <= this.chaseRange + 2) {
      this.isFleeing = true;
      this.isChasing = false;
      // Set flee target AWAY from player - dogs flee faster/further
      const fleeX = this.gridX + Math.sign(this.gridX - playerX) * 4;
      const fleeZ = this.gridZ + Math.sign(this.gridZ - playerZ) * 4;
      this.chaseTarget = {
        x: Math.max(0, Math.min(this.mazeSize - 1, fleeX)),
        z: Math.max(0, Math.min(this.mazeSize - 1, fleeZ)),
      };
      this.alertLevel = 0;
      return;
    }

    this.isFleeing = false;

    if (distance <= this.chaseRange) {
      this.alertLevel = 100;
      this.isChasing = true;
      this.chaseTarget = { x: playerX, z: playerZ };
    } else if (distance <= this.chaseRange + 3 && this.alertLevel > 40) {
      // Dogs have good tracking instincts
      this.alertLevel = Math.max(this.alertLevel - 0.5, 0);
      if (this.chaseTarget) this.isChasing = true;
    } else {
      this.alertLevel = Math.max(this.alertLevel - 2, 0);
      if (this.alertLevel < 20) {
        this.isChasing = false;
        this.chaseTarget = null;
      }
    }
  }

  /**
   * Patrol movement - dogs move in corridors
   */
  movePatrol() {
    // Try to continue in current direction
    if (this.canMove(this.patrolDirection.dx, this.patrolDirection.dz)) {
      this.gridX += this.patrolDirection.dx;
      this.gridZ += this.patrolDirection.dz;
    } else {
      // Hit a wall, reverse direction or turn
      this.patrolDirection.dx *= -1;
      this.patrolDirection.dz *= -1;

      // If still can't move, try perpendicular
      if (!this.canMove(this.patrolDirection.dx, this.patrolDirection.dz)) {
        const temp = this.patrolDirection.dx;
        this.patrolDirection.dx = this.patrolDirection.dz;
        this.patrolDirection.dz = temp;
      }
    }
  }

  /**
   * Chase movement - direct pursuit
   */
  moveChase() {
    if (!this.chaseTarget) return;

    const dx = Math.sign(this.chaseTarget.x - this.gridX);
    const dz = Math.sign(this.chaseTarget.z - this.gridZ);

    // Prioritize the axis with larger distance
    const distX = Math.abs(this.chaseTarget.x - this.gridX);
    const distZ = Math.abs(this.chaseTarget.z - this.gridZ);

    if (distX > distZ) {
      if (dx !== 0 && this.canMove(dx, 0)) {
        this.gridX += dx;
        return;
      }
    } else {
      if (dz !== 0 && this.canMove(0, dz)) {
        this.gridZ += dz;
        return;
      }
    }

    // Fallback - try any available direction
    if (dx !== 0 && this.canMove(dx, 0)) {
      this.gridX += dx;
    } else if (dz !== 0 && this.canMove(0, dz)) {
      this.gridZ += dz;
    }
  }

  /**
   * Check if can move in direction
   */
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

    const cell = this.maze[this.gridZ]?.[this.gridX];
    if (!cell) return false;

    if (dx === 1 && cell.right) return false;
    if (dx === -1 && cell.left) return false;
    if (dz === 1 && cell.bottom) return false;
    if (dz === -1 && cell.top) return false;

    return true;
  }

  /**
   * Main update loop
   */
  update(deltaTime = 0.016) {
    // Guard: Skip update if disposed
    if (this.isDisposed || !this.mesh) return;

    this.moveCounter++;

    // Dogs are FAST when chasing or fleeing
    const interval =
      this.isChasing || this.isFleeing
        ? Math.floor(this.moveInterval * 0.5)
        : this.moveInterval;

    if (this.moveCounter >= interval) {
      this.moveCounter = 0;
      this.moveInterval =
        Math.floor(Math.random() * this.variance) + this.baseInterval;

      // If fleeing (light boost), run away FAST
      if (this.isFleeing && this.chaseTarget) {
        this.moveChase(); // Uses chaseTarget which is set to flee direction
      } else if (this.isChasing && this.chaseTarget) {
        this.moveChase();
      } else {
        this.movePatrol();
      }
    }

    this.updatePosition();
    this.animate(deltaTime);
  }

  /**
   * Animate the dog
   */
  animate(deltaTime = 0.016) {
    this.animationTime += deltaTime;
    const speed = this.isChasing ? 12 : 4;
    this.runCycle += (this.isChasing ? 0.25 : 0.08) * (deltaTime * 60);

    // Running leg animation
    if (this.frontLeftLegPivot) {
      this.frontLeftLegPivot.rotation.x =
        Math.sin(this.runCycle) * (this.isChasing ? 0.8 : 0.3);
    }
    if (this.frontRightLegPivot) {
      this.frontRightLegPivot.rotation.x =
        Math.sin(this.runCycle + Math.PI) * (this.isChasing ? 0.8 : 0.3);
    }
    if (this.backLeftLegPivot) {
      this.backLeftLegPivot.rotation.x =
        Math.sin(this.runCycle + Math.PI) * (this.isChasing ? 0.8 : 0.3);
    }
    if (this.backRightLegPivot) {
      this.backRightLegPivot.rotation.x =
        Math.sin(this.runCycle) * (this.isChasing ? 0.8 : 0.3);
    }

    // Body bounce when running
    if (this.body) {
      this.body.position.y =
        0.5 +
        Math.abs(Math.sin(this.runCycle * 2)) * (this.isChasing ? 0.1 : 0.03);
    }

    // Head movement - looks around or focuses on target
    if (this.head) {
      if (this.isChasing) {
        // Head forward when chasing
        this.head.rotation.x = -0.1;
      } else {
        // Head tilts while patrolling
        this.head.rotation.y = Math.sin(this.animationTime * 2) * 0.3;
        this.head.rotation.x = Math.sin(this.animationTime) * 0.1;
      }
    }

    // Tail wagging (creepily)
    if (this.tailPivot) {
      this.tailPivot.rotation.y =
        Math.sin(this.animationTime * 3) * (this.isChasing ? 0.5 : 0.2);
    }

    // Rotate toward movement direction
    if (this.chaseTarget) {
      const dx = this.chaseTarget.x - this.gridX;
      const dz = this.chaseTarget.z - this.gridZ;
      if (dx !== 0 || dz !== 0) {
        this.targetRotation = Math.atan2(dx, dz);
      }
    } else {
      // Face patrol direction
      if (this.patrolDirection.dx !== 0 || this.patrolDirection.dz !== 0) {
        this.targetRotation = Math.atan2(
          this.patrolDirection.dx,
          this.patrolDirection.dz,
        );
      }
    }

    // Smooth rotation
    let rotDiff = this.targetRotation - this.currentRotation;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    this.currentRotation += rotDiff * 0.15;
    this.mesh.rotation.y = this.currentRotation;
  }

  /**
   * Check collision with player
   */
  checkCollision(playerX, playerZ) {
    return this.gridX === playerX && this.gridZ === playerZ;
  }

  /**
   * Explosion effect when killed - matches zombie explosion
   */
  /**
   * Explosion effect when killed - matches zombie explosion
   */
  explode() {
    if (!this.mesh) return;

    const position = this.mesh.position.clone();

    // OPTIMIZATION: Reduced particle count
    const particleCount = 10; // Was 20
    const particles = [];

    // Reuse shared geometry from assets (optimized)
    const assets = ZombieDog.getAssets();
    const sharedGeo = assets.eyeGeo;

    // Colors for gore/explosion effect - dog colors
    const colors = [0x660000, 0x3d3d2d, 0x2d2d2d, 0x550000, 0x4a4a3a];

    for (let i = 0; i < particleCount; i++) {
      // Random color from gore palette
      const color = colors[Math.floor(Math.random() * colors.length)];

      // Basic cheap material
      const mat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 1.0,
      });

      const particle = new THREE.Mesh(sharedGeo, mat);

      // Start at dog position
      particle.position.copy(position);
      particle.position.y += 0.5 + Math.random() * 0.3;

      // Random scale (large chunks)
      const initialScale = 3.0 + Math.random() * 3.0;
      particle.scale.setScalar(initialScale);
      particle.userData.initialScale = initialScale;

      // Random velocity - exploding outward
      particle.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.35,
        0.15 + Math.random() * 0.25,
        (Math.random() - 0.5) * 0.35,
      );

      particle.userData.gravity = -0.012;
      particle.userData.life = 1.0;
      particle.userData.decay = 0.02 + Math.random() * 0.02; // Slower decay

      this.scene.add(particle);
      particles.push(particle);
    }

    // Animate particles
    const animateParticles = () => {
      let activeCount = 0;

      particles.forEach((p) => {
        if (p.userData.life <= 0) return;

        // Apply velocity
        p.position.add(p.userData.velocity);

        // Apply gravity
        p.userData.velocity.y += p.userData.gravity;

        // Decay life and opacity
        p.userData.life -= p.userData.decay;
        p.material.opacity = Math.max(0, p.userData.life);

        // Shrink as it fades
        if (p.userData.initialScale) {
          const currentScale = Math.max(
            0.1,
            p.userData.initialScale * p.userData.life,
          );
          p.scale.setScalar(currentScale);
        }

        if (p.userData.life > 0) {
          activeCount++;
        }
      });

      if (activeCount > 0) {
        requestAnimationFrame(animateParticles);
      } else {
        // Cleanup particles
        particles.forEach((p) => {
          this.scene.remove(p);
          // Do NOT dispose sharedGeo
          p.material.dispose();
        });
      }
    };

    // Start animation
    requestAnimationFrame(animateParticles);

    // Add a quick flash at explosion point (orange-red for dog)
    // OPTIMIZATION: Reduced light
    const flash = new THREE.PointLight(0xff4400, 2.0, 4);
    flash.position.copy(position);
    flash.position.y += 0.6;
    this.scene.add(flash);

    // Fade out flash
    let flashIntensity = 2.0;
    const fadeFlash = () => {
      flashIntensity -= 0.2;
      if (flashIntensity > 0) {
        flash.intensity = flashIntensity;
        requestAnimationFrame(fadeFlash);
      } else {
        this.scene.remove(flash);
      }
    };
    requestAnimationFrame(fadeFlash);
  }

  /**
   * Dispose and cleanup
   */
  /**
   * Dispose and cleanup
   */
  dispose() {
    this.isDisposed = true;
    if (this.mesh) {
      this.scene.remove(this.mesh);

      // Safe dispose dealing with Shared Assets vs Cloned Materials
      const assets = ZombieDog.assets;

      this.mesh.traverse((child) => {
        // Did NOT dispose geometry (Shared)

        if (child.isMesh && child.material) {
          let isShared = false;
          if (assets) {
            if (
              child.material === assets.bodyMat ||
              child.material === assets.bloodMat ||
              child.material === assets.eyeMat ||
              child.material === assets.ribMat
            ) {
              isShared = true;
            }
            if (assets.glowMat && child.material === assets.glowMat)
              isShared = true;
          }

          // Only dispose unique materials (Horde clones)
          if (!isShared) {
            child.material.dispose();
          }
        }
      });
      this.mesh = null;
    }
  }
}
