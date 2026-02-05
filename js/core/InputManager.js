/**
 * InputManager.js
 * Manages all player input handling - keyboard, mouse, and touch controls
 * Handles: player movement, pause input, mouse tracking, window resize, D-pad controls
 */

export class InputManager {
  constructor(game) {
    this.game = game;

    // Input state
    this.mouseX = 0;
    this.mouseY = 0;

    // Store event handlers for cleanup
    this._resizeHandler = null;
    this._mouseMoveHandler = null;
    this._keyDownHandler = null;
    this._mobileHandlers = new Map(); // Store mobile button handlers
    
    // Track if listeners are already attached to prevent double-registration
    this._listenersAttached = false;
  }

  /**
   * Get mouse X position (normalized -1 to 1)
   */
  getMouseX() {
    return this.mouseX;
  }

  /**
   * Get mouse Y position (normalized -1 to 1)
   */
  getMouseY() {
    return this.mouseY;
  }

  /**
   * Handle player movement in a direction
   * @param {number} dx - X direction (-1, 0, 1)
   * @param {number} dz - Z direction (-1, 0, 1)
   */
  movePlayer(dx, dz) {
    if (this.game.won || this.game.isPaused) return;

    if (!this.game.isRunning) {
      this.game.isRunning = true;
      this.game.startTimer();
    }

    const newX = this.game.playerPos.x + dx;
    const newZ = this.game.playerPos.z + dz;

    // Bounds check
    if (
      newX < 0 ||
      newX >= this.game.MAZE_SIZE ||
      newZ < 0 ||
      newZ >= this.game.MAZE_SIZE
    ) {
      this.game.onWallHit();
      return;
    }

    // Wall check
    const cell = this.game.maze[this.game.playerPos.z][this.game.playerPos.x];
    if (dx === 1 && cell.right) {
      this.game.onWallHit();
      return;
    }
    if (dx === -1 && cell.left) {
      this.game.onWallHit();
      return;
    }
    if (dz === 1 && cell.bottom) {
      this.game.onWallHit();
      return;
    }
    if (dz === -1 && cell.top) {
      this.game.onWallHit();
      return;
    }

    // Valid move - update position
    this.game.playerPos.x = newX;
    this.game.playerPos.z = newZ;
    this.game.entityManager.playerPos = { ...this.game.playerPos }; // Sync with entityManager
    this.game.entityManager.updatePlayerPosition(dx, dz);

    // Update camera direction for look-ahead
    if (this.game.cameraController) {
      this.game.cameraController.setPlayerDirection(dx, dz);
    }

    // Emit particle trail
    if (this.game.particleTrail && this.game.playerMesh) {
      this.game.particleTrail.emit(this.game.playerMesh.position, 2);
    }

    // Update combo system
    this.game.scoringSystem.updateCombo();

    // Update compass
    if (this.game.compassHUD) {
      this.game.compassHUD.update(
        this.game.playerPos.x,
        this.game.playerPos.z,
        0,
        0,
        this.game.CELL_SIZE,
      );
    }

    // Increment moves counter
    this.game.moves++;
    document.getElementById("moves").textContent = this.game.moves;

    // Animate the counter
    const movesEl = document.getElementById("moves");
    movesEl.classList.add("animate");
    setTimeout(() => movesEl.classList.remove("animate"), 300);

    // Vibration feedback
    if (this.game.gameData.getSetting("vibration") && navigator.vibrate)
      navigator.vibrate(10);

    // Check for gem collection
    this.game.checkGemCollection();

    // Check for coin collection (+ magnet effect)
    this.game.checkCoinCollection();

    // Check for power-up collection
    this.game.checkPowerUpCollection();

    // Check for zombie collision
    this.game.checkZombieCollision();

    // Trigger random events at higher levels
    this.game.triggerRandomEvent();

    // Update camera events for dynamic mode
    this.game.updateCameraEvents();

    // Win check
    if (this.game.playerPos.x === 0 && this.game.playerPos.z === 0)
      this.game.triggerVictory();
  }

  /**
   * Toggle game pause state
   */
  togglePause() {
    if (this.game.won) return;
    this.game.isPaused = !this.game.isPaused;
    const pauseScreen = document.getElementById("pauseScreen");
    if (this.game.isPaused) {
      pauseScreen.style.display = "grid";
      // Force reflow
      pauseScreen.offsetHeight;
      pauseScreen.classList.add("active");
    } else {
      pauseScreen.classList.remove("active");
      setTimeout(() => {
        if (!this.game.isPaused) pauseScreen.style.display = "";
      }, 300); // Wait for transition
    }
  }

