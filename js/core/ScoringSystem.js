/**
 * ScoringSystem.js
 * Manages all game scoring, combo mechanics, and victory/game-over logic
 * Handles: score calculation, combo system, game-over triggers, victory screens
 */

import { GameRules } from "./GameRules.js";
import { CameraMode } from "./CameraController.js";
import { steemIntegration } from "../../steem-integration.js";
import { getUnlockedAchievements } from "./Achievements.js";

export class ScoringSystem {
  constructor(game) {
    this.game = game;

    // Scoring state
    this.gemsCollected = 0;
    this.coinsCollected = 0;
    this.zombiesKilled = 0;
    this.zombieDogsKilled = 0;
    this.powerUpsUsed = 0;
    this.wallHits = 0;
    this.extraScore = 0;

    // Combo system state
    this.combo = 0;
    this.maxCombo = 0;
    this.lastMoveTime = 0;
    this.previousDistance = 0;
    this.canBuildCombo = true;
    this.comboDecayTimer = null;

    // Game end state
    this.gameOverTriggered = false;
    this.lastVictoryData = null;
  }

  /**
   * Calculate current game score using GameRules
   */
  calculateScore() {
    return GameRules.calculateScore({
      mazeSize: this.game.MAZE_SIZE,
      level: this.game.level,
      time: this.game.time,
      moves: this.game.moves,
      wallHits: this.wallHits,
      maxCombo: this.maxCombo,
      gemsCollected: this.gemsCollected,
      coinsCollected: this.coinsCollected,
      zombiesKilled: this.zombiesKilled,
      powerUpsUsed: this.powerUpsUsed,
      isDoubleScoreActive: this.game.isDoubleScoreActive,
      extraScore: this.extraScore,
    });
  }

  /**
   * Update combo on player movement
   * Handles intelligent combo building based on direction and timing
   * Called from updatePlayerPosition() every move
   */
  updateCombo() {
    // === INTELLIGENT COMBO SYSTEM ===
    const now = Date.now();
    const timeSinceLastMove = now - this.lastMoveTime;

    // Calculate distance to goal (goal is at 0,0)
    const currentDistance = this.game.playerPos.x + this.game.playerPos.z;
    const isMovingForward = currentDistance < this.previousDistance;
    const isMovingBackward = currentDistance > this.previousDistance;

    // Clear any pending decay timer
    if (this.comboDecayTimer) {
      clearTimeout(this.comboDecayTimer);
      this.comboDecayTimer = null;
    }

    // Combo logic based on direction and timing
    if (isMovingForward) {
      // Moving TOWARD goal
      if (this.canBuildCombo && timeSinceLastMove <= 2000) {
        // Fast forward movement - build combo!
        this.combo++;
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      } else if (timeSinceLastMove > 2000 && timeSinceLastMove <= 3000) {
        // Slow movement - no combo change, but don't decrease
      } else {
        // First move or after long pause - start fresh
        this.combo = Math.max(1, this.combo);
        this.canBuildCombo = true;
      }
    } else if (isMovingBackward) {
      // Moving AWAY from goal - decrease combo
      this.combo = Math.max(0, this.combo - 1);
    }
    // Staying same distance = no combo change

    // Update tracking
    this.lastMoveTime = now;
    this.previousDistance = currentDistance;

    // Set up combo decay timer (3 seconds of no movement = decay starts)
    this.comboDecayTimer = setTimeout(() => {
      if (this.combo > 0) {
        this.combo = Math.max(0, this.combo - 1);
        if (this.game.comboMeter) this.game.comboMeter.setCombo(this.combo);

        // After decay, 1 second cooldown before combo can build again
        this.canBuildCombo = false;
        setTimeout(() => {
          this.canBuildCombo = true;
        }, 1000);
      }
    }, 3000);

    // RULE: Check combo bonus via GameRules
    const bonus = GameRules.checkComboBonus(this.combo);
    if (bonus > 0) {
      this.extraScore = (this.extraScore || 0) + bonus;

      // Visual feedback every 5 combos
      if (this.combo % 5 === 0 && this.game.ui) {
        this.game.ui.showToast(`Combo x${this.combo}! +${bonus} Points`, "star");
      }
    }

    // Update score display in real-time
    const currentScore = this.calculateScore();
    const scoreEl = document.getElementById("scoreDisplay");
    if (scoreEl) scoreEl.textContent = currentScore;

    // Update combo meter
    if (this.game.comboMeter) {
      this.game.comboMeter.setCombo(this.combo);
    }
  }

