/**
 * EntityManager Class
 * Handles all entity management: player, zombies, zombie dogs, bosses, monsters
 * Handles entity spawning, updates, cleanup, and lifecycle management
 * Extracted from Game.js for better code organization
 */

import { Zombie } from "../entities/Zombie.js";
import { ZombieDog } from "../entities/ZombieDog.js";
import { BossZombie } from "../entities/BossZombie.js";
import { BigfootBoss } from "../entities/BigfootBoss.js";
import { Monster } from "../entities/Monster.js";
import { Player } from "../entities/Player.js";
import { GameRules } from "./GameRules.js";

export class EntityManager {
  constructor(game) {
    this.game = game; // Reference to parent Game instance

    // Entity arrays
    this.player = null;
    this.playerMesh = null;
    this.playerPos = { x: 0, z: 0 };

    this.zombies = [];
    this.zombieDogs = [];
    this.bossZombies = [];
    this.monsters = [];
    this.hordeZombies = [];
    this.hordeDogs = [];

    // Spawn queue for staggered spawning
    this.spawnQueue = [];
    this.hordeSpawned = false;

    // Tracking
    this.lastBigfootToast = null;
  }

  /**
   * Create the player entity
   */
  createPlayer() {
    // Use the Player entity class for humanoid model with animations
    this.player = new Player(
      this.game.scene,
      this.game.CELL_SIZE,
      this.game.audioManager,
    );
    this.playerMesh = this.player.mesh; // Keep reference for compatibility
    this.player.addToScene();
    this.updatePlayerPosition();
  }

  /**
   * Update player position in 3D space
   */
  updatePlayerPosition(dx = 0, dz = 0) {
    if (!this.playerMesh) return;
    const offset = -(this.game.MAZE_SIZE * this.game.CELL_SIZE) / 2;
    this.playerMesh.position.set(
      offset + this.playerPos.x * this.game.CELL_SIZE + this.game.CELL_SIZE / 2,
      0, // Ground level (player model handles its own height)
      offset + this.playerPos.z * this.game.CELL_SIZE + this.game.CELL_SIZE / 2,
    );

    // Trigger walking animation if moving
    if (this.player && (dx !== 0 || dz !== 0)) {
      this.player.startWalking(dx, dz);
      // Stop walking after a short delay (movement completion)
      setTimeout(() => {
        if (this.player) this.player.stopWalking();
      }, 200);
    }
  }

