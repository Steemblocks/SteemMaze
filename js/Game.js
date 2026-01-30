/**
 * Game Class - Enhanced Edition
 * Main game logic - handles maze generation, rendering, player movement, and gameplay
 * Features: Smooth 3rd person camera, dynamic difficulty, combo milestones, and more
 */

import * as THREE from "three";
import { steemIntegration } from "../steem-integration.js";
import { animationCache } from "../animation-cache.js";
import {
  PostProcessingManager,
  ParticleTrailSystem,
  SkyboxManager,
  ScreenEffectsManager,
} from "./effects/PostProcessing.js";
import { WeatherManager } from "./effects/WeatherManager.js";
import { CompassHUD } from "./ui/CompassHUD.js";
import { ComboMeter } from "./ui/ComboMeter.js";
import { GameRules } from "./core/GameRules.js";
import { EnvironmentManager } from "./core/EnvironmentManager.js";
import { CameraController, CameraMode } from "./core/CameraController.js";
import { WorldGenerator } from "./core/WorldGenerator.js";
import { EntityManager } from "./core/EntityManager.js";
import { CollectibleManager } from "./core/CollectibleManager.js";
import { CombatSystem } from "./core/CombatSystem.js";
import { PowerUpSystem } from "./core/PowerUpSystem.js";
import { EventSystem } from "./core/EventSystem.js";
import { ScoringSystem } from "./core/ScoringSystem.js";
import { GameStateManager } from "./core/GameStateManager.js";
import { InputManager } from "./core/InputManager.js";
import { FrameUpdater } from "./core/FrameUpdater.js";
import { UIUpdater } from "./core/UIUpdater.js";
import { CollisionHandler } from "./core/CollisionHandler.js";
import { getUnlockedAchievements } from "./core/Achievements.js";
import { AudioManager } from "./core/AudioManager.js";

export class Game {
  constructor(gameData, uiManager) {
    this.gameData = gameData;
    this.ui = uiManager;
    this.audioManager = new AudioManager();

    // Global UI sound listener
    document.body.addEventListener(
      "click",
      (e) => {
        // Check if clicked element is a button or link or has btn class
        const target = e.target.closest(
          "button, a, .btn, .btn-icon, .shop-item-btn",
        );
        if (target) {
          // If it's a specific shop buy button, Audio will be handled there to avoid double play
          // But if we want a generic click for EVERYTHING that isn't handled specifically:
          if (!target.hasAttribute("data-no-click-sound")) {
            this.audioManager.playClick();
          }
        }
      },
      true,
    ); // Capture phase to ensure it triggers

    this.canvas = document.getElementById("renderCanvas");
    this.bgCanvas = document.getElementById("bgCanvas");

    this.moves = 0;
    this.time = 0;
    this.isRunning = false;
    this.isPaused = false;
    this.won = false;
    this.maze = [];
    this.timerInterval = null;
    // NOTE: Level is now managed by GameStateManager - will be initialized after manager creation

    this.CELL_SIZE = GameRules.CELL_SIZE;
    this.WALL_HEIGHT = GameRules.WALL_HEIGHT;
    this.WALL_THICKNESS = GameRules.WALL_THICKNESS;

    this.playerPos = { x: 0, z: 0 };
    // Input state now managed by InputManager - removed direct properties
    this.fireflies = [];

    // World Generator (initialized later in init())
    this.worldGenerator = null;

    // NOTE: All scoring-related state (gems, combo, kills, etc.) is now managed by ScoringSystem
    // NOTE: All intelligent combo system properties are now managed by ScoringSystem

    // NOTE: Power-up inventory counts are now managed by Shop/PowerUpSystem
    this.potionCount = 0; // Number of owned potions
    this.lightBurstCount = 0; // Number of owned light bursts
    this.fogRemoverCount = 0; // Number of owned fog remover potions

    // Zombie and Lives system
    // NOTE: Entity arrays are now managed by EntityManager
    // Keep references for collision checks and UI updates
    this.lives = GameRules.INITIAL_LIVES; // Start with 3 lives per level

    // Economy
    // NOTE: Coin array is managed by CollectibleManager
    this.totalCoins = gameData.get("totalCoins") || 0;
    this.isPotionActive = false;
    this.potionTimer = 0;

    // Power-up system
    // NOTE: PowerUp array is managed by CollectibleManager
    // NOTE: PowerUp state is managed by PowerUpSystem
    this.invincibilityFrames = 0; // Temporary invincibility after taking damage

    // Special events
    // NOTE: Event state is now managed by EventSystem
    this.darknessOverlay = null;

    // Horde system (spawns after level 5 during darkness)
    // NOTE: Horde arrays now managed by EntityManager
    // NOTE: Horde state now managed by EventSystem

    // Horde kill rewards (lower than regular)
    this.HORDE_ZOMBIE_REWARD = 10;
    this.HORDE_DOG_REWARD = 5;
    this.BOSS_ZOMBIE_REWARD = 50;

    // Enhanced effects systems
    this.postProcessing = null;
    this.particleTrail = null;
    this.skybox = null;
    this.screenEffects = null;
    this.compassHUD = null;
    this.comboMeter = null;
    this.weatherManager = null; // Rain and thunder effects for level 7+
    this.lastPlayerPos = { x: 0, z: 0 }; // For particle trails

    // Exploding body parts tracking (for zombie potion blasts)
    this.explodingBodyParts = []; // Array of {mesh, velocity, life, maxLife}

    // Initialize background first (before init())
    this.worldGenerator = new WorldGenerator(this);
    this.worldGenerator.initBackground();

    // Initialize entity manager
    this.entityManager = new EntityManager(this);

    // Initialize collectible manager
    this.collectibleManager = new CollectibleManager(this);

    // Initialize combat system
    this.combatSystem = new CombatSystem(this);

    // Initialize power-up system
    this.powerUpSystem = new PowerUpSystem(this);

    // Initialize event system
    this.eventSystem = new EventSystem(this);

    // Initialize scoring system
    this.scoringSystem = new ScoringSystem(this);

    // Initialize game state manager
    this.gameStateManager = new GameStateManager(this);

    // Initialize input manager
    this.inputManager = new InputManager(this);

    // Initialize frame updater
    this.frameUpdater = new FrameUpdater(this);

    // Initialize UI updater
    this.uiUpdater = new UIUpdater(this);

    // Initialize collision handler
    this.collisionHandler = new CollisionHandler(this);

    this.init();
    document.getElementById("levelDisplay").textContent = this.level;
  }

