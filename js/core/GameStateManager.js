/**
 * GameStateManager.js
 * Manages game level progression, session state, and game initialization
 * Handles: level management, game flow (new game, next level, replay), UI state updates
 */

import { GameRules } from "./GameRules.js";
import { steemIntegration } from "../steem/index.js";

export class GameStateManager {
  constructor(game) {
    this.game = game;

    // Level state
    this.level = game.gameData.get("currentLevel") || 1;
  }

  /**
   * Get current level
   */
  getLevel() {
    return this.level;
  }

  /**
   * Set level and persist to gameData
   */
  setLevel(newLevel) {
    this.level = newLevel;
    this.game.gameData.set("currentLevel", this.level);
  }

  /**
   * Calculate maze size based on level and settings
   */
  calculateMazeSize() {
    const settingsBase = this.game.gameData.getSetting("mazeSize");
    const calculatedSize = GameRules.getMazeSize(
      this.level,
      settingsBase || 15,
    );
    return Math.max(10, Math.min(60, calculatedSize));
  }

  /**
   * Start completely fresh game at Level 1
   * Preserves login session but resets all progress
   */
  async startNewGame() {
    this.level = 1;
    this.game.totalCoins = 0;

    // COMPLETE RESET of game state
    // We must PRESERVE the login session AND game history though!
    const savedSteemUser = this.game.gameData.get("steemUsername");
    const savedPlayerName = this.game.gameData.get("playerName");
    const savedHistory = this.game.gameData.get("history"); // CRITICAL: Preserve history

    // Reset all persistent data
    this.game.gameData.reset(); // Resets to default (Level 1, 0 Coins, etc.)

    // Restore login session
    if (savedSteemUser) {
      this.game.gameData.set("steemUsername", savedSteemUser);
    }
    if (savedPlayerName) {
      this.game.gameData.set("playerName", savedPlayerName);
    }
    
    // CRITICAL: Restore game completion history - this should NEVER be reset
    // Players' achievements history is permanent!
    if (savedHistory && Array.isArray(savedHistory)) {
      this.game.gameData.set("history", savedHistory);
    }

    // If connected, keep the blockchain connection sync
    if (steemIntegration?.isConnected && steemIntegration?.username) {
      this.game.ui.showToast(
        "Started fresh game (Session preserved)",
        "restart_alt",
      );
      
      // CRITICAL: Post reset record to blockchain so data stays in sync
      // Without this, blockchain shows old level 10 completion while local is level 1
      try {
        const resetRecord = {
          level: 1,
          score: 0,
          time: 0,
          moves: 0,
          gems: 0,
          totalGems: 0,
          stars: 0,
          mazeSize: 15,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          totalCoins: 0,
          totalZombiesPurified: 0,
          totalSteps: 0,
          highestLevel: 0,
          bestScore: 0,
          achievements: [],
        };
        
        await steemIntegration.postGameRecord(resetRecord);
        // Don't show extra toast - already showing "Started fresh game"
      } catch (error) {
        console.warn("Failed to sync reset to blockchain (continuing):", error);
        // Continue anyway - local data is more important
      }
    }

    this.game.gameData.set("currentLevel", this.level);
    this.game.gameData.set("totalCoins", 0);

    // Update displays
    document.getElementById("levelDisplay").textContent = this.level;
    const coinEl = document.getElementById("coinsDisplay");
    if (coinEl) coinEl.textContent = "0";

    this.game.gameData.data.gamesPlayed++;
    this.game.gameData.save();
    this.game.resetGame();
    
    // Ensure gameScreen is displayed after setup
    this.game.ui.showScreen("gameScreen");
    this.game.isRunning = true;
  }

  /**
   * Continue game from current level without resetting
   */
  continueGame() {
    this.game.gameData.data.gamesPlayed++;
    this.game.gameData.save();
    this.game.resetGame();
  }

