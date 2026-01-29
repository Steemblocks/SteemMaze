/**
 * CollectibleManager Class
 * Handles all collectible management: gems, coins, power-ups
 * Handles creation, updates, and collection detection for all collectible items
 * Extracted from Game.js for better code organization
 */

import * as THREE from "three";
import { animationCache } from "../../animation-cache.js";
import { GameRules } from "./GameRules.js";

export class CollectibleManager {
  constructor(game) {
    this.game = game; // Reference to parent Game instance for scene/renderer access

    // Collectible arrays
    this.gems = []; // Array of gem meshes
    this.coins = []; // Array of coin data objects
    this.coinsMesh = null; // Instanced mesh for coins (performance)
    this.powerUps = []; // Array of power-up meshes

    // NOTE: Counters stay in Game.js for scoring purposes (gemsCollected, coinsCollected, powerUpsUsed)
  }

  /**
   * Create all gems in the maze
   */
  createGems() {
    // Clear existing gems
    this.gems.forEach((g) => this.game.scene.remove(g));
    this.gems = [];

    // Number of gems scales with level (more gems = more challenge to collect all)
    const gemCount = Math.min(3 + Math.floor(this.game.level / 2), 10);
    const offset =
      -(this.game.MAZE_SIZE * this.game.CELL_SIZE) / 2;

    // Place gems at random maze cells (not start or goal)
    const usedCells = new Set();
    usedCells.add(`0,0`); // Goal
    usedCells.add(
      `${this.game.MAZE_SIZE - 1},${this.game.MAZE_SIZE - 1}`,
    ); // Start

    for (let i = 0; i < gemCount; i++) {
      let x, z;
      let key;
      let attempts = 0;
      do {
        x = Math.floor(Math.random() * this.game.MAZE_SIZE);
        z = Math.floor(Math.random() * this.game.MAZE_SIZE);
        key = `${x},${z}`;
        attempts++;
      } while (usedCells.has(key) && attempts < 50);

      if (attempts >= 50) continue;
      usedCells.add(key);

      // Create gem mesh using cached material
      const gemGeo = new THREE.OctahedronGeometry(0.35, 0);
      const gemMat = animationCache.getMaterial(
        "gem",
        () =>
          new THREE.MeshStandardMaterial({
            color: 0xa855f7, // Purple
            emissive: 0xa855f7,
            emissiveIntensity: 1.5,
            metalness: 0.9,
            roughness: 0.1,
            transparent: true,
            opacity: 0.9,
          }),
      );
      const gem = new THREE.Mesh(gemGeo, gemMat);

      gem.position.set(
        offset + x * this.game.CELL_SIZE + this.game.CELL_SIZE / 2,
        1,
        offset + z * this.game.CELL_SIZE + this.game.CELL_SIZE / 2,
      );

      // Store grid position for collision detection
      gem.userData = { gridX: x, gridZ: z, collected: false };

      // Add glow effect
      gem.add(new THREE.PointLight(0xa855f7, 0.8, 6));

      this.game.scene.add(gem);
      this.gems.push(gem);
    }
  }

