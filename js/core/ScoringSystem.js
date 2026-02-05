/**
 * ScoringSystem.js
 * Manages all game scoring, combo mechanics, and victory/game-over logic
 * Handles: score calculation, combo system, game-over triggers, victory screens
 */

import { GameRules } from "./GameRules.js";
import { CameraMode } from "./CameraController.js";
import { steemIntegration } from "../steem/index.js";
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
    // Simplified: "Flow" system. Keep moving to build combo!
    const now = Date.now();
    const timeSinceLastMove = now - this.lastMoveTime;

    // Check if player actually moved significantly
    const movedMinDistance =
      Math.abs(this.game.playerPos.x - this.lastPlayerPos?.x) > 0.1 ||
      Math.abs(this.game.playerPos.z - this.lastPlayerPos?.z) > 0.1;

    // We store lastPlayerPos here for next frame reference if needed,
    // but ScoringSystem doesn't seem to track 'lastPlayerPos' natively in constructor.
    // simpler check: compare current distance to previous distance strictly for 'change'
    // but the previous code used currentDistance (x+z) which is flawed.

    // Better Logic: logic is called by Game.js only when player *moves*.
    // So we assume valid move interaction has occurred.

    // Clear any pending decay timer
    if (this.comboDecayTimer) {
      clearTimeout(this.comboDecayTimer);
      this.comboDecayTimer = null;
    }

    if (this.canBuildCombo && timeSinceLastMove <= 2000) {
      // Fast movement (flow) - build combo!
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;

      // Visual feedback for combo build
      if (this.game.comboMeter) this.game.comboMeter.setCombo(this.combo);
    } else {
      // Too slow - combo doesn't increment, but doesn't break immediately
      // It will decay via timer if they stop completely.
      // Or if it's the first move:
      if (this.combo === 0) {
        this.combo = 1;
        if (this.game.comboMeter) this.game.comboMeter.setCombo(this.combo);
      }
    }

    // Update tracking
    this.lastMoveTime = now;

    // Set up combo decay timer (3 seconds of no movement = decay starts)
    this.comboDecayTimer = setTimeout(() => {
      if (this.combo > 0) {
        // Decay rapidly if stopped
        this.combo = Math.max(0, Math.floor(this.combo * 0.5)); // Lose half combo
        if (this.game.comboMeter) this.game.comboMeter.setCombo(this.combo);

        // After decay, short cooldown
        this.canBuildCombo = false;
        setTimeout(() => {
          this.canBuildCombo = true;
        }, 500);
      }
    }, 2500); // 2.5s tolerance

    // RULE: Check combo bonus via GameRules
    // Legacy check for small bonuses
    const bonus = GameRules.checkComboBonus(this.combo);
    if (bonus > 0) {
      this.extraScore = (this.extraScore || 0) + bonus;

      // Visual feedback every 10 combos or specific milestones
      if (this.combo % 10 === 0 && this.game.ui) {
        this.game.ui.showToast(
          `Combo x${this.combo}! +${bonus} Pts`,
          "star",
          "combo_bonus",
        );
      }
    }

    // Check for major tier milestones (visuals)
    const tierCheck = GameRules.checkComboMilestone(this.combo - 1, this.combo);
    if (tierCheck) {
      this.onComboMilestone(tierCheck);
    }

    // Update score display in real-time
    const currentScore = this.calculateScore();
    const scoreEl = document.getElementById("scoreDisplay");
    if (scoreEl) scoreEl.textContent = currentScore;
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
      // Only flash for Major milestones (25+ combo) to avoid visual noise
      if (["MAJOR", "SUPER", "LEGENDARY"].includes(milestone.tier)) {
        // Temporarily disabled to debug user report of persistent flashing
        // this.game.screenEffects.flash(colors[milestone.tier], 0.5, 300);
      }
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
      const gameOverScreen = document.getElementById("gameOverScreen");
      gameOverScreen.classList.add("active");
      document.getElementById("gameOverMoves").textContent = this.game.moves;
      document.getElementById("gameOverTime").textContent =
        this.game.ui.formatTime(this.game.time);
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
    // CRITICAL: Store in game object so UIManager can access it
    // UIManager looks for this at game.lastVictoryData, not scoringSystem.lastVictoryData
    this.game.lastVictoryData = victoryData;

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

        // CRITICAL FIX: Await the postGameRecord promise to ensure it broadcasts
        // Do not let this fire-and-forget, as nextLevel() may proceed before record is queued
        const result = await steemIntegration.postGameRecord(gameRecord);
        if (result) {
          steemIntegration.registerActivePlayer(steemIntegration.username);
          this.game.ui.showToast("🎮 Game record saved to blockchain!", "check_circle");
        }
      } catch (error) {
        console.error("Error posting game record:", error);
        // Still attempt to register player even on error
        try {
          if (steemIntegration.isConnected) {
            steemIntegration.registerActivePlayer(steemIntegration.username);
          }
        } catch (regError) {
          console.error("Player registration error:", regError);
        }
      }
    } else {
      // Not connected: Show notification that data is saved locally
      this.game.ui.showToast("📊 Game stats saved locally. Login to sync to blockchain!", "storage");
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
