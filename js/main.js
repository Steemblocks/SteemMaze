/**
 * SteemMaze - Main Entry Point
 *
 * A 3D maze game integrated with the Steem blockchain.
 * This file serves as the application entry point, initializing
 * all game components and setting up the preloader.
 */

import "../styles/main.css";
import { GameData } from "./core/GameData.js";
import { UIManager } from "./ui/UIManager.js";
import { Game } from "./Game.js";
import { Shop } from "./ui/Shop.js";
import { Manual } from "./ui/Manual.js";
import { steemIntegration, steemConfig, gameRecords, playerRegistry, gameShare } from "./steem/index.js";

// ============================================
// INITIALIZE APPLICATION
// ============================================

// Global variables
let gameDataInstance = new GameData();
let uiManagerInstance = new UIManager(gameDataInstance);
let gameInstance = new Game(gameDataInstance, uiManagerInstance);
let shopInstance = new Shop(gameInstance);
let manualInstance = new Manual();

// Expose instances globally
window.game = gameInstance;
window.ui = uiManagerInstance;
window.steemIntegration = steemIntegration;
window.steemConfig = steemConfig;
window.gameRecords = gameRecords;
window.playerRegistry = playerRegistry;
window.gameShare = gameShare;

// Initialize components
shopInstance.init();
gameInstance.shop = shopInstance;

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
