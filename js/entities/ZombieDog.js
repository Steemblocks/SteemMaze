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
  createMesh() {
    const group = new THREE.Group();

    // Rotten grayish-brown color
    const rottenColor = 0x3d3d2d;
    const bloodColor = 0x660000;

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: rottenColor,
      emissive: 0x111111,
      emissiveIntensity: 0.15,
      roughness: 0.85,
    });

    const bloodMaterial = new THREE.MeshStandardMaterial({
      color: bloodColor,
      emissive: 0x220000,
      emissiveIntensity: 0.2,
      roughness: 0.7,
    });

    // Body - elongated
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.35, 0.9);
    this.body = new THREE.Mesh(bodyGeo, bodyMaterial);
    this.body.position.y = 0.5;
    this.body.castShadow = true;
    group.add(this.body);

    // Head
    const headGeo = new THREE.BoxGeometry(0.25, 0.25, 0.35);
    this.head = new THREE.Mesh(headGeo, bodyMaterial);
    this.head.position.set(0, 0.6, 0.55);
    this.head.castShadow = true;
    group.add(this.head);

    // Snout
    const snoutGeo = new THREE.BoxGeometry(0.15, 0.12, 0.2);
    const snout = new THREE.Mesh(snoutGeo, bloodMaterial);
    snout.position.set(0, 0.55, 0.75);
    group.add(snout);

    // Glowing red eyes - MeshBasicMaterial doesn't support emissive
    const eyeGeo = new THREE.SphereGeometry(0.04, 6, 6);
    const eyeMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
    });

    const leftEye = new THREE.Mesh(eyeGeo, eyeMaterial);
    leftEye.position.set(-0.08, 0.65, 0.7);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMaterial);
    rightEye.position.set(0.08, 0.65, 0.7);
    group.add(rightEye);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.06, 0.04, 0.4, 6);

    // Front legs
    const frontLeftLegPivot = new THREE.Group();
    frontLeftLegPivot.position.set(-0.18, 0.4, 0.3);
    this.frontLeftLeg = new THREE.Mesh(legGeo, bodyMaterial);
    this.frontLeftLeg.position.y = -0.2;
    frontLeftLegPivot.add(this.frontLeftLeg);
    group.add(frontLeftLegPivot);
    this.frontLeftLegPivot = frontLeftLegPivot;

    const frontRightLegPivot = new THREE.Group();
    frontRightLegPivot.position.set(0.18, 0.4, 0.3);
    this.frontRightLeg = new THREE.Mesh(legGeo, bodyMaterial);
    this.frontRightLeg.position.y = -0.2;
    frontRightLegPivot.add(this.frontRightLeg);
    group.add(frontRightLegPivot);
    this.frontRightLegPivot = frontRightLegPivot;

    // Back legs
    const backLeftLegPivot = new THREE.Group();
    backLeftLegPivot.position.set(-0.18, 0.4, -0.3);
    this.backLeftLeg = new THREE.Mesh(legGeo, bodyMaterial);
    this.backLeftLeg.position.y = -0.2;
    backLeftLegPivot.add(this.backLeftLeg);
    group.add(backLeftLegPivot);
    this.backLeftLegPivot = backLeftLegPivot;

    const backRightLegPivot = new THREE.Group();
    backRightLegPivot.position.set(0.18, 0.4, -0.3);
    this.backRightLeg = new THREE.Mesh(legGeo, bodyMaterial);
    this.backRightLeg.position.y = -0.2;
    backRightLegPivot.add(this.backRightLeg);
    group.add(backRightLegPivot);
    this.backRightLegPivot = backRightLegPivot;

    // Tail - bony, hanging
    const tailGeo = new THREE.CylinderGeometry(0.03, 0.01, 0.4, 4);
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.55, -0.45);
    this.tail = new THREE.Mesh(tailGeo, bodyMaterial);
    this.tail.position.y = -0.15;
    this.tail.rotation.x = 0.5;
    tailPivot.add(this.tail);
    group.add(tailPivot);
    this.tailPivot = tailPivot;

    // Exposed ribs/bones
    const ribMaterial = new THREE.MeshStandardMaterial({ color: 0xccccaa });
    for (let i = 0; i < 3; i++) {
      const ribGeo = new THREE.BoxGeometry(0.52, 0.02, 0.04);
      const rib = new THREE.Mesh(ribGeo, ribMaterial);
      rib.position.set(0, 0.55, 0.15 - i * 0.15);
      group.add(rib);
    }

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
  explode() {
    if (!this.mesh) return;

    const position = this.mesh.position.clone();
    const particleCount = 20; // Slightly fewer than zombie since dog is smaller
    const particles = [];

    // Colors for gore/explosion effect - dog colors
    const colors = [0x660000, 0x3d3d2d, 0x2d2d2d, 0x550000, 0x4a4a3a];

    for (let i = 0; i < particleCount; i++) {
      // Random particle size
      const size = 0.06 + Math.random() * 0.12;
      const geo = new THREE.SphereGeometry(size, 6, 6);

      // Random color from gore palette
      const color = colors[Math.floor(Math.random() * colors.length)];
      const mat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 1.0,
      });

      const particle = new THREE.Mesh(geo, mat);

      // Start at dog position
      particle.position.copy(position);
      particle.position.y += 0.5 + Math.random() * 0.3;

      // Random velocity - exploding outward
      particle.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.35,
        0.15 + Math.random() * 0.25,
        (Math.random() - 0.5) * 0.35,
      );

      particle.userData.gravity = -0.012;
      particle.userData.life = 1.0;
      particle.userData.decay = 0.025 + Math.random() * 0.02;

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
        const scale = Math.max(0.1, p.userData.life);
        p.scale.setScalar(scale);

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
          p.geometry.dispose();
          p.material.dispose();
        });
      }
    };

    // Start animation
    requestAnimationFrame(animateParticles);

    // Add a quick flash at explosion point (orange-red for dog)
    const flash = new THREE.PointLight(0xff4400, 2.5, 6);
    flash.position.copy(position);
    flash.position.y += 0.6;
    this.scene.add(flash);

    // Fade out flash
    let flashIntensity = 2.5;
    const fadeFlash = () => {
      flashIntensity -= 0.12;
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
  dispose() {
    this.isDisposed = true;
    if (this.mesh) {
      this.mesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.scene.remove(this.mesh);
      this.mesh = null;
    }
  }
}
