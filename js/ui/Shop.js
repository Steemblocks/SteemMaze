import { GameRules } from "../core/GameRules.js";
import * as THREE from "three";

export class Shop {
  constructor(game) {
    this.game = game;
    this.sidebar = document.getElementById("shopSidebar");
    this.shopBtn = document.getElementById("openShopBtn");
    this.closeBtn = document.getElementById("closeShopBtn");
    this.buyLightBtn = document.getElementById("buyLightBtn");
    this.hudLightBurstBtn = document.getElementById("buyLightBurstBtn"); // HUD button
    this.buyPotionBtn = document.getElementById("shopBuyPotionBtn"); // The one in sidebar
    this.hudPotionBtn = document.getElementById("buyPotionBtn"); // The one in HUD
    this.buyFogRemoverBtn = document.getElementById("buyFogRemoverBtn"); // Shop button
    this.hudFogRemoverBtn = document.getElementById("useFogRemoverBtn"); // HUD button

    this.lightBoostActive = false;
    this.lightBoostTimeout = null;
    this.fogRemoverActive = false;
    this.fogRemoverTimeout = null;
    this.defaultFogDensity = 0.08; // Fallback
  }

  reset() {
    if (this.lightBoostTimeout) {
      clearTimeout(this.lightBoostTimeout);
      this.lightBoostTimeout = null;
    }
    this.lightBoostActive = false;

    if (this.fogRemoverTimeout) {
      clearTimeout(this.fogRemoverTimeout);
      this.fogRemoverTimeout = null;
    }
    this.fogRemoverActive = false;
  }

  init() {
    this.setupListeners();
    this.manualHUDUpdate(); // Initial update
  }

  setupListeners() {
    if (this.shopBtn) {
      // Prevent double audio if global listener catches it, manual play + attribute
      this.shopBtn.setAttribute("data-no-click-sound", "true");
      this.shopBtn.onclick = () => {
        if (this.game.audioManager) this.game.audioManager.playClick();
        this.toggle(true);
      };
    }
    if (this.closeBtn) {
      this.closeBtn.setAttribute("data-no-click-sound", "true");
      this.closeBtn.onclick = () => {
        if (this.game.audioManager) this.game.audioManager.playClick();
        this.toggle(false);
      };
    }
    // Close on overlay click
    if (this.sidebar) {
      this.sidebar.onclick = (e) => {
        if (e.target === this.sidebar) this.toggle(false);
      };
    }

    if (this.buyLightBtn) {
      this.buyLightBtn.setAttribute("data-no-click-sound", "true");
      this.buyLightBtn.onclick = () => this.buyLight();
    }

    if (this.hudLightBurstBtn) {
      this.hudLightBurstBtn.onclick = () => this.useLightBurst();
    }

    // Optional: Hook up potion button if desired
    if (this.buyPotionBtn) {
      this.buyPotionBtn.setAttribute("data-no-click-sound", "true");
      this.buyPotionBtn.onclick = () => {
        // Reuse Game's buy potion logic if transparent or duplicate here
        // Assuming Game has a buyPotion method or we handle it here
        this.buyPotion();
      };
    }

    if (this.hudPotionBtn) {
      this.hudPotionBtn.onclick = () => this.usePotion();
    }

    if (this.buyFogRemoverBtn) {
      this.buyFogRemoverBtn.setAttribute("data-no-click-sound", "true");
      this.buyFogRemoverBtn.onclick = () => this.buyFogRemover();
    }

    if (this.hudFogRemoverBtn) {
      this.hudFogRemoverBtn.onclick = () => this.useFogRemover();
    }
  }

  toggle(show) {
    if (this.sidebar) {
      this.sidebar.classList.toggle("active", show);
    }
  }

  buyLight() {
    const COST = 10;

    if (this.game.totalCoins >= COST) {
      // Deduct Coins
      this.game.totalCoins -= COST;
      this.game.lightBurstCount = (this.game.lightBurstCount || 0) + 1;

      this.game.gameData.set("totalCoins", this.game.totalCoins);

      // AUDIO: Play buy sound
      if (this.game.audioManager) this.game.audioManager.playBuy();

      // Update UI
      this.game.updateHUD ? this.game.updateHUD() : this.manualHUDUpdate();

      // Visual Feedback
      this.game.ui.showToast(
        `Light Burst Purchased! You have ${this.game.lightBurstCount}`,
        "light_mode",
        "shop_buy_light",
      );
    } else {
      this.game.ui.showToast("Not enough coins! Need 10", "error");
    }
  }