  /**
   * Create all regular zombies for the level
   */
  createZombies() {
    // Clear existing zombies
    this.zombies.forEach((z) => z.dispose());
    this.zombies = [];

    // Clear existing bosses (persistent will be recreated)
    this.bossZombies.forEach((b) => b.dispose());
    this.bossZombies = [];

    // Get zombie count for this level
    const zombieCount = GameRules.getZombieCount(this.game.level);

    // Track used positions to avoid overlaps
    const usedPositions = new Set();

    // Avoid player start (bottom-right) and goal (top-left)
    const playerStartX = this.game.MAZE_SIZE - 1;
    const playerStartZ = this.game.MAZE_SIZE - 1;
    const goalX = 0;
    const goalZ = 0;

    // === BOSS SPAWN (Level 6+) ===
    // Persistent Bosses appear starting at Level 6
    if (this.game.level >= 6) {
      // Scale boss count based on 5-level tiers: L6-10: 1, L11-15: 2, etc.
      const bigfootCount = Math.floor((this.game.level - 1) / 5);
      const actualCount = Math.min(bigfootCount, 6); // Max 6 Persistent Bigfoots

      for (let i = 0; i < actualCount; i++) {
        let bx, bz;
        let attempts = 0;
        do {
          bx = Math.floor(Math.random() * this.game.MAZE_SIZE);
          bz = Math.floor(Math.random() * this.game.MAZE_SIZE);
          attempts++;
        } while (
          (Math.abs(bx - this.playerPos.x) + Math.abs(bz - this.playerPos.z) <
            4 || // Far from player
            usedPositions.has(`${bx},${bz}`)) && // Not on another entity
          attempts < 50
        );

        usedPositions.add(`${bx},${bz}`);

        const boss = new BigfootBoss(
          bx,
          bz,
          this.game.maze,
          this.game.CELL_SIZE,
          this.game.MAZE_SIZE,
          this.game.scene,
          this.game.level,
        );
        boss.isPersistent = true; // Mark as persistent level boss
        this.bossZombies.push(boss);
      }

      const bossLabel = actualCount > 1 ? "BOSSES" : "BOSS";

      // Debounce toast to prevent double notifications on level load
      const now = Date.now();
      if (!this.lastBigfootToast || now - this.lastBigfootToast > 2000) {
        if (this.game.audioManager) {
          this.game.audioManager.playBossSpawn();
        }

        this.game.ui.showToast(
          `⚠️ ${actualCount} BIGFOOT ${bossLabel} DETECTED!`,
          "warning",
        );
        this.lastBigfootToast = now;
      }
    }

    for (let i = 0; i < zombieCount; i++) {
      let x = Math.floor(Math.random() * this.game.MAZE_SIZE);
      let z = Math.floor(Math.random() * this.game.MAZE_SIZE);

      // Ensure away from player
      while (
        Math.abs(x - this.playerPos.x) + Math.abs(z - this.playerPos.z) <
        3
      ) {
        x = Math.floor(Math.random() * this.game.MAZE_SIZE);
        z = Math.floor(Math.random() * this.game.MAZE_SIZE);
      }

      const zombie = new Zombie(
        x,
        z,
        this.game.maze,
        this.game.CELL_SIZE,
        this.game.MAZE_SIZE,
        this.game.scene,
        `zombie_${i}`,
        this.game.level,
      );
      this.zombies.push(zombie);
    }

    // Also create zombie dogs starting from level 2
    this.createZombieDogs();

    // Create Monsters (Special Enemy)
    this.createMonsters();
  }

  /**
   * Create zombie dogs for the level
   */
  createZombieDogs() {
    // Clear existing zombie dogs
    this.zombieDogs.forEach((d) => d.dispose());
    this.zombieDogs = [];

    // Zombie dogs appear from level 2, count scales with level
    const dogCount = GameRules.getZombieDogCount(this.game.level);
    if (dogCount === 0) return;
    const usedPositions = new Set();

    // Avoid player start and goal
    const playerStartX = this.game.MAZE_SIZE - 1;
    const playerStartZ = this.game.MAZE_SIZE - 1;
    const goalX = 0;
    const goalZ = 0;
    const minDistanceFromStart = Math.max(
      4,
      Math.floor(this.game.MAZE_SIZE / 3),
    );

    for (let i = 0; i < dogCount; i++) {
      let attempts = 0;
      let validPosition = false;
      let x, z;

      while (!validPosition && attempts < 50) {
        // Dogs spawn more toward the middle of the maze for patrol
        x = Math.floor(Math.random() * (this.game.MAZE_SIZE - 2)) + 1;
        z = Math.floor(Math.random() * (this.game.MAZE_SIZE - 2)) + 1;

        const posKey = `${x},${z}`;
        const distanceFromStart =
          Math.abs(x - playerStartX) + Math.abs(z - playerStartZ);
        const isAtGoal = x === goalX && z === goalZ;
        const isAtStart = x === playerStartX && z === playerStartZ;

        if (
          !usedPositions.has(posKey) &&
          !isAtGoal &&
          !isAtStart &&
          distanceFromStart >= minDistanceFromStart
        ) {
          validPosition = true;
          usedPositions.add(posKey);
        }

        attempts++;
      }

      if (!validPosition) {
        // Fallback to center-ish positions
        x = Math.floor(this.game.MAZE_SIZE / 2) + (i % 2 === 0 ? -2 : 2);
        z = Math.floor(this.game.MAZE_SIZE / 2) + (i % 2 === 0 ? 2 : -2);
        x = Math.max(1, Math.min(this.game.MAZE_SIZE - 2, x));
        z = Math.max(1, Math.min(this.game.MAZE_SIZE - 2, z));
      }

      const dog = new ZombieDog(
        x,
        z,
        this.game.maze,
        this.game.CELL_SIZE,
        this.game.MAZE_SIZE,
        this.game.scene,
        this.game.level,
      );
      this.zombieDogs.push(dog);
    }
  }

