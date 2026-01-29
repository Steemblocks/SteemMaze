/**
 * CombatSystem Class
 * Handles all combat collision detection and combat responses
 * Manages zombie, dog, boss, and monster collision detection and hit logic
 * Extracted from Game.js for better code organization
 */

import { GameRules } from "./GameRules.js";

export class CombatSystem {
  constructor(game) {
    this.game = game; // Reference to parent Game instance
  }

  /**
   * Check if player collides with any regular zombie
   */
  checkZombieCollision() {
    // Check if player collides with any zombie
    for (let i = this.game.zombies.length - 1; i >= 0; i--) {
      const zombie = this.game.zombies[i];
      if (zombie.checkCollision(this.game.playerPos.x, this.game.playerPos.z)) {
        if (this.game.isPotionActive) {
          // KILL ZOMBIE with explosion effect!
          zombie.explode();
          zombie.dispose();
          this.game.zombies.splice(i, 1);

          // AUDIO: Explosion sound
          if (this.game.audioManager)
            this.game.audioManager.playExplosion();

          // Reward coins (scales down with level)
          const reward = GameRules.getZombieKillReward(this.game.level);
          this.game.totalCoins += reward;
          // Stats updated in memory, saved on game over/win

          // Track kills
          this.game.scoringSystem.recordZombieKilled();
          const currentKills =
            this.game.gameData.get("totalZombiesPurified") || 0;
          this.game.gameData.set("totalZombiesPurified", currentKills + 1);

          this.game.ui.showToast(
            `Zombie Purified! +${reward} Coins`,
            "monetization_on",
          );

          // Update UI
          const coinEl = document.getElementById("coinsDisplay");
          if (coinEl) coinEl.textContent = this.game.totalCoins;

          this.game.cameraShake = 0.3;
          if (navigator.vibrate) navigator.vibrate(50);
        } else {
          this.game.onZombieHit();
          return;
        }
      }
    }
  }

  /**
   * Check if player collides with any zombie dog
   */
  checkZombieDogCollision() {
    // Check if player collides with any zombie dog
    const DOG_KILL_REWARD = GameRules.getZombieDogKillReward(this.game.level);

    for (let i = this.game.zombieDogs.length - 1; i >= 0; i--) {
      const dog = this.game.zombieDogs[i];
      if (dog.checkCollision(this.game.playerPos.x, this.game.playerPos.z)) {
        if (this.game.isPotionActive) {
          // KILL DOG with explosion effect!
          dog.explode();
          dog.dispose();
          this.game.zombieDogs.splice(i, 1);

          // AUDIO: Explosion sound
          if (this.game.audioManager)
            this.game.audioManager.playExplosion();

          // Reward coins (scales down with level)
          this.game.totalCoins += DOG_KILL_REWARD;
          // Stats updated in memory, saved on game over/win

          // Track kills
          this.game.scoringSystem.recordZombieDogKilled();
          const currentKills =
            this.game.gameData.get("totalZombiesPurified") || 0;
          this.game.gameData.set("totalZombiesPurified", currentKills + 1);

          this.game.ui.showToast(
            `Zombie Dog Eliminated! +${DOG_KILL_REWARD} Coins`,
            "monetization_on",
          );

          // Update UI
          const coinEl = document.getElementById("coinsDisplay");
          if (coinEl) coinEl.textContent = this.game.totalCoins;

          this.game.cameraShake = 0.2;
          if (navigator.vibrate) navigator.vibrate(30);
        } else {
          // Dog attack - same as zombie hit
          this.game.onZombieHit();
          return;
        }
      }
    }
  }