  /**
   * Create all coins in the maze (instanced rendering for performance)
   */
  createCoins() {
    // Clean up old instances
    if (this.coinsMesh) {
      this.game.scene.remove(this.coinsMesh);
      if (this.coinsMesh.geometry) this.coinsMesh.geometry.dispose();
      if (this.coinsMesh.material) this.coinsMesh.material.dispose();
      this.coinsMesh = null;
    }
    this.coins = [];

    const count = Math.floor(this.game.MAZE_SIZE * 0.8) + this.game.level; // Scale with size
    const offset =
      -(this.game.MAZE_SIZE * this.game.CELL_SIZE) / 2;

    // Simple gold material
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0xaa6600,
      emissiveIntensity: 0.2,
    });
    const geo = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16);

    // Create InstancedMesh
    this.coinsMesh = new THREE.InstancedMesh(geo, mat, count);
    this.coinsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coinsMesh.castShadow = true;
    this.coinsMesh.receiveShadow = true;
    this.game.scene.add(this.coinsMesh);

    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = Math.floor(Math.random() * this.game.MAZE_SIZE);
      const z = Math.floor(Math.random() * this.game.MAZE_SIZE);

      const posX = offset + x * this.game.CELL_SIZE + this.game.CELL_SIZE / 2;
      const posZ = offset + z * this.game.CELL_SIZE + this.game.CELL_SIZE / 2;
      const posY = 1.0;

      dummy.position.set(posX, posY, posZ);
      dummy.rotation.z = Math.PI / 2; // Stand vertically
      dummy.updateMatrix();

      this.coinsMesh.setMatrixAt(i, dummy.matrix);

      // Store data for logic
      this.coins.push({
        index: i,
        gridX: x,
        gridZ: z,
        position: new THREE.Vector3(posX, posY, posZ),
        collecting: false,
        active: true,
      });
    }

    this.coinsMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Create all power-ups in the maze
   */
  createPowerUps() {
    // Clear existing power-ups
    this.powerUps.forEach((p) => this.game.scene.remove(p));
    this.powerUps = [];

    // Power-ups appear starting at level 2
    if (this.game.level < 2) return;

    // Number of power-ups (1-2 based on level)
    const powerUpCount = Math.min(1 + Math.floor(this.game.level / 4), 2);
    const offset =
      -(this.game.MAZE_SIZE * this.game.CELL_SIZE) / 2;

    // Track used cells
    const usedCells = new Set();
    usedCells.add(`0,0`); // Goal
    usedCells.add(
      `${this.game.MAZE_SIZE - 1},${this.game.MAZE_SIZE - 1}`,
    ); // Start

    // Add gem positions to avoid
    this.gems.forEach((gem) => {
      usedCells.add(`${gem.userData.gridX},${gem.userData.gridZ}`);
    });

    const powerUpTypes = ["shield", "speed", "freeze"];

    for (let i = 0; i < powerUpCount; i++) {
      let x, z, key;
      let attempts = 0;
      do {
        x = Math.floor(Math.random() * this.game.MAZE_SIZE);
        z = Math.floor(Math.random() * this.game.MAZE_SIZE);
        key = `${x},${z}`;
        attempts++;
      } while (usedCells.has(key) && attempts < 50);

      if (attempts >= 50) continue;
      usedCells.add(key);

      const type =
        powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
      const powerUp = this.createPowerUpMesh(type);

      powerUp.position.set(
        offset + x * this.game.CELL_SIZE + this.game.CELL_SIZE / 2,
        1.2,
        offset + z * this.game.CELL_SIZE + this.game.CELL_SIZE / 2,
      );

      powerUp.userData = {
        gridX: x,
        gridZ: z,
        type: type,
        collected: false,
      };

      this.game.scene.add(powerUp);
      this.powerUps.push(powerUp);
    }
  }

  /**
   * Create power-up mesh based on type
   */
  createPowerUpMesh(type) {
    let geo, mat, color;

    switch (type) {
      case "shield":
        geo = new THREE.TorusGeometry(0.3, 0.1, 8, 16);
        color = 0x3b82f6; // Blue
        break;
      case "speed":
        geo = new THREE.TetrahedronGeometry(0.25);
        color = 0xfbbf24; // Yellow
        break;
      case "freeze":
        geo = new THREE.IcosahedronGeometry(0.25);
        color = 0x06b6d4; // Cyan
        break;
      default:
        geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        color = 0xffffff;
    }

    mat = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 1.0,
      metalness: 0.7,
      roughness: 0.3,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Check for gem collection at player position
   */
  checkGemCollection() {
    const { x, z } = this.game.entityManager.playerPos;

    this.gems.forEach((gem) => {
      if (gem.userData.collected) return;
      if (gem.userData.gridX === x && gem.userData.gridZ === z) {
        gem.userData.collected = true;
        this.game.scoringSystem.recordGemCollection();

        // Particle burst effect at gem location
        if (this.game.particleTrail) {
          this.game.particleTrail.burst(gem.position, 20, 0xa855f7);
        }

        // Visual Feedback
        this.game.showFloatingText(gem.position, "+1 Life", "#a855f7");

        // Smooth collection animation - gem flies up and fades out
        const startY = gem.position.y;
        const startScale = gem.scale.x;
        const startTime = Date.now();
        const duration = 300; // 300ms animation

        const animateCollection = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);

          // Ease out curve
          const eased = 1 - Math.pow(1 - progress, 3);

          // Fly up and scale up slightly then shrink
          gem.position.y = startY + eased * 2;
          gem.rotation.y += 0.15; // Fast spin during collection

          if (progress < 0.5) {
            // Scale up first half
            gem.scale.setScalar(startScale * (1 + eased * 0.5));
          } else {
            // Scale down second half
            gem.scale.setScalar(startScale * (1.25 - (eased - 0.5) * 2.5));
          }

          if (progress < 1) {
            requestAnimationFrame(animateCollection);
          } else {
            // Remove after animation complete
            this.game.scene.remove(gem);
          }
        };

        animateCollection();

        // Give player an extra life when collecting gem
        this.game.addLife();

        // Show toast for gem with life bonus
        this.game.ui.showToast(
          `✨ Gem Collected! +1 Life (${this.game.gemsCollected}/${this.gems.length})`,
          "favorite",
        );

        // AUDIO: Play gem collect sound
        if (this.game.audioManager)
          this.game.audioManager.playGem();

        // Vibration feedback
        if (
          this.game.gameData.getSetting("vibration") &&
          navigator.vibrate
        )
          navigator.vibrate([10, 30, 10]);
      }
    });
  }

  /**
   * Check for coin collection at player position (with magnet support)
   */
  checkCoinCollection() {
    const { x, z } = this.game.entityManager.playerPos;

    // Magnet range - attracts coins from nearby cells
    const magnetRange = this.game.isMagnetActive ? 2 : 0;
    const dummy = new THREE.Object3D();

    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coinData = this.coins[i];
      if (!coinData.active || coinData.collecting) continue;

      const coinX = coinData.gridX;
      const coinZ = coinData.gridZ;

      // Check if within collection/magnet range
      const distance = Math.abs(coinX - x) + Math.abs(coinZ - z);

      if (distance <= magnetRange || (coinX === x && coinZ === z)) {
        // Mark as being collected and inactive - this coin will be skipped in updateCoins
        coinData.collecting = true;
        coinData.active = false;

        // Immediately hide this coin by setting it to zero scale
        const hideDummy = new THREE.Object3D();
        hideDummy.scale.set(0, 0, 0);
        hideDummy.updateMatrix();
        
        if (this.coinsMesh) {
          this.coinsMesh.setMatrixAt(coinData.index, hideDummy.matrix);
          this.coinsMesh.instanceMatrix.needsUpdate = true;
        }

        // SPAWN TEMPORARY VISUAL COIN for the collection animation
        const tempGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16);
        const tempMat = new THREE.MeshStandardMaterial({
          color: 0xffd700,
          metalness: 0.8,
          roughness: 0.2,
          emissive: 0xaa6600,
          emissiveIntensity: 0.2,
        });
        const visualCoin = new THREE.Mesh(tempGeo, tempMat);
        visualCoin.position.copy(coinData.position);
        visualCoin.rotation.z = Math.PI / 2;
        this.game.scene.add(visualCoin);

        // Animate the visual coin - fly up and fade out
        const startY = visualCoin.position.y;
        const startTime = Date.now();
        const duration = 500; // 500ms animation

        const animateVisualCoin = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);

          // Ease out curve
          const eased = 1 - Math.pow(1 - progress, 3);

          // Move up
          visualCoin.position.y = startY + eased * 2;
          visualCoin.rotation.z = Math.PI / 2;
          visualCoin.rotation.x += 0.1; // Spin effect

          if (progress < 1) {
            requestAnimationFrame(animateVisualCoin);
          } else {
            // Remove coin mesh after animation
            this.game.scene.remove(visualCoin);
            if (tempGeo) tempGeo.dispose();
            if (tempMat) tempMat.dispose();
          }
        };

        animateVisualCoin();

        // Visual Feedback: Floating Text
        this.game.showFloatingText(
          coinData.position,
          `+${GameRules.COIN_VALUE}`,
          "#ffd700",
        );

        // Update Stats immediately
        this.game.totalCoins += GameRules.COIN_VALUE;
        this.game.scoringSystem.recordCoinCollection();

        // Update UI
        const coinEl = document.getElementById("coinsDisplay");
        if (coinEl) coinEl.textContent = this.game.totalCoins;
        this.game.ui.showToast(
          `+${GameRules.COIN_VALUE} Coins`,
          "monetization_on",
        );

        // Particle effect
        if (this.game.particleTrail) {
          this.game.particleTrail.burst(coinData.position, 5, 0xffd700);
        }

        // AUDIO: Play coin sound
        if (this.game.audioManager) this.game.audioManager.playCoin();

        // Vibration feedback
        if (
          this.game.gameData.getSetting("vibration") &&
          navigator.vibrate
        ) {
          navigator.vibrate(GameRules.VIBRATION_COLLECT);
        }
      }
    }
  }

  /**
   * Update power-up timers and animations
   */
  updatePowerUps() {
    // Delegate timer update to PowerUpSystem
    this.game.powerUpSystem.updateTimer();

    // Animate power-ups
    this.powerUps.forEach((powerUp) => {
      if (!powerUp.userData.collected) {
        powerUp.rotation.y += 0.03;
        powerUp.position.y = 1.2 + Math.sin(Date.now() * 0.003) * 0.2;
      }
    });
  }

  /**
   * Deactivate current power-up - delegated to Game
   */
  deactivatePowerUp() {
    // Delegate to Game which has all the power-up state logic
    return this.game.deactivatePowerUp();
  }

  /**
   * Update coin animations (stationary rotation like Earth spinning on its axis)
   */
  updateCoins() {
    if (!this.coins || !this.coinsMesh) return;

    const dummy = new THREE.Object3D();
    const time = Date.now() * 0.001; // Time factor for rotation

    this.coins.forEach((c) => {
      // If collected/inactive, hide it with zero scale
      if (!c.active) {
        dummy.scale.set(0, 0, 0);
        dummy.position.set(0, 0, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        this.coinsMesh.setMatrixAt(c.index, dummy.matrix);
        return;
      }

      // IMPORTANT: Reset scale to 1 for active coins
      dummy.scale.set(1, 1, 1);

      // Set position to stationary location (no orbital movement)
      dummy.position.copy(c.position);

      // Rotate the coin on its own axis (like Earth rotating)
      // Rotation speed: 1 radian per second
      const spinAngle = time * 1.0;
      dummy.rotation.set(0.3, spinAngle, Math.PI / 2);

      dummy.updateMatrix();
      this.coinsMesh.setMatrixAt(c.index, dummy.matrix);
    });

    this.coinsMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Animate gems in the scene (rotation and bobbing using wave)
   * @param {number} smoothDelta - Delta time for smooth animation
   */
  animateGems(smoothDelta) {
    if (!this.gems) return;
    
    const gemRotSpeed = smoothDelta * 1.2;
    this.gems.forEach((gem) => {
      gem.rotation.y += gemRotSpeed;
      gem.position.y =
        1 + this.game.animationCache?.getWave(0.5, 0.15, gem.userData.gridX) || 1;
    });
  }

  /**
   * Dispose all collectibles and cleanup resources
   */
  dispose() {
    // Dispose gems
    this.gems.forEach((gem) => {
      if (gem.geometry) gem.geometry.dispose();
      if (gem.material) gem.material.dispose();
      if (gem.children) {
        gem.children.forEach((child) => {
          if (child instanceof THREE.Light) child.dispose?.();
        });
      }
    });
    this.gems = [];

    // Dispose coins mesh
    if (this.coinsMesh) {
      if (this.coinsMesh.geometry) this.coinsMesh.geometry.dispose();
      if (this.coinsMesh.material) this.coinsMesh.material.dispose();
      this.coinsMesh = null;
    }
    this.coins = [];

    // Dispose power-ups
    this.powerUps.forEach((powerUp) => {
      if (powerUp.geometry) powerUp.geometry.dispose();
      if (powerUp.material) powerUp.material.dispose();
    });
    this.powerUps = [];
  }
}