  /**
   * Create special monster enemies
   */
  createMonsters() {
    // Clear existing monsters
    this.monsters.forEach((m) => m.dispose());
    this.monsters = [];

    // Spawn 1 Monster per level, max 5 (Very dangerous)
    const count = Math.min(Math.floor(this.game.level / 2) + 1, 5);

    const usedPositions = new Set();

    for (let i = 0; i < count; i++) {
      let x, z;
      let attempts = 0;
      let valid = false;

      while (!valid && attempts < 50) {
        x = Math.floor(Math.random() * this.game.MAZE_SIZE);
        z = Math.floor(Math.random() * this.game.MAZE_SIZE);

        // Check distance from player start (bottom right)
        const dist =
          Math.abs(x - (this.game.MAZE_SIZE - 1)) +
          Math.abs(z - (this.game.MAZE_SIZE - 1));

        if (dist > 5 && !usedPositions.has(`${x},${z}`)) {
          valid = true;
          usedPositions.add(`${x},${z}`);
        }
        attempts++;
      }

      if (valid) {
        const monster = new Monster(
          x,
          z,
          this.game.maze,
          this.game.CELL_SIZE,
          this.game.MAZE_SIZE,
          this.game.scene,
          this.game.level,
          this.game, // Pass game instance
        );
        this.monsters.push(monster);
      }
    }
  }

  /**
   * Spawn zombie horde - triggered during darkness event
   */
  spawnZombieHorde() {
    if (this.hordeSpawned) return;
    this.hordeSpawned = true;

    this.game.ui.showToast("💀 ZOMBIE HORDE INCOMING!", "warning");
    this.game.cameraShake = 1.5;

    // Vibration feedback
    if (this.game.gameData.getSetting("vibration") && navigator.vibrate) {
      navigator.vibrate([100, 50, 100, 50, 200]);
    }

    // Find spawn positions far from player
    const hordeConfig = GameRules.getHordeConfig(this.game.level);
    const totalNeeded =
      hordeConfig.bossCount + hordeConfig.zombieCount + hordeConfig.dogCount;
    const spawnPositions = this.findHordeSpawnPositions(totalNeeded);

    if (spawnPositions.length < 1) {
      console.warn("Could not find spawn positions for horde");
      return;
    }

    // Spawn Bosses - Add to Queue
    const bossCount = hordeConfig.bossCount;

    for (let i = 0; i < bossCount && i < spawnPositions.length; i++) {
      const bossPos = spawnPositions[i];
      this.spawnQueue.push({
        type: "boss",
        x: bossPos.x,
        z: bossPos.z,
      });
    }

    // Adjust start index for next loop
    const startIndex = bossCount;

    // Spawn horde zombies - Add to Queue
    for (
      let i = startIndex;
      i < Math.min(startIndex + hordeConfig.zombieCount, spawnPositions.length);
      i++
    ) {
      const pos = spawnPositions[i];
      this.spawnQueue.push({
        type: "zombie",
        x: pos.x,
        z: pos.z,
        corner: i % 4,
      });
    }

    // Spawn horde dogs - Add to Queue
    for (
      let i = startIndex + hordeConfig.zombieCount;
      i <
      Math.min(
        startIndex + hordeConfig.zombieCount + hordeConfig.dogCount,
        spawnPositions.length,
      );
      i++
    ) {
      const pos = spawnPositions[i];
      this.spawnQueue.push({
        type: "dog",
        x: pos.x,
        z: pos.z,
      });
    }
  }

  /**
   * Process the spawn queue - 1 entity per frame to prevent lag spikes
   */
  processSpawnQueue() {
    if (!this.spawnQueue || this.spawnQueue.length === 0) return;

    // Process up to 2 entities per frame
    const batchSize = 2;
    for (let i = 0; i < batchSize && this.spawnQueue.length > 0; i++) {
      const task = this.spawnQueue.shift();
      this.spawnEntity(task);
    }
  }

