/**
 * CollisionHandler.js
 * Manages collision detection and damage handling
 * Handles: wall collisions, zombie hits, life management, safe zone clearing
 */

import { GameRules } from "./GameRules.js";

export class CollisionHandler {
  constructor(game) {
    this.game = game;
  }

  /**
   * Handle wall collision - reduce combo and apply effects
   */
  onWallHit() {
    // Reset combo and record wall hit
    this.game.scoringSystem.resetCombo();
    this.game.scoringSystem.recordWallHit();

    // Break combo meter visual
    if (this.game.comboMeter) {
      this.game.comboMeter.breakCombo();
    }

    // Camera shake effect (subtle feedback)
    this.game.cameraShake = GameRules.SHAKE_INTENSITY_WALL;

    // Vibration feedback (stronger for wall hit)
    if (
      this.game.gameData.getSetting("vibration") &&
      navigator.vibrate
    ) {
      navigator.vibrate(GameRules.VIBRATION_WALL);
    }
  }

  /**
   * Handle zombie collision - apply damage, manage invincibility, handle respawn
   */
  onZombieHit() {
    if (this.game.gameOverTriggered) return;

    // Check invincibility frames - prevents rapid consecutive hits
    if (this.game.invincibilityFrames > 0) {
      // AUDIO: collision feedback even if invincible
      if (this.game.audioManager) this.game.audioManager.playToggle();
      return; // Still invincible, ignore hit
    }

    // Shield protection - absorbs one hit
    if (this.game.isShieldActive) {
      this.game.powerUpSystem.deactivateShieldSilent();

      // Grant invincibility frames after shield absorbs hit
      this.game.invincibilityFrames = 90; // ~1.5 seconds at 60fps

      // Reset player color (respecting active potion)
      if (this.game.playerMesh && this.game.player) {
        if (this.game.isPotionActive) {
          this.game.player.activatePotionEffect();
        } else {
          this.game.player.resetColor();
        }
      }

      this.game.ui.showToast("Shield absorbed the hit!", "shield");

      // AUDIO: Play shield sound
      if (this.game.audioManager) this.game.audioManager.playShield();

      this.game.cameraShake = 0.5;

      if (
        this.game.gameData.getSetting("vibration") &&
        navigator.vibrate
      ) {
        navigator.vibrate([30, 30, 30]);
      }
      return; // Shield consumed, no damage
    }

    // Play hit burst effect on player (similar to zombie death explosion)
    if (this.game.player) {
      this.game.player.playHitBurst();
    }

    // AUDIO: Play hit/explosion sound
    if (this.game.audioManager) this.game.audioManager.playExplosion();

    // Reset combo on zombie hit
    this.game.scoringSystem.resetCombo();

    this.game.lives--;

    // Camera shake effect (stronger than wall hit)
    this.game.cameraShake = GameRules.SHAKE_INTENSITY_ZOMBIE;

    // Vibration feedback (strong vibration for zombie hit)
    if (
      this.game.gameData.getSetting("vibration") &&
      navigator.vibrate
    ) {
      navigator.vibrate(GameRules.VIBRATION_ZOMBIE);
    }

    // Flash screen red
    this.game.uiUpdater.flashScreen("rgba(239, 68, 68, 0.7)", 250);

    // Update lives display
    this.game.updateLivesDisplay();

    if (this.game.lives <= 0) {
      this.game.triggerGameOver();
    } else {
      // AUDIO: Stop attack sounds during respawn
      if (this.game.audioManager) {
        // Stop pooled attack sounds (dog barks, zombie growls, etc.) but not music
        this.game.audioManager.soundPools["dogBark"]?.forEach((audio) => {
          audio.pause();
          audio.currentTime = 0;
        });
        this.game.audioManager.soundPools["zombieGrowl"]?.forEach((audio) => {
          audio.pause();
          audio.currentTime = 0;
        });
        this.game.audioManager.soundPools["monsterGrowl"]?.forEach((audio) => {
          audio.pause();
          audio.currentTime = 0;
        });
      }

      // Reset player position to start
      this.game.playerPos = { x: this.game.MAZE_SIZE - 1, z: this.game.MAZE_SIZE - 1 };
      this.game.entityManager.playerPos = { ...this.game.playerPos }; // Sync with EntityManager
      this.game.entityManager.updatePlayerPosition();

      // Ensure no zombies are camping the spawn point
      this.clearSafeZone();

      // Grant invincibility frames after respawn
      this.game.invincibilityFrames = 120; // ~2 seconds at 60fps

      // Show warning with lives remaining
      this.game.ui.showToast(
        `Zombie Bite! ${this.game.lives} lives remaining`,
        "warning",
      );
    }
  }

  /**
   * Add a life to the player and update display
   */
  addLife() {
    this.game.lives++;
    this.game.updateLivesDisplay();
  }

  /**
   * Pushes zombies away from the player's start position to prevent spawn-kills
   */
  clearSafeZone() {
    const startX = this.game.MAZE_SIZE - 1;
    const startZ = this.game.MAZE_SIZE - 1;
    const safeDist = 5;

    // Helper to move entity if too close
    const pushAway = (entity) => {
      const dist =
        Math.abs(entity.gridX - startX) + Math.abs(entity.gridZ - startZ);
      if (dist < safeDist) {
        // Move to a safer random spot in the top-left quadrant (near goal but random)
        // to ensure they are far from bottom-right start
        entity.gridX = Math.floor(Math.random() * (this.game.MAZE_SIZE / 2));
        entity.gridZ = Math.floor(Math.random() * (this.game.MAZE_SIZE / 2));
        entity.updatePosition();
      }
    };

    if (this.game.zombies) this.game.zombies.forEach(pushAway);
    if (this.game.zombieDogs) this.game.zombieDogs.forEach(pushAway);
    if (this.game.hordeZombies) this.game.hordeZombies.forEach(pushAway);
    if (this.game.hordeDogs) this.game.hordeDogs.forEach(pushAway);
    if (this.game.monsters) this.game.monsters.forEach(pushAway);
    if (this.game.bossZombies) this.game.bossZombies.forEach(pushAway);
  }

  /**
   * Reset collision handler state
   */
  reset() {
    // No state to reset currently
  }

  /**
   * Cleanup collision handler resources
   */
  dispose() {
    // No resources to cleanup
  }
}