  /**
   * Handle combo milestone reached
   */
  onComboMilestone(milestone) {
    const tierLabels = {
      MINOR: "Nice Combo!",
      MODERATE: "Great Combo!",
      MAJOR: "AMAZING COMBO!",
      SUPER: "SUPER COMBO!!!",
      LEGENDARY: "LEGENDARY!!!",
    };

    // Show milestone toast
    if (this.game.ui) {
      this.game.ui.showToast(
        `${tierLabels[milestone.tier]} x${milestone.multiplier.toFixed(1)}`,
        "whatshot",
      );
    }

    // Visual effects
    if (this.game.screenEffects) {
      const colors = {
        MINOR: "#fbbf24",
        MODERATE: "#f97316",
        MAJOR: "#ef4444",
        SUPER: "#a855f7",
        LEGENDARY: "#06b6d4",
      };
      this.game.screenEffects.flashScreen(colors[milestone.tier], 200);
    }

    // Camera shake for major milestones
    if (
      milestone.tier === "MAJOR" ||
      milestone.tier === "SUPER" ||
      milestone.tier === "LEGENDARY"
    ) {
      this.game.cameraShake = 0.3;
    }
  }

  /**
   * Reset combo on zombie hit or wall hit
   */
  resetCombo() {
    this.combo = 0;

    // Break combo meter visual
    if (this.game.comboMeter) {
      this.game.comboMeter.breakCombo();
    }
  }

  /**
   * Record gem collection event
   */
  recordGemCollection() {
    this.gemsCollected++;
  }

  /**
   * Record coin collection event
   */
  recordCoinCollection() {
    this.coinsCollected++;
  }

  /**
   * Record power-up activation event
   */
  recordPowerUpUsed() {
    this.powerUpsUsed++;
  }

  /**
   * Record wall hit event
   */
  recordWallHit() {
    this.wallHits++;
  }

  /**
   * Record zombie killed event
   */
  recordZombieKilled() {
    this.zombiesKilled++;
  }

  /**
   * Record zombie dog killed event
   */
  recordZombieDogKilled() {
    this.zombieDogsKilled++;
  }

  /**
   * Trigger game over when player dies
   */
  triggerGameOver() {
    this.gameOverTriggered = true;
    this.game.won = true;
    this.game.isRunning = false;
    clearInterval(this.game.timerInterval);

    // NOTE: We NO LONGER despawn horde here!
    // When player clicks "Retry", resetGame() will call createZombies()
    // which properly clears and recreates all entities.
    // This prevents the Bigfoot disappearance bug.
    this.game.eventSystem.resetEventState();
    this.game.weatherManager?.stopStorm();

    // AUDIO: Stop ALL sounds when game over is triggered
    if (this.game.audioManager) {
      this.game.audioManager.stopAllSounds();
      // Then play the game over sound
      this.game.audioManager.playGameOver();
    }

    // Play dramatic death burst effect
    if (this.game.player) {
      this.game.player.playDeathBurst();
    }

    // Extra strong camera shake for death
    this.game.cameraShake = 2.0;

    // Track loss
    this.game.gameData.data.losses = (this.game.gameData.data.losses || 0) + 1;
    this.game.gameData.set("totalCoins", this.game.totalCoins); // Save earned coins despite death
    this.game.gameData.save();

    // Hide HUD elements
    if (this.game.comboMeter) this.game.comboMeter.reset();

    // Delay showing game over screen to let death animation play
    setTimeout(() => {
      document.getElementById("gameOverScreen").style.display = "grid";
      document.getElementById("gameOverMoves").textContent = this.game.moves;
      document.getElementById("gameOverTime").textContent = this.game.ui.formatTime(
        this.game.time,
      );
      document.getElementById("gameOverLevel").textContent = this.game.level;
    }, 500);
  }