  // Par time in seconds - scales with level and maze size
  get PAR_TIME() {
    return GameRules.getParTime(this.MAZE_SIZE, this.level);
  }

  // Optimal moves (roughly maze size * 2 for a perfect run)
  get PAR_MOVES() {
    return GameRules.getParMoves(this.MAZE_SIZE);
  }

  get MAZE_SIZE() {
    // 1. Check for manual override from Settings UI
    // If user sets a custom size in Settings ("Maze Size 15, 20, 25..."), use it as BASE for level scaling
    const settingsBase = this.gameData.getSetting("mazeSize");

    // 2. Combine with level progression
    const calculatedSize = GameRules.getMazeSize(
      this.level,
      settingsBase || 15,
    );

    // 3. Clamp for safety (min 10x10, max 60x60 for performance)
    return Math.max(10, Math.min(60, calculatedSize));
  }

  // ===== INPUT STATE GETTERS (delegate to InputManager) =====
  get mouseX() {
    return this.inputManager?.getMouseX() || 0;
  }

  get mouseY() {
    return this.inputManager?.getMouseY() || 0;
  }

  // ===== ENTITY ARRAY GETTERS (delegate to EntityManager) =====
  get zombies() {
    return this.entityManager?.zombies || [];
  }
  get zombieDogs() {
    return this.entityManager?.zombieDogs || [];
  }
  get bossZombies() {
    return this.entityManager?.bossZombies || [];
  }
  get monsters() {
    return this.entityManager?.monsters || [];
  }
  get hordeZombies() {
    return this.entityManager?.hordeZombies || [];
  }
  get hordeDogs() {
    return this.entityManager?.hordeDogs || [];
  }

  get gems() {
    return this.collectibleManager?.gems || [];
  }
  get coins() {
    return this.collectibleManager?.coins || [];
  }
  get coinsMesh() {
    return this.collectibleManager?.coinsMesh || null;
  }
  get powerUps() {
    return this.collectibleManager?.powerUps || [];
  }

  // Power-up state getters
  get activePowerUp() {
    return this.powerUpSystem?.activePowerUp || null;
  }
  get powerUpTimer() {
    return this.powerUpSystem?.powerUpTimer || 0;
  }
  get isShieldActive() {
    return this.powerUpSystem?.isShieldActive || false;
  }
  get isSpeedBoostActive() {
    return this.powerUpSystem?.isSpeedBoostActive || false;
  }
  get isTimeFreezeActive() {
    return this.powerUpSystem?.isTimeFreezeActive || false;
  }
  get isMagnetActive() {
    return this.powerUpSystem?.isMagnetActive || false;
  }
  get isDoubleScoreActive() {
    return this.powerUpSystem?.isDoubleScoreActive || false;
  }
  get isLightBoostActive() {
    return this.powerUpSystem?.isLightBoostActive || false;
  }

  // ========== EVENT SYSTEM GETTERS ==========
  get eventTimer() {
    return this.eventSystem?.eventTimer || 0;
  }
  get currentEvent() {
    return this.eventSystem?.currentEvent || null;
  }
  get isDarknessActive() {
    return this.eventSystem?.isDarknessActive || false;
  }
  get darknessStartTime() {
    return this.eventSystem?.darknessStartTime || null;
  }
  get hordeSpawned() {
    return this.eventSystem?.hordeSpawned || false;
  }
  get darknessEventTimer() {
    return this.eventSystem?.darknessEventTimer || null;
  }

  // ========== SCORING SYSTEM GETTERS ==========
  get gemsCollected() {
    return this.scoringSystem?.gemsCollected || 0;
  }
  get coinsCollected() {
    return this.scoringSystem?.coinsCollected || 0;
  }
  get zombiesKilled() {
    return this.scoringSystem?.zombiesKilled || 0;
  }
  get zombieDogsKilled() {
    return this.scoringSystem?.zombieDogsKilled || 0;
  }
  get powerUpsUsed() {
    return this.scoringSystem?.powerUpsUsed || 0;
  }
  get wallHits() {
    return this.scoringSystem?.wallHits || 0;
  }
  get extraScore() {
    return this.scoringSystem?.extraScore || 0;
  }
  get combo() {
    return this.scoringSystem?.combo || 0;
  }
  get maxCombo() {
    return this.scoringSystem?.maxCombo || 0;
  }
  get canBuildCombo() {
    return this.scoringSystem?.canBuildCombo !== false;
  }
  get gameOverTriggered() {
    return this.scoringSystem?.gameOverTriggered || false;
  }

  // ========== GAME STATE MANAGER GETTERS/SETTERS ==========
  get level() {
    return this.gameStateManager?.getLevel?.() || 1;
  }
  set level(value) {
    if (this.gameStateManager) {
      this.gameStateManager.setLevel(value);
    }
  }

  initBackground() {
    // Background initialization is now handled by WorldGenerator
    // Called before this.init() in constructor
  }

  init() {
    // Preload all animations and geometry caches
    animationCache.preloadCommonGeometries();
    animationCache.preloadCommonMaterials();

    this.scene = new THREE.Scene();
    this.scene.background = null; // Let skybox handle background
    this.applySettings();

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance",
      precision: "highp",
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = this.gameData.getSetting("shadows");
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // High Quality Colors
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3; // Balanced exposure

    // Performance optimization
    this.renderer.info.autoReset = true;
    this.renderer.localClippingEnabled = true;

    // Initialize enhanced effects systems
    this.initEffectsSystems();

    // Update World Generator reference with initialized scene
    this.worldGenerator.setupLights();
    this.worldGenerator.setupGround();
    if (this.gameData.getSetting("fireflies")) {
      this.worldGenerator.createFireflies();
      this.fireflies = this.worldGenerator.fireflies;
    }
    this.inputManager.setupEventListeners();
    this.startAutoRefresh();
    this.animate();
  }

