import { GameRules } from "../core/GameRules.js";

export class ComboMeter {
  constructor() {
    this.container = null;
    this.comboValue = null;
    this.comboBar = null;
    this.multiplierLabel = null;
    this.currentCombo = 0;
    this.maxCombo = 60; // GameRules.LEGENDARY threshold

    this.createMeter();
  }

  // ... (createMeter and injectStyles remain mostly same, just updating getMultiplier) ...

  createMeter() {
    this.container = document.createElement("div");
    this.container.id = "comboMeter";
    this.container.innerHTML = `
      <div class="combo-header">
        <span class="combo-label">COMBO</span>
        <span class="combo-multiplier">×1.0</span>
      </div>
      <div class="combo-bar-container">
        <div class="combo-bar-fill"></div>
        <div class="combo-bar-glow"></div>
      </div>
      <div class="combo-value">0</div>
    `;

    document.body.appendChild(this.container);

    // Cache DOM references
    this.comboValue = this.container.querySelector(".combo-value");
    this.comboBar = this.container.querySelector(".combo-bar-fill");
    this.multiplierLabel = this.container.querySelector(".combo-multiplier");

    this.injectStyles();
  }

  injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      #comboMeter {
        position: fixed;
        top: 70px;
        left: 15px;
        z-index: 50;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
        padding: 10px 14px;
        background: rgba(10, 15, 26, 0.85);
        border: 1px solid rgba(74, 222, 128, 0.2);
        border-radius: 12px;
        backdrop-filter: blur(10px);
        pointer-events: none;
        opacity: 0;
        transform: translateX(-10px);
        transition: all 0.3s ease;
        min-width: 100px;
      }

      #comboMeter.visible {
        opacity: 1;
        transform: translateX(0);
      }

      #comboMeter.active {
        border-color: rgba(74, 222, 128, 0.5);
        box-shadow: 0 0 20px rgba(74, 222, 128, 0.2);
      }

      #comboMeter.max {
        border-color: #fbbf24;
        box-shadow: 0 0 30px rgba(251, 191, 36, 0.3);
        animation: maxComboPulse 0.8s ease-in-out infinite;
      }

      @keyframes maxComboPulse {
        0%, 100% {
          box-shadow: 0 0 30px rgba(251, 191, 36, 0.3);
        }
        50% {
          box-shadow: 0 0 40px rgba(251, 191, 36, 0.5);
        }
      }

      .combo-header {
        display: flex;
        justify-content: space-between;
        width: 100%;
        align-items: center;
      }

      .combo-label {
        font-size: 9px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.5);
        letter-spacing: 2px;
        text-transform: uppercase;
      }

      .combo-multiplier {
        font-size: 14px;
        font-weight: 800;
        color: #4ade80;
        text-shadow: 0 0 10px rgba(74, 222, 128, 0.5);
        transition: all 0.2s ease;
      }

      #comboMeter.max .combo-multiplier {
        color: #fbbf24;
        text-shadow: 0 0 15px rgba(251, 191, 36, 0.6);
        transform: scale(1.1);
      }

      .combo-bar-container {
        position: relative;
        width: 100%;
        height: 4px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
        overflow: hidden;
      }

      .combo-bar-fill {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #4ade80, #22c55e);
        border-radius: 2px;
        transition: width 0.2s ease-out;
      }

      #comboMeter.max .combo-bar-fill {
        background: linear-gradient(90deg, #fbbf24, #f59e0b);
      }

      .combo-bar-glow {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
        transform: translateX(-100%);
        animation: barShine 2s ease-in-out infinite;
      }

      @keyframes barShine {
        0% { transform: translateX(-100%); }
        50%, 100% { transform: translateX(100%); }
      }

      .combo-value {
        font-size: 24px;
        font-weight: 900;
        color: #fff;
        line-height: 1;
        transition: transform 0.15s ease;
      }

      #comboMeter.bump .combo-value {
        transform: scale(1.2);
      }

      /* Tier colors from GameRules */
      .combo-tier-MINOR .combo-multiplier { color: #4ade80; }
      .combo-tier-MODERATE .combo-multiplier { color: #fbbf24; }
      .combo-tier-MAJOR .combo-multiplier { color: #f97316; }
      .combo-tier-SUPER .combo-multiplier { color: #ef4444; }
      .combo-tier-LEGENDARY .combo-multiplier { color: #a855f7; }

      @media (max-width: 768px) {
        #comboMeter {
          top: auto;
          bottom: 230px;
          left: 50%;
          transform: translateX(-50%) translateY(10px);
          min-width: 80px;
          padding: 8px 12px;
        }

        #comboMeter.visible {
          transform: translateX(-50%) translateY(0);
        }

        .combo-value {
          font-size: 20px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  setCombo(value) {
    this.currentCombo = value;

    // Update value display
    if (this.comboValue) {
      this.comboValue.textContent = value;
    }

    // Update bar
    // Scale bar based on next milestone or fixed cap
    const percent = Math.min((value / this.maxCombo) * 100, 100);
    if (this.comboBar) {
      this.comboBar.style.width = `${percent}%`;
    }

    // Update multiplier using GameRules
    const multiplier = GameRules.getComboMultiplier(value);
    if (this.multiplierLabel) {
      this.multiplierLabel.textContent = `×${multiplier.toFixed(2)}`;
    }

    // Show/hide based on combo
    if (value > 0) {
      this.container.classList.add("visible", "active");
    } else {
      this.container.classList.remove(
        "visible",
        "active",
        "max",
        "combo-tier-MINOR",
        "combo-tier-MODERATE",
        "combo-tier-MAJOR",
        "combo-tier-SUPER",
        "combo-tier-LEGENDARY",
      );
    }

    // Max combo effect
    if (value >= GameRules.COMBO_THRESHOLDS.LEGENDARY) {
      this.container.classList.add("max");
    } else {
      this.container.classList.remove("max");
    }

    // Tier colors
    const tier = GameRules.getComboTier(value);
    // clean old classes
    this.container.classList.remove(
      "combo-tier-MINOR",
      "combo-tier-MODERATE",
      "combo-tier-MAJOR",
      "combo-tier-SUPER",
      "combo-tier-LEGENDARY",
    );
    if (tier) {
      this.container.classList.add(`combo-tier-${tier}`);
    }

    // Bump animation
    this.container.classList.add("bump");
    setTimeout(() => {
      this.container.classList.remove("bump");
    }, 150);
  }

  getMultiplier(combo) {
    // Deprecated: Uses GameRules now
    return GameRules.getComboMultiplier(combo);
  }

  reset() {
    this.setCombo(0);
  }

  breakCombo() {
    // Flash red when combo breaks
    if (this.currentCombo > 2) {
      this.container.style.borderColor = "#ef4444";
      this.container.style.boxShadow = "0 0 20px rgba(239, 68, 68, 0.3)";
      setTimeout(() => {
        this.container.style.borderColor = "";
        this.container.style.boxShadow = "";
      }, 300);
    }
    this.setCombo(0);
  }

  dispose() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