  /**
   * Spawn a single entity from queue
   */
  spawnEntity(task) {
    if (task.type === "boss") {
      const boss = new BossZombie(
        task.x,
        task.z,
        this.game.maze,
        this.game.CELL_SIZE,
        this.game.MAZE_SIZE,
        this.game.scene,
        this.game.level,
      );
      boss.isHordeBoss = true;
      boss.isPersistent = false;
      if (boss.mesh) {
        boss.mesh.userData.isHordeBoss = true;
        // Traverse and clone material before modifying to avoid affecting shared cache
        boss.mesh.traverse((child) => {
          if (child.isMesh && child.material && child.material.emissive) {
            const hordeMat = child.material.clone();
            hordeMat.emissiveIntensity = 0.6; // Brighter glow
            child.material = hordeMat;
          }
        });
      }
      if (boss.eyeGlow) {
        boss.eyeGlow.intensity = 2.0;
        boss.eyeGlow.distance = 8;
      }
      this.game.scene.add(boss.mesh);
      this.bossZombies.push(boss);

      // Play Spawn Sound for Horde Boss
      if (this.game.audioManager) {
        this.game.audioManager.playBossSpawn();
      }
    } else if (task.type === "zombie") {
      const zombie = new Zombie(
        task.x,
        task.z,
        this.game.maze,
        this.game.CELL_SIZE,
        this.game.MAZE_SIZE,
        this.game.scene,
        task.corner,
        this.game.level,
      );
      zombie.chaseRange = this.game.MAZE_SIZE;
      zombie.isHordeZombie = true;
      zombie.moveInterval = Math.max(10, Math.floor(zombie.moveInterval * 0.7));

      // VISUAL DISTINCTION: Clone and modify material
      if (zombie.mesh) {
        zombie.mesh.userData.isHordeZombie = true;
        zombie.mesh.traverse((child) => {
          // Target specific parts that use the body material
          if (child.isMesh && child.name !== "jaw" && child.name !== "neck") {
            if (child.material && child.material.emissive) {
              // Clone material so we don't change ALL zombies
              const hordeMat = child.material.clone();
              hordeMat.emissive.setHex(0x660000); // Dark red glow
              hordeMat.emissiveIntensity = 0.4;
              child.material = hordeMat;
            }
          }
        });
      }

      this.hordeZombies.push(zombie);
    } else if (task.type === "dog") {
      const dog = new ZombieDog(
        task.x,
        task.z,
        this.game.maze,
        this.game.CELL_SIZE,
        this.game.MAZE_SIZE,
        this.game.scene,
        this.game.level,
      );
      dog.chaseRange = this.game.MAZE_SIZE;
      dog.isHordeDog = true;
      dog.moveInterval = Math.max(8, Math.floor(dog.moveInterval * 0.8));

      // VISUAL DISTINCTION: Clone and modify material
      if (dog.mesh) {
        dog.mesh.userData.isHordeDog = true;
        dog.mesh.traverse((child) => {
          if (child.isMesh && child.material && child.material.emissive) {
            // Clone material so we don't change ALL dogs
            const hordeMat = child.material.clone();
            hordeMat.emissive.setHex(0x440000); // Red tint
            hordeMat.emissiveIntensity = 0.3;
            child.material = hordeMat;
          }
        });
      }
      this.hordeDogs.push(dog);
    }
  }

