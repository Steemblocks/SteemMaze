/**
 * UIUpdater.js
 * Manages all UI display updates and interactions
 * Handles: HUD display, floating text, compass, combo meter, lives display, and screen feedback
 */

import * as THREE from "three";

export class UIUpdater {
  constructor(game) {
    this.game = game;
  }

  /**
   * Update all HUD elements with current game state
   * Called periodically to keep UI in sync with gameplay
   */
  updateHUD() {
    // Update coins display
    const coinEl = document.getElementById("coinsDisplay");
    if (coinEl) {
      coinEl.textContent = this.game.totalCoins;
    }

    // Update lives display
    const livesEl = document.getElementById("livesCount");
    if (livesEl) {
      livesEl.textContent = this.game.lives;
    }

    // Update level display
    const levelEl = document.getElementById("levelDisplay");
    if (levelEl) {
      levelEl.textContent = this.game.level;
    }

    // Update potion count
    const potionVal = document.querySelector("#buyPotionBtn .stat-value");
    if (potionVal) {
      potionVal.textContent = this.game.potionCount || 0;
    }

    // Update light burst count
    const lightVal = document.querySelector("#buyLightBurstBtn .stat-value");
    if (lightVal) {
      lightVal.textContent = this.game.lightBurstCount || 0;
    }

    // Update fog remover count
    const fogVal = document.querySelector("#useFogRemoverBtn .stat-value");
    if (fogVal) {
      fogVal.textContent = this.game.fogRemoverCount || 0;
    }

    // Update compass HUD with current position
    if (this.game.compassHUD && this.game.playerPos && this.game.goal) {
      this.game.compassHUD.update(
        this.game.playerPos.x,
        this.game.playerPos.z,
        this.game.goal.position.x / this.game.CELL_SIZE,
        this.game.goal.position.z / this.game.CELL_SIZE,
        this.game.CELL_SIZE,
      );
    }

    // Update combo meter if it exists
    if (this.game.comboMeter) {
      this.game.comboMeter.setCombo(this.game.scoringSystem?.currentCombo || 0);
    }
  }

  /**
   * Shows floating 3D text at a world position
   * @param {THREE.Vector3} position - 3D world position
   * @param {string} text - Text to display
   * @param {string} color - CSS color string
   */
  showFloatingText(position, text, color = "#ffffff") {
    // Project 3D position to 2D screen coordinates
    const vector = position.clone();
    vector.y += 1.5; // Offset slightly above object
    vector.project(this.game.camera);

    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-(vector.y * 0.5) + 0.5) * window.innerHeight;

    // Create DOM element
    const el = document.createElement("div");
    el.textContent = text;
    el.style.position = "absolute";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color;
    el.style.fontFamily = "'Outfit', sans-serif";
    el.style.fontWeight = "800";
    el.style.fontSize = "1.5rem";
    el.style.pointerEvents = "none";
    el.style.textShadow = "0 2px 4px rgba(0,0,0,0.5)";
    el.style.zIndex = "1000";
    el.style.transform = "translate(-50%, -50%)";
    el.style.transition = "all 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
    el.style.opacity = "1";

    document.body.appendChild(el);

    // Animate
    requestAnimationFrame(() => {
      el.style.transform = "translate(-50%, -150%) scale(1.2)";
      el.style.opacity = "0";
    });

    // Cleanup
    setTimeout(() => {
      document.body.removeChild(el);
    }, 800);
  }

  /**
   * Update lives display with animation
   */
  updateLivesDisplay() {
    const livesEl = document.getElementById("livesCount");
    if (livesEl) {
      livesEl.textContent = this.game.lives;
      // Highlight animation
      livesEl.classList.add("pulse");
      setTimeout(() => livesEl.classList.remove("pulse"), 300);
    }
  }

  /**
   * Update compass HUD position and direction
   */
  updateCompass() {
    if (this.game.compassHUD && this.game.playerPos && this.game.goal) {
      this.game.compassHUD.update(
        this.game.playerPos.x,
        this.game.playerPos.z,
        this.game.goal.position.x / this.game.CELL_SIZE,
        this.game.goal.position.z / this.game.CELL_SIZE,
        this.game.CELL_SIZE,
      );
    }
  }

  /**
   * Update combo meter display
   */
  updateComboDisplay() {
    if (this.game.comboMeter) {
      this.game.comboMeter.setCombo(this.game.scoringSystem?.currentCombo || 0);
    }
  }

  /**
   * Reset all UI elements for new level/game
   */
  resetUI() {
    // Reset moves display
    const movesEl = document.getElementById("moves");
    if (movesEl) {
      movesEl.textContent = "0";
    }

    // Reset time display
    const timeEl = document.getElementById("time");
    if (timeEl) {
      timeEl.textContent = "0:00";
    }

    // Reset score display
    const scoreEl = document.getElementById("scoreDisplay");
    if (scoreEl) {
      scoreEl.textContent = "0";
    }

    // Reset combo meter
    if (this.game.comboMeter) {
      this.game.comboMeter.reset();
    }

    // Reset compass
    if (this.game.compassHUD) {
      this.game.compassHUD.update(
        this.game.playerPos.x,
        this.game.playerPos.z,
        0,
        0,
        this.game.CELL_SIZE,
      );
      this.game.compassHUD.show();
    }

    // Hide screens
    const victoryScreen = document.getElementById("victoryScreen");
    if (victoryScreen) victoryScreen.classList.remove("active");

    const gameOverScreen = document.getElementById("gameOverScreen");
    if (gameOverScreen) gameOverScreen.classList.remove("active");
  }

  /**
   * Hide compass HUD
   */
  hideCompass() {
    if (this.game.compassHUD) {
      this.game.compassHUD.hide();
    }
  }

  /**
   * Show compass HUD
   */
  showCompass() {
    if (this.game.compassHUD) {
      this.game.compassHUD.show();
    }
  }

  /**
   * Toggle compass visibility
   */
  toggleCompass() {
    if (this.game.compassHUD) {
      this.game.compassHUD.toggle();
    }
  }

  /**
   * Show HUD elements
   */
  showHUD() {
    const hud = document.getElementById("hud");
    if (hud) {
      hud.style.display = "flex";
    }
  }

  /**
   * Hide HUD elements
   */
  hideHUD() {
    const hud = document.getElementById("hud");
    if (hud) {
      hud.style.display = "none";
    }
  }

  /**
   * Update coins display
   */
  updateCoinsDisplay() {
    const coinEl = document.getElementById("coinsDisplay");
    if (coinEl) {
      coinEl.textContent = this.game.totalCoins;
    }
  }

  /**   * Update time display with formatted time
   * @param {number} seconds - Time in seconds
   */
  updateTimeDisplay(seconds) {
    const timeEl = document.getElementById("time");
    if (
      timeEl &&
      this.game.ui &&
      typeof this.game.ui.formatTime === "function"
    ) {
      timeEl.textContent = this.game.ui.formatTime(seconds);
    }
  }

  /**   * Flash screen with a color effect (e.g., red for damage)
   * @param {string} color - CSS color for the flash
   * @param {number} duration - Duration in milliseconds
   */
  flashScreen(color = "rgba(239, 68, 68, 0.7)", duration = 250) {
    const canvas = this.game.canvas;
    if (canvas) {
      canvas.style.boxShadow = `inset 0 0 100px ${color}`;
      setTimeout(() => (canvas.style.boxShadow = "none"), duration);
    }
  }

  /**
   * Reset UI state for new game
   */
  reset() {
    this.resetUI();
  }

  /**
   * Cleanup UI resources
   */
  dispose() {
    // UI cleanup if needed
  }
}