  useLightBurst() {
    const count = this.game.lightBurstCount || 0;

    if (this.lightBoostActive) {
      this.game.ui.showToast("Light Burst already active!", "timer");
      return;
    }

    if (count > 0) {
      this.game.lightBurstCount--;

      // Activate Effect
      this.activateLightBoost();

      this.game.updateHUD ? this.game.updateHUD() : this.manualHUDUpdate();

      this.game.ui.showToast("Light Burst! Enemies flee!", "light_mode");
      if (this.game.screenEffects) {
        this.game.screenEffects.flash(0xffd700, 0.3);
      }
    } else {
      this.game.ui.showToast("No Light Bursts! Buy from Shop.", "error");
    }
  }

  buyPotion() {
    const COST = 50;
    if (this.game.totalCoins >= COST) {
      this.game.totalCoins -= COST;
      this.game.potionCount = (this.game.potionCount || 0) + 1;

      this.game.gameData.set("totalCoins", this.game.totalCoins);

      // AUDIO: Play buy sound
      if (this.game.audioManager) this.game.audioManager.playBuy();

      // Save potion count if we were persisting it, for now locally in game session
      // this.game.gameData.set("potionCount", this.game.potionCount);

      // Helper to update UI
      this.game.updateHUD ? this.game.updateHUD() : this.manualHUDUpdate();

      this.game.ui.showToast(
        `Potion Purchased! You have ${this.game.potionCount}`,
        "science",
        "shop_buy_potion",
      );
    } else {
      this.game.ui.showToast("Not enough coins! Need 50", "error");
    }
  }

  usePotion() {
    // Ensure potionCount is defined
    const potionCount = this.game.potionCount || 0;

    if (this.game.isPotionActive) {
      this.game.ui.showToast("Potion already active!", "timer");
      return;
    }

    if (potionCount > 0) {
      this.game.potionCount--;

      // Activate potion mode in Game
      this.game.activatePotion();

      this.game.updateHUD ? this.game.updateHUD() : this.manualHUDUpdate();

      this.game.ui.showToast(
        "Zombie Potion Activated! Crash into zombies!",
        "science",
      );

      // Visual feedback
      if (this.game.screenEffects) {
        this.game.screenEffects.flash(0xff00ff, 0.4); // Purple flash for activation
      }
    } else {
      this.game.ui.showToast("No potions! Buy from Shop first.", "error");
    }
  }

  buyFogRemover() {
    const COST = 25;
    if (this.game.totalCoins >= COST) {
      this.game.totalCoins -= COST;
      this.game.fogRemoverCount = (this.game.fogRemoverCount || 0) + 1;

      this.game.gameData.set("totalCoins", this.game.totalCoins);

      // AUDIO: Play buy sound
      if (this.game.audioManager) this.game.audioManager.playBuy();

      // Update UI
      this.game.updateHUD ? this.game.updateHUD() : this.manualHUDUpdate();

      // Visual Feedback
      this.game.ui.showToast(
        `Fog Remover Purchased! You have ${this.game.fogRemoverCount}`,
        "blur_off",
        "shop_buy_fog",
      );
    } else {
      this.game.ui.showToast("Not enough coins! Need 25", "error");
    }
  }

  useFogRemover() {
    const count = this.game.fogRemoverCount || 0;

    if (this.fogRemoverActive) {
      this.game.ui.showToast("Fog already cleared!", "blur_off");
      return;
    }

    if (count > 0) {
      this.game.fogRemoverCount--;

      // Activate Effect
      this.activateFogRemover();

      this.game.updateHUD ? this.game.updateHUD() : this.manualHUDUpdate();

      this.game.ui.showToast(
        "Fog Cleared! Crystal clear visibility!",
        "blur_off",
      );
      if (this.game.screenEffects) {
        this.game.screenEffects.flash(0x06b6d4, 0.3); // Cyan flash
      }
    } else {
      this.game.ui.showToast("No Fog Removers! Buy from Shop.", "error");
    }
  }

  manualHUDUpdate() {
    // Fallback if game.updateHUD doesn't exist
    const coinEl = document.getElementById("coinsDisplay");
    if (coinEl) coinEl.textContent = this.game.totalCoins;
    const livesEl = document.getElementById("livesCount");
    if (livesEl) livesEl.textContent = this.game.lives;

    // Update potion count in HUD
    const potionVal = document.querySelector("#buyPotionBtn .stat-value");
    if (potionVal) potionVal.textContent = this.game.potionCount || 0;

    // Update Light Burst Count
    const lightVal = document.querySelector("#buyLightBurstBtn .stat-value");
    if (lightVal) {
      lightVal.textContent = this.game.lightBurstCount || 0;
    }

    // Update Fog Remover Count
    const fogVal = document.querySelector("#useFogRemoverBtn .stat-value");
    if (fogVal) {
      fogVal.textContent = this.game.fogRemoverCount || 0;
    }
  }