  /**
   * Find valid spawn positions for horde (far from player)
   */
  findHordeSpawnPositions(count) {
    const positions = [];
    let minDistanceFromPlayer = Math.floor(this.game.MAZE_SIZE / 3);

    // Attempt 1: Strict distance
    let attempts = 0;
    while (positions.length < count && attempts < 200) {
      this._tryAddSpawnPosition(positions, minDistanceFromPlayer);
      attempts++;
    }

    // Attempt 2: Relaxed distance (half range)
    if (positions.length < count) {
      minDistanceFromPlayer = Math.floor(this.game.MAZE_SIZE / 6);
      attempts = 0;
      while (positions.length < count && attempts < 200) {
        this._tryAddSpawnPosition(positions, minDistanceFromPlayer);
        attempts++;
      }
    }

    // Attempt 3: Desperate (any empty spot)
    if (positions.length < count) {
      minDistanceFromPlayer = 2; // Just not ON the player
      attempts = 0;
      while (positions.length < count && attempts < 200) {
        this._tryAddSpawnPosition(positions, minDistanceFromPlayer);
        attempts++;
      }
    }

    if (positions.length === 0) {
      console.warn(
        "CRITICAL: Failed to find ANY spawn positions even after fallback.",
      );
    } else if (positions.length < count) {
      console.warn(
        `Partial spawn: Found ${positions.length}/${count} positions.`,
      );
    }

    return positions;
  }

  /**
   * Helper to try adding a spawn position
   */
  _tryAddSpawnPosition(positions, minDistance) {
    const x = Math.floor(Math.random() * this.game.MAZE_SIZE);
    const z = Math.floor(Math.random() * this.game.MAZE_SIZE);

    // Check distance from player
    const distFromPlayer =
      Math.abs(x - this.playerPos.x) + Math.abs(z - this.playerPos.z);
    if (distFromPlayer < minDistance) return false;

    // Check not too close to other spawn positions
    const tooClose = positions.some(
      (p) => Math.abs(p.x - x) + Math.abs(p.z - z) < 1, // Relaxed inter-spawn distance
    );
    if (tooClose) return false;

    positions.push({ x, z });
    return true;
  }

  /**
   * Despawn all horde entities when darkness ends
   */
  despawnHorde(keepPersistent = false) {
    // Dispose boss zombies
    if (keepPersistent) {
      this.bossZombies = this.bossZombies.filter((boss) => {
        if (boss.isPersistent) {
          return true;
        }
        boss.dispose();
        return false;
      });
    } else {
      this.bossZombies.forEach((boss) => boss.dispose());
      this.bossZombies = [];
    }

    // Dispose horde zombies
    const hordeZombieCount = this.hordeZombies.length;
    this.hordeZombies.forEach((zombie) => {
      zombie.dispose();
    });
    this.hordeZombies = [];

    // Dispose horde dogs
    const hordeDogCount = this.hordeDogs.length;
    this.hordeDogs.forEach((dog) => {
      dog.dispose();
    });
    this.hordeDogs = [];

    // Reset horde spawned flag
    this.hordeSpawned = false;
  }

  /**
   * Zombie surge - zombies move faster temporarily
   */
  triggerZombieSurge() {
    this.game.ui.showToast("ZOMBIE SURGE! They're faster!", "warning");

    // Already handled by zombie chase behavior
    this.zombies.forEach((z) => {
      z.isChasing = true;
      z.chaseTarget = { x: this.playerPos.x, z: this.playerPos.z };
    });

    setTimeout(() => {
      this.zombies.forEach((z) => {
        z.isChasing = false;
      });
      this.game.ui.showToast("Zombies calmed down", "check_circle");
    }, 4000);
  }

