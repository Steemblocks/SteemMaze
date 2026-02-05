/**
 * FrameUpdater.js
 * Manages game loop, animations, and frame-based updates
 * Handles: requestAnimationFrame loop, delta time, entity/effects updates, ambient sounds, data refresh
 */

import { animationCache } from "../../animation-cache.js";
import { BigfootBoss } from "../entities/BigfootBoss.js";
import { steemIntegration } from "../steem/index.js";
import * as THREE from "three";

export class FrameUpdater {
  constructor(game) {
    this.game = game;
    this.autoRefreshInterval = null;
    this.lastAmbientSoundTime = 0;
  }

  /**
   * Main animation loop - runs every frame with requestAnimationFrame
   * Handles camera updates, entity animation, effects, and rendering
   */
  animate() {
    requestAnimationFrame((time) => {
      // Update animation cache timing
      animationCache.updateFrameTiming(time);
      this.animate();
    });

    // Skip if not on game screen or player not ready
    if (!this.game.playerMesh || this.game.ui.currentScreen !== "gameScreen")
      return;

    // Get delta time for frame-rate independent animations
    const deltaTime = animationCache.deltaTime || 0.016;
    const smoothDelta = Math.min(deltaTime, 0.05); // Cap delta to prevent jumps

    // === PLAYER ANIMATION (Updated FIRST for Camera Sync) ===
    // Critical Fix: Update player position BEFORE camera tracks it
    // This prevents 1-frame lag which causes "wobble" or "sliding ground"
    if (this.game.player) {
      this.game.player.update(smoothDelta);
    }

    // === CHECK IF PLAYER IS MOVING ===
    // (Logic removed: Camera handling delegated entirely to CameraController for consistency)

    if (this.game.cameraController) {
      // Player idle AND CameraController exists: use it normally
      this.game.cameraController.setPlayerPosition(
        this.game.playerMesh.position,
      );

      // Apply camera shake from game events only if setting enabled
      if (this.game.cameraShake > 0) {
        const shakeEnabled = this.game.gameData.getSetting("cameraShake");
        if (shakeEnabled) {
          this.game.cameraController.shake(this.game.cameraShake, 0.2);
        }
        this.game.cameraShake = Math.max(
          0,
          this.game.cameraShake - smoothDelta * 3,
        );
      }

      // Update camera with mouse offset for interactive feel
      this.game.cameraController.update({
        x: this.game.mouseX,
        y: this.game.mouseY,
      });
    } else {
      // Player idle AND no CameraController: use legacy system
      let targetCamX = this.game.playerMesh.position.x + this.game.mouseX * 1.0;
      let targetCamZ =
        this.game.playerMesh.position.z + 14 + this.game.mouseY * 1.0;
      let targetCamY = 22;

      if (this.game.cameraShake > 0) {
        const shakeEnabled = this.game.gameData.getSetting("cameraShake");
        if (shakeEnabled) {
          const shakeIntensity = this.game.cameraShake * 0.5;
          targetCamX += (Math.random() - 0.5) * shakeIntensity;
          targetCamZ += (Math.random() - 0.5) * shakeIntensity;
        }
        this.game.cameraShake = Math.max(
          0,
          this.game.cameraShake - smoothDelta * 3,
        );
      }

      const camSpeedSetting = this.game.gameData.getSetting("cameraSpeed") || 5;
      const baseSpeed = Math.min((camSpeedSetting / 100) * 1.2, 0.15);
      const lerpFactor = 1 - Math.pow(1 - baseSpeed, smoothDelta * 60);

      this.game.camera.position.x +=
        (targetCamX - this.game.camera.position.x) * lerpFactor;
      this.game.camera.position.y +=
        (targetCamY - this.game.camera.position.y) * lerpFactor;
      this.game.camera.position.z +=
        (targetCamZ - this.game.camera.position.z) * lerpFactor;

      const lookAheadX = this.game.playerMesh.position.x;
      const lookAheadY = 0.5;
      const lookAheadZ = this.game.playerMesh.position.z - 5;

      if (!this.game.cameraCurrentLookAt) {
        this.game.cameraCurrentLookAt = new THREE.Vector3(
          lookAheadX,
          lookAheadY,
          lookAheadZ,
        );
      }

      const targetLookAt = new THREE.Vector3(
        lookAheadX,
        lookAheadY,
        lookAheadZ,
      );

      this.game.cameraCurrentLookAt.lerp(targetLookAt, 0.06);
      this.game.camera.lookAt(this.game.cameraCurrentLookAt);
    }

    // === CHECK IF PLAYER IS MOVING ===

    // === COLLECTIBLES ANIMATION (delta-time based) ===
    // Goal animation using cached waves
    // Goal animation (3D Portal)
    if (this.game.goal) {
      // Bob entire goal slightly
      this.game.goal.position.y = 1.5 + Math.sin(Date.now() * 0.002) * 0.1;

      // === AMBIENT SOUNDS ===
      this.updateAmbientSounds();

      // Animate parts
      if (this.game.portalParts) {
        this.game.portalParts.forEach((part) => {
          if (part.mesh) {
            // Generic axis rotation
            if (part.axis === "x")
              part.mesh.rotation.x += smoothDelta * part.speed;
            else if (part.axis === "y")
              part.mesh.rotation.y += smoothDelta * part.speed;
            else if (part.axis === "z")
              part.mesh.rotation.z += smoothDelta * part.speed;
            // Legacy fallbacks (if axis not specified)
            else if (part.isParticles) {
              part.mesh.rotation.y += smoothDelta * part.speed;
              part.mesh.rotation.z += smoothDelta * 0.2;
            } else {
              part.mesh.rotation.z += smoothDelta * part.speed;
            }
          }
          if (part.light) {
            part.light.intensity =
              part.baseIntensity + Math.sin(Date.now() * 0.005) * 0.5;
          }
        });
      } else {
        // Fallback for old goal style if portalParts missing
        this.game.goal.rotation.y += smoothDelta * 1.2;
        this.game.goal.rotation.x += smoothDelta * 0.6;
      }
    }

    // Gem animation - delegated to CollectibleManager
    if (this.game.collectibleManager) {
      this.game.collectibleManager.animateGems(smoothDelta);
    }

    // === SPAWN QUEUE PROCESSING (Staggered Spawning) ===
    if (!this.game.won && !this.game.isPaused) {
      this.game.entityManager.processSpawnQueue();

      // === GAME LOGIC UPDATES ===
      // Decrement invincibility frames
      if (this.game.invincibilityFrames > 0) {
        this.game.invincibilityFrames--;

        // Blink player exactly 3 times at the START of invincibility
        // Only blink during the first 36 frames (3 blinks at 12 frames each)
        if (this.game.playerMesh) {
          const blinkPeriod = 12; // frames per blink cycle (on/off)
          const blinkDuration = 36; // total frames for 3 blinks
          const framesFromStart =
            (this.game.invincibilityFrames > 120 ? 90 : 120) -
            this.game.invincibilityFrames;

          if (framesFromStart < blinkDuration) {
            // During blink phase: toggle visibility every blinkPeriod/2 frames
            this.game.playerMesh.visible =
              Math.floor(framesFromStart / (blinkPeriod / 2)) % 2 === 0;
          } else {
            // After blink phase: stay visible (but still invincible)
            this.game.playerMesh.visible = true;
          }
        }
      } else if (this.game.playerMesh && !this.game.playerMesh.visible) {
        this.game.playerMesh.visible = true; // Ensure visible when invincibility ends
      }

      this.game.updatePowerUps();
      this.updatePotion();

      // === ZOMBIE AI (freeze if time freeze is active) ===
      // All entity updates delegated to EntityManager
      this.game.entityManager.updateEntities(smoothDelta);

      // Collision checks
      this.game.checkZombieCollision();
      this.game.checkZombieDogCollision();
      this.game.checkMonsterCollision();
      this.game.checkHordeCollisions();
    }

    // Update coin animations (visual only - always run)
    this.game.updateCoins();

    // === ENVIRONMENTAL EFFECTS (optimized with animation cache) ===
    const animTime = animationCache.animationTime;
    this.game.fireflies.forEach((f) => {
      const curve = f.userData.curve;
      const speed = f.userData.speed;
      f.position.x +=
        animationCache.fastSin((animTime * 60 + curve * 57) % 360) * speed;
      f.position.z +=
        animationCache.fastCos((animTime * 60 + curve * 57) % 360) * speed;
      f.position.y = 2 + animationCache.getWave(1, 1, f.userData.yOffset);
    });

    // === EXPLODING BODY PARTS UPDATE ===
    // Update and clean up scattered zombie/dog body parts
    for (let i = this.game.explodingBodyParts.length - 1; i >= 0; i--) {
      const part = this.game.explodingBodyParts[i];

      // Update position with velocity
      part.mesh.position.add(part.velocity);
      part.velocity.y -= 0.01; // Gravity

      // Update lifetime
      part.life--;

      // Fade out and scale
      // Fade out and scale
      const lifeRatio = part.life / part.maxLife;

      // Safely handle opacity on Meshes or Groups of Meshes
      const updateOpacity = (obj) => {
        if (obj.isMesh && obj.material) {
          obj.material.opacity = lifeRatio * 0.8;
          // Ensure transparent is true so opacity works (idempotent)
          if (!obj.material.transparent) obj.material.transparent = true;
        }
      };

      // Apply to root or children
      updateOpacity(part.mesh);
      part.mesh.traverse(updateOpacity);

      part.mesh.scale.multiplyScalar(0.98); // Slight shrink

      // Remove when lifetime expires
      if (part.life <= 0) {
        this.game.scene.remove(part.mesh);
        this.game.explodingBodyParts.splice(i, 1);
      }
    }

    // === EFFECTS SYSTEMS UPDATE ===
    if (this.game.particleTrail) {
      this.game.particleTrail.update();
    }

    if (this.game.skybox) {
      this.game.skybox.update();
    }

    if (this.game.environment) {
      this.game.environment.update();
    }

    // Update weather effects (rain, lightning)
    if (this.game.weatherManager) {
      this.game.weatherManager.update(
        smoothDelta,
        this.game.playerMesh?.position,
      );
    }

    // === CENTRALIZED EXPLOSION UPDATES ===
    // Updates flash/glow effects without using setInterval
    if (this.game.activeExplosions && this.game.activeExplosions.length > 0) {
      for (let i = this.game.activeExplosions.length - 1; i >= 0; i--) {
        const explosion = this.game.activeExplosions[i];

        // Update values
        explosion.flashIntensity -= 15.0 * smoothDelta; // Approx 0.25 per 16ms
        explosion.glowOpacity -= 6.0 * smoothDelta; // Approx 0.1 per 16ms
        explosion.glowScale += 9.0 * smoothDelta; // Approx 0.15 per 16ms

        if (explosion.flashIntensity > 0) {
          explosion.flash.intensity = explosion.flashIntensity;
          explosion.mesh.material.opacity = explosion.glowOpacity;
          explosion.mesh.scale.setScalar(explosion.glowScale);
        } else {
          // Remove and Dispose
          this.game.scene.remove(explosion.flash);
          this.game.scene.remove(explosion.mesh);

          // We reuse the generic geometry, but dispose the specific material instance because we set color on it
          // (Optimization: In future we could pool materials too)
          explosion.mesh.material.dispose();

          this.game.activeExplosions.splice(i, 1);
        }
      }
    }

    // === RENDER ===
    if (this.game.postProcessing && this.game.postProcessing.enabled) {
      this.game.postProcessing.render();
    } else {
      this.game.renderer.render(this.game.scene, this.game.camera);
    }
  }

