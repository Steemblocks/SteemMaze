/**
 * PowerUpSystem.js
 * Manages power-up activation, deactivation, and state
 * Handles all power-up mechanics: shield, speed, freeze, magnet, double_score, lightboost
 */

import { GameRules } from "./GameRules.js";

export class PowerUpSystem {
  constructor(game) {
    this.game = game;

    // Power-up state
    this.activePowerUp = null; // Currently active power-up type
    this.powerUpTimer = 0; // Countdown timer for power-up duration

    // Power-up effect flags
    this.isShieldActive = false; // Shield protects from one zombie hit
    this.isSpeedBoostActive = false; // Speed boost for faster movement
    this.isTimeFreezeActive = false; // Freezes zombies temporarily
    this.isMagnetActive = false; // Coin magnet effect
    this.isDoubleScoreActive = false; // Double score power-up
    this.isLightBoostActive = false; // Light boost repels zombies
  }

  /**
   * Check for power-up collection at player's current position
   */
  checkPowerUpCollection() {
    const { x, z } = this.game.playerPos;

    this.game.powerUps.forEach((powerUp) => {
      if (powerUp.userData.collected) return;
      if (powerUp.userData.gridX === x && powerUp.userData.gridZ === z) {
        powerUp.userData.collected = true;
        this.game.scene.remove(powerUp);

        this.activatePowerUp(powerUp.userData.type);
      }
    });
  }

  /**
   * Activate a power-up by type
   * Deactivates any existing power-up first, then applies new one
   */
  activatePowerUp(type) {
    // Deactivate any existing power-up first
    if (this.activePowerUp) {
      this.deactivatePowerUp();
    }

    this.activePowerUp = type;
    this.game.scoringSystem.recordPowerUpUsed();

    // Get duration from GameRules if available
    const typeUpper = type.toUpperCase();
    const powerUpConfig = GameRules.POWERUP_TYPES[typeUpper];
    this.powerUpTimer = powerUpConfig
      ? powerUpConfig.duration
      : GameRules.POWERUP_DURATION;

    // Screen flash for power-up
    if (this.game.screenEffects) {
      this.game.screenEffects.powerUpFlash(type);
    }

    // Camera zoom effect
    if (this.game.cameraController) {
      this.game.cameraController.zoomTo(0.9);
      setTimeout(() => this.game.cameraController.zoomTo(1.0), 500);
    }

    // Particle burst at player position
    if (this.game.particleTrail && this.game.playerMesh) {
      const colors = {
        shield: 0x3b82f6,
        speed: 0xfbbf24,
        freeze: 0x06b6d4,
        magnet: 0xa855f7,
        double_score: 0x22c55e,
        lightboost: 0xfbbf24,
      };
      this.game.particleTrail.burst(
        this.game.playerMesh.position,
        25,
        colors[type] || 0x4ade80,
      );
    }

    switch (type) {
      case "shield":
        this.isShieldActive = true;
        this.game.ui.showToast(
          "🛡️ SHIELD ACTIVATED! Protected from 1 hit!",
          "shield",
        );
        // AUDIO: Play shield sound
        if (this.game.audioManager) this.game.audioManager.playShield();

        if (this.game.playerMesh) {
          this.game.playerMesh.material.color.setHex(0x3b82f6);
        }
        if (this.game.particleTrail) {
          this.game.particleTrail.setColor(0x3b82f6);
        }
        break;

      case "speed":
        this.isSpeedBoostActive = true;
        this.game.ui.showToast("⚡ SPEED BOOST! Move faster!", "bolt");
        if (this.game.particleTrail) {
          this.game.particleTrail.setColor(0xfbbf24);
        }
        break;

      case "freeze":
        this.isTimeFreezeActive = true;
        this.game.ui.showToast("❄️ TIME FREEZE! Zombies frozen!", "ac_unit");
        if (this.game.particleTrail) {
          this.game.particleTrail.setColor(0x06b6d4);
        }
        // Freeze all zombies visually
        this.game.zombies.forEach((z) => {
          if (z.mesh) {
            z.mesh.material.emissive.setHex(0x06b6d4);
          }
        });
        break;

      case "magnet":
        this.isMagnetActive = true;
        this.game.ui.showToast("🧲 COIN MAGNET! Attract nearby coins!", "explore");
        if (this.game.playerMesh) {
          this.game.playerMesh.material.color.setHex(0xa855f7);
        }
        if (this.game.particleTrail) {
          this.game.particleTrail.setColor(0xa855f7);
        }
        break;

      case "double_score":
        this.isDoubleScoreActive = true;
        this.game.ui.showToast("💰 DOUBLE SCORE! 2X points!", "paid");
        if (this.game.playerMesh) {
          this.game.playerMesh.material.color.setHex(0x22c55e);
          this.game.playerMesh.material.emissiveIntensity = 2;
        }
        if (this.game.particleTrail) {
          this.game.particleTrail.setColor(0x22c55e);
        }
        break;

      case "lightboost":
        this.isLightBoostActive = true;
        this.game.ui.showToast("💡 LIGHT BOOST! Zombies flee!", "lightbulb");
        if (this.game.playerMesh) {
          this.game.playerMesh.material.color.setHex(0xfbbf24);
        }
        if (this.game.particleTrail) {
          this.game.particleTrail.setColor(0xfbbf24);
        }
        break;
    }

    if (this.game.gameData.getSetting("vibration") && navigator.vibrate) {
      navigator.vibrate([20, 50, 20, 50, 20]);
    }
  }