  /**
   * Update all entities each frame
   */
  updateEntities(smoothDelta) {
    // Increment frame counter for logic distribution
    this.frameCounter = (this.frameCounter || 0) + 1;

    // Update player (Always update)
    if (this.player) {
      this.player.update(smoothDelta);
    }

    // Update zombie AI (freeze if time freeze is active)
    if (!this.game.isTimeFreezeActive) {
      const px = this.playerPos.x;
      const pz = this.playerPos.z;
      const isBoost = this.game.isLightBoostActive;

      // Helper function for throttled updates
      const updateEntityThrottled = (entity, index) => {
        // Calculate Manhattan distance to player
        const dist = Math.abs(entity.gridX - px) + Math.abs(entity.gridZ - pz);

        let throttle = 1;
        if (dist > 45)
          throttle = 4; // Very far: 15fps logic
        else if (dist > 25) throttle = 2; // Far: 30fps logic

        // Distribute load based on index
        if ((this.frameCounter + index) % throttle === 0) {
          // Apply skipped time to timers so movement speed remains consistent
          // Zombies/Dogs use moveCounter logic
          if (entity.moveCounter !== undefined) {
            entity.moveCounter += throttle - 1;
          }
          // Bosses/Monsters use moveTimer logic
          if (entity.moveTimer !== undefined) {
            entity.moveTimer += throttle - 1;
          }

          entity.setPlayerPosition(px, pz, isBoost);

          // Pass accumulated time for smooth movement interpolation
          entity.update(smoothDelta * throttle);
        }
      };

      this.zombies.forEach(updateEntityThrottled);
      this.zombieDogs.forEach(updateEntityThrottled);

      // === BOSS ZOMBIES (Always update if present) ===
      this.bossZombies.forEach((boss, i) => {
        // Bosses deserve higher priority, throttle less aggressively
        // But logic is identical, maybe enforce throttle=1 for bosses nearby
        const dist = Math.abs(boss.gridX - px) + Math.abs(boss.gridZ - pz);
        let throttle = 1;
        if (dist > 50) throttle = 2; // Only throttle if practically off-map

        if ((this.frameCounter + i) % throttle === 0) {
          if (boss.moveTimer !== undefined) boss.moveTimer += throttle - 1;
          boss.setPlayerPosition(px, pz, isBoost);
          boss.update(smoothDelta * throttle);
        }
      });

      // === MONSTERS ===
      this.monsters.forEach(updateEntityThrottled);

      // === HORDE ENTITIES ===
      this.hordeZombies.forEach(updateEntityThrottled);
      this.hordeDogs.forEach(updateEntityThrottled);
    }

    // Clean up dead entities
    this._cleanupDeadEntities();
  }

  /**
   * Helper to remove dead entities from arrays
   */
  _cleanupDeadEntities() {
    // Remove dead regular zombies
    this.zombies = this.zombies.filter((z) => {
      if (z.isDead) {
        z.dispose();
        return false;
      }
      return true;
    });

    // Remove dead zombie dogs
    this.zombieDogs = this.zombieDogs.filter((d) => {
      if (d.isDead) {
        d.dispose();
        return false;
      }
      return true;
    });

    // Remove dead bosses
    this.bossZombies = this.bossZombies.filter((b) => {
      if (b.isDead) {
        b.dispose();
        return false;
      }
      return true;
    });

    // Remove dead monsters
    this.monsters = this.monsters.filter((m) => {
      if (m.isDead) {
        m.dispose();
        return false;
      }
      return true;
    });

    // Remove dead horde entities
    this.hordeZombies = this.hordeZombies.filter((hz) => {
      if (hz.isDead) {
        hz.dispose();
        return false;
      }
      return true;
    });

    this.hordeDogs = this.hordeDogs.filter((hd) => {
      if (hd.isDead) {
        hd.dispose();
        return false;
      }
      return true;
    });
  }

  /**
   * Dispose all entities and cleanup
   */
  dispose() {
    // Dispose player
    if (this.player) {
      this.player.dispose?.();
      this.player = null;
      this.playerMesh = null;
    }

    // Dispose all zombies
    this.zombies.forEach((z) => z.dispose?.());
    this.zombies = [];

    // Dispose all zombie dogs
    this.zombieDogs.forEach((d) => d.dispose?.());
    this.zombieDogs = [];

    // Dispose all bosses
    this.bossZombies.forEach((b) => b.dispose?.());
    this.bossZombies = [];

    // Dispose all monsters
    this.monsters.forEach((m) => m.dispose?.());
    this.monsters = [];

    // Dispose horde entities
    this.hordeZombies.forEach((hz) => hz.dispose?.());
    this.hordeZombies = [];

    this.hordeDogs.forEach((hd) => hd.dispose?.());
    this.hordeDogs = [];

    // Clear spawn queue
    this.spawnQueue = [];
  }
}