  /**
   * Advance to next level after victory
   */
  async nextLevel() {
    // Clear share modal and advance to next level
    this.game.ui.hideShareModal();

    // Hide pause and victory screens
    document.getElementById("victoryScreen").classList.remove("active");
    document.getElementById("pauseScreen").classList.remove("active");

    // CRITICAL FIX: Reset game state BEFORE showing screen
    // This prevents input blocking during the transition (InputManager checks these flags)
    this.game.won = false;
    this.game.isRunning = false;
    this.game.isPaused = false;

    // Ensure UI is in game mode
    this.game.ui.showScreen("gameScreen");

    // CRITICAL FIX: Give blockchain operations a brief moment to queue
    // The triggerVictory() calls postGameRecord which is async
    // We need to ensure it's queued before we advance levels
    // This prevents the next level starting before the record is in the queue
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Advancing Logic: Show Game End Screen after completing Level 10
    if (this.level >= 10) {
      // 1. Record Full Game Completion in History with Rich Data
      const history = this.game.gameData.get("history") || [];
      const totalScore = this.game.gameData.get("bestScore") || 0;
      const d = this.game.gameData.data;
      
      // Get currently unlocked achievements
      const { getUnlockedAchievements } = await import("../core/Achievements.js");
      const unlockedAchievements = getUnlockedAchievements(d).map(a => ({
        id: a.id,
        name: a.name,
        icon: a.icon
      }));
      
      const completionRecord = {
        timestamp: new Date().toISOString(),
        score: totalScore,
        levelReached: this.level,
        status: "Completed",
        date: new Date().toLocaleDateString(),
        completionType: "FULL_GAME_COMPLETION", // NEW: Mark as full game completion
        totalGameTime: this.game.time, // NEW: Total time to complete all 10 levels
        totalMoves: d.totalSteps, // NEW: Cumulative moves across game
        achievementsUnlocked: unlockedAchievements, // NEW: Achievements at completion
        difficultySettings: {
          mazeSize: this.game.gameData.getSetting("mazeSize") || 15,
          quality: this.game.gameData.getSetting("quality") || "high"
        }
      };
      
      history.push(completionRecord);
      this.game.gameData.set("history", history);
      
      // 2. Reset progress for next run but keep higher difficulty or stats
      this.game.gameData.set("currentLevel", 1);
      this.level = 1;
      this.game.level = this.level; // Sync with Game class

      // Show Final Completion Screen
      this.game.ui.showGameEndScreen(totalScore);
      
      this.game.ui.showToast(
        "🏆 All Levels Completed! Congratulations!",
        "emoji_events",
      );
      
      // Update UI displays to reflect reset
      document.getElementById("levelDisplay").textContent = "1";
      this.game.ui.updateMenuStats();
      
      // CRITICAL: Properly clean up and reset the game after showing end screen
      // This allows players to immediately start a new game or return to menu
      // without a broken game state
      this.game.cleanup();
      
      // CRITICAL: Save the reset level to persistent storage
      // Without this, the level 10 completion data persists in localStorage
      this.game.gameData.save();
      
      return; // Exit early
    } else {
      this.level++;
    }

    this.game.gameData.set("currentLevel", this.level);

    // CRITICAL: Sync Game.level with GameStateManager.level
    // These are separate properties and must stay in sync
    this.game.level = this.level;

    // Update UI display
    document.getElementById("levelDisplay").textContent = this.level;

    // Now resetGame() will use the correct new level
    // This also re-attaches InputManager event listeners via reset process
    this.game.resetGame();
  }

  /**
   * Replay current level without advancing
   */
  replayLevel() {
    // Hide pause and victory screens
    document.getElementById("victoryScreen").classList.remove("active");
    document.getElementById("pauseScreen").classList.remove("active");

    // CRITICAL: Reset game state completely
    this.game.won = false;
    this.game.isRunning = false;
    this.game.isPaused = false;

    // Reset the game with same level
    this.game.resetGame();
  }

  /**
   * Reload level from gameData - called after account login/switch
   * Ensures the game uses the correct level for the current user
   */
  reloadLevelFromData() {
    const newLevel = this.game.gameData.get("currentLevel") || 1;

    this.level = newLevel;

    // Update display
    const levelDisplay = document.getElementById("levelDisplay");
    if (levelDisplay) {
      levelDisplay.textContent = this.level;
    }

    // Update total coins from gameData
    this.game.totalCoins = this.game.gameData.get("totalCoins") || 0;

    // Reset inventory counts
    this.game.potionCount = 0;
    this.game.lightBurstCount = 0;
    this.game.fogRemoverCount = 0;

    // Reset shop state if it exists
    if (this.game.shop && typeof this.game.shop.reset === "function") {
      this.game.shop.reset();
    }

    // Update HUD to reflect new inventory
    if (
      this.game.shop &&
      typeof this.game.shop.manualHUDUpdate === "function"
    ) {
      this.game.shop.manualHUDUpdate();
    }

    // Update coins display
    const coinsDisplay = document.getElementById("coinsDisplay");
    if (coinsDisplay) {
      coinsDisplay.textContent = this.game.totalCoins;
    }
  }

  /**
   * Restart current level
   */
  restartLevel() {
    this.game.resetGame();
  }

  /**
   * Dispose of GameStateManager resources
   */
  dispose() {
    // No active timers or listeners to clean up
  }
}
