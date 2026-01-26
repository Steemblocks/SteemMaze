/**
 * Zombie Entity Class
 * Handles zombie enemy behavior, movement, and collision detection
 *
 * Movement speed scales with game level for increased difficulty
 */

import * as THREE from "three";
import { GameRules } from "../core/GameRules.js";
import { EntityRegistry } from "../core/EntityRegistry.js";

export class Zombie {
  constructor(x, z, maze, cellSize, mazeSize, scene, spawnCorner, level = 1) {
    this.id = `zombie_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
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

    // Register to prevent overlaps
    EntityRegistry.register(this.id, x, z, "zombie");

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
  /**
   * Static assets to prevent creating duplicate geometries and materials
   * This drastically improves performance (batching & memory)
   */
  /**
   * Static assets to prevent creating duplicate geometries and materials
   */
  static assets = null;
  static masterMesh = null;

  static getAssets() {
    if (!Zombie.assets) {
      // ... (asset creation code remains same but we can simplify if we build prototype immediately)
      // Actually, let's keep assets for now in case we need them, but build prototype.
      const rottenColor = 0x4a5d4a;
      const bloodColor = 0x8b0000;

      Zombie.assets = {
        bodyMat: new THREE.MeshStandardMaterial({
          color: rottenColor,
          emissive: 0x1a1a1a,
          emissiveIntensity: 0.1,
          metalness: 0.1,
          roughness: 0.9,
        }),
        bloodMat: new THREE.MeshStandardMaterial({
          color: bloodColor,
          emissive: 0x330000,
          emissiveIntensity: 0.2,
          metalness: 0.3,
          roughness: 0.8,
        }),
        eyeMat: new THREE.MeshBasicMaterial({ color: 0xff0000 }),

        // Geometries
        headGeo: new THREE.SphereGeometry(0.28, 8, 8),
        jawGeo: new THREE.BoxGeometry(0.18, 0.08, 0.12),
        neckGeo: new THREE.CylinderGeometry(0.08, 0.12, 0.2, 5),
        torsoGeo: new THREE.CylinderGeometry(0.22, 0.18, 0.55, 8),
        ribGeo: new THREE.TorusGeometry(0.12, 0.015, 4, 6, Math.PI),
        hipsGeo: new THREE.CylinderGeometry(0.15, 0.12, 0.2, 6),
        legGeo: new THREE.CylinderGeometry(0.06, 0.04, 0.5, 5),
        footGeo: new THREE.BoxGeometry(0.1, 0.05, 0.18),
        armGeo: new THREE.CylinderGeometry(0.045, 0.03, 0.4, 5),
        clawGeo: new THREE.ConeGeometry(0.05, 0.12, 4),
        eyeGeo: new THREE.SphereGeometry(0.04, 6, 6),
      };

      // Create glow texture
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
      const texture = new THREE.CanvasTexture(canvas);

      Zombie.assets.glowMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
    }
    return Zombie.assets;
  }

  static initMasterMesh() {
    if (Zombie.masterMesh) return;

    const assets = Zombie.getAssets();
    const group = new THREE.Group();

    // Head
    const head = new THREE.Mesh(assets.headGeo, assets.bodyMat);
    head.position.y = 1.5;
    head.scale.set(1, 1.1, 0.9);
    head.castShadow = true;
    head.name = "head";
    group.add(head);

    // Jaw
    const jaw = new THREE.Mesh(assets.jawGeo, assets.bloodMat);
    jaw.position.set(0, 1.28, 0.1);
    jaw.rotation.x = 0.3;
    jaw.castShadow = true;
    group.add(jaw);

    // Neck
    const neck = new THREE.Mesh(assets.neckGeo, assets.bloodMat);
    neck.position.y = 1.25;
    neck.castShadow = true;
    group.add(neck);

    // Torso
    const torso = new THREE.Mesh(assets.torsoGeo, assets.bodyMat);
    torso.position.y = 0.95;
    torso.rotation.x = 0.15;
    torso.castShadow = true;
    torso.name = "torso";
    group.add(torso);

    // Ribs
    for (let i = 0; i < 3; i++) {
      const rib = new THREE.Mesh(assets.ribGeo, assets.bloodMat);
      rib.position.set(0, 1.0 - i * 0.1, 0.15);
      rib.rotation.x = Math.PI / 2;
      rib.rotation.z = Math.PI;
      group.add(rib);
    }

    // Hips
    const hips = new THREE.Mesh(assets.hipsGeo, assets.bodyMat);
    hips.position.y = 0.58;
    hips.castShadow = true;
    group.add(hips);

    // Left Leg
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.08, 0.5, 0);
    leftLegPivot.name = "leftLegPivot";
    const leftLeg = new THREE.Mesh(assets.legGeo, assets.bodyMat);
    leftLeg.position.y = -0.25;
    leftLeg.castShadow = true;
    leftLegPivot.add(leftLeg);

    const leftFoot = new THREE.Mesh(assets.footGeo, assets.bodyMat);
    leftFoot.position.set(0, -0.52, 0.04);
    leftFoot.rotation.y = 0.3;
    leftLegPivot.add(leftFoot);
    group.add(leftLegPivot);

    // Right Leg
    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.08, 0.5, 0);
    rightLegPivot.name = "rightLegPivot";
    const rightLeg = new THREE.Mesh(assets.legGeo, assets.bodyMat);
    rightLeg.position.y = -0.25;
    rightLeg.castShadow = true;
    rightLegPivot.add(rightLeg);

    const rightFoot = new THREE.Mesh(assets.footGeo, assets.bodyMat);
    rightFoot.position.set(0, -0.52, 0.04);
    rightFoot.rotation.y = -0.2;
    rightLegPivot.add(rightFoot);
    group.add(rightLegPivot);

    // Left Arm
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.28, 1.1, 0);
    leftArmPivot.rotation.z = 0.4;
    leftArmPivot.name = "leftArmPivot";
    const leftArm = new THREE.Mesh(assets.armGeo, assets.bodyMat);
    leftArm.position.y = -0.2;
    leftArm.castShadow = true;
    leftArmPivot.add(leftArm);

    const leftClaw = new THREE.Mesh(assets.clawGeo, assets.bloodMat);
    leftClaw.position.set(0, -0.45, 0);
    leftClaw.rotation.x = Math.PI;
    leftArmPivot.add(leftClaw);
    group.add(leftArmPivot);

    // Right Arm
    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.28, 1.1, 0);
    rightArmPivot.rotation.z = -0.3;
    rightArmPivot.rotation.x = -0.5;
    rightArmPivot.name = "rightArmPivot";
    const rightArm = new THREE.Mesh(assets.armGeo, assets.bodyMat);
    rightArm.position.y = -0.2;
    rightArm.castShadow = true;
    rightArmPivot.add(rightArm);

    const rightClaw = new THREE.Mesh(assets.clawGeo, assets.bloodMat);
    rightClaw.position.set(0, -0.45, 0);
    rightClaw.rotation.x = Math.PI;
    rightArmPivot.add(rightClaw);
    group.add(rightArmPivot);

    // Eyes
    const leftEye = new THREE.Mesh(assets.eyeGeo, assets.eyeMat);
    leftEye.position.set(-0.08, 1.55, 0.2);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(assets.eyeGeo, assets.eyeMat);
    rightEye.position.set(0.08, 1.55, 0.2);
    group.add(rightEye);

    // Glows
    const eyeScale = 0.25;
    const leftGlow = new THREE.Sprite(assets.glowMat);
    leftGlow.scale.set(eyeScale, eyeScale, 1.0);
    leftGlow.position.set(0, 0, 0.06);
    leftEye.add(leftGlow);

    const rightGlow = new THREE.Sprite(assets.glowMat);
    rightGlow.scale.set(eyeScale, eyeScale, 1.0);
    rightGlow.position.set(0, 0, 0.06);
    rightEye.add(rightGlow);

    group.scale.setScalar(1.3);

    Zombie.masterMesh = group;
  }

  /**
   * Create the zombie humanoid mesh using optimized cloning
   */
  createMesh() {
    Zombie.initMasterMesh();

    // Efficient cloning of the entire hierarchy
    const group = Zombie.masterMesh.clone();

    // Re-bind references required for animation
    this.head = group.getObjectByName("head");
    this.torso = group.getObjectByName("torso");
    this.leftLegPivot = group.getObjectByName("leftLegPivot");
    this.rightLegPivot = group.getObjectByName("rightLegPivot");
    this.leftArmPivot = group.getObjectByName("leftArmPivot");
    this.rightArmPivot = group.getObjectByName("rightArmPivot");

    // Shared material reference for Horde coloring logic
    this.bodyMaterial = Zombie.getAssets().bodyMat;

    // Store material reference on group for compatibility
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
    // Update registry first
    EntityRegistry.update(this.id, this.gridX, this.gridZ);

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

    // Entity overlap check
    if (EntityRegistry.isOccupied(newX, newZ, this.id)) {
      return false;
    }

    if (dx === 1 && cell.right) return false;
    if (dx === -1 && cell.left) return false;
    if (dz === 1 && cell.bottom) return false;
    if (dz === -1 && cell.top) return false;

    return true;
  }

  dispose() {
    this.isDisposed = true;
    EntityRegistry.unregister(this.id);
    if (this.mesh) {
      this.scene.remove(this.mesh);
      // ... clean up geometry if needed ...
    }
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
  /**
   * Create explosion effect when zombie is purified
   */
  explode() {
    if (!this.mesh) return;

    const position = this.mesh.position.clone();

    // OPTIMIZATION: Reduce particle count for performance
    const particleCount = 12; // Was 25
    const particles = [];

    // Reuse shared geometry from assets
    const assets = Zombie.getAssets();
    // If eyeGeo is too small (0.04), we might want a slightly bigger one,
    // or just scale the mesh up. scaling is cheap.
    const sharedGeo = assets.eyeGeo;

    // Colors for gore/explosion effect
    const colors = [0x8b0000, 0x4a5d4a, 0x2d2d2d, 0x660000, 0x3d4d3d];

    for (let i = 0; i < particleCount; i++) {
      // Random color from gore palette
      const color = colors[Math.floor(Math.random() * colors.length)];

      // We need unique material for opacity fading, unfortunately.
      // But creating a simple BasicMaterial is cheap.
      const mat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 1.0,
      });

      const particle = new THREE.Mesh(sharedGeo, mat);

      // Start at zombie position
      particle.position.copy(position);
      particle.position.y += 0.8 + Math.random() * 0.5;

      // Random scale to vary size (instead of unique geometry)
      // Base scale: 4.0 to 8.0 times the eyeGeo (0.04 radius) -> 0.16 to 0.32 radius
      const initialScale = 4.0 + Math.random() * 4.0;
      particle.scale.setScalar(initialScale);
      particle.userData.initialScale = initialScale;

      // Random velocity - exploding outward
      particle.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        0.2 + Math.random() * 0.3,
        (Math.random() - 0.5) * 0.4,
      );

      particle.userData.gravity = -0.015;
      particle.userData.life = 1.0;
      particle.userData.decay = 0.015 + Math.random() * 0.02; // Slower decay for visibility

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

        // Shrink as it fades - use initialScale reference
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
          // Do NOT dispose sharedGeo!
          p.material.dispose();
        });
      }
    };

    // Start animation
    requestAnimationFrame(animateParticles);

    // Add a quick flash at explosion point
    // OPTIMIZATION: Reduced duration and range
    const flash = new THREE.PointLight(0xff0000, 2, 5);
    flash.position.copy(position);
    flash.position.y += 1;
    this.scene.add(flash);

    // Fade out flash
    let flashIntensity = 2;
    const fadeFlash = () => {
      flashIntensity -= 0.2; // Faster fade
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
  /**
   * Remove zombie from scene and clean up resources
   */
  dispose() {
    this.isDisposed = true;
    if (this.mesh) {
      // Clean up mesh from scene
      this.scene.remove(this.mesh);

      // Resource Cleanup
      // IMPORTANT: Since we use shared Geometries and Materials (Prototype pattern),
      // we must NOT blindly dispose everything. Only dispose CLONED materials (like Horde variants).

      const assets = Zombie.assets; // Access static assets directly

      this.mesh.traverse((child) => {
        // Geometries are ALWAYS shared from the prototype -> Never dispose

        // Materials: Check if it's a unique clone (Horde) or shared asset
        if (child.isMesh && child.material) {
          let isShared = false;

          if (assets) {
            // Check against known shared materials
            if (
              child.material === assets.bodyMat ||
              child.material === assets.bloodMat ||
              child.material === assets.eyeMat ||
              child.material === assets.ribMat
            ) {
              isShared = true;
            }
            // Also check sprite materials
            if (assets.glowMat && child.material === assets.glowMat)
              isShared = true;
          }

          // Only dispose if it's a unique instance (like a red-tinted Horde material)
          if (!isShared) {
            child.material.dispose();
          }
        }
      });

      this.mesh = null;
    }
  }
}