  /**
   * Trigger victory when player reaches goal
   */
  async triggerVictory() {
    this.game.won = true;
    this.game.isRunning = false;
    clearInterval(this.game.timerInterval);

    // Clean up horde if active
    this.game.entityManager.despawnHorde();
    this.game.eventSystem.resetEventState();
    this.game.weatherManager?.stopStorm();

    if (this.game.audioManager) this.game.audioManager.stopRain();

    // AUDIO: Play victory sound
    if (this.game.audioManager) this.game.audioManager.playVictory();

    const score = this.calculateScore();
    const d = this.game.gameData.data;

    // Calculate Stars using GameRules
    const stars = GameRules.calculateStars({
      time: this.game.time,
      parTime: this.game.PAR_TIME,
      wallHits: this.wallHits,
      gemsCollected: this.gemsCollected,
      totalGems: this.game.gems.length,
      maxCombo: this.maxCombo,
    });

    // Get detailed score breakdown
    const breakdown = GameRules.getScoreBreakdown({
      mazeSize: this.game.MAZE_SIZE,
      level: this.game.level,
      time: this.game.time,
      moves: this.game.moves,
      wallHits: this.wallHits,
      maxCombo: this.maxCombo,
      gemsCollected: this.gemsCollected,
      coinsCollected: this.coinsCollected,
      zombiesKilled: this.zombiesKilled,
    });

    // Calculate level completion coin reward
    const levelReward = GameRules.calculateLevelReward(this.game.level, stars);

    // Award coins for level completion
    this.game.totalCoins += levelReward.total;
    this.game.gameData.set("totalCoins", this.game.totalCoins);

    // Update HUD
    const coinEl = document.getElementById("coinsDisplay");
    if (coinEl) coinEl.textContent = this.game.totalCoins;

    d.wins++;
    d.totalSteps += this.game.moves;
    if (this.game.level > d.highestLevel) {
      d.highestLevel = this.game.level;
    }
    // Always unlock next level if we beat the current one
    if ((d.currentLevel || 1) <= this.game.level) {
      d.currentLevel = this.game.level + 1;
    }

    const isNewRecord = !d.bestScore || score > d.bestScore;
    if (isNewRecord) d.bestScore = score;
    if (!d.bestTime || this.game.time < d.bestTime) d.bestTime = this.game.time;

    this.game.gameData.save();
    this.game.ui.updateAllStats();

    // Camera cinematic effect on victory
    if (this.game.cameraController) {
      this.game.cameraController.setMode(CameraMode.CINEMATIC);
    }

    // Hide HUD elements
    if (this.game.comboMeter) this.game.comboMeter.reset();

    // Pass extra data to UI including level reward breakdown
    const victoryData = {
      stars,
      level: this.game.level,
      score: score,
      time: this.game.time,
      isNewRecord,
      gems: this.gemsCollected,
      totalGems: this.game.gems.length,
      moves: this.game.moves,
      maxCombo: this.maxCombo,
      coinsCollected: this.coinsCollected,
      wallHits: this.wallHits,
      timeLabel: breakdown.timeLabel,
      difficultyTier: breakdown.difficultyTier,
      zombiesKilled: this.zombiesKilled,
      zombieDogsKilled: this.zombieDogsKilled || 0,
      levelReward: levelReward,
    };

    // Store for share button (blog post)
    this.lastVictoryData = victoryData;

    this.game.ui.showVictory(
      this.game.moves,
      this.game.time,
      score,
      isNewRecord,
      victoryData,
    );

    // MANDATORY: Auto-post game record as custom_json (for leaderboards/restore)
    // This is separate from the optional Share blog post button
    if (steemIntegration.isConnected && steemIntegration.username) {
      try {
        const gameRecord = {
          level: this.game.level,
          score: score,
          time: this.game.time,
          moves: this.game.moves,
          gems: this.gemsCollected,
          totalGems: this.game.gems.length,
          stars: stars,
          mazeSize: this.game.MAZE_SIZE,
          // Profile Stats
          gamesPlayed: d.gamesPlayed,
          wins: d.wins,
          losses: d.losses,
          totalCoins: d.totalCoins,
          totalZombiesPurified: d.totalZombiesPurified,
          totalSteps: d.totalSteps,
          highestLevel: d.highestLevel,
          bestScore: d.bestScore,
          achievements: getUnlockedAchievements(d).map((a) => a.id),
        };

        const result = await steemIntegration.postGameRecord(gameRecord);
        if (result) {
          steemIntegration.registerActivePlayer(steemIntegration.username);
          this.game.ui.showToast("🎮 Game record saved!", "check_circle");
        }
      } catch (error) {
        console.error("Error posting game record:", error);
        // Don't show error toast - user may have cancelled Keychain
      }
    }
  }

  /**
   * Reset all scoring state for new level
   * Called from Game.resetGame()
   */
  resetScoringState() {
    this.gemsCollected = 0;
    this.coinsCollected = 0;
    this.zombiesKilled = 0;
    this.zombieDogsKilled = 0;
    this.powerUpsUsed = 0;
    this.wallHits = 0;
    this.extraScore = 0;

    // Reset combo system
    this.combo = 0;
    this.maxCombo = 0;
    this.lastMoveTime = 0;
    this.previousDistance = (this.game.MAZE_SIZE - 1) * 2;
    this.canBuildCombo = true;

    // Clear combo decay timer
    if (this.comboDecayTimer) {
      clearTimeout(this.comboDecayTimer);
      this.comboDecayTimer = null;
    }

    // Reset game end state
    this.gameOverTriggered = false;
  }

  /**
   * Dispose of ScoringSystem resources
   */
  dispose() {
    // Clear any pending combo decay timer
    if (this.comboDecayTimer) {
      clearTimeout(this.comboDecayTimer);
      this.comboDecayTimer = null;
    }
  }
}
