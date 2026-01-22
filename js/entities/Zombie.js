/**
 * Zombie Entity Class
 * Handles zombie enemy behavior, movement, and collision detection
 *
 * Movement speed scales with game level for increased difficulty
 */

import * as THREE from "three";
import { GameRules } from "../core/GameRules.js";

export class Zombie {
  constructor(x, z, maze, cellSize, mazeSize, scene, spawnCorner, level = 1) {
    this.gridX = x;
    this.gridZ = z;
    this.startX = x; // Remember spawn position
    this.startZ = z;
    this.maze = maze;
    this.cellSize = cellSize;
    this.mazeSize = mazeSize;
    this.scene = scene;
    this.spawnCorner = spawnCorner; // 'topRight' or 'bottomLeft'
    this.level = level;
    this.moveCounter = 0;

    // BALANCED: Zombie speed scales with level using GameRules
    const baseInterval = GameRules.getZombieSpeed(level);
    const variance = Math.floor(baseInterval * 0.5);
    this.moveInterval = Math.floor(Math.random() * variance) + baseInterval;
    this.baseInterval = baseInterval;
    this.variance = variance;

    // Patrol range - zombies patrol within a territory (expands with level)
    this.patrolRange = Math.ceil(mazeSize / 3) + Math.floor(level / 3);
    this.minX = Math.max(0, this.startX - this.patrolRange);
    this.maxX = Math.min(mazeSize - 1, this.startX + this.patrolRange);
    this.minZ = Math.max(0, this.startZ - this.patrolRange);
    this.maxZ = Math.min(mazeSize - 1, this.startZ + this.patrolRange);

    // Patrol waypoints for more natural movement
    this.waypoints = this.generateWaypoints();
    this.currentWaypoint = 0;
    this.targetX = this.waypoints[0].x;
    this.targetZ = this.waypoints[0].z;

    // Movement strategy - higher levels have smarter zombies
    const patrolChance = 0.4 + level * 0.06; // More patrol behavior at higher levels
    this.moveStrategy = Math.random() < patrolChance ? "patrol" : "random";

    // ENHANCED Chase mode - zombies can now chase from level 1!
    this.canChase = true; // Always can chase
    this.chaseRange = GameRules.getZombieChaseRange(level); // Level-scaled detection range
    this.aggroRange = Math.floor(this.chaseRange * 0.6); // 60% of chase range for staying aggro
    this.isChasing = false;
    this.isFleeing = false; // Fleeing from light boost
    this.chaseTarget = null;
    this.lastKnownPlayerPos = null; // Remember where player was last seen
    this.alertLevel = 0; // 0-100, increases when player is nearby
    this.maxAlertLevel = 100;
    this.alertDecayRate = level >= 5 ? 0.3 : level >= 3 ? 0.5 : 1; // Much slower decay at higher levels

    // Animation state
    this.animationTime = Math.random() * 10; // Randomize start phase
    this.targetRotation = 0;
    this.currentRotation = Math.random() * Math.PI * 2;

    // Body part references for animation
    this.head = null;
    this.torso = null;
    this.leftArmPivot = null;
    this.rightArmPivot = null;
    this.leftLegPivot = null;
    this.rightLegPivot = null;
    this.bodyMaterial = null;

    // Create zombie mesh
    this.mesh = this.createMesh();
    this.updatePosition();
    this.scene.add(this.mesh);
    this.isDisposed = false;
  }