  /**
   * Initialize all enhanced visual effects systems
   */
  initEffectsSystems() {
    // Post-processing with bloom
    this.postProcessing = new PostProcessingManager(
      this.renderer,
      this.scene,
      this.camera,
    );

    // Skybox with stars
    this.skybox = new SkyboxManager(this.scene);
    this.environment = new EnvironmentManager(this.scene);

    // Particle trail system - subtle white/cyan
    this.particleTrail = new ParticleTrailSystem(this.scene, 0x88ddff);

    // Screen effects (shake, flash)
    this.screenEffects = new ScreenEffectsManager();

    // Compass HUD
    this.compassHUD = new CompassHUD();

    // Combo meter
    this.comboMeter = new ComboMeter();

    // Weather system for level 7+ effects
    this.weatherManager = new WeatherManager(
      this.scene,
      this.camera,
      this.skybox,
    );
    this.weatherManager.setThunderCallback(() => {
      // Safety check: Only run effect if game is active AND on game screen
      if (
        !this.isRunning ||
        this.isPaused ||
        this.won ||
        this.ui.currentScreen !== "gameScreen"
      ) {
        return;
      }

      // Camera shake on thunder
      this.cameraShake = Math.max(this.cameraShake, 2.0);
      this.ui.showToast("⚡ Thunder!", "bolt");

      // AUDIO: Play thunder sound
      if (this.audioManager) this.audioManager.playThunder();
    });

    // DEBUG: Expose rain test function globally for debugging
    window.testRain = () => {
      this.weatherManager.enableRainDebug();
      this.weatherManager.startStorm(1.0);
    };
    window.stopRain = () => {
      this.weatherManager.disableRainDebug();
      this.weatherManager.stopStorm();
    };

    // Camera Controller - Enabled for advanced cinematic smooth tracking
    // This manages all camera modes, smoothing, and stability
    this.cameraController = new CameraController(this.camera, this.gameData);
  }

  applySettings() {
    // Quality
    const quality = this.gameData.getSetting("quality");
    let pixelRatio = 1;

    // Apply Audio Settings
    if (this.audioManager) {
      // SFX (Master Mute)
      const sfxOn = this.gameData.getSetting("sfx");
      this.audioManager.muted = !sfxOn;
      if (!sfxOn) {
        // Stop looping SFX if muted
        this.audioManager.stopRain();
      } else {
        // If unmuted and storm is active, restart rain?
        // That requires checking weatherManager state.
        // For now, simple toggling off stops persistent noise is good enough.
        if (this.weatherManager && this.weatherManager.isStormActive) {
          this.audioManager.playRain();
        }
      }

      // Music
      const musicOn = this.gameData.getSetting("music");
      this.audioManager.musicMuted = !musicOn;
      if (!musicOn) {
        this.audioManager.stopMusic();
      } else if (
        this.ui &&
        (this.ui.currentScreen === "mainMenu" ||
          this.ui.currentScreen === "loginScreen")
      ) {
        // Restart music if toggled ON in menu
        this.audioManager.playMusic();
      }
    }

    if (quality === "high") pixelRatio = Math.min(window.devicePixelRatio, 2);
    else if (quality === "medium") pixelRatio = 1;
    else if (quality === "low") pixelRatio = 0.75;

    if (this.renderer) this.renderer.setPixelRatio(pixelRatio);

    // FOG INCREASES WITH LEVEL - makes higher levels more challenging
    const baseFog = this.gameData.getSetting("fogDensity") / 2500;
    const levelFogBonus = (this.level - 1) * 0.003; // More fog each level
    const totalFog = Math.min(baseFog + levelFogBonus, 0.08); // Cap at 0.08
    this.defaultFogDensity = totalFog;

    // Only update static fog here. Dynamic fog (Level > 7) is handled by startLevelFog()
    if (this.level <= 7 && this.scene && this.scene.fog) {
      this.scene.fog.density = totalFog;
    }

    const mc = document.getElementById("mobileControls");
    if (mc)
      mc.style.display = this.gameData.getSetting("mobileControls")
        ? "flex"
        : "none";

    if (this.renderer)
      this.renderer.shadowMap.enabled = this.gameData.getSetting("shadows");

    if (!this.gameData.getSetting("fireflies")) {
      this.fireflies.forEach((f) => this.scene.remove(f));
      this.fireflies = [];
    } else if (
      this.fireflies.length === 0 &&
      this.scene &&
      this.worldGenerator
    ) {
      this.worldGenerator.createFireflies();
      this.fireflies = this.worldGenerator.fireflies;
    }

    // Check if Maze Size setting requires a restart/level change to take effect
    if (this.maze && this.maze.length > 0) {
      const currentMazeSize = this.maze.length;
      const targetMazeSize = this.MAZE_SIZE;
      if (currentMazeSize !== targetMazeSize) {
        // Only show warning if we are in game screen or settings screen
        if (
          this.ui &&
          (this.ui.currentScreen === "gameScreen" ||
            this.ui.currentScreen === "settingsScreen")
        ) {
          this.ui.showToast(
            "Changes will apply on next Level/Restart",
            "grid_view",
          );
        }
      }
    }
  }

  /**
   * Initializes fog state for the start of a level
   * Handles dynamic fog events for higher levels
   */
  startLevelFog() {
    const baseFog = this.gameData.getSetting("fogDensity") / 2500;
    const levelFogBonus = (this.level - 1) * 0.003;
    const totalFog = Math.min(baseFog + levelFogBonus, 0.08);
    this.defaultFogDensity = totalFog;

    if (this.level > 7) {
      // Level > 7: Start clear, then thicken after 5 seconds to force potion usage
      this.scene.fog = new THREE.FogExp2(0x020617, baseFog);

      // Delay toast slightly to ensure UI is ready
      setTimeout(() => {
        this.ui.showToast("Visibility clear... for 5 seconds", "visibility");
      }, 500);

      this.fogStartTimeout = setTimeout(() => {
        this.ui.showToast("Dense Fog Descending! Use Potion!", "cloud_off");

        // Smoothly increase fog
        let currentFog = baseFog;
        this.fogUpdateInterval = setInterval(() => {
          currentFog += 0.0005;
          if (currentFog >= totalFog) {
            currentFog = totalFog;
            clearInterval(this.fogUpdateInterval);
            this.fogUpdateInterval = null;
          }
          if (this.scene.fog) this.scene.fog.density = currentFog;
        }, 50);
      }, 5000);
    } else {
      // Normal behavior for lower levels
      this.scene.fog = new THREE.FogExp2(0x020617, totalFog);
    }
  }

