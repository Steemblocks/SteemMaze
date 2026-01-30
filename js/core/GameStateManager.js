/**
 * GameStateManager.js
 * Manages game level progression, session state, and game initialization
 * Handles: level management, game flow (new game, next level, replay), UI state updates
 */

import { GameRules } from "./GameRules.js";
import { steemIntegration } from "../../steem-integration.js";

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
    // We must PRESERVE the login session though!
    const savedSteemUser = this.game.gameData.get("steemUsername");
    const savedPlayerName = this.game.gameData.get("playerName");

    // Reset all persistent data
    this.game.gameData.reset(); // Resets to default (Level 1, 0 Coins, etc.)

    // Restore login session
    if (savedSteemUser) {
      this.game.gameData.set("steemUsername", savedSteemUser);
    }
    if (savedPlayerName) {
      this.game.gameData.set("playerName", savedPlayerName);
    }

    // If connected, keep the blockchain connection sync
    if (steemIntegration?.isConnected && steemIntegration?.username) {
      this.game.ui.showToast(
        "Started fresh game (Session preserved)",
        "restart_alt",
      );
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

    // Advance to next level
    this.level++;
    this.game.gameData.set("currentLevel", this.level);
    
    // CRITICAL: Sync Game.level with GameStateManager.level
    // These are separate properties and must stay in sync
    this.game.level = this.level;
    
    // CRITICAL: Ensure game is not paused
    this.game.isPaused = false;
    
    // Update UI display
    document.getElementById("levelDisplay").textContent = this.level;
    
    // Now resetGame() will use the correct new level
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
    if (this.game.shop && typeof this.game.shop.manualHUDUpdate === "function") {
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