  /**
   * Check collisions with horde entities (boss, horde zombies, horde dogs)
   * Horde entities give lower rewards when killed
   */
  checkHordeCollisions() {
    // Check all boss collisions (including persistent ones)
    // Removed guard clause to ensure persistent bosses are interactable
    // if (!this.game.isDarknessActive || !this.game.hordeSpawned) return;

    // Check monster collisions
    this.checkMonsterCollision();

    // Check boss zombie collisions
    for (let i = this.game.bossZombies.length - 1; i >= 0; i--) {
      const boss = this.game.bossZombies[i];
      if (boss.checkCollision(this.game.playerPos.x, this.game.playerPos.z)) {
        if (this.game.isPotionActive) {
          // Determine boss type for logging and messaging
          const bossType = boss.isHordeBoss
            ? "Horde Boss"
            : boss.isPersistent
              ? "Bigfoot Boss"
              : "Boss";

          // KILL BOSS with explosion effect!
          boss.explode();
          boss.dispose();
          this.game.bossZombies.splice(i, 1);

          // AUDIO: Explosion sound
          if (this.game.audioManager)
            this.game.audioManager.playExplosion();

          // Reward coins (scales with level)
          const bossReward = GameRules.getBossKillReward(this.game.level);
          this.game.totalCoins += bossReward;
          // Stats updated in memory

          // Track kills
          this.game.scoringSystem.recordZombieKilled();
          const currentKills =
            this.game.gameData.get("totalZombiesPurified") || 0;
          this.game.gameData.set("totalZombiesPurified", currentKills + 1);

          // Differentiated message based on boss type
          const message = boss.isHordeBoss
            ? `👹 HORDE BOSS SLAIN! +${bossReward} Coins`
            : `💀 BIGFOOT BOSS SLAIN! +${bossReward} Coins`;
          this.game.ui.showToast(message, "monetization_on");

          // Update UI
          const coinEl = document.getElementById("coinsDisplay");
          if (coinEl) coinEl.textContent = this.game.totalCoins;

          this.game.cameraShake = 1.0; // Big shake for boss kill
          if (navigator.vibrate) navigator.vibrate([50, 30, 100]);
        } else {
          this.game.onZombieHit();
          return;
        }
      }
    }

    // Check horde zombie collisions
    for (let i = this.game.hordeZombies.length - 1; i >= 0; i--) {
      const zombie = this.game.hordeZombies[i];
      if (zombie.checkCollision(this.game.playerPos.x, this.game.playerPos.z)) {
        if (this.game.isPotionActive) {
          zombie.explode();
          zombie.dispose();
          this.game.hordeZombies.splice(i, 1);

          // AUDIO: Explosion sound
          if (this.game.audioManager)
            this.game.audioManager.playExplosion();

          // Lower reward for horde zombies (10 coins)
          this.game.totalCoins += this.game.HORDE_ZOMBIE_REWARD;
          // Stats updated in memory

          this.game.scoringSystem.recordZombieKilled();

          this.game.ui.showToast(
            `Horde Zombie Purified! +${this.game.HORDE_ZOMBIE_REWARD} Coins`,
            "monetization_on",
          );

          const coinEl = document.getElementById("coinsDisplay");
          if (coinEl) coinEl.textContent = this.game.totalCoins;

          this.game.cameraShake = 0.3;
          if (navigator.vibrate) navigator.vibrate(50);
        } else {
          this.game.onZombieHit();
          return;
        }
      }
    }

    // Check horde dog collisions
    for (let i = this.game.hordeDogs.length - 1; i >= 0; i--) {
      const dog = this.game.hordeDogs[i];
      if (dog.checkCollision(this.game.playerPos.x, this.game.playerPos.z)) {
        if (this.game.isPotionActive) {
          dog.explode();
          dog.dispose();
          this.game.hordeDogs.splice(i, 1);

          // AUDIO: Explosion sound
          if (this.game.audioManager)
            this.game.audioManager.playExplosion();

          // Lower reward for horde dogs (5 coins)
          this.game.totalCoins += this.game.HORDE_DOG_REWARD;
          this.game.gameData.set("totalCoins", this.game.totalCoins);

          this.game.scoringSystem.recordZombieDogKilled();

          this.game.ui.showToast(
            `Horde Dog Eliminated! +${this.game.HORDE_DOG_REWARD} Coins`,
            "monetization_on",
          );

          const coinEl = document.getElementById("coinsDisplay");
          if (coinEl) coinEl.textContent = this.game.totalCoins;

          this.game.cameraShake = 0.2;
          if (navigator.vibrate) navigator.vibrate(30);
        } else {
          this.game.onZombieHit();
          return;
        }
      }
    }
  }

  /**
   * Check if player collides with any monster
   */
  checkMonsterCollision() {
    for (let i = this.game.monsters.length - 1; i >= 0; i--) {
      const monster = this.game.monsters[i];
      if (
        monster.checkCollision(this.game.playerPos.x, this.game.playerPos.z)
      ) {
        if (this.game.isPotionActive) {
          monster.explode();
          // No need to splice if explode/dispose handles safety, but consistency:
          this.game.monsters.splice(i, 1);

          if (this.game.audioManager)
            this.game.audioManager.playExplosion();

          this.game.totalCoins += 50; // Use static reward or rule
          this.game.scoringSystem.recordZombieKilled();

          this.game.ui.showToast("Monster Banished! +50 Coins", "face_retouching_off");

          const coinEl = document.getElementById("coinsDisplay");
          if (coinEl) coinEl.textContent = this.game.totalCoins;

          this.game.cameraShake = 0.5;
          if (navigator.vibrate) navigator.vibrate(40);
        } else {
          this.game.onZombieHit();
          return;
        }
      }
    }
  }

  /**
   * Dispose combat system resources
   */
  dispose() {
    // CombatSystem is stateless - no resources to dispose
    // Kept for consistency with other managers
  }
}