  /**
   * Cancel ongoing fog startup events (e.g. when fog remover is used)
   */
  cancelFogEvents() {
    if (this.fogStartTimeout) {
      clearTimeout(this.fogStartTimeout);
      this.fogStartTimeout = null;
    }
    if (this.fogUpdateInterval) {
      clearInterval(this.fogUpdateInterval);
      this.fogUpdateInterval = null;
    }
  }

  /**
   * Get difficulty multiplier based on level
   */
  getDifficultyMultiplier() {
    return 1 + (this.level - 1) * 0.15; // 15% harder each level
  }

  generateMaze() {
    return this.worldGenerator.generateMaze();
  }

  createWall(x, z, w, d) {
    const geo = new THREE.BoxGeometry(w, this.WALL_HEIGHT, d);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x888888, // Light Grey
      roughness: 1.0,
      metalness: 0.0,
    });
    const wall = new THREE.Mesh(geo, mat);
    wall.position.set(x, this.WALL_HEIGHT / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    return wall;
  }

  buildMaze() {
    this.scene.children = this.scene.children.filter(
      (c) =>
        c === this.worldGenerator.ground ||
        c.type === "AmbientLight" ||
        c.type === "DirectionalLight" ||
        c.type === "PointLight" ||
        this.fireflies.includes(c),
    );

    // Optimized Instanced Rendering for Walls (Massive FPS Boost)
    const wallCountEstimation = this.MAZE_SIZE * this.MAZE_SIZE * 4;

    // Use generic 1x1x1 cube and scale it via matrix for each instance
    // Use cached geometry/material if available or create new
    // Note: accessing global animationCache if imported, else fallback to local create
    // Assuming animationCache is globally available or I should use standard Three.js
    // Generate Procedural Stone Texture
    // Generate Procedural Stone Texture - Higher Res & Reduced Noise Freq
    const createStoneTexture = () => {
      const size = 1024; // Increased from 512 for better close-up quality
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");

      // Base Noise Layer
      ctx.fillStyle = "#999999";
      ctx.fillRect(0, 0, size, size);

      // Grain Noise - Larger grains to reduce pixel shimmy
      for (let i = 0; i < 80000; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const v = Math.floor(Math.random() * 40) + 140;
        ctx.fillStyle = `rgba(${v},${v},${v}, 0.4)`;
        ctx.fillRect(x, y, 3, 3); // Slightly larger grain
      }

      // Soft Clouds/Dirt (Add variegation)
      for (let i = 0; i < 20; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = Math.random() * 100 + 50;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, "rgba(0,0,0,0.1)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Cracks
      ctx.strokeStyle = "rgba(80, 80, 80, 0.3)";
      ctx.lineWidth = 2; // Thicker lines for visibility at distance
      for (let i = 0; i < 15; i++) {
        ctx.beginPath();
        let cx = Math.random() * size;
        let cy = Math.random() * size;
        ctx.moveTo(cx, cy);
        for (let j = 0; j < 10; j++) {
          cx += (Math.random() - 0.5) * 80;
          cy += (Math.random() - 0.5) * 80;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      // CRITICAL: filtering to fix "pixel broken" / aliasing
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      return texture;
    };

    const stoneTexture = createStoneTexture();

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      map: stoneTexture,
      bumpMap: stoneTexture,
      bumpScale: 0.02,
      roughnessMap: stoneTexture,
      color: 0x999999, // Darker grey to prevent BLOOM GLOW
      roughness: 0.9,
      metalness: 0.0,
    });

    const wallMesh = new THREE.InstancedMesh(
      geometry,
      material,
      wallCountEstimation,
    );
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const offset = -(this.MAZE_SIZE * this.CELL_SIZE) / 2;
    let instanceId = 0;

    for (let y = 0; y < this.MAZE_SIZE; y++) {
      for (let x = 0; x < this.MAZE_SIZE; x++) {
        const cell = this.maze[y][x];
        const px = offset + x * this.CELL_SIZE + this.CELL_SIZE / 2;
        const pz = offset + y * this.CELL_SIZE + this.CELL_SIZE / 2;

        // Top Wall
        if (cell.top) {
          dummy.position.set(
            px,
            this.WALL_HEIGHT / 2,
            offset + y * this.CELL_SIZE,
          );
          dummy.scale.set(
            this.CELL_SIZE + this.WALL_THICKNESS,
            this.WALL_HEIGHT,
            this.WALL_THICKNESS,
          );
          dummy.updateMatrix();
          wallMesh.setMatrixAt(instanceId++, dummy.matrix);
        }

        // Bottom Wall
        if (cell.bottom) {
          dummy.position.set(
            px,
            this.WALL_HEIGHT / 2,
            offset + (y + 1) * this.CELL_SIZE,
          );
          dummy.scale.set(
            this.CELL_SIZE + this.WALL_THICKNESS,
            this.WALL_HEIGHT,
            this.WALL_THICKNESS,
          );
          dummy.updateMatrix();
          wallMesh.setMatrixAt(instanceId++, dummy.matrix);
        }

        // Left Wall
        if (cell.left) {
          dummy.position.set(
            offset + x * this.CELL_SIZE,
            this.WALL_HEIGHT / 2,
            pz,
          );
          dummy.scale.set(
            this.WALL_THICKNESS,
            this.WALL_HEIGHT,
            this.CELL_SIZE + this.WALL_THICKNESS,
          );
          dummy.updateMatrix();
          wallMesh.setMatrixAt(instanceId++, dummy.matrix);
        }

        // Right Wall
        if (cell.right) {
          dummy.position.set(
            offset + (x + 1) * this.CELL_SIZE,
            this.WALL_HEIGHT / 2,
            pz,
          );
          dummy.scale.set(
            this.WALL_THICKNESS,
            this.WALL_HEIGHT,
            this.CELL_SIZE + this.WALL_THICKNESS,
          );
          dummy.updateMatrix();
          wallMesh.setMatrixAt(instanceId++, dummy.matrix);
        }
      }
    }

    wallMesh.count = instanceId;
    this.scene.add(wallMesh);

    // === 3D PORTAL GOAL (STARGATE CLASS) ===
    this.goal = new THREE.Group();
    this.portalParts = []; // Store parts for animation

    const PORTAL_SCALE = 0.75; // Slightly smaller to fit cell

    // 0. Pedestal (Base)
    const pedestalGeo = new THREE.CylinderGeometry(
      2.2 * PORTAL_SCALE,
      2.5 * PORTAL_SCALE,
      0.4,
      8,
    );
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.8,
      metalness: 0.5,
    });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.y = 0.2; // Sit solidly on ground
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    this.goal.add(pedestal);

    // 1. Massive Outer Ring (Tech Frame)
    const ringGeo = new THREE.TorusGeometry(
      1.6 * PORTAL_SCALE,
      0.25 * PORTAL_SCALE,
      12,
      40,
    );
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a, // Dark metallic
      metalness: 0.8,
      roughness: 0.3,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.2,
    });
    const portalRing = new THREE.Mesh(ringGeo, ringMat);
    portalRing.position.y = 1.8 * PORTAL_SCALE; // Lifted above pedestal

    // Add glowing nodes to ring
    for (let i = 0; i < 8; i++) {
      const node = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.5 * PORTAL_SCALE,
          0.3 * PORTAL_SCALE,
          0.5 * PORTAL_SCALE,
        ),
        new THREE.MeshStandardMaterial({
          color: 0x00ffff,
          emissive: 0x00ffff,
          emissiveIntensity: 2,
        }),
      );
      const angle = (i / 8) * Math.PI * 2;
      node.position.set(
        Math.cos(angle) * 1.6 * PORTAL_SCALE,
        Math.sin(angle) * 1.6 * PORTAL_SCALE,
        0,
      );
      node.rotation.z = angle;
      portalRing.add(node);
    }
    this.goal.add(portalRing);
    this.portalParts.push({ mesh: portalRing, speed: 0.2, axis: "z" }); // Slow rotation

    // 2. Inner Rotating Stabilizer Ring
    const innerRingGeo = new THREE.TorusGeometry(
      1.2 * PORTAL_SCALE,
      0.1 * PORTAL_SCALE,
      8,
      30,
    );
    const innerRingMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.9,
      roughness: 0.4,
    });
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.position.y = 1.8 * PORTAL_SCALE; // Lifted
    this.goal.add(innerRing);
    this.portalParts.push({ mesh: innerRing, speed: -0.8, axis: "x" }); // Gyroscopic rotation

    // 3. Event Horizon (Deep Energy Vortex)
    const vortexGroup = new THREE.Group();
    vortexGroup.position.y = 1.8 * PORTAL_SCALE; // Lifted
    this.goal.add(vortexGroup);

    // Layer 1: Core Brightness
    const vortexCore = new THREE.Mesh(
      new THREE.CircleGeometry(1.1 * PORTAL_SCALE, 32),
      new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      }),
    );
    vortexGroup.add(vortexCore);

    // Layer 2: Swirling Nebula
    const vortexNebula = new THREE.Mesh(
      new THREE.CircleGeometry(1.0 * PORTAL_SCALE, 32),
      new THREE.MeshBasicMaterial({
        color: 0x06b6d4, // Cyan
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    vortexNebula.position.z = 0.05;
    vortexGroup.add(vortexNebula);
    this.portalParts.push({ mesh: vortexNebula, speed: 3.0, axis: "z" });

    // Layer 3: Darker Grid Overlay
    const vortexGrid = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 1.1 * PORTAL_SCALE, 32, 4),
      new THREE.MeshBasicMaterial({
        color: 0x0e7490,
        transparent: true,
        opacity: 0.4,
        wireframe: true,
        side: THREE.DoubleSide,
      }),
    );
    vortexGrid.position.z = 0.1;
    vortexGroup.add(vortexGrid);
    this.portalParts.push({ mesh: vortexGrid, speed: -1.5, axis: "z" });

    // 5. Particle System
    const particleCount = 80;
    const particlesGeo = new THREE.BufferGeometry();
    const particlePositions = [];

    for (let i = 0; i < particleCount; i++) {
      const r = Math.random() * 1.5 * PORTAL_SCALE;
      const theta = Math.random() * Math.PI * 2;
      const z = (Math.random() - 0.5) * 2;
      particlePositions.push(Math.cos(theta) * r, Math.sin(theta) * r, z);
    }
    particlesGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(particlePositions, 3),
    );
    const particlesMat = new THREE.PointsMaterial({
      color: 0x67e8f9,
      size: 0.1,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particlesGeo, particlesMat);
    vortexGroup.add(particles); // Add to vortex group
    this.portalParts.push({ mesh: particles, speed: 0.5, axis: "z" }); // Rotate around center axis

    // Portal Light
    const portalLight = new THREE.PointLight(0x06b6d4, 3, 8);
    portalLight.position.y = 1.8 * PORTAL_SCALE;
    this.goal.add(portalLight);
    this.portalParts.push({ light: portalLight, baseIntensity: 3 });

    // Position the whole group
    // Position the whole goal on the ground
    this.goal.position.set(
      offset + 0.5 * this.CELL_SIZE,
      0, // ON THE GROUND
      offset + 0.5 * this.CELL_SIZE,
    );

    // Rotate 45 degrees to face the room center usually
    this.goal.rotation.y = Math.PI / 4;

    this.scene.add(this.goal);

    // Spawn gems throughout the maze
    this.collectibleManager.createGems();

    // Spawn zombies in corners - delegated to EntityManager
    this.entityManager.createZombies();

    // Spawn power-ups (level 2+)
    this.collectibleManager.createPowerUps();

    // Apply level-based fog settings
    this.applySettings();
    this.startLevelFog();
  }

  /**
   * Check for power-up collection
   */
  checkPowerUpCollection() {
    return this.powerUpSystem.checkPowerUpCollection();
  }

  /**
   * Activate a power-up
   */
  activatePowerUp(type) {
    return this.powerUpSystem.activatePowerUp(type);
  }

  /**
   * Update power-up timer
   */
  updatePowerUps() {
    // MOVED TO CollectibleManager - delegated call
    return this.collectibleManager.updatePowerUps();
  }

  /**
   * Deactivate current power-up
   */
  deactivatePowerUp() {
    return this.powerUpSystem.deactivatePowerUp();
  }

  /**
   * Trigger random special events based on level
   */
  triggerRandomEvent() {
    return this.eventSystem.triggerRandomEvent();
  }

  /**
   * Darkness event - reduced visibility
   * After level 5: Spawns zombie horde if player doesn't use light boost within 2 seconds
   */
  triggerDarknessEvent() {
    return this.eventSystem.triggerDarknessEvent();
  }

  /**
   * End darkness event and clean up
   */
  endDarknessEvent(originalFog) {
    return this.eventSystem.endDarknessEvent(originalFog);
  }

  /**
   * Spawn zombie horde - MOVED TO EntityManager
   */
  spawnZombieHorde() {
    return this.eventSystem.spawnZombieHorde();
  }

  /**
   * Process the spawn queue - 1 entity per frame to prevent lag spikes
   */
  // processSpawnQueue() - MOVED TO EntityManager
  processSpawnQueue() {
    return this.entityManager.processSpawnQueue();
  }

  // spawnEntity() - MOVED TO EntityManager
  spawnEntity(task) {
    return this.entityManager.spawnEntity(task);
  }

  // findHordeSpawnPositions() - MOVED TO EntityManager
  findHordeSpawnPositions(count) {
    return this.entityManager.findHordeSpawnPositions(count);
  }

  // _tryAddSpawnPosition() - MOVED TO EntityManager
  _tryAddSpawnPosition(positions, minDistance) {
    return this.entityManager._tryAddSpawnPosition(positions, minDistance);
  }

  /**
   * Despawn all horde entities when darkness ends - MOVED TO EntityManager
   */
  despawnHorde(keepPersistent = false) {
    return this.entityManager.despawnHorde(keepPersistent);
  }

  /**
   * Zombie surge - zombies move faster temporarily - MOVED TO EntityManager
   */
  triggerZombieSurge() {
    return this.eventSystem.triggerZombieSurge();
  }

  /**
   * Bonus time event
   */
  triggerBonusTime() {
    return this.eventSystem.triggerBonusTime();
  }

  createPlayer() {
    // Delegated to EntityManager
    this.entityManager.createPlayer();
    // Keep references for compatibility
    this.player = this.entityManager.player;
    this.playerMesh = this.entityManager.playerMesh;
  }

  updatePlayerPosition(dx = 0, dz = 0) {
    // Delegated to EntityManager
    return this.entityManager.updatePlayerPosition(dx, dz);
  }

  /**
   * Move player in given direction - DELEGATED TO InputManager
   */
  movePlayer(dx, dz) {
    return this.inputManager.movePlayer(dx, dz);
  }

  /**
   * Handle combo milestone reached
   */
  onComboMilestone(milestone) {
    this.scoringSystem.onComboMilestone(milestone);
  }

  /**
   * Check for coin collection with magnet effect
   */
  checkCoinCollection() {
    // MOVED TO CollectibleManager - delegated call
    return this.collectibleManager.checkCoinCollection();
  }

  /**
   * Update camera event state for dynamic mode
   */
  updateCameraEvents() {
    if (!this.cameraController) return;

    // Check if near goal
    const distToGoal = Math.abs(this.playerPos.x) + Math.abs(this.playerPos.z);
    const nearGoal = distToGoal <= 3;

    // Check if under attack (zombie nearby)
    let isUnderAttack = false;
    for (const zombie of this.zombies) {
      const dx = Math.abs(zombie.gridX - this.playerPos.x);
      const dz = Math.abs(zombie.gridZ - this.playerPos.z);
      if (dx + dz <= 2) {
        isUnderAttack = true;
        break;
      }
    }

    // Check high combo
    const highCombo = this.combo >= GameRules.COMBO_THRESHOLDS.MAJOR;

    this.cameraController.updateEventState({
      nearGoal,
      isUnderAttack,
      highCombo,
      inCombat: this.isPotionActive && this.zombies.length > 0,
      isCollecting: false, // Set briefly during collection
    });
  }

  /**
   * Handle wall collision - DELEGATED TO CollisionHandler
   */
  onWallHit() {
    return this.collisionHandler.onWallHit();
  }

  checkGemCollection() {
    // MOVED TO CollectibleManager - delegated call
    return this.collectibleManager.checkGemCollection();
  }

  checkZombieCollision() {
    // MOVED TO CombatSystem - delegated call
    return this.combatSystem.checkZombieCollision();
  }

  checkZombieDogCollision() {
    // MOVED TO CombatSystem - delegated call
    return this.combatSystem.checkZombieDogCollision();
  }

  /**
   * Check collisions with horde entities (boss, horde zombies, horde dogs)
   * Horde entities give lower rewards when killed
   */
  checkHordeCollisions() {
    // MOVED TO CombatSystem - delegated call
    return this.combatSystem.checkHordeCollisions();
  }

  checkMonsterCollision() {
    // MOVED TO CombatSystem - delegated call
    return this.combatSystem.checkMonsterCollision();
  }

  buyPotion() {
    if (this.totalCoins >= GameRules.POTION_COST) {
      this.totalCoins -= GameRules.POTION_COST;
      this.gameData.set("totalCoins", this.totalCoins);
      this.activatePotion();
      this.ui.showToast("Potion Activated!", "science");

      // Update UI
      this.updateCoinsDisplay();
    } else {
      this.ui.showToast(`Need ${GameRules.POTION_COST} Coins!`, "savings");
    }
  }

  activatePotion() {
    this.isPotionActive = true;
    this.potionTimer = GameRules.POTION_DURATION;
    if (this.player) {
      this.player.activatePotionEffect();
    }

    // AUDIO: Play potion activation sound
    if (this.audioManager) this.audioManager.playPotion();
  }

  /**
   * Update potion effect timer - DELEGATED TO FrameUpdater
   */
  updatePotion() {
    return this.frameUpdater.updatePotion();
  }

  updateCoins() {
    // MOVED TO CollectibleManager - delegated call
    return this.collectibleManager.updateCoins();
  }

  /**
   * Shows floating text at a 3D position - DELEGATED TO UIUpdater
   * @param {THREE.Vector3} position - 3D world position
   * @param {string} text - Text to display
   * @param {string} color - CSS color string
   */
  showFloatingText(position, text, color = "#ffffff") {
    return this.uiUpdater.showFloatingText(position, text, color);
  }

  /**
   * Handle zombie collision and damage - DELEGATED TO CollisionHandler
   */
  onZombieHit() {
    return this.collisionHandler.onZombieHit();
  }

  /**
   * Add a life to player - DELEGATED TO CollisionHandler
   */
  addLife() {
    return this.collisionHandler.addLife();
  }

  /**
   * Update lives display - DELEGATED TO UIUpdater
   */
  updateLivesDisplay() {
    return this.uiUpdater.updateLivesDisplay();
  }

  /**
   * Pushes zombies away from start position - DELEGATED TO CollisionHandler
   */
  clearSafeZone() {
    return this.collisionHandler.clearSafeZone();
  }

  triggerGameOver() {
    this.scoringSystem.triggerGameOver();
  }

  startTimer() {
    this.timerInterval = setInterval(() => {
      if (!this.isPaused && !this.isTimeFreezeActive) {
        this.time++;
        this.updateTimeDisplay(this.time);
      }
    }, 1000);
  }

  calculateScore() {
    return this.scoringSystem.calculateScore();
  }

  /**
   * Create centralized entity explosion effect
   * Called by all entities when they die to ensure consistent particle effects
   * Optimized to prevent frame drops during multiple explosions
   * @param {THREE.Vector3} position - Position of explosion
   * @param {number} particleCount - Number of particles
   * @param {number} color - Hex color for particles
   * @param {number} scaleMultiplier - Size scaling for boss effects (default 1.0)
   */
  createEntityExplosion(
    position,
    particleCount = 20,
    color = 0x8b0000,
    scaleMultiplier = 1.0,
  ) {
    // 1. Particle System (Instanced)
    if (this.particleTrail) {
      this.particleTrail.entityExplosion(
        position,
        particleCount,
        color,
        scaleMultiplier,
      );
    }

    // 2. Initialize Shared Resources lazily
    if (!this.activeExplosions) this.activeExplosions = [];
    if (!this.explosionGlowGeometry) {
      this.explosionGlowGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    }

    // 3. Create Flash Light
    const flash = new THREE.PointLight(color, 5, 15);
    flash.position.copy(position);
    flash.position.y += 1.0;
    this.scene.add(flash);

    // 4. Create Glow Mesh (Reusing Geometry)
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8,
      depthWrite: false, // Performance: Don't write depth for additive-like effects
    });
    const glowMesh = new THREE.Mesh(this.explosionGlowGeometry, glowMaterial);
    glowMesh.position.copy(position);
    glowMesh.position.y += 0.5;
    this.scene.add(glowMesh);

    // 5. Add to centralized update list (Handled by FrameUpdater)
    this.activeExplosions.push({
      flash: flash,
      mesh: glowMesh,
      flashIntensity: 5.0,
      glowOpacity: 0.8,
      glowScale: 1.0,
    });
  }

  async triggerVictory() {
    return this.scoringSystem.triggerVictory();
  }

  async startNewGame() {
    return this.gameStateManager.startNewGame();
  }

  continueGame() {
    return this.gameStateManager.continueGame();
  }

  async nextLevel() {
    return this.gameStateManager.nextLevel();
  }

  replayLevel() {
    return this.gameStateManager.replayLevel();
  }
  /**
   * Reload level from gameData - called after account login/switch
   * Ensures the game uses the correct level for the current user
   */
  reloadLevelFromData() {
    return this.gameStateManager.reloadLevelFromData();
  }

  restartLevel() {
    return this.gameStateManager.restartLevel();
  }

  resetGame() {
    this.cleanup(); // Ensure everything is stopped before resetting
    // Reload persistent data from disk to ensure we discard any unsaved in-memory progress
    // This is CRITICAL for preventing coin farming (collect -> exit -> resume -> repeat)
    this.gameData.data = this.gameData.load();
    this.totalCoins = this.gameData.get("totalCoins") || 0;

    // Update UI immediately
    this.updateCoinsDisplay();
    this.moves = 0;
    this.time = 0;
    this.won = false;
    this.isRunning = false;
    this.isPaused = false;
    this.playerPos = { x: this.MAZE_SIZE - 1, z: this.MAZE_SIZE - 1 };
    // CRITICAL: Sync with EntityManager so both use same playerPos
    this.entityManager.playerPos = { ...this.playerPos };

    // Smart Lives Reset: Level 1 always 3, otherwise keep extras or refill to 3
    if (this.level === 1) {
      this.lives = GameRules.INITIAL_LIVES;
    } else {
      this.lives = Math.max(this.lives, GameRules.INITIAL_LIVES);
    }

    // Reset all scoring state
    this.scoringSystem.resetScoringState();

    // Reset power-up state
    this.powerUpSystem.resetPowerUpState();
    this.invincibilityFrames = 0;

    // Reset event state
    this.eventSystem.resetEventState();

    // Reset input state
    this.inputManager.reset();

    // Reset frame updater state
    this.frameUpdater.reset();

    // Reset UI state
    this.uiUpdater.reset();

    // Reset collision handler state
    this.collisionHandler.reset();

    // CRITICAL: Reset camera to normal gameplay mode (was in cinematic during victory)
    if (this.cameraController) {
      this.cameraController.setMode(CameraMode.DYNAMIC);
    }

    this.maze = this.generateMaze();
    this.buildMaze();

    // UPDATE CAMERA FOR NEW MAZE SIZE
    // Smart scaling: camera distance and height adjust proportionally to maze size
    if (this.cameraController) {
      this.cameraController.updateMazeSize(this.MAZE_SIZE);
    }

    if (this.environment) {
      this.environment.generate(this.MAZE_SIZE, this.CELL_SIZE);
    }
    if (this.playerMesh) this.scene.remove(this.playerMesh);
    this.entityManager.createPlayer();
    // Keep references for compatibility
    this.player = this.entityManager.player;
    this.playerMesh = this.entityManager.playerMesh;
    this.collectibleManager.createGems();
    this.collectibleManager.createPowerUps();
    this.collectibleManager.createCoins();
    this.entityManager.createZombies();

    // Update lives display
    this.updateLivesDisplay();

    // Reset particle trail color
    if (this.particleTrail) {
      this.particleTrail.setColor(0x4ade80);
    }

    // --- DETERMINISTIC EVENTS ---
    // Schedule periodic darkness events (level 5+)
    this.eventSystem.scheduleDarknessEvents();

    // Weather effects - activate storm at level 7+
    if (this.weatherManager) {
      if (WeatherManager.shouldActivateStorm(this.level)) {
        // Delay storm start by 3 seconds (was 10) for quicker immersion
        this.stormStartTimeout = setTimeout(() => {
          const intensity = WeatherManager.getStormIntensity(this.level);
          this.weatherManager.startStorm(intensity);
          this.ui.showToast(`⛈️ Storm approaching...`, "thunderstorm");

          // AUDIO: Start rain sound
          if (this.audioManager) this.audioManager.playRain();
        }, 3000); // 3 second delay
      } else {
        this.weatherManager.stopStorm();
        // AUDIO: Enable stop rain if it was running
        if (this.audioManager) this.audioManager.stopRain();
      }
    }

    // Show level info
    this.ui.showToast(
      `Level ${this.level} - ${this.zombies.length} Zombie${
        this.zombies.length > 1 ? "s" : ""
      }`,
      "grid_3x3",
    );
  }

  stopGame() {
    this.cleanup();
    this.isRunning = false;
    this.isPaused = false;
  }

  /**
   * cleanup - Stops all running timers, intervals, and effects
   * Ensures no game logic continues running after game ends or user leaves
   */
  cleanup() {
    // 1. Stop Update Loops
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // 2. Clear Event Timers
    if (this.comboDecayTimer) {
      clearTimeout(this.comboDecayTimer);
      this.comboDecayTimer = null;
    }

    if (this.stormStartTimeout) {
      clearTimeout(this.stormStartTimeout);
      this.stormStartTimeout = null;
    }

    if (this.fogStartTimeout) {
      clearTimeout(this.fogStartTimeout);
      this.fogStartTimeout = null;
    }

    if (this.fogUpdateInterval) {
      clearInterval(this.fogUpdateInterval);
      this.fogUpdateInterval = null;
    }

    // Clear spawn queue and dispose entities
    if (this.entityManager) {
      this.entityManager.dispose();
    }

    // Dispose collectibles
    if (this.collectibleManager) {
      this.collectibleManager.dispose();
    }

    // Dispose combat system
    if (this.combatSystem) {
      this.combatSystem.dispose();
    }

    // Dispose power-up system
    if (this.powerUpSystem) {
      this.powerUpSystem.dispose();
    }

    // Dispose event system
    if (this.eventSystem) {
      this.eventSystem.dispose();
    }

    // Dispose scoring system
    if (this.scoringSystem) {
      this.scoringSystem.dispose();
    }

    // Dispose game state manager
    if (this.gameStateManager) {
      this.gameStateManager.dispose();
    }

    // Dispose frame updater
    if (this.frameUpdater) {
      this.frameUpdater.dispose();
    }

    // Dispose UI updater
    if (this.uiUpdater) {
      this.uiUpdater.dispose();
    }

    // Dispose collision handler
    if (this.collisionHandler) {
      this.collisionHandler.dispose();
    }

    // NOTE: Do NOT dispose InputManager - it needs to remain active for keyboard/mouse input!
    // The input listeners should persist across game resets to avoid losing keyboard control
    // If we need to clear input state, use inputManager.reset() instead

    // 3. Reset Game State/Effects

    // Restore default fog if needed
    if (this.defaultFogDensity !== undefined && this.scene && this.scene.fog) {
      this.scene.fog.density = this.defaultFogDensity;
    }

    // 4. Despawn Entities
    this.despawnHorde();

    // 5. Stop Weather
    if (this.weatherManager) {
      this.weatherManager.stopStorm();
    }

    // AUDIO: Stop ALL game sounds (rain, ambient loops, etc.)
    if (this.audioManager) {
      this.audioManager.stopAllSounds();
    }

    // 6. Reset Shop Timers
    if (this.shop) {
      this.shop.reset();
    }

    // 7. Clear UI Notifications
    if (this.ui) {
      this.ui.clearToasts();
    }
  }

  /**
   * Toggle game pause state - DELEGATED TO InputManager
   */
  togglePause() {
    return this.inputManager.togglePause();
  }

  /**
   * Setup event listeners - DELEGATED TO InputManager
   */
  setupEventListeners() {
    return this.inputManager.setupEventListeners();
  }

  /**
   * Main animation loop - DELEGATED TO FrameUpdater
   */
  animate() {
    return this.frameUpdater.animate();
  }

  /**
   * Update ambient sounds based on nearby entities - DELEGATED TO FrameUpdater
   */
  updateAmbientSounds() {
    return this.frameUpdater.updateAmbientSounds();
  }

  /**
   * Start periodic auto-refresh of game data - DELEGATED TO FrameUpdater
   */
  startAutoRefresh() {
    return this.frameUpdater.startAutoRefresh();
  }

  /**
   * Fetch latest data from blockchain - DELEGATED TO FrameUpdater
   */
  async refreshData() {
    return this.frameUpdater.refreshData();
  }

  /**
   * Update HUD display with current state - DELEGATED TO UIUpdater
   */
  updateHUD() {
    return this.uiUpdater.updateHUD();
  }

  /**
   * Update compass display - DELEGATED TO UIUpdater
   */
  updateCompass() {
    return this.uiUpdater.updateCompass();
  }

  /**
   * Update combo meter display - DELEGATED TO UIUpdater
   */
  updateComboDisplay() {
    return this.uiUpdater.updateComboDisplay();
  }

  /**
   * Hide compass HUD - DELEGATED TO UIUpdater
   */
  hideCompass() {
    return this.uiUpdater.hideCompass();
  }

  /**
   * Show compass HUD - DELEGATED TO UIUpdater
   */
  showCompass() {
    return this.uiUpdater.showCompass();
  }

  /**
   * Toggle compass visibility - DELEGATED TO UIUpdater
   */
  toggleCompass() {
    return this.uiUpdater.toggleCompass();
  }

  /**
   * Update coins display - DELEGATED TO UIUpdater
   */
  updateCoinsDisplay() {
    return this.uiUpdater.updateCoinsDisplay();
  }

  /**
   * Flash screen with color effect - DELEGATED TO UIUpdater
   */
  flashScreen(color, duration) {
    return this.uiUpdater.flashScreen(color, duration);
  }

  /**
   * Update time display - DELEGATED TO UIUpdater
   */
  updateTimeDisplay(seconds) {
    return this.uiUpdater.updateTimeDisplay(seconds);
  }
}