  /**
   * Deactivate current power-up
   * Resets effects based on power-up type and restores player state
   */
  deactivatePowerUp() {
    // Reset based on power-up type
    switch (this.activePowerUp) {
      case "shield":
        this.isShieldActive = false;
        if (this.game.player) {
          this.game.player.resetColor();
        }
        break;

      case "speed":
        this.isSpeedBoostActive = false;
        if (this.game.player) {
          this.game.player.resetColor();
        }
        break;

      case "freeze":
        this.isTimeFreezeActive = false;
        // Reset zombie colors
        this.game.zombies.forEach((z) => {
          if (z.mesh) {
            z.mesh.material.emissive.setHex(0xdc2626);
          }
        });
        break;

      case "magnet":
        this.isMagnetActive = false;
        if (this.game.player) {
          this.game.player.resetColor();
        }
        break;

      case "double_score":
        this.isDoubleScoreActive = false;
        if (this.game.player) {
          this.game.player.resetColor();
        }
        break;

      case "lightboost":
        this.isLightBoostActive = false;
        if (this.game.player) {
          this.game.player.resetColor();
        }
        break;
    }

    // Reset particle trail to white/cyan
    if (this.game.particleTrail) {
      this.game.particleTrail.setColor(0x88ddff);
    }

    this.activePowerUp = null;
    this.game.ui.showToast("Power-up expired!", "timer_off");
  }

  /**
   * Deactivate shield specifically (called when shield absorbs a hit)
   * Doesn't show toast or reset particle trail
   */
  deactivateShieldSilent() {
    this.isShieldActive = false;
    this.activePowerUp = null;
    this.powerUpTimer = 0;
    if (this.game.player) {
      this.game.player.resetColor();
    }
  }

  /**
   * Update power-up state (called from Game.resetGame() and onZombieHit())
   * Clears all power-up state without showing effects
   */
  resetPowerUpState() {
    this.activePowerUp = null;
    this.powerUpTimer = 0;
    this.isShieldActive = false;
    this.isSpeedBoostActive = false;
    this.isTimeFreezeActive = false;
    this.isMagnetActive = false;
    this.isDoubleScoreActive = false;
    this.isLightBoostActive = false;
  }

  /**
   * Activate light boost (handled by Shop.js independently)
   * Light boost is NOT a traditional power-up - it's managed separately
   * This method allows Shop.js to control the state through PowerUpSystem
   */
  activateLightBoost() {
    this.isLightBoostActive = true;
  }

  /**
   * Deactivate light boost (handled by Shop.js independently)
   * Light boost is NOT a traditional power-up - it's managed separately
   * This method allows Shop.js to control the state through PowerUpSystem
   */
  deactivateLightBoost() {
    this.isLightBoostActive = false;
  }

  /**
   * Update power-up timer (decrement each frame)
   * Returns true if power-up expired and was deactivated
   */
  updateTimer() {
    if (this.powerUpTimer > 0) {
      this.powerUpTimer--;
      if (this.powerUpTimer === 0) {
        // Timer expired - deactivate the power-up
        if (this.activePowerUp) {
          this.deactivatePowerUp();
        }
        return true; // Power-up expired
      }
    }
    return false; // Still active or no active power-up
  }

  /**
   * Dispose of PowerUpSystem resources
   */
  dispose() {
    // PowerUpSystem is stateless - nothing to dispose
  }
}