  activateLightBoost() {
    if (!this.game.scene.fog) return;

    // AUDIO: Play light burst sound
    if (this.game.audioManager) this.game.audioManager.playLightBurst();

    // Cancel any upcoming dense fog events (Level 7+ startup logic)
    if (this.game.cancelFogEvents) {
      this.game.cancelFogEvents();
    }

    // Cancel any darkness pulse effect
    if (this.game.darknessPulseInterval) {
      clearInterval(this.game.darknessPulseInterval);
      this.game.darknessPulseInterval = null;
    }

    // Cancel horde spawn check and despawn existing horde
    if (this.game.hordeCheckTimeout) {
      clearTimeout(this.game.hordeCheckTimeout);
      this.game.hordeCheckTimeout = null;
    }

    // NOTE: Light Burst does NOT despawn zombies anymore
    // Zombies are independent - they only disappear when killed by player
    // Light Burst just makes enemies flee (repel effect)

    // Store original density if not already stored
    if (!this.lightBoostActive) {
      this.defaultFogDensity =
        this.game.defaultFogDensity || this.game.scene.fog.density || 0.02;
    }

    this.lightBoostActive = true;
    this.game.isLightBoostActive = true; // Track in game for zombie repelling

    // Pause weather fog effects while potion is active
    if (this.game.weatherManager) {
      this.game.weatherManager.pauseFogEffects();
    }

    // Apply Boost: Crystal clear vision
    this.game.scene.fog.density = 0.0;

    // Add golden glow during Light Boost
    if (this.game.player) {
      this.game.player.activateLightBoostEffect();
    }

    // Reset Timer
    if (this.lightBoostTimeout) clearTimeout(this.lightBoostTimeout);

    this.lightBoostTimeout = setTimeout(() => {
      this.deactivateLightBoost();
    }, 5000); // 5 Seconds
  }

  deactivateLightBoost() {
    this.lightBoostActive = false;
    this.lightBoostTimeout = null;
    this.game.isLightBoostActive = false; // Clear repelling flag

    // Resume weather fog effects
    if (this.game.weatherManager) {
      this.game.weatherManager.resumeFogEffects();
    } else if (this.game.scene.fog) {
      // Fallback: Restore fog manually if no weather manager
      this.game.scene.fog.density = this.defaultFogDensity;
    }

    this.game.ui.showToast("Light Boost Ended", "dark_mode");

    // Restore player color (respecting active potion)
    if (this.game.player) {
      if (this.game.isPotionActive) {
        this.game.player.activatePotionEffect();
      } else {
        this.game.player.resetColor();
      }
    }
  }

  activateFogRemover() {
    if (!this.game.scene.fog) return;

    // AUDIO: Play fog remove sound
    if (this.game.audioManager) this.game.audioManager.playFogRemove();

    // Cancel any upcoming dense fog events (Level 7+ startup logic)
    if (this.game.cancelFogEvents) {
      this.game.cancelFogEvents();
    }

    // Cancel any darkness pulse effect
    if (this.game.darknessPulseInterval) {
      clearInterval(this.game.darknessPulseInterval);
      this.game.darknessPulseInterval = null;
    }

    // Cancel horde spawn check and despawn existing horde
    if (this.game.hordeCheckTimeout) {
      clearTimeout(this.game.hordeCheckTimeout);
      this.game.hordeCheckTimeout = null;
    }

    // NOTE: Fog Remover does NOT despawn zombies anymore
    // Zombies are independent - they only disappear when killed by player
    // Fog Remover just clears the fog for better visibility

    // Store original density if not already stored
    if (!this.fogRemoverActive) {
      this.defaultFogDensity =
        this.game.defaultFogDensity || this.game.scene.fog.density || 0.02;
    }

    this.fogRemoverActive = true;

    // Pause weather fog effects while potion is active
    if (this.game.weatherManager) {
      this.game.weatherManager.pauseFogEffects();
    }

    // Apply Effect: Reduce fog significantly (but not to 0, just very clear)
    this.game.scene.fog.density = 0.005;

    // Reset Timer
    if (this.fogRemoverTimeout) clearTimeout(this.fogRemoverTimeout);

    this.fogRemoverTimeout = setTimeout(() => {
      this.deactivateFogRemover();
    }, 20000); // 20 Seconds
  }

  deactivateFogRemover() {
    this.fogRemoverActive = false;
    this.fogRemoverTimeout = null;

    // Resume weather fog effects
    if (this.game.weatherManager) {
      this.game.weatherManager.resumeFogEffects();
    } else if (this.game.scene.fog) {
      // Fallback: Restore fog manually if no weather manager
      this.game.scene.fog.density = this.defaultFogDensity;
    }

    this.game.ui.showToast("Fog Remover Ended", "blur_on");
  }
}