  /**
   * Update potion effect timer
   */
  updatePotion() {
    if (this.game.isPotionActive) {
      this.game.potionTimer--;
      if (this.game.potionTimer <= 0) {
        this.game.isPotionActive = false;
        if (this.game.player) {
          this.game.player.resetColor();
        }
        this.game.ui.showToast("Potion wore off...", "timer_off");
      }
    }
  }

  /**
   * Update ambient sounds based on nearby entities
   * Plays sounds for zombies, bosses, monsters, and dogs based on distance
   */
  updateAmbientSounds() {
    // Only play if game is active and not paused
    if (
      this.game.isPaused ||
      this.game.won ||
      this.game.ui.currentScreen !== "gameScreen"
    )
      return;

    const now = Date.now();
    // Min interval for ANY ambient sound check: 2 seconds
    if (now - this.lastAmbientSoundTime < 2000) return;

    if (this.game.audioManager) {
      // Helper: Linear falloff (1.0 at dist 0, 0.0 at maxDist)
      const getVol = (dist, maxDist) => Math.max(0, 1 - dist / maxDist);

      // 1. Zombies (Hearing range: 8)
      let minZombieDist = Infinity;
      const checkZ = (list) => {
        if (!list) return;
        for (const z of list) {
          const dist =
            Math.abs(z.gridX - this.game.playerPos.x) +
            Math.abs(z.gridZ - this.game.playerPos.z);
          if (dist < minZombieDist) minZombieDist = dist;
        }
      };
      checkZ(this.game.zombies);
      checkZ(this.game.hordeZombies);

      if (minZombieDist < 2) {
        if (Math.random() < 0.1) {
          this.game.audioManager.playZombieGrowl(getVol(minZombieDist, 2));
          this.lastAmbientSoundTime = now;
          return;
        }
      }

      // 1.2 Boss Check (Bigfoot & Horde Angel)
      let minBigfootDist = Infinity;
      let minHordeBossDist = Infinity;

      for (const boss of this.game.bossZombies) {
        const d =
          Math.abs(boss.gridX - this.game.playerPos.x) +
          Math.abs(boss.gridZ - this.game.playerPos.z);
        if (boss instanceof BigfootBoss) {
          if (d < minBigfootDist) minBigfootDist = d;
        } else {
          if (d < minHordeBossDist) minHordeBossDist = d;
        }
      }

      if (minBigfootDist < 3) {
        if (Math.random() < 0.12) {
          this.game.audioManager.playBigfootRoar(getVol(minBigfootDist, 3));
          this.lastAmbientSoundTime = now;
          return;
        }
      } else if (minHordeBossDist < 3) {
        if (Math.random() < 0.1) {
          // Use Monster Growl for Angel Bosses (distinct from Bigfoot)
          this.game.audioManager.playMonsterGrowl(getVol(minHordeBossDist, 3));
          this.lastAmbientSoundTime = now;
          return;
        }
      }

      // 1.5 Monster Check (Specific for the new Monster entity)
      let minMonsterDist = Infinity;
      if (this.game.monsters) {
        for (const m of this.game.monsters) {
          const d =
            Math.abs(m.gridX - this.game.playerPos.x) +
            Math.abs(m.gridZ - this.game.playerPos.z);
          if (d < minMonsterDist) minMonsterDist = d;
        }
      }

      if (minMonsterDist < 4) {
        if (Math.random() < 0.08) {
          // Higher chance for monster growl
          this.game.audioManager.playMonsterGrowl(getVol(minMonsterDist, 4));
          this.lastAmbientSoundTime = now;
          return;
        }
      }

      // 1.8 Dog Check (Horde or Normal)
      let minDogDist = Infinity;
      const checkDogs = (list) => {
        if (!list) return;
        for (const d of list) {
          const dist =
            Math.abs(d.gridX - this.game.playerPos.x) +
            Math.abs(d.gridZ - this.game.playerPos.z);
          if (dist < minDogDist) minDogDist = dist;
        }
      };
      checkDogs(this.game.zombieDogs);
      checkDogs(this.game.hordeDogs);

      if (minDogDist < 2) {
        // High chance for bark (fast aggressive enemy)
        if (Math.random() < 0.15) {
          this.game.audioManager.playDogBark(getVol(minDogDist, 2));
          this.lastAmbientSoundTime = now;
          return;
        }
      }

      // 2. Distant Ambient (Low Priority)
      // Only if no growl played recently
      if (now - this.lastAmbientSoundTime > 12000) {
        if (Math.random() < 0.01) {
          this.game.audioManager.playZombieAmbient();
          this.lastAmbientSoundTime = now;
        }
      }
    }
  }

