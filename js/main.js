/**
 * SteemMaze - Main Entry Point
 *
 * A 3D maze game integrated with the Steem blockchain.
 * This file serves as the application entry point, initializing
 * all game components and setting up the preloader.
 *
 * Module Structure:
 * - js/core/GameData.js      - Game data persistence
 * - js/core/Achievements.js  - Achievement definitions
 * - js/entities/Zombie.js    - Zombie enemy class
 * - js/ui/UIManager.js       - UI management
 * - js/Game.js               - Main game logic
 * - steem-integration.js     - Steem blockchain integration
 * - animation-cache.js       - Animation optimization
 */

import "../style.css";
import { GameData } from "./core/GameData.js";
import { UIManager } from "./ui/UIManager.js";
import { Game } from "./Game.js";
import { Shop } from "./ui/Shop.js";

// ============================================
// INITIALIZE APPLICATION
// ============================================

// Create game data manager
const gameData = new GameData();

// Create UI manager (handles all screen interactions)
const uiManager = new UIManager(gameData);

// Create and expose game instance globally for UI event handlers
window.game = new Game(gameData, uiManager);

// Expose UI manager globally for share modal handlers
window.ui = uiManager;

// Initialize Shop
const shop = new Shop(window.game);
shop.init();
window.game.shop = shop; // Expose shop to game if needed

// ============================================
// PRELOADER
// ============================================
window.addEventListener("load", () => {
  // Delay preloader hide for smooth reveal animation
  setTimeout(() => {
    const preloader = document.getElementById("preloader");
    if (preloader) {
      preloader.classList.add("hidden");
    }
  }, 1000);
});

// ============================================
// DEBUG HELPERS (Development Only)
// ============================================
if (import.meta.env?.DEV) {
  // Expose modules for debugging in development
  window.gameData = gameData;
  window.uiManager = uiManager;
}