  /**
   * Create the zombie humanoid mesh with rotten appearance
   */
  createMesh() {
    const group = new THREE.Group();

    // Rotten zombie skin color - greenish gray with variations
    const rottenColor = 0x4a5d4a; // Greenish gray
    const bloodColor = 0x8b0000; // Dark red blood

    // Main body material - rotten flesh
    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: rottenColor,
      emissive: 0x1a1a1a, // Very subtle dark glow
      emissiveIntensity: 0.1,
      metalness: 0.1,
      roughness: 0.9, // Very rough, decayed
    });

    // Blood-stained material for some parts
    const bloodMaterial = new THREE.MeshStandardMaterial({
      color: bloodColor,
      emissive: 0x330000,
      emissiveIntensity: 0.2,
      metalness: 0.3,
      roughness: 0.8,
    });

    // Head - slightly deformed/lumpy
    const headGeo = new THREE.SphereGeometry(0.28, 12, 10);
    this.head = new THREE.Mesh(headGeo, this.bodyMaterial);
    this.head.position.y = 1.5;
    this.head.scale.set(1, 1.1, 0.9); // Elongated skull
    this.head.castShadow = true;
    group.add(this.head);

    // Jaw - hanging open
    const jawGeo = new THREE.BoxGeometry(0.18, 0.08, 0.12);
    const jaw = new THREE.Mesh(jawGeo, bloodMaterial);
    jaw.position.set(0, 1.28, 0.1);
    jaw.rotation.x = 0.3; // Hanging open
    jaw.castShadow = true;
    group.add(jaw);

    // Neck - thin and exposed
    const neckGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.2, 8);
    const neck = new THREE.Mesh(neckGeo, bloodMaterial);
    neck.position.y = 1.25;
    neck.castShadow = true;
    group.add(neck);

    // Torso - hunched and decayed
    const torsoGeo = new THREE.CylinderGeometry(0.22, 0.18, 0.55, 10);
    this.torso = new THREE.Mesh(torsoGeo, this.bodyMaterial);
    this.torso.position.y = 0.95;
    this.torso.rotation.x = 0.15; // Hunched forward
    this.torso.castShadow = true;
    group.add(this.torso);

    // Exposed ribs (visible through torn flesh)
    for (let i = 0; i < 3; i++) {
      const ribGeo = new THREE.TorusGeometry(0.12, 0.015, 4, 8, Math.PI);
      const rib = new THREE.Mesh(ribGeo, bloodMaterial);
      rib.position.set(0, 1.0 - i * 0.1, 0.15);
      rib.rotation.x = Math.PI / 2;
      rib.rotation.z = Math.PI;
      group.add(rib);
    }

    // Hips - bony
    const hipsGeo = new THREE.CylinderGeometry(0.15, 0.12, 0.2, 8);
    const hips = new THREE.Mesh(hipsGeo, this.bodyMaterial);
    hips.position.y = 0.58;
    hips.castShadow = true;
    group.add(hips);

    // Left Leg - shambling, bent at odd angle
    this.leftLegPivot = new THREE.Group();
    this.leftLegPivot.position.set(-0.08, 0.5, 0);
    const legGeo = new THREE.CylinderGeometry(0.06, 0.04, 0.5, 6);
    const leftLeg = new THREE.Mesh(legGeo, this.bodyMaterial);
    leftLeg.position.y = -0.25;
    leftLeg.castShadow = true;
    this.leftLegPivot.add(leftLeg);
    group.add(this.leftLegPivot);

    // Left foot - dragging
    const footGeo = new THREE.BoxGeometry(0.1, 0.05, 0.18);
    const leftFoot = new THREE.Mesh(footGeo, this.bodyMaterial);
    leftFoot.position.set(0, -0.52, 0.04);
    leftFoot.rotation.y = 0.3; // Twisted
    this.leftLegPivot.add(leftFoot);

    // Right Leg
    this.rightLegPivot = new THREE.Group();
    this.rightLegPivot.position.set(0.08, 0.5, 0);
    const rightLeg = new THREE.Mesh(legGeo, this.bodyMaterial);
    rightLeg.position.y = -0.25;
    rightLeg.castShadow = true;
    this.rightLegPivot.add(rightLeg);
    group.add(this.rightLegPivot);

    // Right foot
    const rightFoot = new THREE.Mesh(footGeo, this.bodyMaterial);
    rightFoot.position.set(0, -0.52, 0.04);
    rightFoot.rotation.y = -0.2;
    this.rightLegPivot.add(rightFoot);

    // Left Arm - hanging limp, one arm reaching
    this.leftArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(-0.28, 1.1, 0);
    this.leftArmPivot.rotation.z = 0.4; // Hanging outward
    const armGeo = new THREE.CylinderGeometry(0.045, 0.03, 0.4, 6);
    const leftArm = new THREE.Mesh(armGeo, this.bodyMaterial);
    leftArm.position.y = -0.2;
    leftArm.castShadow = true;
    this.leftArmPivot.add(leftArm);
    group.add(this.leftArmPivot);

    // Left claw hand
    const clawGeo = new THREE.ConeGeometry(0.05, 0.12, 5);
    const leftClaw = new THREE.Mesh(clawGeo, bloodMaterial);
    leftClaw.position.set(0, -0.45, 0);
    leftClaw.rotation.x = Math.PI; // Point down
    this.leftArmPivot.add(leftClaw);

    // Right Arm - reaching forward menacingly
    this.rightArmPivot = new THREE.Group();
    this.rightArmPivot.position.set(0.28, 1.1, 0);
    this.rightArmPivot.rotation.z = -0.3;
    this.rightArmPivot.rotation.x = -0.5; // Reaching forward
    const rightArm = new THREE.Mesh(armGeo, this.bodyMaterial);
    rightArm.position.y = -0.2;
    rightArm.castShadow = true;
    this.rightArmPivot.add(rightArm);
    group.add(this.rightArmPivot);

    // Right claw hand
    const rightClaw = new THREE.Mesh(clawGeo, bloodMaterial);
    rightClaw.position.set(0, -0.45, 0);
    rightClaw.rotation.x = Math.PI;
    this.rightArmPivot.add(rightClaw);

    // Eyes - glowing red
    const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.08, 1.55, 0.2);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.08, 1.55, 0.2);
    group.add(rightEye);

    // Subtle red glow from eyes
    const eyeGlow = new THREE.PointLight(0xff0000, 0.3, 5);
    eyeGlow.position.set(0, 1.5, 0.2);
    group.add(eyeGlow);

    // Scale up slightly
    group.scale.setScalar(1.3);

    // Store material reference
    group.material = this.bodyMaterial;

    return group;
  }

  /**
   * Generate patrol waypoints around the territory
   */
  generateWaypoints() {
    const corners = [
      { x: this.minX, z: this.minZ },
      { x: this.maxX, z: this.minZ },
      { x: this.maxX, z: this.maxZ },
      { x: this.minX, z: this.maxZ },
      {
        x: Math.floor((this.minX + this.maxX) / 2),
        z: Math.floor((this.minZ + this.maxZ) / 2),
      }, // Center
    ];
    return corners;
  }

  /**
   * Update the visual position of the zombie mesh
   */
  updatePosition() {
    const offset = -(this.mazeSize * this.cellSize) / 2;
    this.mesh.position.set(
      offset + this.gridX * this.cellSize + this.cellSize / 2,
      0, // Ground level
      offset + this.gridZ * this.cellSize + this.cellSize / 2,
    );
  }

  /**
   * Set player position for enhanced chase behavior with memory
   * Also handles fleeing when player has light boost active
   */
  setPlayerPosition(playerX, playerZ, isLightBoostActive = false) {
    if (!this.canChase) return;

    // Calculate distance to player
    const dx = Math.abs(this.gridX - playerX);
    const dz = Math.abs(this.gridZ - playerZ);
    const distance = dx + dz; // Manhattan distance

    // FLEE from light boost!
    if (isLightBoostActive && distance <= this.chaseRange + 2) {
      this.isFleeing = true;
      this.isChasing = false;
      // Set flee target AWAY from player
      const fleeX = this.gridX + Math.sign(this.gridX - playerX) * 3;
      const fleeZ = this.gridZ + Math.sign(this.gridZ - playerZ) * 3;
      this.chaseTarget = {
        x: Math.max(0, Math.min(this.mazeSize - 1, fleeX)),
        z: Math.max(0, Math.min(this.mazeSize - 1, fleeZ)),
      };
      this.alertLevel = 0; // Reset alert when fleeing
      return;
    }

    this.isFleeing = false;

    // Check if player is within detection range
    // HORDE ZOMBIES have infinite range (omniscience)
    if (this.isHordeZombie || distance <= this.chaseRange) {
      // Player spotted! Max alert and chase
      this.alertLevel = this.maxAlertLevel;
      this.isChasing = true;
      this.chaseTarget = { x: playerX, z: playerZ };
      this.lastKnownPlayerPos = { x: playerX, z: playerZ };
    } else if (distance <= this.chaseRange + 2 && this.alertLevel > 50) {
      // Player nearby and zombie is alert - continue chase with last known position
      this.alertLevel = Math.min(this.alertLevel + 10, this.maxAlertLevel);
      if (this.lastKnownPlayerPos) {
        this.chaseTarget = this.lastKnownPlayerPos;
        this.isChasing = true;
      }
    } else {
      // Player out of range

      // Horde zombies never lose interest entirely if they had a target, but if logic above caught them, they are fine.

      // Decay alert level
      this.alertLevel = Math.max(0, this.alertLevel - this.alertDecayRate);

      if (this.alertLevel > 30 && this.lastKnownPlayerPos) {
        // Still alert! Investigate last known position
        this.isChasing = true;
        this.chaseTarget = this.lastKnownPlayerPos;

        // If we reached last known position, clear it
        if (
          this.gridX === this.lastKnownPlayerPos.x &&
          this.gridZ === this.lastKnownPlayerPos.z
        ) {
          this.lastKnownPlayerPos = null;
          this.alertLevel = 20; // Confused, looking around
        }
      } else {
        // No longer alert - return to patrol
        this.isChasing = false;
        this.chaseTarget = null;
      }
    }
  }

  /**
   * Move toward target waypoint with smart pathfinding
   */
  moveTowardTarget() {
    const targetX =
      this.isChasing && this.chaseTarget ? this.chaseTarget.x : this.targetX;
    const targetZ =
      this.isChasing && this.chaseTarget ? this.chaseTarget.z : this.targetZ;

    // Smart pathfinding toward target
    const dx = Math.sign(targetX - this.gridX);
    const dz = Math.sign(targetZ - this.gridZ);

    // Try diagonal movement first (more efficient)
    if (dx !== 0 && dz !== 0) {
      if (this.canMove(dx, 0)) {
        this.gridX += dx;
        return true;
      }
      if (this.canMove(0, dz)) {
        this.gridZ += dz;
        return true;
      }
    }

    // Try horizontal movement
    if (dx !== 0 && this.canMove(dx, 0)) {
      this.gridX += dx;
      return true;
    }

    // Try vertical movement
    if (dz !== 0 && this.canMove(0, dz)) {
      this.gridZ += dz;
      return true;
    }

    return false;
  }

  /**
   * Check if movement in the given direction is valid
   */
  canMove(dx, dz) {
    // Check if move is valid (within bounds and no wall)
    const newX = this.gridX + dx;
    const newZ = this.gridZ + dz;

    // Bounds check
    if (
      newX < 0 ||
      newX >= this.mazeSize ||
      newZ < 0 ||
      newZ >= this.mazeSize
    ) {
      return false;
    }

    // Wall check
    const cell = this.maze[this.gridZ]?.[this.gridX];
    if (!cell) return false;

    if (dx === 1 && cell.right) return false;
    if (dx === -1 && cell.left) return false;
    if (dz === 1 && cell.bottom) return false;
    if (dz === -1 && cell.top) return false;

    return true;
  }

  /**
   * Patrol mode: Move toward waypoints
   */
  movePatrol() {
    if (this.gridX === this.targetX && this.gridZ === this.targetZ) {
      // Reached waypoint, go to next
      this.currentWaypoint = (this.currentWaypoint + 1) % this.waypoints.length;
      this.targetX = this.waypoints[this.currentWaypoint].x;
      this.targetZ = this.waypoints[this.currentWaypoint].z;
    }

    this.moveTowardTarget();
  }

  /**
   * Random mode: Move randomly within territory
   */
  moveRandomly() {
    const directions = [];
    const cell = this.maze[this.gridZ]?.[this.gridX];

    if (!cell) return;

    // Check valid moves
    if (this.gridZ > 0 && !cell.top && this.gridZ - 1 >= this.minZ)
      directions.push({ dx: 0, dz: -1 });
    if (
      this.gridZ < this.mazeSize - 1 &&
      !cell.bottom &&
      this.gridZ + 1 <= this.maxZ
    )
      directions.push({ dx: 0, dz: 1 });
    if (this.gridX > 0 && !cell.left && this.gridX - 1 >= this.minX)
      directions.push({ dx: -1, dz: 0 });
    if (
      this.gridX < this.mazeSize - 1 &&
      !cell.right &&
      this.gridX + 1 <= this.maxX
    )
      directions.push({ dx: 1, dz: 0 });

    if (directions.length > 0) {
      const move = directions[Math.floor(Math.random() * directions.length)];
      this.gridX += move.dx;
      this.gridZ += move.dz;
    }
  }

  /**
   * Main update loop - called each frame
   */
  update(deltaTime = 0.016) {
    // Guard: Skip update if disposed
    if (this.isDisposed || !this.mesh) return;

    this.moveCounter++;

    // Zombies move faster when chasing
    const currentInterval = this.isChasing
      ? Math.floor(this.moveInterval * 0.7)
      : this.moveInterval;

    if (this.moveCounter >= currentInterval) {
      this.moveCounter = 0;
      // Randomize next move interval
      this.moveInterval =
        Math.floor(Math.random() * this.variance) + this.baseInterval;

      // If fleeing (light boost), move away from player FAST
      if (this.isFleeing && this.chaseTarget) {
        this.moveTowardTarget(); // chaseTarget is set to flee direction
      }
      // If chasing, always move toward player
      else if (this.isChasing && this.chaseTarget) {
        const moved = this.moveTowardTarget();
        if (!moved) this.moveRandomly(); // Unstuck if blocked
      } else if (this.moveStrategy === "patrol") {
        this.movePatrol();
      } else {
        this.moveRandomly();
      }
    }

    this.updatePosition();

    // Animate the zombie
    this.animate(deltaTime);
  }

  /**
   * Animate the zombie - sloppy shambling or aggressive chase
   */
  animate(deltaTime = 0.016) {
    this.animationTime += deltaTime;

    if (this.isChasing) {
      this.animateAggressive();
    } else {
      this.animateShamble();
    }

    // Rotate toward movement direction (sloppy, delayed)
    if (this.chaseTarget) {
      const dx = this.chaseTarget.x - this.gridX;
      const dz = this.chaseTarget.z - this.gridZ;
      if (dx !== 0 || dz !== 0) {
        this.targetRotation = Math.atan2(dx, dz);
      }
    }

    // Sloppy rotation - slow and jerky
    const rotDiff = this.targetRotation - this.currentRotation;
    let normalizedDiff = rotDiff;
    while (normalizedDiff > Math.PI) normalizedDiff -= Math.PI * 2;
    while (normalizedDiff < -Math.PI) normalizedDiff += Math.PI * 2;

    const rotSpeed = this.isChasing ? 0.08 : 0.03;
    this.currentRotation += normalizedDiff * rotSpeed;
    this.mesh.rotation.y = this.currentRotation;
  }

  /**
   * Sloppy shambling idle animation
   */
  animateShamble() {
    const time = this.animationTime;
    const slowSpeed = 1.5; // Slow, uneven movement

    // Uneven leg dragging
    if (this.leftLegPivot) {
      this.leftLegPivot.rotation.x = Math.sin(time * slowSpeed) * 0.25;
      this.leftLegPivot.rotation.z = Math.sin(time * slowSpeed * 0.7) * 0.1;
    }
    if (this.rightLegPivot) {
      this.rightLegPivot.rotation.x = Math.sin(time * slowSpeed + 2) * 0.2;
      this.rightLegPivot.rotation.z = Math.cos(time * slowSpeed * 0.5) * 0.08;
    }

    // Arms hanging and swaying loosely
    if (this.leftArmPivot) {
      this.leftArmPivot.rotation.x = Math.sin(time * slowSpeed * 0.8) * 0.15;
      this.leftArmPivot.rotation.z = 0.4 + Math.sin(time * 0.5) * 0.1;
    }
    if (this.rightArmPivot) {
      this.rightArmPivot.rotation.x =
        -0.5 + Math.sin(time * slowSpeed * 0.6) * 0.2;
    }

    // Head tilting and bobbing
    if (this.head) {
      this.head.rotation.z = Math.sin(time * slowSpeed * 0.4) * 0.15;
      this.head.rotation.x = 0.1 + Math.sin(time * 0.8) * 0.05;
    }

    // Torso swaying
    if (this.torso) {
      this.torso.rotation.z = Math.sin(time * slowSpeed * 0.3) * 0.08;
    }
  }

  /**
   * Aggressive chase animation - faster, more violent movements
   */
  animateAggressive() {
    const time = this.animationTime;
    const fastSpeed = 8; // Fast, aggressive movement

    // Fast, jerky leg movement
    if (this.leftLegPivot) {
      this.leftLegPivot.rotation.x = Math.sin(time * fastSpeed) * 0.6;
    }
    if (this.rightLegPivot) {
      this.rightLegPivot.rotation.x =
        Math.sin(time * fastSpeed + Math.PI) * 0.6;
    }

    // Arms reaching forward aggressively
    if (this.leftArmPivot) {
      this.leftArmPivot.rotation.x =
        -0.8 + Math.sin(time * fastSpeed * 0.5) * 0.3;
      this.leftArmPivot.rotation.z = 0.2;
    }
    if (this.rightArmPivot) {
      this.rightArmPivot.rotation.x =
        -1.0 + Math.sin(time * fastSpeed * 0.5 + 1) * 0.3;
      this.rightArmPivot.rotation.z = -0.2;
    }

    // Head lunging forward
    if (this.head) {
      this.head.rotation.x = 0.2 + Math.sin(time * fastSpeed) * 0.1;
      this.head.rotation.z = Math.sin(time * fastSpeed * 2) * 0.1;
    }

    // Torso lurching
    if (this.torso) {
      this.torso.rotation.x = 0.25 + Math.sin(time * fastSpeed) * 0.1;
    }
  }

  /**
   * Check collision with player at given position
   */
  checkCollision(playerX, playerZ) {
    return this.gridX === playerX && this.gridZ === playerZ;
  }

  /**
   * Create explosion effect when zombie is purified
   */
  explode() {
    if (!this.mesh) return;

    const position = this.mesh.position.clone();
    const particleCount = 25;
    const particles = [];

    // Colors for gore/explosion effect
    const colors = [0x8b0000, 0x4a5d4a, 0x2d2d2d, 0x660000, 0x3d4d3d];

    for (let i = 0; i < particleCount; i++) {
      // Random particle size
      const size = 0.08 + Math.random() * 0.15;
      const geo = new THREE.SphereGeometry(size, 6, 6);

      // Random color from gore palette
      const color = colors[Math.floor(Math.random() * colors.length)];
      const mat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 1.0,
      });

      const particle = new THREE.Mesh(geo, mat);

      // Start at zombie position
      particle.position.copy(position);
      particle.position.y += 0.8 + Math.random() * 0.5;

      // Random velocity - exploding outward
      particle.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        0.2 + Math.random() * 0.3,
        (Math.random() - 0.5) * 0.4,
      );

      particle.userData.gravity = -0.015;
      particle.userData.life = 1.0;
      particle.userData.decay = 0.02 + Math.random() * 0.02;

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

    // Add a quick flash at explosion point
    const flash = new THREE.PointLight(0xff0000, 3, 8);
    flash.position.copy(position);
    flash.position.y += 1;
    this.scene.add(flash);

    // Fade out flash
    let flashIntensity = 3;
    const fadeFlash = () => {
      flashIntensity -= 0.15;
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
   * Remove zombie from scene and clean up resources
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