  /**
   * Start periodic auto-refresh of game data from blockchain
   * Runs every 60 seconds to ensure local state matches verified state
   */
  startAutoRefresh() {
    // Clear any existing interval
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }

    // refresh every 60 seconds
    this.autoRefreshInterval = setInterval(() => {
      this.refreshData();
    }, 60000);
  }

  /**
   * Fetch latest data from blockchain and update local state
   * Only updates if blockchain has *more* progress/coins than local
   * (to avoid overwriting current session progress)
   */
  async refreshData() {
    if (!steemIntegration.isConnected || !steemIntegration.username) return;

    try {
      // Sync via UIManager reusing the existing logic
      if (
        this.game.ui &&
        typeof this.game.ui.syncFromBlockchain === "function"
      ) {
        await this.game.ui.syncFromBlockchain(steemIntegration.username);

        // After sync, update local Game instance state if we are in menu/idle
        // or if blockchain has MORE coins than we do (e.g. bought something on mobile)
        const savedCoins = this.game.gameData.get("totalCoins") || 0;
        if (savedCoins > this.game.totalCoins) {
          this.game.totalCoins = savedCoins;
          const coinEl = document.getElementById("coinsDisplay");
          if (coinEl) coinEl.textContent = this.game.totalCoins;
          this.game.ui.showToast("Data synced from blockchain", "sync");
        }
      }
    } catch (e) {
      console.warn("Auto-refresh failed:", e);
    }
  }

  /**
   * Stop the auto-refresh interval
   */
  dispose() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
  }

  /**
   * Reset frame updater state (for level restart)
   */
  reset() {
    this.lastAmbientSoundTime = 0;
  }
}