  /**
   * Setup all event listeners for input
   * Handles:
   * - Window resize for camera/renderer
   * - Mouse movement for camera look
   * - Keyboard controls (arrow keys and WASD)
   * - Mobile/touch controls (D-pad buttons)
   * - Escape key for pause
   */
  setupEventListeners() {
    // CRITICAL: Prevent double-registration of event listeners
    // This can happen when resetGame() disposes and re-attaches listeners
    // Without this check, keys trigger movement TWICE (moving 2 blocks instead of 1)
    if (this._listenersAttached) {
      console.warn("InputManager: Event listeners already attached, skipping re-registration");
      return;
    }

    // Window resize listener
    this._resizeHandler = () => this._onWindowResize();
    window.addEventListener("resize", this._resizeHandler);

    // Mouse movement tracking for camera
    this._mouseMoveHandler = (e) => {
      this.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    document.addEventListener("mousemove", this._mouseMoveHandler);

    // Keyboard input - attach to window for better capture
    this._keyDownHandler = (e) => this._onKeyDown(e);
    window.addEventListener("keydown", this._keyDownHandler);

    // Mobile / D-Pad Controls
    this._setupMobileControls();
    
    // Mark listeners as attached
    this._listenersAttached = true;
  }

  /**
   * Handle window resize event
   * @private
   */
  _onWindowResize() {
    // Update main camera
    this.game.camera.aspect = window.innerWidth / window.innerHeight;
    this.game.camera.updateProjectionMatrix();
    this.game.renderer.setSize(window.innerWidth, window.innerHeight);

    // Update background camera/renderer via worldGenerator
    if (this.game.worldGenerator) {
      this.game.worldGenerator.bgCamera.aspect =
        window.innerWidth / window.innerHeight;
      this.game.worldGenerator.bgCamera.updateProjectionMatrix();
      this.game.worldGenerator.bgRenderer.setSize(
        window.innerWidth,
        window.innerHeight,
      );
    }

    // Resize post-processing
    if (this.game.postProcessing) {
      this.game.postProcessing.setSize(window.innerWidth, window.innerHeight);
    }
  }

  /**
   * Handle keyboard input
   * @private
   * @param {KeyboardEvent} e - The keyboard event
   */
  _onKeyDown(e) {
    // Check for gameScreen or allow pause from any screen
    if (e.key === "Escape" || e.key === "Esc") {
      this.togglePause();
      e.preventDefault();
      return;
    }

    // Only allow movement on game screen
    if (this.game.ui.currentScreen !== "gameScreen") return;

    // Ignore movement input if paused
    if (this.game.isPaused) return;

    const key = e.key.toLowerCase();

    // Movement keys
    if (key === "arrowup" || key === "w") {
      e.preventDefault();
      this.movePlayer(0, -1);
    } else if (key === "arrowdown" || key === "s") {
      e.preventDefault();
      this.movePlayer(0, 1);
    } else if (key === "arrowleft" || key === "a") {
      e.preventDefault();
      this.movePlayer(-1, 0);
    } else if (key === "arrowright" || key === "d") {
      e.preventDefault();
      this.movePlayer(1, 0);
    }
  }

  /**
   * Setup mobile D-pad controls
   * @private
   */
  _setupMobileControls() {
    document.querySelectorAll(".control-btn").forEach((btn) => {
      const handleInput = (e) => {
        e.preventDefault(); // Prevent double-firing on some devices
        if (this.game.ui.currentScreen !== "gameScreen" || this.game.isPaused)
          return;

        const dir = btn.dataset.dir;
        if (dir === "up") this.movePlayer(0, -1);
        else if (dir === "down") this.movePlayer(0, 1);
        else if (dir === "left") this.movePlayer(-1, 0);
        else if (dir === "right") this.movePlayer(1, 0);
      };

      // Store handlers for cleanup
      this._mobileHandlers.set(btn, {
        touchstart: handleInput,
        mousedown: handleInput,
      });

      // Add both touch and click for responsiveness
      btn.addEventListener("touchstart", handleInput, { passive: false });
      btn.addEventListener("mousedown", handleInput);
    });
  }

  /**
   * Dispose of input manager resources and cleanup all event listeners to prevent memory leaks
   */
  dispose() {
    // Remove window and document event listeners
    if (this._resizeHandler) {
      window.removeEventListener("resize", this._resizeHandler);
    }
    if (this._mouseMoveHandler) {
      document.removeEventListener("mousemove", this._mouseMoveHandler);
    }
    if (this._keyDownHandler) {
      window.removeEventListener("keydown", this._keyDownHandler);
    }

    // Remove mobile button event listeners
    this._mobileHandlers.forEach((handlers, btn) => {
      if (handlers.touchstart) {
        btn.removeEventListener("touchstart", handlers.touchstart);
      }
      if (handlers.mousedown) {
        btn.removeEventListener("mousedown", handlers.mousedown);
      }
    });
    this._mobileHandlers.clear();

    // Clear handler references
    this._resizeHandler = null;
    this._mouseMoveHandler = null;
    this._keyDownHandler = null;
    
    // CRITICAL: Mark listeners as detached so setupEventListeners() can re-attach them
    // This prevents double-registration on next resetGame() call
    this._listenersAttached = false;
  }

  /**
   * Reset input state (for level restart)
   */
  reset() {
    this.mouseX = 0;
    this.mouseY = 0;
  }
}
