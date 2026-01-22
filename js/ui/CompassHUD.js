/**
 * CompassHUD - Direction indicator showing goal location
 * Displays an animated compass arrow pointing toward the maze exit
 */

export class CompassHUD {
  constructor() {
    this.container = null;
    this.arrow = null;
    this.distanceLabel = null;
    this.glowRing = null;

    this.playerPos = { x: 0, z: 0 };
    this.goalPos = { x: 0, z: 0 };
    this.isVisible = true;

    this.createHUD();
  }

  createHUD() {
    // Create compass container
    this.container = document.createElement("div");
    this.container.id = "compassHUD";
    this.container.innerHTML = `
      <div class="compass-ring">
        <div class="compass-glow"></div>
        <div class="compass-center">
          <div class="compass-arrow"></div>
        </div>
        <div class="compass-labels">
          <span class="compass-n">N</span>
          <span class="compass-e">E</span>
          <span class="compass-s">S</span>
          <span class="compass-w">W</span>
        </div>
      </div>
      <div class="compass-info">
        <span class="compass-distance">--</span>
        <span class="compass-label">TO GOAL</span>
      </div>
    `;

    document.body.appendChild(this.container);

    // Cache DOM references
    this.arrow = this.container.querySelector(".compass-arrow");
    this.distanceLabel = this.container.querySelector(".compass-distance");
    this.glowRing = this.container.querySelector(".compass-glow");

    // Add styles
    this.injectStyles();
  }

  injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      #compassHUD {
        position: fixed;
        bottom: 20px;
        left: 20px;
        z-index: 50;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        pointer-events: none;
        opacity: 0.9;
        transition: opacity 0.3s ease, transform 0.3s ease;
      }

      #compassHUD.hidden {
        opacity: 0;
        transform: scale(0.8);
      }

      .compass-ring {
        position: relative;
        width: 70px;
        height: 70px;
        border-radius: 50%;
        background: rgba(10, 15, 26, 0.85);
        border: 2px solid rgba(74, 222, 128, 0.3);
        backdrop-filter: blur(10px);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4),
                    inset 0 0 20px rgba(74, 222, 128, 0.1);
      }

      .compass-glow {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(74, 222, 128, 0.2) 0%, transparent 70%);
        animation: compassPulse 2s ease-in-out infinite;
        pointer-events: none;
      }

      @keyframes compassPulse {
        0%, 100% {
          transform: translate(-50%, -50%) scale(1);
          opacity: 0.5;
        }
        50% {
          transform: translate(-50%, -50%) scale(1.15);
          opacity: 0.8;
        }
      }

      .compass-center {
        position: relative;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .compass-arrow {
        width: 0;
        height: 0;
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
        border-bottom: 28px solid #4ade80;
        filter: drop-shadow(0 0 8px rgba(74, 222, 128, 0.8));
        transition: transform 0.15s ease-out;
        transform-origin: center 60%;
      }

      .compass-arrow::after {
        content: '';
        position: absolute;
        top: 16px;
        left: -4px;
        width: 0;
        height: 0;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-top: 14px solid rgba(74, 222, 128, 0.3);
      }

      .compass-labels {
        position: absolute;
        width: 100%;
        height: 100%;
        font-size: 10px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.5);
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      .compass-labels span {
        position: absolute;
      }

      .compass-n { top: 4px; left: 50%; transform: translateX(-50%); color: #ef4444; }
      .compass-e { right: 6px; top: 50%; transform: translateY(-50%); }
      .compass-s { bottom: 4px; left: 50%; transform: translateX(-50%); }
      .compass-w { left: 6px; top: 50%; transform: translateY(-50%); }

      .compass-info {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 6px 14px;
        background: rgba(10, 15, 26, 0.85);
        border: 1px solid rgba(74, 222, 128, 0.2);
        border-radius: 20px;
        backdrop-filter: blur(10px);
      }

      .compass-distance {
        font-size: 16px;
        font-weight: 700;
        color: #4ade80;
        font-family: 'Outfit', sans-serif;
        text-shadow: 0 0 10px rgba(74, 222, 128, 0.5);
      }

      .compass-label {
        font-size: 8px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.5);
        letter-spacing: 1px;
        text-transform: uppercase;
      }

      /* Close proximity effects */
      #compassHUD.close .compass-ring {
        border-color: #fbbf24;
        animation: compassClose 0.5s ease-in-out infinite;
      }

      #compassHUD.close .compass-arrow {
        border-bottom-color: #fbbf24;
        filter: drop-shadow(0 0 12px rgba(251, 191, 36, 0.9));
      }

      #compassHUD.close .compass-distance {
        color: #fbbf24;
        text-shadow: 0 0 15px rgba(251, 191, 36, 0.6);
      }

      #compassHUD.close .compass-glow {
        background: radial-gradient(circle, rgba(251, 191, 36, 0.3) 0%, transparent 70%);
      }

      @keyframes compassClose {
        0%, 100% {
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4),
                      0 0 30px rgba(251, 191, 36, 0.2);
        }
        50% {
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4),
                      0 0 40px rgba(251, 191, 36, 0.4);
        }
      }

      @media (max-width: 768px) {
        #compassHUD {
          bottom: 150px;
          left: 15px;
          transform: scale(0.85);
          transform-origin: bottom left;
        }

        .compass-ring {
          width: 60px;
          height: 60px;
        }

        .compass-arrow {
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-bottom: 22px solid #4ade80;
        }
      }
    `;
    document.head.appendChild(style);
  }

  update(playerX, playerZ, goalX, goalZ, cellSize = 4) {
    this.playerPos = { x: playerX, z: playerZ };
    this.goalPos = { x: goalX, z: goalZ };

    // Calculate direction to goal
    const dx = goalX - playerX;
    const dz = goalZ - playerZ;

    // Calculate angle (in screen space, where Z is "up")
    // Rotate 180 degrees because the maze uses top-left as origin
    let angle = Math.atan2(dx, -dz) * (180 / Math.PI);

    // Apply rotation to arrow
    if (this.arrow) {
      this.arrow.style.transform = `rotate(${angle}deg)`;
    }

    // Calculate distance
    const distance = Math.sqrt(dx * dx + dz * dz);
    const cellDistance = Math.round(distance);

    if (this.distanceLabel) {
      this.distanceLabel.textContent =
        cellDistance === 0 ? "🎯" : `${cellDistance}`;
    }

    // Add "close" effect when near goal
    if (cellDistance <= 3) {
      this.container.classList.add("close");
    } else {
      this.container.classList.remove("close");
    }
  }

  show() {
    this.isVisible = true;
    this.container.classList.remove("hidden");
  }

  hide() {
    this.isVisible = false;
    this.container.classList.add("hidden");
  }

  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  dispose() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
