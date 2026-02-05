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
 * - js/steem/                - Steem blockchain integration (modular)
 * - animation-cache.js       - Animation optimization
 */

import "../styles/main.css";
import { GameData } from "./core/GameData.js";
import { UIManager } from "./ui/UIManager.js";
import { Game } from "./Game.js";
import { Shop } from "./ui/Shop.js";
import { Manual } from "./ui/Manual.js";
import { steemIntegration, steemConfig, gameRecords, playerRegistry, gameShare } from "./steem/index.js";

// ============================================
// INITIALIZE STEEM INTEGRATION
// ============================================
// Async initialization function that properly loads configuration
async function initializeSteemConfig() {
  try {
    // Try to load configuration from steem-config.local.js first
    // IMPORTANT: Await this to ensure config is loaded before game starts
    const configLoaded = await steemConfig.loadFromConfigFile();
    if (configLoaded) {
      console.log("✓ Steem configuration loaded from steem-config.local.js");
    }
  } catch (error) {
    console.debug('Note: Could not load steem-config.local.js:', error);
  }
  
  // Also load from environment variables (they override config file)
  steemConfig.loadFromEnv();
  
  // Verify that game records configuration is ready
  if (steemConfig.isGameRecordsConfigured()) {
    console.log("✓ Game records posting is configured and ready");
  } else {
    console.warn("⚠ Game records posting is NOT configured - records will not be saved to blockchain");
  }
}

// ============================================
// INITIALIZE APPLICATION
// ============================================

// Global variables
let gameDataInstance = null;
let uiManagerInstance = null;
let gameInstance = null;
let shopInstance = null;
let manualInstance = null;

// Initialize Steem config first, then create game
initializeSteemConfig().then(() => {
  // Create game data manager
  gameDataInstance = new GameData();

  // Create UI manager (handles all screen interactions)
  uiManagerInstance = new UIManager(gameDataInstance);

  // Create and expose game instance globally for UI event handlers
  gameInstance = new Game(gameDataInstance, uiManagerInstance);
  window.game = gameInstance;
  
  // Expose UI manager globally for share modal handlers
  window.ui = uiManagerInstance;

  // Initialize Shop
  shopInstance = new Shop(gameInstance);
  shopInstance.init();
  gameInstance.shop = shopInstance; // Expose shop to game if needed

  // Initialize Manual
  manualInstance = new Manual();
}).catch((error) => {
  console.error("Failed to initialize Steem config:", error);
  // Still initialize game even if Steem config fails
  gameDataInstance = new GameData();
  uiManagerInstance = new UIManager(gameDataInstance);
  gameInstance = new Game(gameDataInstance, uiManagerInstance);
  window.game = gameInstance;
  
  window.ui = uiManagerInstance;
  
  shopInstance = new Shop(gameInstance);
  shopInstance.init();
  gameInstance.shop = shopInstance;

  manualInstance = new Manual();
});

// ============================================
// EXPOSE STEEM INTEGRATION GLOBALLY
// ============================================
window.steemIntegration = steemIntegration;
window.steemConfig = steemConfig;
window.gameRecords = gameRecords;
window.playerRegistry = playerRegistry;
window.gameShare = gameShare;

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
  window.gameData = gameDataInstance;
  window.uiManager = uiManagerInstance;
}
// ============================================
// SERVICE WORKER REGISTRATION (Production Only)
// ============================================
if ("serviceWorker" in navigator && !import.meta.env?.DEV) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("SW registered: ", registration);
      })
      .catch((registrationError) => {
        console.log("SW registration failed: ", registrationError);
      });
  });
}
