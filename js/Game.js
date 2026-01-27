/**
 * Game Class - Enhanced Edition
 * Main game logic - handles maze generation, rendering, player movement, and gameplay
 * Features: Smooth 3rd person camera, dynamic difficulty, combo milestones, and more
 */

import * as THREE from "three";
import { steemIntegration } from "../steem-integration.js";
import { animationCache } from "../animation-cache.js";
import { Zombie } from "./entities/Zombie.js";
import { ZombieDog } from "./entities/ZombieDog.js";
import { BossZombie } from "./entities/BossZombie.js";
import { BigfootBoss } from "./entities/BigfootBoss.js";
import { Monster } from "./entities/Monster.js";
import { Player } from "./entities/Player.js";
import {
  PostProcessingManager,
  ParticleTrailSystem,
  SkyboxManager,
  ScreenEffectsManager,
} from "./effects/PostProcessing.js";
import { WeatherManager } from "./effects/WeatherManager.js";
import { CompassHUD } from "./ui/CompassHUD.js";
import { ComboMeter } from "./ui/ComboMeter.js";
import { MazeGenerator } from "./core/MazeGenerator.js";
import { GameRules } from "./core/GameRules.js";
import { EnvironmentManager } from "./core/EnvironmentManager.js";
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
    this.level = gameData.get("currentLevel") || 1;

    this.CELL_SIZE = GameRules.CELL_SIZE;
    this.WALL_HEIGHT = GameRules.WALL_HEIGHT;
    this.WALL_THICKNESS = GameRules.WALL_THICKNESS;

    this.playerPos = { x: 0, z: 0 };
    this.mouseX = 0;
    this.mouseY = 0;
    this.fireflies = [];

    // Enhanced game mechanics
    this.gems = []; // Collectible gems in maze
    this.gemsCollected = 0; // Gems picked up this level
    this.combo = 0; // Combo counter
    this.maxCombo = 0; // Best combo this level
    this.wallHits = 0; // Times player hit a wall
    this.cameraShake = 0; // Camera shake intensity
    this.coinsCollected = 0; // Coins collected this level
    this.zombiesKilled = 0; // Zombies purified this level
    this.zombieDogsKilled = 0; // Zombie dogs killed this level
    this.powerUpsUsed = 0; // Power-ups activated this level

    // Intelligent Combo System
    this.lastMoveTime = 0; // Timestamp of last move
    this.previousDistance = 0; // Previous distance to goal (for direction detection)
    this.comboCooldown = 0; // Cooldown timer after decay
    this.canBuildCombo = true; // Whether combo can increase
    this.comboDecayTimer = null; // Timer for combo decay
    this.potionCount = 0; // Number of owned potions
    this.lightBurstCount = 0; // Number of owned light bursts
    this.fogRemoverCount = 0; // Number of owned fog remover potions

    // Zombie and Lives system
    this.zombies = []; // Array of zombie enemies
    this.zombieDogs = []; // Array of zombie dog enemies
    this.lives = GameRules.INITIAL_LIVES; // Start with 3 lives per level
    this.gameOverTriggered = false; // Prevent multiple game-over events

    // Economy
    this.coins = [];
    this.totalCoins = gameData.get("totalCoins") || 0;
    this.isPotionActive = false;
    this.potionTimer = 0;

    // Power-up system
    this.powerUps = []; // Power-ups in maze
    this.activePowerUp = null; // Currently active power-up
    this.powerUpTimer = 0; // Power-up duration timer
    this.isShieldActive = false; // Shield protects from one zombie hit
    this.isSpeedBoostActive = false; // Speed boost for faster movement
    this.isTimeFreezeActive = false; // Freezes zombies temporarily
    this.isMagnetActive = false; // Coin magnet effect
    this.isDoubleScoreActive = false; // Double score power-up
    this.isLightBoostActive = false; // Light boost repels zombies
    this.invincibilityFrames = 0; // Temporary invincibility after taking damage

    // Special events
    this.eventTimer = 0;
    this.currentEvent = null;
    this.darknessOverlay = null;

    // Horde system (spawns after level 5 during darkness)
    this.bossZombies = []; // Boss zombies in current level
    this.monsters = []; // Special Monsters
    this.hordeZombies = []; // Horde-spawned regular zombies
    this.hordeDogs = []; // Horde-spawned dogs
    this.darknessStartTime = null; // When darkness started
    this.hordeSpawned = false; // Has horde been spawned this darkness event
    this.isDarknessActive = false; // Is darkness currently active

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
    this.spawnQueue = []; // Queue for staggered entity spawning

    this.initBackground();
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

  initBackground() {
    this.bgScene = new THREE.Scene();
    this.bgCamera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.bgRenderer = new THREE.WebGLRenderer({
      canvas: this.bgCanvas,
      antialias: true,
      alpha: true,
    });
    this.bgRenderer.setSize(window.innerWidth, window.innerHeight);
    this.bgRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Use cached particle geometry and material
    const particles = animationCache.getGeometry("particle-buffer", () => {
      const geo = new THREE.BufferGeometry();
      const count = 150;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count * 3; i++)
        positions[i] = (Math.random() - 0.5) * 100;
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      return geo;
    });

    const material = animationCache.getMaterial(
      "bg-particles",
      () =>
        new THREE.PointsMaterial({
          color: 0x4ade80,
          size: 0.5,
          transparent: true,
          opacity: 0.6,
        }),
    );

    this.bgParticles = new THREE.Points(particles, material);
    this.bgScene.add(this.bgParticles);
    this.bgCamera.position.z = 30;

    this.animateBackground();
  }

  animateBackground() {
    requestAnimationFrame(() => this.animateBackground());
    if (this.bgParticles) {
      this.bgParticles.rotation.y += 0.0005;
      this.bgParticles.rotation.x += 0.0002;
    }
    this.bgRenderer.render(this.bgScene, this.bgCamera);
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

    this.setupLights();
    this.setupGround();
    if (this.gameData.getSetting("fireflies")) this.createFireflies();
    this.setupEventListeners();
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
    this.weatherManager = new WeatherManager(this.scene, this.camera);
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

    // Camera Controller - DISABLED for stable 3rd person view
    this.cameraController = null;
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
    } else if (this.fireflies.length === 0 && this.scene) {
      this.createFireflies();
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

  setupLights() {
    // High Ambient light to ensure visibility (Non-PBR workaround)
    this.scene.add(new THREE.AmbientLight(0xffffff, 2.2));

    // Bright directional sun light
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(50, 100, 50);
    sun.castShadow = true;
    sun.shadow.camera.left = -100;
    sun.shadow.camera.right = 100;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -100;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    // Stronger interior fill light
    const fillLight = new THREE.PointLight(0xffffff, 1.5, 150);
    fillLight.position.set(0, 30, 0);
    this.scene.add(fillLight);
  }

  setupGround() {
    const size = this.MAZE_SIZE * this.CELL_SIZE + 200;
    const geo = new THREE.PlaneGeometry(size, size, 100, 100);
    const verts = geo.attributes.position.array;
    for (let i = 0; i < verts.length; i += 3) {
      if (
        Math.abs(verts[i]) < (this.MAZE_SIZE * this.CELL_SIZE) / 2 &&
        Math.abs(verts[i + 1]) < (this.MAZE_SIZE * this.CELL_SIZE) / 2
      )
        continue;
      verts[i + 2] = Math.random() * 0.5;
    }
    // Changed to Lighter Earth Tone and removed Metalness
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4e8a46, // Richer Green (More saturation, less pale)
      roughness: 1.0, // Fully matte (absorbs/scatters light evenly)
      metalness: 0.0, // REMOVED METALNESS - caused black look
      flatShading: true,
    });
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // Add distant mountains
    this.createMountains();
  }

  /**
   * Create realistic mountain terrain surrounding the maze
   * Uses procedural noise for jagged, dramatic peaks like real mountains
   */
  createMountains() {
    this.mountains = [];

    const baseDistance = 60 + (this.MAZE_SIZE * this.CELL_SIZE) / 2;

    // Create 4 mountain range segments around the maze
    for (let segment = 0; segment < 4; segment++) {
      const angle = (segment * Math.PI) / 2;
      this.createMountainRange(baseDistance, angle, segment);
    }

    // Add corner ranges for continuity
    for (let corner = 0; corner < 4; corner++) {
      const angle = (corner * Math.PI) / 2 + Math.PI / 4;
      this.createMountainRange(baseDistance + 20, angle, corner, true);
    }
  }

  /**
   * Create a single mountain range segment
   */
  createMountainRange(distance, centerAngle, seed, isCorner = false) {
    // Range dimensions
    const rangeWidth = isCorner ? 80 : 120;
    const rangeDepth = 60;
    const segments = 40;

    // Create plane geometry for terrain
    const geometry = new THREE.PlaneGeometry(
      rangeWidth,
      rangeDepth,
      segments,
      segments,
    );

    // Apply noise displacement for mountain peaks
    const positions = geometry.attributes.position.array;
    const vertex = new THREE.Vector3();

    for (let i = 0; i < positions.length; i += 3) {
      vertex.set(positions[i], positions[i + 1], positions[i + 2]);

      // Multi-octave noise for realistic terrain
      let height = 0;
      const x = vertex.x * 0.05 + seed * 100;
      const y = vertex.y * 0.05;

      // Large features (main peaks)
      height += this.noise(x * 0.3, y * 0.3) * 35;
      // Medium features (ridges)
      height += this.noise(x * 0.7, y * 0.7) * 18;
      // Small features (jagged details)
      height += this.noise(x * 1.5, y * 1.5) * 8;
      // Micro detail
      height += this.noise(x * 3, y * 3) * 3;

      // Create valley in the center facing the maze
      const distFromCenter = Math.abs(vertex.x) / (rangeWidth / 2);
      const valleyFactor = Math.pow(distFromCenter, 0.5);
      height *= 0.3 + valleyFactor * 0.7;

      // Edge fade
      const edgeDist = Math.abs(vertex.y) / (rangeDepth / 2);
      const edgeFade = 1 - Math.pow(edgeDist, 2);
      height *= Math.max(0, edgeFade);

      // Minimum height for foothills
      height = Math.max(height, 2 + Math.random() * 2);

      positions[i + 2] = height;
    }

    geometry.computeVertexNormals();

    // Create gradient material (green base, blue-gray peaks)
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true,
      side: THREE.DoubleSide,
    });

    // Apply vertex colors based on height
    const colors = [];
    for (let i = 0; i < positions.length; i += 3) {
      const height = positions[i + 2];
      const color = this.getMountainColor(height);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const terrain = new THREE.Mesh(geometry, material);

    // Position the range
    terrain.rotation.x = -Math.PI / 2;
    terrain.rotation.z = centerAngle;

    const x = Math.sin(centerAngle) * distance;
    const z = Math.cos(centerAngle) * distance;
    terrain.position.set(x, 0, z);

    this.scene.add(terrain);
    this.mountains.push(terrain);

    // Add dramatic peak spires on top
    this.addMountainSpires(x, z, centerAngle, rangeWidth, distance);
  }

  /**
   * Add sharp peak spires for extra drama
   */
  addMountainSpires(baseX, baseZ, angle, rangeWidth, distance) {
    const spireCount = 5 + Math.floor(Math.random() * 5);

    for (let i = 0; i < spireCount; i++) {
      // Random position along the range
      const offset = (Math.random() - 0.5) * rangeWidth * 0.8;
      const depthOffset = (Math.random() - 0.5) * 30;

      // Calculate world position
      const perpAngle = angle + Math.PI / 2;
      const x =
        baseX + Math.sin(perpAngle) * offset + Math.sin(angle) * depthOffset;
      const z =
        baseZ + Math.cos(perpAngle) * offset + Math.cos(angle) * depthOffset;

      // Spire dimensions
      const height = 25 + Math.random() * 35;
      const radius = 3 + Math.random() * 5;

      // Create jagged cone
      const geo = new THREE.ConeGeometry(
        radius,
        height,
        5 + Math.floor(Math.random() * 3),
      );

      // Displace vertices for jagged look
      const positions = geo.attributes.position.array;
      for (let j = 0; j < positions.length; j += 3) {
        if (positions[j + 1] > height * 0.1) {
          // Don't mess with base
          positions[j] += (Math.random() - 0.5) * 2;
          positions[j + 2] += (Math.random() - 0.5) * 2;
        }
      }
      geo.computeVertexNormals();

      // Blue-gray color for peaks
      const peakColor = new THREE.Color().setHSL(
        0.55 + Math.random() * 0.1, // Blue-cyan hue
        0.2 + Math.random() * 0.15,
        0.35 + Math.random() * 0.15,
      );

      const mat = new THREE.MeshStandardMaterial({
        color: peakColor,
        emissive: peakColor,
        emissiveIntensity: 0.1,
        roughness: 0.85,
        metalness: 0.15,
        flatShading: true,
      });

      const spire = new THREE.Mesh(geo, mat);
      spire.position.set(x, height / 2 + 5, z);
      spire.rotation.y = Math.random() * Math.PI;
      spire.rotation.x = (Math.random() - 0.5) * 0.2;
      spire.rotation.z = (Math.random() - 0.5) * 0.2;

      this.scene.add(spire);
      this.mountains.push(spire);
    }
  }

  /**
   * Simple noise function for terrain generation
   */
  noise(x, y) {
    // Simplex-like noise approximation
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;

    // Hash function
    const hash = (a, b) => {
      const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
      return n - Math.floor(n);
    };

    // Interpolate
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);

    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);

    return (
      a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
    );
  }

  /**
   * Get mountain color based on height (green valleys, blue-gray peaks)
   */
  getMountainColor(height) {
    const color = new THREE.Color();

    if (height < 10) {
      // Low: Dark forest green
      color.setHSL(0.35, 0.5, 0.15 + height * 0.01);
    } else if (height < 25) {
      // Mid: Lighter green to gray-green
      const t = (height - 10) / 15;
      color.setHSL(0.35 - t * 0.1, 0.4 - t * 0.2, 0.2 + t * 0.1);
    } else if (height < 40) {
      // High: Gray-blue rock
      const t = (height - 25) / 15;
      color.setHSL(0.55, 0.15 + t * 0.1, 0.35 + t * 0.1);
    } else {
      // Peak: Light blue-gray (misty)
      color.setHSL(0.58, 0.2, 0.5 + Math.min(height - 40, 20) * 0.01);
    }

    return color;
  }

  createFireflies() {
    // Use cached geometry and material for fireflies
    const geo = animationCache.getGeometry(
      "firefly-sphere",
      () => new THREE.SphereGeometry(0.1, 8, 8),
    );
    const mat = animationCache.getMaterial(
      "firefly",
      () => new THREE.MeshBasicMaterial({ color: 0xffff00 }),
    );

    for (let i = 0; i < 50; i++) {
      const f = new THREE.Mesh(geo, mat);
      f.position.set(
        (Math.random() - 0.5) * 100,
        Math.random() * 5 + 1,
        (Math.random() - 0.5) * 100,
      );
      f.userData = {
        speed: Math.random() * 0.05 + 0.02,
        curve: Math.random() * Math.PI * 2,
        yOffset: Math.random() * 100,
      };
      this.scene.add(f);
      this.fireflies.push(f);
    }
  }

  generateMaze() {
    return MazeGenerator.generate(this.MAZE_SIZE);
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
        c === this.ground ||
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
    this.createGems();

    // Spawn zombies in corners
    this.createZombies();

    // Spawn power-ups (level 2+)
    this.createPowerUps();

    // Apply level-based fog settings
    this.applySettings();
    this.startLevelFog();
  }

  createGems() {
    // Clear existing gems
    this.gems.forEach((g) => this.scene.remove(g));
    this.gems = [];
    this.gemsCollected = 0;

    // Number of gems scales with level (more gems = more challenge to collect all)
    const gemCount = Math.min(3 + Math.floor(this.level / 2), 10);
    const offset = -(this.MAZE_SIZE * this.CELL_SIZE) / 2;

    // Place gems at random maze cells (not start or goal)
    const usedCells = new Set();
    usedCells.add(`0,0`); // Goal
    usedCells.add(`${this.MAZE_SIZE - 1},${this.MAZE_SIZE - 1}`); // Start

    for (let i = 0; i < gemCount; i++) {
      let x, z;
      let key;
      let attempts = 0;
      do {
        x = Math.floor(Math.random() * this.MAZE_SIZE);
        z = Math.floor(Math.random() * this.MAZE_SIZE);
        key = `${x},${z}`;
        attempts++;
      } while (usedCells.has(key) && attempts < 50);

      if (attempts >= 50) continue;
      usedCells.add(key);

      // Create gem mesh using cached material
      const gemGeo = new THREE.OctahedronGeometry(0.35, 0);
      const gemMat = animationCache.getMaterial(
        "gem",
        () =>
          new THREE.MeshStandardMaterial({
            color: 0xa855f7, // Purple
            emissive: 0xa855f7,
            emissiveIntensity: 1.5,
            metalness: 0.9,
            roughness: 0.1,
            transparent: true,
            opacity: 0.9,
          }),
      );
      const gem = new THREE.Mesh(gemGeo, gemMat);

      gem.position.set(
        offset + x * this.CELL_SIZE + this.CELL_SIZE / 2,
        1,
        offset + z * this.CELL_SIZE + this.CELL_SIZE / 2,
      );

      // Store grid position for collision detection
      gem.userData = { gridX: x, gridZ: z, collected: false };

      // Add glow effect
      gem.add(new THREE.PointLight(0xa855f7, 0.8, 6));

      this.scene.add(gem);
      this.gems.push(gem);
    }
  }

  createCoins() {
    // Clean up old instances
    if (this.coinsMesh) {
      this.scene.remove(this.coinsMesh);
      if (this.coinsMesh.geometry) this.coinsMesh.geometry.dispose();
      if (this.coinsMesh.material) this.coinsMesh.material.dispose();
      this.coinsMesh = null;
    }
    // We don't have individual meshes to remove anymore, just reset data
    this.coins = [];

    const count = Math.floor(this.MAZE_SIZE * 0.8) + this.level; // Scale with size
    const offset = -(this.MAZE_SIZE * this.CELL_SIZE) / 2;

    // Simple gold material
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0xaa6600,
      emissiveIntensity: 0.2,
    });
    const geo = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16);

    // Create InstancedMesh
    this.coinsMesh = new THREE.InstancedMesh(geo, mat, count);
    this.coinsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // valid for coins if we animate/hide them
    this.coinsMesh.castShadow = true;
    this.coinsMesh.receiveShadow = true;
    this.scene.add(this.coinsMesh);

    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = Math.floor(Math.random() * this.MAZE_SIZE);
      const z = Math.floor(Math.random() * this.MAZE_SIZE);

      const posX = offset + x * this.CELL_SIZE + this.CELL_SIZE / 2;
      const posZ = offset + z * this.CELL_SIZE + this.CELL_SIZE / 2;
      const posY = 1.0;

      dummy.position.set(posX, posY, posZ);
      dummy.rotation.z = Math.PI / 2; // Stand vertically
      dummy.updateMatrix();

      this.coinsMesh.setMatrixAt(i, dummy.matrix);

      // Store data for logic
      this.coins.push({
        index: i,
        gridX: x,
        gridZ: z,
        position: new THREE.Vector3(posX, posY, posZ),
        collecting: false,
        active: true,
      });
    }

    this.coinsMesh.instanceMatrix.needsUpdate = true;
  }

  createZombies() {
    // Clear existing zombies
    this.zombies.forEach((z) => z.dispose());
    this.zombies = [];

    // Clear existing bosses
    this.bossZombies.forEach((b) => b.dispose());
    this.bossZombies = [];

    // Number of zombies = level number (Level 1 = 1, Level 2 = 2, etc., max 6)
    const zombieCount = GameRules.getZombieCount(this.level);

    // Track used positions to avoid overlaps
    const usedPositions = new Set();

    // Avoid player start (bottom-right) and goal (top-left)
    const playerStartX = this.MAZE_SIZE - 1;
    const playerStartZ = this.MAZE_SIZE - 1;
    const goalX = 0;
    const goalZ = 0;

    // Minimum distance from player start (gives player breathing room)
    // === BOSS SPAWN (Level 6+) ===
    // Persistent Bosses appear starting at Level 6
    if (this.level >= 6) {
      // Scale boss count based on 5-level tiers: L6-10: 1, L11-15: 2, etc.
      const bigfootCount = Math.floor((this.level - 1) / 5);
      const actualCount = Math.min(bigfootCount, 6); // Max 6 Persistent Bigfoots

      for (let i = 0; i < actualCount; i++) {
        let bx, bz;
        let attempts = 0;
        do {
          bx = Math.floor(Math.random() * this.MAZE_SIZE);
          bz = Math.floor(Math.random() * this.MAZE_SIZE);
          attempts++;
        } while (
          (Math.abs(bx - this.playerPos.x) + Math.abs(bz - this.playerPos.z) <
            4 || // Far from player
            usedPositions.has(`${bx},${bz}`)) && // Not on another entity
          attempts < 50
        );

        usedPositions.add(`${bx},${bz}`);

        const boss = new BigfootBoss(
          bx,
          bz,
          this.maze,
          this.CELL_SIZE,
          this.MAZE_SIZE,
          this.scene,
          this.level,
        );
        boss.isPersistent = true; // Mark as persistent level boss
        this.bossZombies.push(boss);
      }

      const bossLabel = actualCount > 1 ? "BOSSES" : "BOSS";

      // Debounce toast to prevent double notifications on level load
      const now = Date.now();
      if (!this.lastBigfootToast || now - this.lastBigfootToast > 2000) {
        if (this.audioManager) {
          this.audioManager.playBossSpawn();
        }

        this.ui.showToast(
          `⚠️ ${actualCount} BIGFOOT ${bossLabel} DETECTED!`,
          "warning",
        );
        this.lastBigfootToast = now;
      }
    }

    for (let i = 0; i < zombieCount; i++) {
      let x = Math.floor(Math.random() * this.MAZE_SIZE);
      let z = Math.floor(Math.random() * this.MAZE_SIZE);

      // Ensure away from player
      while (
        Math.abs(x - this.playerPos.x) + Math.abs(z - this.playerPos.z) <
        3
      ) {
        x = Math.floor(Math.random() * this.MAZE_SIZE);
        z = Math.floor(Math.random() * this.MAZE_SIZE);
      }

      const zombie = new Zombie(
        x,
        z,
        this.maze,
        this.CELL_SIZE,
        this.MAZE_SIZE,
        this.scene,
        `zombie_${i}`,
        this.level,
      );
      this.zombies.push(zombie);
    }

    // Also create zombie dogs starting from level 2
    this.createZombieDogs();

    // Create Monsters (Special Enemy)
    this.createMonsters();
  }

  createMonsters() {
    // Clear existing monsters
    this.monsters.forEach((m) => m.dispose());
    this.monsters = [];

    // Spawn 1 Monster per level, max 5 (Very dangerous)
    const count = Math.min(Math.floor(this.level / 2) + 1, 5);

    const usedPositions = new Set();

    for (let i = 0; i < count; i++) {
      let x, z;
      let attempts = 0;
      let valid = false;

      while (!valid && attempts < 50) {
        x = Math.floor(Math.random() * this.MAZE_SIZE);
        z = Math.floor(Math.random() * this.MAZE_SIZE);

        // Check distance from player start (bottom right)
        const dist =
          Math.abs(x - (this.MAZE_SIZE - 1)) +
          Math.abs(z - (this.MAZE_SIZE - 1));

        if (dist > 5 && !usedPositions.has(`${x},${z}`)) {
          valid = true;
          usedPositions.add(`${x},${z}`);
        }
        attempts++;
      }

      if (valid) {
        const monster = new Monster(
          x,
          z,
          this.maze,
          this.CELL_SIZE,
          this.MAZE_SIZE,
          this.scene,
          this.level,
          this, // Pass game instance
        );
        this.monsters.push(monster);
      }
    }
  }

  createZombieDogs() {
    // Clear existing zombie dogs
    this.zombieDogs.forEach((d) => d.dispose());
    this.zombieDogs = [];

    // Zombie dogs appear from level 2, count scales with level
    const dogCount = GameRules.getZombieDogCount(this.level);
    if (dogCount === 0) return;
    const usedPositions = new Set();

    // Avoid player start and goal
    const playerStartX = this.MAZE_SIZE - 1;
    const playerStartZ = this.MAZE_SIZE - 1;
    const goalX = 0;
    const goalZ = 0;
    const minDistanceFromStart = Math.max(4, Math.floor(this.MAZE_SIZE / 3));

    for (let i = 0; i < dogCount; i++) {
      let attempts = 0;
      let validPosition = false;
      let x, z;

      while (!validPosition && attempts < 50) {
        // Dogs spawn more toward the middle of the maze for patrol
        x = Math.floor(Math.random() * (this.MAZE_SIZE - 2)) + 1;
        z = Math.floor(Math.random() * (this.MAZE_SIZE - 2)) + 1;

        const posKey = `${x},${z}`;
        const distanceFromStart =
          Math.abs(x - playerStartX) + Math.abs(z - playerStartZ);
        const isAtGoal = x === goalX && z === goalZ;
        const isAtStart = x === playerStartX && z === playerStartZ;

        if (
          !usedPositions.has(posKey) &&
          !isAtGoal &&
          !isAtStart &&
          distanceFromStart >= minDistanceFromStart
        ) {
          validPosition = true;
          usedPositions.add(posKey);
        }

        attempts++;
      }

      if (!validPosition) {
        // Fallback to center-ish positions
        x = Math.floor(this.MAZE_SIZE / 2) + (i % 2 === 0 ? -2 : 2);
        z = Math.floor(this.MAZE_SIZE / 2) + (i % 2 === 0 ? 2 : -2);
        x = Math.max(1, Math.min(this.MAZE_SIZE - 2, x));
        z = Math.max(1, Math.min(this.MAZE_SIZE - 2, z));
      }

      const dog = new ZombieDog(
        x,
        z,
        this.maze,
        this.CELL_SIZE,
        this.MAZE_SIZE,
        this.scene,
        this.level,
      );
      this.zombieDogs.push(dog);
    }
  }

  /**
   * Create power-ups in the maze
   */
  createPowerUps() {
    // Clear existing power-ups
    this.powerUps.forEach((p) => this.scene.remove(p));
    this.powerUps = [];

    // Power-ups appear starting at level 2
    if (this.level < 2) return;

    // Number of power-ups (1-2 based on level)
    const powerUpCount = Math.min(1 + Math.floor(this.level / 4), 2);
    const offset = -(this.MAZE_SIZE * this.CELL_SIZE) / 2;

    // Track used cells
    const usedCells = new Set();
    usedCells.add(`0,0`); // Goal
    usedCells.add(`${this.MAZE_SIZE - 1},${this.MAZE_SIZE - 1}`); // Start

    // Add gem positions to avoid
    this.gems.forEach((gem) => {
      usedCells.add(`${gem.userData.gridX},${gem.userData.gridZ}`);
    });

    const powerUpTypes = ["shield", "speed", "freeze"];

    for (let i = 0; i < powerUpCount; i++) {
      let x, z, key;
      let attempts = 0;
      do {
        x = Math.floor(Math.random() * this.MAZE_SIZE);
        z = Math.floor(Math.random() * this.MAZE_SIZE);
        key = `${x},${z}`;
        attempts++;
      } while (usedCells.has(key) && attempts < 50);

      if (attempts >= 50) continue;
      usedCells.add(key);

      const type =
        powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
      const powerUp = this.createPowerUpMesh(type);

      powerUp.position.set(
        offset + x * this.CELL_SIZE + this.CELL_SIZE / 2,
        1.2,
        offset + z * this.CELL_SIZE + this.CELL_SIZE / 2,
      );

      powerUp.userData = { gridX: x, gridZ: z, type: type, collected: false };

      this.scene.add(powerUp);
      this.powerUps.push(powerUp);
    }
  }

  /**
   * Create power-up mesh based on type
   */
  createPowerUpMesh(type) {
    let geo, mat, color;

    switch (type) {
      case "shield":
        geo = new THREE.TorusGeometry(0.3, 0.1, 8, 16);
        color = 0x3b82f6; // Blue
        break;
      case "speed":
        geo = new THREE.ConeGeometry(0.25, 0.5, 8);
        color = 0xfbbf24; // Yellow
        break;
      case "freeze":
        geo = new THREE.IcosahedronGeometry(0.3, 0);
        color = 0x06b6d4; // Cyan
        break;
      default:
        geo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        color = 0xffffff;
    }

    mat = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 1.5,
      metalness: 0.9,
      roughness: 0.1,
      transparent: true,
      opacity: 0.9,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.add(new THREE.PointLight(color, 1, 8));

    return mesh;
  }

  /**
   * Check for power-up collection
   */
  checkPowerUpCollection() {
    const { x, z } = this.playerPos;

    this.powerUps.forEach((powerUp) => {
      if (powerUp.userData.collected) return;
      if (powerUp.userData.gridX === x && powerUp.userData.gridZ === z) {
        powerUp.userData.collected = true;
        this.scene.remove(powerUp);

        this.activatePowerUp(powerUp.userData.type);
      }
    });
  }

  /**
   * Activate a power-up
   */
  activatePowerUp(type) {
    // Deactivate any existing power-up first
    if (this.activePowerUp) {
      this.deactivatePowerUp();
    }

    this.activePowerUp = type;
    this.powerUpsUsed++;

    // Get duration from GameRules if available
    const typeUpper = type.toUpperCase();
    const powerUpConfig = GameRules.POWERUP_TYPES[typeUpper];
    this.powerUpTimer = powerUpConfig
      ? powerUpConfig.duration
      : GameRules.POWERUP_DURATION;

    // Screen flash for power-up
    if (this.screenEffects) {
      this.screenEffects.powerUpFlash(type);
    }

    // Camera zoom effect
    if (this.cameraController) {
      this.cameraController.zoomTo(0.9);
      setTimeout(() => this.cameraController.zoomTo(1.0), 500);
    }

    // Particle burst at player position
    if (this.particleTrail && this.playerMesh) {
      const colors = {
        shield: 0x3b82f6,
        speed: 0xfbbf24,
        freeze: 0x06b6d4,
        magnet: 0xa855f7,
        double_score: 0x22c55e,
      };
      this.particleTrail.burst(
        this.playerMesh.position,
        25,
        colors[type] || 0x4ade80,
      );
    }

    switch (type) {
      case "shield":
        this.isShieldActive = true;
        this.ui.showToast(
          "🛡️ SHIELD ACTIVATED! Protected from 1 hit!",
          "shield",
        );
        // AUDIO: Play shield sound
        if (this.audioManager) this.audioManager.playShield();

        if (this.playerMesh) {
          this.playerMesh.material.color.setHex(0x3b82f6);
        }
        if (this.particleTrail) {
          this.particleTrail.setColor(0x3b82f6);
        }
        break;

      case "speed":
        this.isSpeedBoostActive = true;
        this.ui.showToast("⚡ SPEED BOOST! Move faster!", "bolt");
        if (this.particleTrail) {
          this.particleTrail.setColor(0xfbbf24);
        }
        break;

      case "freeze":
        this.isTimeFreezeActive = true;
        this.ui.showToast("❄️ TIME FREEZE! Zombies frozen!", "ac_unit");
        if (this.particleTrail) {
          this.particleTrail.setColor(0x06b6d4);
        }
        // Freeze all zombies visually
        this.zombies.forEach((z) => {
          if (z.mesh) {
            z.mesh.material.emissive.setHex(0x06b6d4);
          }
        });
        break;

      case "magnet":
        this.isMagnetActive = true;
        this.ui.showToast("🧲 COIN MAGNET! Attract nearby coins!", "explore");
        if (this.playerMesh) {
          this.playerMesh.material.color.setHex(0xa855f7);
        }
        if (this.particleTrail) {
          this.particleTrail.setColor(0xa855f7);
        }
        break;

      case "double_score":
        this.isDoubleScoreActive = true;
        this.ui.showToast("💰 DOUBLE SCORE! 2X points!", "paid");
        if (this.playerMesh) {
          this.playerMesh.material.color.setHex(0x22c55e);
          this.playerMesh.material.emissiveIntensity = 2;
        }
        if (this.particleTrail) {
          this.particleTrail.setColor(0x22c55e);
        }
        break;
    }

    if (this.gameData.getSetting("vibration") && navigator.vibrate) {
      navigator.vibrate([20, 50, 20, 50, 20]);
    }
  }

  /**
   * Update power-up timer
   */
  updatePowerUps() {
    if (this.powerUpTimer > 0) {
      this.powerUpTimer--;

      if (this.powerUpTimer === 0) {
        this.deactivatePowerUp();
      }
    }

    // Animate power-ups
    this.powerUps.forEach((powerUp) => {
      if (!powerUp.userData.collected) {
        powerUp.rotation.y += 0.03;
        powerUp.position.y = 1.2 + Math.sin(Date.now() * 0.003) * 0.2;
      }
    });
  }

  /**
   * Deactivate current power-up
   */
  deactivatePowerUp() {
    // Reset based on power-up type
    switch (this.activePowerUp) {
      case "shield":
        this.isShieldActive = false;
        if (this.player) {
          this.player.resetColor();
        }
        break;

      case "speed":
        this.isSpeedBoostActive = false;
        if (this.player) {
          this.player.resetColor();
        }
        break;

      case "freeze":
        this.isTimeFreezeActive = false;
        // Reset zombie colors
        this.zombies.forEach((z) => {
          if (z.mesh) {
            z.mesh.material.emissive.setHex(0xdc2626);
          }
        });
        break;

      case "magnet":
        this.isMagnetActive = false;
        if (this.player) {
          this.player.resetColor();
        }
        break;

      case "double_score":
        this.isDoubleScoreActive = false;
        if (this.player) {
          this.player.resetColor();
        }
        break;
    }

    // Reset particle trail to white/cyan
    if (this.particleTrail) {
      this.particleTrail.setColor(0x88ddff);
    }

    this.activePowerUp = null;
    this.ui.showToast("Power-up expired!", "timer_off");
  }

  /**
   * Trigger random special events based on level
   */
  triggerRandomEvent() {
    if (this.level < 3) return; // Events start at level 3

    // 5% chance per move to trigger an event
    if (Math.random() > 0.05) return;

    // Darkness event should not trigger within first 10 seconds of the game
    const minTimeForDarkness = 10; // seconds

    const events = ["darkness", "zombie_surge", "bonus_time"];
    let event = events[Math.floor(Math.random() * events.length)];

    // If darkness was selected but game just started, pick a different event
    if (event === "darkness" && this.time < minTimeForDarkness) {
      const nonDarknessEvents = events.filter((e) => e !== "darkness");
      event =
        nonDarknessEvents[Math.floor(Math.random() * nonDarknessEvents.length)];
    }

    switch (event) {
      case "darkness":
        // Darkness is now handled by a dedicated timer (every 3 minutes)
        // We skip it here to keep it periodic and predictable as requested
        return;
        break;
      case "zombie_surge":
        this.triggerZombieSurge();
        break;
      case "bonus_time":
        this.triggerBonusTime();
        break;
    }
  }

  /**
   * Darkness event - reduced visibility
   * After level 5: Spawns zombie horde if player doesn't use light boost within 2 seconds
   */
  triggerDarknessEvent() {
    // Check if Fog Remover prevents darkness
    if (this.shop && this.shop.fogRemoverActive) {
      return;
    }

    this.ui.showToast(
      "⚠️ DARKNESS FALLS! Visibility reduced!",
      "visibility_off",
    );

    this.isDarknessActive = true;
    this.darknessStartTime = Date.now();
    this.hordeSpawned = false;

    // AUDIO: Play terrifying scream
    if (this.audioManager) {
      this.audioManager.playHordeScream();
    }

    // Store default fog for restoration
    if (!this.defaultFogDensity) {
      this.defaultFogDensity = this.scene.fog.density;
    }
    const originalFog = this.defaultFogDensity;
    this.scene.fog.density = originalFog * 2.5; // Heavier darkness

    // Lock weather density so it doesn't fight darkness, but keep color effects (flash) active
    if (this.weatherManager) {
      this.weatherManager.resumeFogEffects(); // Ensure it's active for color/flash
      this.weatherManager.lockFogDensity(true);
    }

    // Pulsing effect
    let pulseDirection = 1;
    const pulseInterval = setInterval(() => {
      if (!this.scene.fog || !this.isDarknessActive) {
        clearInterval(pulseInterval);
        return;
      }
      // Simple pulse between 2.0x and 3.0x density
      const current = this.scene.fog.density;
      if (current > originalFog * 3) pulseDirection = -1;
      if (current < originalFog * 2.0) pulseDirection = 1;
      this.scene.fog.density += 0.002 * pulseDirection;
    }, 50);

    // Save interval ID to clear it later if needed
    this.darknessPulseInterval = pulseInterval;

    // Check for horde spawn after 2 seconds (only level 5+)
    if (this.level >= 5) {
      this.hordeCheckTimeout = setTimeout(() => {
        // Check if player has activated protection
        if (this.isDarknessActive && !this.hordeSpawned) {
          this.spawnZombieHorde();
        }
      }, 1000); // 1 second delay (reduced from 2s)
    }

    // End darkness after 20 seconds
    this.darknessEndTimeout = setTimeout(() => {
      this.endDarknessEvent(originalFog);
    }, 20000);
  }

  /**
   * End darkness event and clean up
   */
  endDarknessEvent(originalFog) {
    this.isDarknessActive = false;
    this.darknessStartTime = null;

    // Ambient Sound Timer
    this.lastAmbientSoundTime = 0;

    if (this.hordeCheckTimeout) {
      clearTimeout(this.hordeCheckTimeout);
      this.hordeCheckTimeout = null;
    }

    // Clear pulse interval
    if (this.darknessPulseInterval) {
      clearInterval(this.darknessPulseInterval);
      this.darknessPulseInterval = null;
    }

    // Restore fog
    if (this.scene.fog && originalFog) {
      this.scene.fog.density = originalFog;
    }

    // Resume weather fog effects fully
    if (this.weatherManager) {
      this.weatherManager.lockFogDensity(false);
    }

    // NOTE: We NO LONGER despawn horde entities when darkness ends!
    // Entities persist until killed by player or level restarts.
    // This makes gameplay more consistent and prevents visual bugs.

    this.ui.showToast("☀️ Light returns!", "wb_sunny");
  }

  /**
   * Spawn zombie horde - 1 boss + multiple zombies and dogs
   */
  spawnZombieHorde() {
    if (this.hordeSpawned) return;
    this.hordeSpawned = true;

    this.ui.showToast("💀 ZOMBIE HORDE INCOMING!", "warning");
    this.cameraShake = 1.5;

    // Vibration feedback
    if (this.gameData.getSetting("vibration") && navigator.vibrate) {
      navigator.vibrate([100, 50, 100, 50, 200]);
    }

    // Find spawn positions far from player
    const hordeConfig = GameRules.getHordeConfig(this.level);
    const totalNeeded =
      hordeConfig.bossCount + hordeConfig.zombieCount + hordeConfig.dogCount;
    const spawnPositions = this.findHordeSpawnPositions(totalNeeded);

    if (spawnPositions.length < 1) {
      console.warn("Could not find spawn positions for horde");
      return;
    }

    // Spawn Bosses - Add to Queue
    const bossCount = hordeConfig.bossCount;

    for (let i = 0; i < bossCount && i < spawnPositions.length; i++) {
      const bossPos = spawnPositions[i];
      this.spawnQueue.push({
        type: "boss",
        x: bossPos.x,
        z: bossPos.z,
      });
    }

    // Adjust start index for next loop
    const startIndex = bossCount;

    // Spawn horde zombies - Add to Queue
    for (
      let i = startIndex;
      i < Math.min(startIndex + hordeConfig.zombieCount, spawnPositions.length);
      i++
    ) {
      const pos = spawnPositions[i];
      this.spawnQueue.push({
        type: "zombie",
        x: pos.x,
        z: pos.z,
        corner: i % 4,
      });
    }

    // Spawn horde dogs - Add to Queue
    for (
      let i = startIndex + hordeConfig.zombieCount;
      i <
      Math.min(
        startIndex + hordeConfig.zombieCount + hordeConfig.dogCount,
        spawnPositions.length,
      );
      i++
    ) {
      const pos = spawnPositions[i];
      this.spawnQueue.push({
        type: "dog",
        x: pos.x,
        z: pos.z,
      });
    }
  }

  /**
   * Process the spawn queue - 1 entity per frame to prevent lag spikes
   */
  processSpawnQueue() {
    if (!this.spawnQueue || this.spawnQueue.length === 0) return;

    // Process up to 2 entities per frame
    const batchSize = 2;
    for (let i = 0; i < batchSize && this.spawnQueue.length > 0; i++) {
      const task = this.spawnQueue.shift();
      this.spawnEntity(task);
    }
  }

  spawnEntity(task) {
    if (task.type === "boss") {
      const boss = new BossZombie(
        task.x,
        task.z,
        this.maze,
        this.CELL_SIZE,
        this.MAZE_SIZE,
        this.scene,
        this.level,
      );
      boss.isHordeBoss = true;
      boss.isPersistent = false;
      if (boss.mesh) {
        boss.mesh.userData.isHordeBoss = true;
        // Traverse and clone material before modifying to avoid affecting shared cache
        boss.mesh.traverse((child) => {
          if (child.isMesh && child.material && child.material.emissive) {
            const hordeMat = child.material.clone();
            hordeMat.emissiveIntensity = 0.6; // Brighter glow
            child.material = hordeMat;
          }
        });
      }
      if (boss.eyeGlow) {
        boss.eyeGlow.intensity = 2.0;
        boss.eyeGlow.distance = 8;
      }
      this.scene.add(boss.mesh);
      this.bossZombies.push(boss);

      // Play Spawn Sound for Horde Boss
      if (this.audioManager) {
        this.audioManager.playBossSpawn();
      }
    } else if (task.type === "zombie") {
      const zombie = new Zombie(
        task.x,
        task.z,
        this.maze,
        this.CELL_SIZE,
        this.MAZE_SIZE,
        this.scene,
        task.corner,
        this.level,
      );
      zombie.chaseRange = this.MAZE_SIZE;
      zombie.isHordeZombie = true;
      zombie.moveInterval = Math.max(10, Math.floor(zombie.moveInterval * 0.7));

      // VISUAL DISTINCTION: Clone and modify material
      if (zombie.mesh) {
        zombie.mesh.userData.isHordeZombie = true;
        zombie.mesh.traverse((child) => {
          // Target specific parts that use the body material
          if (child.isMesh && child.name !== "jaw" && child.name !== "neck") {
            if (child.material && child.material.emissive) {
              // Clone material so we don't change ALL zombies
              const hordeMat = child.material.clone();
              hordeMat.emissive.setHex(0x660000); // Dark red glow
              hordeMat.emissiveIntensity = 0.4;
              child.material = hordeMat;
            }
          }
        });
      }

      this.hordeZombies.push(zombie);
    } else if (task.type === "dog") {
      const dog = new ZombieDog(
        task.x,
        task.z,
        this.maze,
        this.CELL_SIZE,
        this.MAZE_SIZE,
        this.scene,
        this.level,
      );
      dog.chaseRange = this.MAZE_SIZE;
      dog.isHordeDog = true;
      dog.moveInterval = Math.max(8, Math.floor(dog.moveInterval * 0.8));

      // VISUAL DISTINCTION: Clone and modify material
      if (dog.mesh) {
        dog.mesh.userData.isHordeDog = true;
        dog.mesh.traverse((child) => {
          if (child.isMesh && child.material && child.material.emissive) {
            // Clone material so we don't change ALL dogs
            const hordeMat = child.material.clone();
            hordeMat.emissive.setHex(0x440000); // Red tint
            hordeMat.emissiveIntensity = 0.3;
            child.material = hordeMat;
          }
        });
      }
      this.hordeDogs.push(dog);
    }
  }

  /**
   * Find valid spawn positions for horde (far from player)
   */
  findHordeSpawnPositions(count) {
    const positions = [];
    let minDistanceFromPlayer = Math.floor(this.MAZE_SIZE / 3);

    // Attempt 1: Strict distance
    let attempts = 0;
    while (positions.length < count && attempts < 200) {
      this._tryAddSpawnPosition(positions, minDistanceFromPlayer);
      attempts++;
    }

    // Attempt 2: Relaxed distance (half range)
    if (positions.length < count) {
      minDistanceFromPlayer = Math.floor(this.MAZE_SIZE / 6);
      attempts = 0;
      while (positions.length < count && attempts < 200) {
        this._tryAddSpawnPosition(positions, minDistanceFromPlayer);
        attempts++;
      }
    }

    // Attempt 3: Desperate (any empty spot)
    if (positions.length < count) {
      minDistanceFromPlayer = 2; // Just not ON the player
      attempts = 0;
      while (positions.length < count && attempts < 200) {
        this._tryAddSpawnPosition(positions, minDistanceFromPlayer);
        attempts++;
      }
    }

    if (positions.length === 0) {
      console.warn(
        "CRITICAL: Failed to find ANY spawn positions even after fallback.",
      );
    } else if (positions.length < count) {
      console.warn(
        `Partial spawn: Found ${positions.length}/${count} positions.`,
      );
    }

    return positions;
  }

  _tryAddSpawnPosition(positions, minDistance) {
    const x = Math.floor(Math.random() * this.MAZE_SIZE);
    const z = Math.floor(Math.random() * this.MAZE_SIZE);

    // MAZE CHECK: In grid mazes, all cells are valid valid positions.
    // The previous check (this.maze[z][x] !== 0) assumed 0=empty, but maze cells are objects.
    // So checking !== 0 always returned true (invalid), failing the spawn.
    // We can just skip this check as long as x/z are bounds checked (which random does).

    // Check distance from player
    const distFromPlayer =
      Math.abs(x - this.playerPos.x) + Math.abs(z - this.playerPos.z);
    if (distFromPlayer < minDistance) return false;

    // Check not too close to other spawn positions
    const tooClose = positions.some(
      (p) => Math.abs(p.x - x) + Math.abs(p.z - z) < 1, // Relaxed inter-spawn distance
    );
    if (tooClose) return false;

    positions.push({ x, z });
    return true;
  }

  /**
   * Despawn all horde entities when darkness ends
   * @param {boolean} keepPersistent - If true, keeps level bosses active
   */
  despawnHorde(keepPersistent = false) {
    // Dispose boss zombies
    // If keepPersistent is true, we filter. Otherwise we kill all (for cleanup)
    if (keepPersistent) {
      const beforeCount = this.bossZombies.length;
      this.bossZombies = this.bossZombies.filter((boss) => {
        if (boss.isPersistent) {
          return true;
        }
        boss.dispose();
        return false;
      });
    } else {
      this.bossZombies.forEach((boss) => boss.dispose());
      this.bossZombies = [];
    }

    // Dispose horde zombies
    const hordeZombieCount = this.hordeZombies.length;
    this.hordeZombies.forEach((zombie) => {
      zombie.dispose();
    });
    this.hordeZombies = [];

    // Dispose horde dogs
    const hordeDogCount = this.hordeDogs.length;
    this.hordeDogs.forEach((dog) => {
      dog.dispose();
    });
    this.hordeDogs = [];

    // Only set hordeSpawned to false if we actually cleared everything
    // If persistent bosses remain, we should track that the event horde is gone but bosses remain
    if (hordeZombieCount > 0 || hordeDogCount > 0) {
    }

    // Reset horde spawned flag - this only affects whether NEW horde can spawn
    this.hordeSpawned = false;
  }

  /**
   * Zombie surge - zombies move faster temporarily
   */
  triggerZombieSurge() {
    this.ui.showToast("ZOMBIE SURGE! They're faster!", "warning");

    // Already handled by zombie chase behavior
    this.zombies.forEach((z) => {
      z.isChasing = true;
      z.chaseTarget = { x: this.playerPos.x, z: this.playerPos.z };
    });

    this.zombieSurgeTimeout = setTimeout(() => {
      this.zombies.forEach((z) => {
        z.isChasing = false;
      });
      this.ui.showToast("Zombies calmed down", "check_circle");
    }, 4000);
  }

  /**
   * Bonus time event
   */
  triggerBonusTime() {
    this.ui.showToast("BONUS TIME! +10 seconds!", "schedule");
    this.time = Math.max(0, this.time - 10);
    document.getElementById("time").textContent = this.ui.formatTime(this.time);
  }

  createPlayer() {
    // Use the Player entity class for humanoid model with animations
    this.player = new Player(this.scene, this.CELL_SIZE, this.audioManager);
    this.playerMesh = this.player.mesh; // Keep reference for compatibility
    this.player.addToScene();
    this.updatePlayerPosition();
  }

  updatePlayerPosition(dx = 0, dz = 0) {
    if (!this.playerMesh) return;
    const offset = -(this.MAZE_SIZE * this.CELL_SIZE) / 2;
    this.playerMesh.position.set(
      offset + this.playerPos.x * this.CELL_SIZE + this.CELL_SIZE / 2,
      0, // Ground level (player model handles its own height)
      offset + this.playerPos.z * this.CELL_SIZE + this.CELL_SIZE / 2,
    );

    // Trigger walking animation if moving
    if (this.player && (dx !== 0 || dz !== 0)) {
      this.player.startWalking(dx, dz);
      // Stop walking after a short delay (movement completion)
      setTimeout(() => {
        if (this.player) this.player.stopWalking();
      }, 200);
    }
  }

  movePlayer(dx, dz) {
    if (this.won || this.isPaused) return;

    if (!this.isRunning) {
      this.isRunning = true;
      this.startTimer();
    }

    const newX = this.playerPos.x + dx;
    const newZ = this.playerPos.z + dz;

    // Bounds check
    if (
      newX < 0 ||
      newX >= this.MAZE_SIZE ||
      newZ < 0 ||
      newZ >= this.MAZE_SIZE
    ) {
      this.onWallHit();
      return;
    }

    // Wall check
    const cell = this.maze[this.playerPos.z][this.playerPos.x];
    if (dx === 1 && cell.right) {
      this.onWallHit();
      return;
    }
    if (dx === -1 && cell.left) {
      this.onWallHit();
      return;
    }
    if (dz === 1 && cell.bottom) {
      this.onWallHit();
      return;
    }
    if (dz === -1 && cell.top) {
      this.onWallHit();
      return;
    }

    // Valid move - update position
    this.playerPos.x = newX;
    this.playerPos.z = newZ;
    this.updatePlayerPosition(dx, dz);

    // Update camera direction for look-ahead
    if (this.cameraController) {
      this.cameraController.setPlayerDirection(dx, dz);
    }

    // Emit particle trail
    if (this.particleTrail && this.playerMesh) {
      this.particleTrail.emit(this.playerMesh.position, 2);
    }

    // === INTELLIGENT COMBO SYSTEM ===
    const now = Date.now();
    const timeSinceLastMove = now - this.lastMoveTime;

    // Calculate distance to goal (goal is at 0,0)
    const currentDistance = this.playerPos.x + this.playerPos.z;
    const isMovingForward = currentDistance < this.previousDistance;
    const isMovingBackward = currentDistance > this.previousDistance;

    // Clear any pending decay timer
    if (this.comboDecayTimer) {
      clearTimeout(this.comboDecayTimer);
      this.comboDecayTimer = null;
    }

    // Combo logic based on direction and timing
    if (isMovingForward) {
      // Moving TOWARD goal
      if (this.canBuildCombo && timeSinceLastMove <= 2000) {
        // Fast forward movement - build combo!
        this.combo++;
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      } else if (timeSinceLastMove > 2000 && timeSinceLastMove <= 3000) {
        // Slow movement - no combo change, but don't decrease
      } else {
        // First move or after long pause - start fresh
        this.combo = Math.max(1, this.combo);
        this.canBuildCombo = true;
      }
    } else if (isMovingBackward) {
      // Moving AWAY from goal - decrease combo
      this.combo = Math.max(0, this.combo - 1);
    }
    // Staying same distance = no combo change

    // Update tracking
    this.lastMoveTime = now;
    this.previousDistance = currentDistance;

    // Set up combo decay timer (3 seconds of no movement = decay starts)
    this.comboDecayTimer = setTimeout(() => {
      if (this.combo > 0) {
        this.combo = Math.max(0, this.combo - 1);
        if (this.comboMeter) this.comboMeter.setCombo(this.combo);

        // After decay, 1 second cooldown before combo can build again
        this.canBuildCombo = false;
        setTimeout(() => {
          this.canBuildCombo = true;
        }, 1000);
      }
    }, 3000);

    // RULE: Check combo bonus via GameRules
    const bonus = GameRules.checkComboBonus(this.combo);
    if (bonus > 0) {
      this.extraScore = (this.extraScore || 0) + bonus;

      // Visual feedback every 5 combos
      if (this.combo % 5 === 0 && this.ui) {
        this.ui.showToast(`Combo x${this.combo}! +${bonus} Points`, "star");
      }
    }

    // Update score display in real-time
    const currentScore = this.calculateScore();
    const scoreEl = document.getElementById("scoreDisplay");
    if (scoreEl) scoreEl.textContent = currentScore;

    // Update combo meter
    if (this.comboMeter) {
      this.comboMeter.setCombo(this.combo);
    }

    // Update compass
    if (this.compassHUD) {
      this.compassHUD.update(
        this.playerPos.x,
        this.playerPos.z,
        0,
        0,
        this.CELL_SIZE,
      );
    }

    // Increment moves counter
    this.moves++;
    document.getElementById("moves").textContent = this.moves;

    // Animate the counter
    const movesEl = document.getElementById("moves");
    movesEl.classList.add("animate");
    setTimeout(() => movesEl.classList.remove("animate"), 300);

    // Vibration feedback
    if (this.gameData.getSetting("vibration") && navigator.vibrate)
      navigator.vibrate(10);

    // Check for gem collection
    this.checkGemCollection();

    // Check for coin collection (+ magnet effect)
    this.checkCoinCollection();

    // Check for power-up collection
    this.checkPowerUpCollection();

    // Check for zombie collision
    this.checkZombieCollision();

    // Trigger random events at higher levels
    this.triggerRandomEvent();

    // Update camera events for dynamic mode
    this.updateCameraEvents();

    // Win check
    if (this.playerPos.x === 0 && this.playerPos.z === 0) this.triggerVictory();
  }

  /**
   * Handle combo milestone reached
   */
  onComboMilestone(milestone) {
    const tierLabels = {
      MINOR: "Nice Combo!",
      MODERATE: "Great Combo!",
      MAJOR: "AMAZING COMBO!",
      SUPER: "SUPER COMBO!!!",
      LEGENDARY: "LEGENDARY!!!",
    };

    // Show milestone toast
    if (this.ui) {
      this.ui.showToast(
        `${tierLabels[milestone.tier]} x${milestone.multiplier.toFixed(1)}`,
        "whatshot",
      );
    }

    // Visual effects
    if (this.screenEffects) {
      const colors = {
        MINOR: "#fbbf24",
        MODERATE: "#f97316",
        MAJOR: "#ef4444",
        SUPER: "#a855f7",
        LEGENDARY: "#ec4899",
      };
      this.screenEffects.flash(colors[milestone.tier] || "#fbbf24", 0.15, 100);
    }

    // Camera zoom pulse
    if (this.cameraController) {
      const zoomPulse = {
        MINOR: 0.95,
        MODERATE: 0.9,
        MAJOR: 0.85,
        SUPER: 0.8,
        LEGENDARY: 0.75,
      };
      this.cameraController.zoomTo(zoomPulse[milestone.tier] || 0.95);
      setTimeout(() => this.cameraController.zoomTo(1.0), 300);
    }

    // Particle burst
    if (this.particleTrail && this.playerMesh) {
      const burstCount = {
        MINOR: 10,
        MODERATE: 15,
        MAJOR: 25,
        SUPER: 40,
        LEGENDARY: 60,
      };
      this.particleTrail.burst(
        this.playerMesh.position,
        burstCount[milestone.tier] || 10,
        0xfbbf24,
      );
    }

    // Vibration pattern
    if (this.gameData.getSetting("vibration") && navigator.vibrate) {
      const patterns = {
        MINOR: [30, 30, 30],
        MODERATE: [50, 30, 50],
        MAJOR: [50, 30, 50, 30, 80],
        SUPER: [80, 40, 80, 40, 120],
        LEGENDARY: [100, 50, 100, 50, 100, 50, 150],
      };
      navigator.vibrate(patterns[milestone.tier] || [30]);
    }
  }

  /**
   * Check for coin collection with magnet effect
   */
  checkCoinCollection() {
    const { x, z } = this.playerPos;

    // Magnet range - attracts coins from nearby cells
    const magnetRange = this.isMagnetActive ? 2 : 0;
    const dummy = new THREE.Object3D();

    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coinData = this.coins[i];
      if (!coinData.active || coinData.collecting) continue;

      const coinX = coinData.gridX;
      const coinZ = coinData.gridZ;

      // Check if within collection/magnet range
      const distance = Math.abs(coinX - x) + Math.abs(coinZ - z);

      if (distance <= magnetRange || (coinX === x && coinZ === z)) {
        // Mark as being collected and inactive in the batch
        coinData.collecting = true;
        coinData.active = false;

        // Hide the instance immediately by scaling to 0
        dummy.position.copy(coinData.position);
        dummy.rotation.z = Math.PI / 2;
        dummy.scale.set(0, 0, 0); // Hide
        dummy.updateMatrix();

        if (this.coinsMesh) {
          this.coinsMesh.setMatrixAt(coinData.index, dummy.matrix);
          this.coinsMesh.instanceMatrix.needsUpdate = true;
        }

        // SPAWN TEMPORARY VISUAL COIN for the collection animation
        // This keeps performance high (batching 99% of coins) while allowing rich interaction for the 1 collected coin.
        const tempGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16);
        const tempMat = new THREE.MeshStandardMaterial({
          color: 0xffd700,
          metalness: 0.8,
          roughness: 0.2,
          emissive: 0xaa6600,
          emissiveIntensity: 0.2,
        });
        const visualCoin = new THREE.Mesh(tempGeo, tempMat);
        visualCoin.position.copy(coinData.position);
        visualCoin.rotation.z = Math.PI / 2;
        this.scene.add(visualCoin);

        // Visual Feedback: Floating Text
        this.showFloatingText(
          coinData.position,
          `+${GameRules.COIN_VALUE}`,
          "#ffd700",
        );

        // Update Stats immediately
        this.totalCoins += GameRules.COIN_VALUE;
        this.coinsCollected++;
        // NOTE: We do NOT save to disk here. Coins are only secured on Level Complete or Game Over.

        // Anti-farming check: ensure we handle display correctly
        // But do not persist to GameData yet.

        // Update UI
        const coinEl = document.getElementById("coinsDisplay");
        if (coinEl) coinEl.textContent = this.totalCoins;
        this.ui.showToast(`+${GameRules.COIN_VALUE} Coins`, "monetization_on");

        // Particle effect
        if (this.particleTrail) {
          this.particleTrail.burst(coinData.position, 5, 0xffd700);
        }

        // AUDIO: Play coin sound
        if (this.audioManager) this.audioManager.playCoin();

        // Sound/vibration feedback
        if (this.gameData.getSetting("vibration") && navigator.vibrate) {
          navigator.vibrate(GameRules.VIBRATION_COLLECT);
        }

        // Smooth collection animation on the VISUAL coin
        const startY = visualCoin.position.y;
        const startScale = visualCoin.scale.x;
        const startTime = Date.now();
        const duration = 200; // 200ms animation

        const animateCoin = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 2);

          // Fly up and shrink
          visualCoin.position.y = startY + eased * 1.5;
          visualCoin.scale.setScalar(startScale * (1 - eased));
          visualCoin.rotation.x += 0.2; // Fast spin

          if (progress < 1) {
            requestAnimationFrame(animateCoin);
          } else {
            // Remove after animation
            this.scene.remove(visualCoin);
            visualCoin.geometry.dispose();
            visualCoin.material.dispose();
            // Data cleanup is not strictly necessary for array efficiency if we just use flags,
            // but we can remove it to keep array small if levels are very long?
            // Actually keeping it is safer for index alignment unless we compact.
            // But we used index in setMatrixAt. So we CANNOT remove from array without re-indexing or
            // using the 'index' property carefully.
            // Let's just keep it in array but flagged inactive.
          }
        };

        animateCoin();
      }
    }
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

  onWallHit() {
    // Reset combo
    this.combo = 0;
    this.wallHits++;

    // Break combo meter visual
    if (this.comboMeter) {
      this.comboMeter.breakCombo();
    }

    // Camera shake effect (subtle feedback)
    this.cameraShake = GameRules.SHAKE_INTENSITY_WALL;

    // Vibration feedback (stronger for wall hit)
    if (this.gameData.getSetting("vibration") && navigator.vibrate)
      navigator.vibrate(GameRules.VIBRATION_WALL);
  }

  checkGemCollection() {
    const { x, z } = this.playerPos;

    this.gems.forEach((gem) => {
      if (gem.userData.collected) return;
      if (gem.userData.gridX === x && gem.userData.gridZ === z) {
        gem.userData.collected = true;
        this.gemsCollected++;

        // Particle burst effect at gem location
        if (this.particleTrail) {
          this.particleTrail.burst(gem.position, 20, 0xa855f7);
        }

        // Screen flash effect

        // Visual Feedback
        this.showFloatingText(gem.position, "+1 Life", "#a855f7");

        // Smooth collection animation - gem flies up and fades out
        const startY = gem.position.y;
        const startScale = gem.scale.x;
        const startTime = Date.now();
        const duration = 300; // 300ms animation

        const animateCollection = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);

          // Ease out curve
          const eased = 1 - Math.pow(1 - progress, 3);

          // Fly up and scale up slightly then shrink
          gem.position.y = startY + eased * 2;
          gem.rotation.y += 0.15; // Fast spin during collection

          if (progress < 0.5) {
            // Scale up first half
            gem.scale.setScalar(startScale * (1 + eased * 0.5));
          } else {
            // Scale down second half
            gem.scale.setScalar(startScale * (1.25 - (eased - 0.5) * 2.5));
          }

          if (progress < 1) {
            requestAnimationFrame(animateCollection);
          } else {
            // Remove after animation complete
            this.scene.remove(gem);
          }
        };

        animateCollection();

        // Give player an extra life when collecting gem
        this.addLife();

        // Show toast for gem with life bonus
        this.ui.showToast(
          `✨ Gem Collected! +1 Life (${this.gemsCollected}/${this.gems.length})`,
          "favorite",
        );

        // AUDIO: Play gem collect sound
        if (this.audioManager) this.audioManager.playGem();

        // Vibration feedback
        if (this.gameData.getSetting("vibration") && navigator.vibrate)
          navigator.vibrate([10, 30, 10]);
      }
    });
  }

  checkZombieCollision() {
    // Check if player collides with any zombie
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const zombie = this.zombies[i];
      if (zombie.checkCollision(this.playerPos.x, this.playerPos.z)) {
        if (this.isPotionActive) {
          // KILL ZOMBIE with explosion effect!
          zombie.explode();
          zombie.dispose();
          this.zombies.splice(i, 1);

          // AUDIO: Explosion sound
          if (this.audioManager) this.audioManager.playExplosion();

          // Reward coins (scales down with level)
          const reward = GameRules.getZombieKillReward(this.level);
          this.totalCoins += reward;
          // Stats updated in memory, saved on game over/win

          // Track kills
          this.zombiesKilled++;
          const currentKills = this.gameData.get("totalZombiesPurified") || 0;
          this.gameData.set("totalZombiesPurified", currentKills + 1);

          this.ui.showToast(
            `Zombie Purified! +${reward} Coins`,
            "monetization_on",
          );

          // Update UI
          const coinEl = document.getElementById("coinsDisplay");
          if (coinEl) coinEl.textContent = this.totalCoins;

          this.cameraShake = 0.3;
          if (navigator.vibrate) navigator.vibrate(50);
        } else {
          this.onZombieHit();
          return;
        }
      }
    }
  }

  checkZombieDogCollision() {
    // Check if player collides with any zombie dog
    const DOG_KILL_REWARD = GameRules.getZombieDogKillReward(this.level);

    for (let i = this.zombieDogs.length - 1; i >= 0; i--) {
      const dog = this.zombieDogs[i];
      if (dog.checkCollision(this.playerPos.x, this.playerPos.z)) {
        if (this.isPotionActive) {
          // KILL DOG with explosion effect!
          dog.explode();
          dog.dispose();
          this.zombieDogs.splice(i, 1);

          // AUDIO: Explosion sound
          if (this.audioManager) this.audioManager.playExplosion();

          // Reward coins (scales down with level)
          this.totalCoins += DOG_KILL_REWARD;
          // Stats updated in memory, saved on game over/win

          // Track kills
          this.zombieDogsKilled++;
          const currentKills = this.gameData.get("totalZombiesPurified") || 0;
          this.gameData.set("totalZombiesPurified", currentKills + 1);

          this.ui.showToast(
            `Zombie Dog Eliminated! +${DOG_KILL_REWARD} Coins`,
            "monetization_on",
          );

          // Update UI
          const coinEl = document.getElementById("coinsDisplay");
          if (coinEl) coinEl.textContent = this.totalCoins;

          this.cameraShake = 0.2;
          if (navigator.vibrate) navigator.vibrate(30);
        } else {
          // Dog attack - same as zombie hit
          this.onZombieHit();
          return;
        }
      }
    }
  }

  /**
   * Check collisions with horde entities (boss, horde zombies, horde dogs)
   * Horde entities give lower rewards when killed
   */
  checkHordeCollisions() {
    // Check all boss collisions (including persistent ones)
    // Removed guard clause to ensure persistent bosses are interactable
    // if (!this.isDarknessActive || !this.hordeSpawned) return;

    // Check monster collisions
    this.checkMonsterCollision();

    // Check boss zombie collisions
    for (let i = this.bossZombies.length - 1; i >= 0; i--) {
      const boss = this.bossZombies[i];
      if (boss.checkCollision(this.playerPos.x, this.playerPos.z)) {
        if (this.isPotionActive) {
          // Determine boss type for logging and messaging
          const bossType = boss.isHordeBoss
            ? "Horde Boss"
            : boss.isPersistent
              ? "Bigfoot Boss"
              : "Boss";

          // KILL BOSS with explosion effect!
          boss.explode();
          boss.dispose();
          this.bossZombies.splice(i, 1);

          // AUDIO: Explosion sound
          if (this.audioManager) this.audioManager.playExplosion();

          // Reward coins (scales with level)
          const bossReward = GameRules.getBossKillReward(this.level);
          this.totalCoins += bossReward;
          // Stats updated in memory

          // Track kills
          this.zombiesKilled++;
          const currentKills = this.gameData.get("totalZombiesPurified") || 0;
          this.gameData.set("totalZombiesPurified", currentKills + 1);

          // Differentiated message based on boss type
          const message = boss.isHordeBoss
            ? `👹 HORDE BOSS SLAIN! +${bossReward} Coins`
            : `💀 BIGFOOT BOSS SLAIN! +${bossReward} Coins`;
          this.ui.showToast(message, "monetization_on");

          // Update UI
          const coinEl = document.getElementById("coinsDisplay");
          if (coinEl) coinEl.textContent = this.totalCoins;

          this.cameraShake = 1.0; // Big shake for boss kill
          if (navigator.vibrate) navigator.vibrate([50, 30, 100]);
        } else {
          this.onZombieHit();
          return;
        }
      }
    }

    // Check horde zombie collisions
    for (let i = this.hordeZombies.length - 1; i >= 0; i--) {
      const zombie = this.hordeZombies[i];
      if (zombie.checkCollision(this.playerPos.x, this.playerPos.z)) {
        if (this.isPotionActive) {
          zombie.explode();
          zombie.dispose();
          this.hordeZombies.splice(i, 1);

          // AUDIO: Explosion sound
          if (this.audioManager) this.audioManager.playExplosion();

          // Lower reward for horde zombies (10 coins)
          this.totalCoins += this.HORDE_ZOMBIE_REWARD;
          // Stats updated in memory

          this.zombiesKilled++;

          this.ui.showToast(
            `Horde Zombie Purified! +${this.HORDE_ZOMBIE_REWARD} Coins`,
            "monetization_on",
          );

          const coinEl = document.getElementById("coinsDisplay");
          if (coinEl) coinEl.textContent = this.totalCoins;

          this.cameraShake = 0.3;
          if (navigator.vibrate) navigator.vibrate(50);
        } else {
          this.onZombieHit();
          return;
        }
      }
    }

    // Check horde dog collisions
    for (let i = this.hordeDogs.length - 1; i >= 0; i--) {
      const dog = this.hordeDogs[i];
      if (dog.checkCollision(this.playerPos.x, this.playerPos.z)) {
        if (this.isPotionActive) {
          dog.explode();
          dog.dispose();
          this.hordeDogs.splice(i, 1);

          // AUDIO: Explosion sound
          if (this.audioManager) this.audioManager.playExplosion();

          // Lower reward for horde dogs (5 coins)
          this.totalCoins += this.HORDE_DOG_REWARD;
          this.gameData.set("totalCoins", this.totalCoins);

          this.zombieDogsKilled++;

          this.ui.showToast(
            `Horde Dog Eliminated! +${this.HORDE_DOG_REWARD} Coins`,
            "monetization_on",
          );

          const coinEl = document.getElementById("coinsDisplay");
          if (coinEl) coinEl.textContent = this.totalCoins;

          this.cameraShake = 0.2;
          if (navigator.vibrate) navigator.vibrate(30);
        } else {
          this.onZombieHit();
          return;
        }
      }
    }
  }

  checkMonsterCollision() {
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const monster = this.monsters[i];
      if (monster.checkCollision(this.playerPos.x, this.playerPos.z)) {
        if (this.isPotionActive) {
          monster.explode();
          // No need to splice if explode/dispose handles safety, but consistency:
          this.monsters.splice(i, 1);

          if (this.audioManager) this.audioManager.playExplosion();

          this.totalCoins += 50; // Use static reward or rule
          this.zombiesKilled++;

          this.ui.showToast(
            "Monster Banished! +50 Coins",
            "face_retouching_off",
          );

          const coinEl = document.getElementById("coinsDisplay");
          if (coinEl) coinEl.textContent = this.totalCoins;

          this.cameraShake = 0.5;
          if (navigator.vibrate) navigator.vibrate(40);
        } else {
          this.onZombieHit();
          return;
        }
      }
    }
  }

  buyPotion() {
    if (this.totalCoins >= GameRules.POTION_COST) {
      this.totalCoins -= GameRules.POTION_COST;
      this.gameData.set("totalCoins", this.totalCoins);
      this.activatePotion();
      this.ui.showToast("Potion Activated!", "science");

      // Update UI
      const coinEl = document.getElementById("coinsDisplay");
      if (coinEl) coinEl.textContent = this.totalCoins;
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

  updatePotion() {
    if (this.isPotionActive) {
      this.potionTimer--;
      if (this.potionTimer <= 0) {
        this.isPotionActive = false;
        if (this.player) {
          this.player.resetColor();
        }
        this.ui.showToast("Potion wore off...", "timer_off");
      }
    }
  }

  updateCoins() {
    if (!this.coins || !this.coinsMesh) return;

    const dummy = new THREE.Object3D();
    const time = Date.now() * 0.002;

    this.coins.forEach((c) => {
      // If inactive (collected), we skip updating it (it's hidden)
      if (!c.active) return;

      // Calculate simple spin and bob
      // Rotation: Stand vertically (Z=90) and spin on X axis (time)
      const spinAngle = time + c.gridX * 0.5; // Use gridX as phase offset
      dummy.rotation.set(spinAngle, 0, Math.PI / 2);

      // Bobbing position
      const yOffset = Math.sin(time + c.gridX) * 0.1;

      // Use stored base position
      dummy.position.copy(c.position);
      dummy.position.y += yOffset;

      dummy.updateMatrix();
      this.coinsMesh.setMatrixAt(c.index, dummy.matrix);
    });

    this.coinsMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Shows floating text at a 3D position
   * @param {THREE.Vector3} position - 3D world position
   * @param {string} text - Text to display
   * @param {string} color - CSS color string
   */
  showFloatingText(position, text, color = "#ffffff") {
    // Project 3D position to 2D screen coordinates
    const vector = position.clone();
    vector.y += 1.5; // Offset slightly above object
    vector.project(this.camera);

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

  onZombieHit() {
    if (this.gameOverTriggered) return;

    // Check invincibility frames - prevents rapid consecutive hits
    if (this.invincibilityFrames > 0) {
      // AUDIO: collision feedback even if invincible
      if (this.audioManager) this.audioManager.playToggle();
      return; // Still invincible, ignore hit
    }

    // Shield protection - absorbs one hit
    if (this.isShieldActive) {
      this.isShieldActive = false;
      this.activePowerUp = null;
      this.powerUpTimer = 0;

      // Grant invincibility frames after shield absorbs hit
      this.invincibilityFrames = 90; // ~1.5 seconds at 60fps

      // Reset player color (respecting active potion)
      if (this.playerMesh && this.player) {
        if (this.isPotionActive) {
          this.player.activatePotionEffect();
        } else {
          this.player.resetColor();
        }
      }

      this.ui.showToast("Shield absorbed the hit!", "shield");

      // AUDIO: Play shield sound
      if (this.audioManager) this.audioManager.playShield();

      this.cameraShake = 0.5;

      if (this.gameData.getSetting("vibration") && navigator.vibrate) {
        navigator.vibrate([30, 30, 30]);
      }
      return; // Shield consumed, no damage
    }

    // Play hit burst effect on player (similar to zombie death explosion)
    if (this.player) {
      this.player.playHitBurst();
    }

    // AUDIO: Play hit/explosion sound
    if (this.audioManager) this.audioManager.playExplosion();

    this.lives--;

    // Camera shake effect (stronger than wall hit)
    this.cameraShake = GameRules.SHAKE_INTENSITY_ZOMBIE;

    // Vibration feedback (strong vibration for zombie hit)
    if (this.gameData.getSetting("vibration") && navigator.vibrate)
      navigator.vibrate(GameRules.VIBRATION_ZOMBIE);

    // Flash screen red
    const canvas = this.canvas;
    canvas.style.boxShadow = "inset 0 0 100px rgba(239, 68, 68, 0.7)";
    setTimeout(() => (canvas.style.boxShadow = "none"), 250);

    // Update lives display
    this.updateLivesDisplay();

    if (this.lives <= 0) {
      this.triggerGameOver();
    } else {
      // Reset player position to start
      this.playerPos = { x: this.MAZE_SIZE - 1, z: this.MAZE_SIZE - 1 };
      this.updatePlayerPosition();

      // Ensure no zombies are camping the spawn point
      this.clearSafeZone();

      // Grant invincibility frames after respawn
      this.invincibilityFrames = 120; // ~2 seconds at 60fps

      // Show warning with lives remaining
      this.ui.showToast(
        `Zombie Bite! ${this.lives} lives remaining`,
        "warning",
      );
    }
  }

  addLife() {
    this.lives++;
    this.updateLivesDisplay();
  }

  updateLivesDisplay() {
    const livesEl = document.getElementById("livesCount");
    if (livesEl) {
      livesEl.textContent = this.lives;
      // Highlight animation
      livesEl.classList.add("pulse");
      setTimeout(() => livesEl.classList.remove("pulse"), 300);
    }
  }

  /**
   * Pushes zombies away from the player's start position
   * preventing spawn-kills
   */
  clearSafeZone() {
    const startX = this.MAZE_SIZE - 1;
    const startZ = this.MAZE_SIZE - 1;
    const safeDist = 5;

    // Helper to move entity if too close
    const pushAway = (entity) => {
      const dist =
        Math.abs(entity.gridX - startX) + Math.abs(entity.gridZ - startZ);
      if (dist < safeDist) {
        // Move to a safer random spot in the top-left quadrant (near goal but random)
        // to ensure they are far from bottom-right start
        entity.gridX = Math.floor(Math.random() * (this.MAZE_SIZE / 2));
        entity.gridZ = Math.floor(Math.random() * (this.MAZE_SIZE / 2));
        entity.updatePosition();
      }
    };

    if (this.zombies) this.zombies.forEach(pushAway);
    if (this.zombieDogs) this.zombieDogs.forEach(pushAway);
    if (this.hordeZombies) this.hordeZombies.forEach(pushAway);
    if (this.hordeDogs) this.hordeDogs.forEach(pushAway);
    if (this.monsters) this.monsters.forEach(pushAway);
    if (this.bossZombies) this.bossZombies.forEach(pushAway);
  }

  triggerGameOver() {
    this.gameOverTriggered = true;
    this.won = true;
    this.isRunning = false;
    clearInterval(this.timerInterval);

    // NOTE: We NO LONGER despawn horde here!
    // When player clicks "Retry", resetGame() will call createZombies()
    // which properly clears and recreates all entities.
    // This prevents the Bigfoot disappearance bug.
    this.isDarknessActive = false;
    this.weatherManager?.stopStorm();

    if (this.audioManager) this.audioManager.stopRain();

    // AUDIO: Play game over sound
    if (this.audioManager) this.audioManager.playGameOver();

    // Play dramatic death burst effect
    if (this.player) {
      this.player.playDeathBurst();
    }

    // Extra strong camera shake for death
    this.cameraShake = 2.0;

    // Track loss
    this.gameData.data.losses = (this.gameData.data.losses || 0) + 1;
    this.gameData.set("totalCoins", this.totalCoins); // Save earned coins despite death
    this.gameData.save();

    // Hide HUD elements
    if (this.comboMeter) this.comboMeter.reset();

    // Delay showing game over screen to let death animation play
    setTimeout(() => {
      document.getElementById("gameOverScreen").style.display = "grid";
      document.getElementById("gameOverMoves").textContent = this.moves;
      document.getElementById("gameOverTime").textContent = this.ui.formatTime(
        this.time,
      );
      document.getElementById("gameOverLevel").textContent = this.level;
    }, 500);
  }

  startTimer() {
    this.timerInterval = setInterval(() => {
      if (!this.isPaused && !this.isTimeFreezeActive) {
        this.time++;
        document.getElementById("time").textContent = this.ui.formatTime(
          this.time,
        );
      }
    }, 1000);
  }

  calculateScore() {
    return GameRules.calculateScore({
      mazeSize: this.MAZE_SIZE,
      level: this.level,
      time: this.time,
      moves: this.moves,
      wallHits: this.wallHits,
      maxCombo: this.maxCombo,
      gemsCollected: this.gemsCollected,
      coinsCollected: this.coinsCollected,
      zombiesKilled: this.zombiesKilled,
      powerUpsUsed: this.powerUpsUsed,
      isDoubleScoreActive: this.isDoubleScoreActive,
      extraScore: this.extraScore,
    });
  }

  async triggerVictory() {
    this.won = true;
    this.isRunning = false;
    clearInterval(this.timerInterval);

    // Clean up horde if active
    this.despawnHorde();
    this.isDarknessActive = false;
    this.weatherManager?.stopStorm();

    if (this.audioManager) this.audioManager.stopRain();

    // AUDIO: Play victory sound
    if (this.audioManager) this.audioManager.playVictory();

    const score = this.calculateScore();
    const d = this.gameData.data;

    // Calculate Stars using GameRules
    const stars = GameRules.calculateStars({
      time: this.time,
      parTime: this.PAR_TIME,
      wallHits: this.wallHits,
      gemsCollected: this.gemsCollected,
      totalGems: this.gems.length,
      maxCombo: this.maxCombo,
    });

    // Get detailed score breakdown
    const breakdown = GameRules.getScoreBreakdown({
      mazeSize: this.MAZE_SIZE,
      level: this.level,
      time: this.time,
      moves: this.moves,
      wallHits: this.wallHits,
      maxCombo: this.maxCombo,
      gemsCollected: this.gemsCollected,
      coinsCollected: this.coinsCollected,
      zombiesKilled: this.zombiesKilled,
    });

    // Calculate level completion coin reward
    const levelReward = GameRules.calculateLevelReward(this.level, stars);

    // Award coins for level completion
    this.totalCoins += levelReward.total;
    this.gameData.set("totalCoins", this.totalCoins);

    // Update HUD
    const coinEl = document.getElementById("coinsDisplay");
    if (coinEl) coinEl.textContent = this.totalCoins;

    d.wins++;
    d.totalSteps += this.moves;
    if (this.level > d.highestLevel) {
      d.highestLevel = this.level;
    }
    // Always unlock next level if we beat the current one
    if ((d.currentLevel || 1) <= this.level) {
      d.currentLevel = this.level + 1;
    }

    const isNewRecord = !d.bestScore || score > d.bestScore;
    if (isNewRecord) d.bestScore = score;
    if (!d.bestTime || this.time < d.bestTime) d.bestTime = this.time;

    this.gameData.save();
    this.ui.updateAllStats();

    // Camera cinematic effect on victory
    if (this.cameraController) {
      this.cameraController.setMode(CameraMode.CINEMATIC);
    }

    // Hide HUD elements
    if (this.comboMeter) this.comboMeter.reset();

    // Pass extra data to UI including level reward breakdown
    const victoryData = {
      stars,
      level: this.level,
      score: score,
      time: this.time,
      isNewRecord,
      gems: this.gemsCollected,
      totalGems: this.gems.length,
      moves: this.moves,
      maxCombo: this.maxCombo,
      coinsCollected: this.coinsCollected,
      wallHits: this.wallHits,
      timeLabel: breakdown.timeLabel,
      difficultyTier: breakdown.difficultyTier,
      zombiesKilled: this.zombiesKilled,
      zombieDogsKilled: this.zombieDogsKilled || 0,
      levelReward: levelReward,
    };

    // Store for share button (blog post)
    this.lastVictoryData = victoryData;

    this.ui.showVictory(this.moves, this.time, score, isNewRecord, victoryData);

    // MANDATORY: Auto-post game record as custom_json (for leaderboards/restore)
    // This is separate from the optional Share blog post button
    if (steemIntegration.isConnected && steemIntegration.username) {
      try {
        const gameRecord = {
          level: this.level,
          score: score,
          time: this.time,
          moves: this.moves,
          gems: this.gemsCollected,
          totalGems: this.gems.length,
          stars: stars,
          mazeSize: this.MAZE_SIZE,
          // Profile Stats
          gamesPlayed: d.gamesPlayed,
          wins: d.wins,
          losses: d.losses,
          totalCoins: d.totalCoins,
          totalZombiesPurified: d.totalZombiesPurified,
          totalSteps: d.totalSteps,
          highestLevel: d.highestLevel,
          bestScore: d.bestScore,
          achievements: getUnlockedAchievements(d).map((a) => a.id),
        };

        const result = await steemIntegration.postGameRecord(gameRecord);
        if (result) {
          steemIntegration.registerActivePlayer(steemIntegration.username);
          this.ui.showToast("🎮 Game record saved!", "check_circle");
        }
      } catch (error) {
        console.error("Error posting game record:", error);
        // Don't show error toast - user may have cancelled Keychain
      }
    }
  }

  async postToSteem(score, stars) {
    try {
      if (!steemIntegration.isConnected || !steemIntegration.username) {
        console.warn("Not connected to Steem, skipping post");
        this.ui.showToast("Not connected to Steem wallet");
        return;
      }

      const gameRecord = {
        level: this.level,
        score: score,
        time: this.time,
        moves: this.moves,
        gems: this.gemsCollected,
        totalGems: this.gems.length,
        stars: stars,
        mazeSize: this.MAZE_SIZE,
        // Profile Stats
        gamesPlayed: this.gameData.data.gamesPlayed,
        wins: this.gameData.data.wins,
        losses: this.gameData.data.losses,
        totalCoins: this.gameData.data.totalCoins,
        totalZombiesPurified: this.gameData.data.totalZombiesPurified,
        totalSteps: this.gameData.data.totalSteps,
        highestLevel: this.gameData.data.highestLevel,
        bestScore: this.gameData.data.bestScore,
        achievements: getUnlockedAchievements(this.gameData.data).map(
          (a) => a.id,
        ),
      };

      const result = await steemIntegration.postGameRecord(gameRecord);

      if (result) {
        // Register player as active
        steemIntegration.registerActivePlayer(steemIntegration.username);
        this.ui.showToast(`Game posted to Steem!`);
      }
    } catch (error) {
      console.error("Error posting to Steem:", error);
      this.ui.showToast(`Steem post failed: ${error.message}`);
      // Don't break the game experience if posting fails
    }
  }

  async startNewGame() {
    // Completely reset the game state to Level 1 and 0 stats
    // The user requested that "New Game" means "Play from the beginning", implying a full reset.
    this.level = 1;
    this.totalCoins = 0;

    // COMPLETE RESET of game state
    // We must PRESERVE the login session though!
    const savedSteemUser = this.gameData.get("steemUsername");
    const savedPlayerName = this.gameData.get("playerName");

    // Reset all persistent data
    this.gameData.reset(); // Resets to default (Level 1, 0 Coins, etc.)

    // Restore login session
    if (savedSteemUser) {
      this.gameData.set("steemUsername", savedSteemUser);
    }
    if (savedPlayerName) {
      this.gameData.set("playerName", savedPlayerName);
    }

    // If connected, keep the blockchain connection sync
    if (steemIntegration.isConnected && steemIntegration.username) {
      this.ui.showToast(
        "Started fresh game (Session preserved)",
        "restart_alt",
      );
    }

    this.gameData.set("currentLevel", this.level);
    this.gameData.set("totalCoins", 0);

    // Update displays
    document.getElementById("levelDisplay").textContent = this.level;
    const coinEl = document.getElementById("coinsDisplay");
    if (coinEl) coinEl.textContent = "0";

    this.gameData.data.gamesPlayed++;
    this.gameData.save();
    this.resetGame();
  }

  continueGame() {
    // Continue from current level - don't reset it
    this.gameData.data.gamesPlayed++;
    this.gameData.save();
    this.resetGame();
  }

  async nextLevel() {
    // Clear share modal and advance to next level
    this.ui.hideShareModal();

    // Then advance to next level
    this.level++;
    this.gameData.set("currentLevel", this.level);
    document.getElementById("levelDisplay").textContent = this.level;
    document.getElementById("victoryScreen").style.display = "none";
    this.resetGame();
  }

  replayLevel() {
    document.getElementById("victoryScreen").style.display = "none";
    this.resetGame();
  }
  /**
   * Reload level from gameData - called after account login/switch
   * Ensures the game uses the correct level for the current user
   */
  reloadLevelFromData() {
    const newLevel = this.gameData.get("currentLevel") || 1;

    this.level = newLevel;

    // Update display
    const levelDisplay = document.getElementById("levelDisplay");
    if (levelDisplay) {
      levelDisplay.textContent = this.level;
    }

    // Update total coins from gameData
    this.totalCoins = this.gameData.get("totalCoins") || 0;

    // Reset inventory counts
    this.potionCount = 0;
    this.lightBurstCount = 0;
    this.fogRemoverCount = 0;

    // Reset shop state if it exists
    if (this.shop && typeof this.shop.reset === "function") {
      this.shop.reset();
    }

    // Update HUD to reflect new inventory
    if (this.shop && typeof this.shop.manualHUDUpdate === "function") {
      this.shop.manualHUDUpdate();
    }

    // Update coins display
    const coinsDisplay = document.getElementById("coinsDisplay");
    coinsDisplay.textContent = this.totalCoins;
  }

  restartLevel() {
    this.resetGame();
  }

  resetGame() {
    this.cleanup(); // Ensure everything is stopped before resetting
    // Reload persistent data from disk to ensure we discard any unsaved in-memory progress
    // This is CRITICAL for preventing coin farming (collect -> exit -> resume -> repeat)
    this.gameData.data = this.gameData.load();
    this.totalCoins = this.gameData.get("totalCoins") || 0;

    // Update UI immediately
    const coinEl = document.getElementById("coinsDisplay");
    if (coinEl) coinEl.textContent = this.totalCoins;
    this.moves = 0;
    this.time = 0;
    this.won = false;
    this.isRunning = false;
    this.isPaused = false;
    this.playerPos = { x: this.MAZE_SIZE - 1, z: this.MAZE_SIZE - 1 };

    // Smart Lives Reset: Level 1 always 3, otherwise keep extras or refill to 3
    if (this.level === 1) {
      this.lives = GameRules.INITIAL_LIVES;
    } else {
      this.lives = Math.max(this.lives, GameRules.INITIAL_LIVES);
    }

    this.gameOverTriggered = false;
    this.combo = 0;
    this.maxCombo = 0;
    this.wallHits = 0;
    this.gemsCollected = 0;
    this.coinsCollected = 0;
    this.zombiesKilled = 0;
    this.powerUpsUsed = 0;
    this.extraScore = 0;

    // Reset intelligent combo system
    this.lastMoveTime = 0;
    this.previousDistance = (this.MAZE_SIZE - 1) * 2; // Starting distance to goal
    this.canBuildCombo = true;
    if (this.comboDecayTimer) {
      clearTimeout(this.comboDecayTimer);
      this.comboDecayTimer = null;
    }

    // Reset power-up state
    this.activePowerUp = null;
    this.powerUpTimer = 0;
    this.isShieldActive = false;
    this.isSpeedBoostActive = false;
    this.isTimeFreezeActive = false;
    this.isMagnetActive = false;
    this.isDoubleScoreActive = false;
    this.invincibilityFrames = 0;

    if (this.timerInterval) clearInterval(this.timerInterval);

    document.getElementById("moves").textContent = "0";
    document.getElementById("time").textContent = "0:00";
    const scoreEl = document.getElementById("scoreDisplay");
    if (scoreEl) scoreEl.textContent = this.calculateScore(); // Show actual starting score
    document.getElementById("victoryScreen").style.display = "none";
    document.getElementById("gameOverScreen").style.display = "none";

    this.maze = this.generateMaze();
    this.buildMaze();
    if (this.environment) {
      this.environment.generate(this.MAZE_SIZE, this.CELL_SIZE);
    }
    if (this.playerMesh) this.scene.remove(this.playerMesh);
    this.createPlayer();
    this.createGems();
    this.createPowerUps();
    this.createCoins();
    this.createZombies();

    // Update lives display
    this.updateLivesDisplay();

    // Reset HUD elements
    if (this.comboMeter) {
      this.comboMeter.reset();
    }

    // Update compass with initial positions
    if (this.compassHUD) {
      this.compassHUD.update(
        this.playerPos.x,
        this.playerPos.z,
        0,
        0,
        this.CELL_SIZE,
      );
      this.compassHUD.show();
    }

    // Reset particle trail color
    if (this.particleTrail) {
      this.particleTrail.setColor(0x4ade80);
    }

    // --- DETERMINISTIC EVENTS ---
    // First horde at 1 minute, then every 3 minutes
    if (this.level >= 5) {
      if (this.darknessEventTimer) {
        clearTimeout(this.darknessEventTimer);
        clearInterval(this.darknessEventTimer);
      }

      // Use a timeout for the first event (1 minute)
      this.darknessEventTimer = setTimeout(() => {
        if (!this.isPaused && this.isRunning && !this.won) {
          this.triggerDarknessEvent();
        }

        // Then switch to interval (3 minutes)
        this.darknessEventTimer = setInterval(() => {
          if (!this.isPaused && this.isRunning && !this.won) {
            this.triggerDarknessEvent();
          }
        }, 180000); // 3 Minutes recurring
      }, 60000); // 1 Minute initial delay
    }

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

    if (this.darknessEventTimer) {
      clearTimeout(this.darknessEventTimer);
      clearInterval(this.darknessEventTimer);
      this.darknessEventTimer = null;
    }

    // 2. Clear Event Timers
    if (this.comboDecayTimer) {
      clearTimeout(this.comboDecayTimer);
      this.comboDecayTimer = null;
    }

    if (this.darknessPulseInterval) {
      clearInterval(this.darknessPulseInterval);
      this.darknessPulseInterval = null;
    }

    if (this.hordeCheckTimeout) {
      clearTimeout(this.hordeCheckTimeout);
      this.hordeCheckTimeout = null;
    }

    if (this.darknessEndTimeout) {
      clearTimeout(this.darknessEndTimeout);
      this.darknessEndTimeout = null;
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

    // Clear Spawn Queue
    this.spawnQueue = [];

    // 3. Reset Game State/Effects
    this.isDarknessActive = false;
    this.darknessStartTime = null;
    this.currentEvent = null;

    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }

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

  togglePause() {
    if (this.won) return;
    this.isPaused = !this.isPaused;
    document.getElementById("pauseScreen").style.display = this.isPaused
      ? "grid"
      : "none";
  }

  setupEventListeners() {
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.bgCamera.aspect = window.innerWidth / window.innerHeight;
      this.bgCamera.updateProjectionMatrix();
      this.bgRenderer.setSize(window.innerWidth, window.innerHeight);

      // Resize post-processing
      if (this.postProcessing) {
        this.postProcessing.setSize(window.innerWidth, window.innerHeight);
      }
    });

    document.addEventListener("mousemove", (e) => {
      this.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    // Note: Potion button is handled by Shop.js which uses potionCount system

    document.addEventListener("keydown", (e) => {
      if (this.ui.currentScreen !== "gameScreen") return;

      const key = e.key.toLowerCase();
      if (key === "escape") {
        this.togglePause();
        return;
      }
      if (this.isPaused) return;

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
    });

    // Mobile / D-Pad Controls
    document.querySelectorAll(".control-btn").forEach((btn) => {
      const handleInput = (e) => {
        e.preventDefault(); // Prevent double-firing on some devices
        if (this.ui.currentScreen !== "gameScreen" || this.isPaused) return;

        const dir = btn.dataset.dir;
        if (dir === "up") this.movePlayer(0, -1);
        else if (dir === "down") this.movePlayer(0, 1);
        else if (dir === "left") this.movePlayer(-1, 0);
        else if (dir === "right") this.movePlayer(1, 0);
      };

      // Add both touch and click for responsiveness
      btn.addEventListener("touchstart", handleInput, { passive: false });
      btn.addEventListener("mousedown", handleInput);
    });
  }

  animate() {
    requestAnimationFrame((time) => {
      // Update animation cache timing
      animationCache.updateFrameTiming(time);
      this.animate();
    });

    // Skip if not on game screen or player not ready
    if (!this.playerMesh || this.ui.currentScreen !== "gameScreen") return;

    // Get delta time for frame-rate independent animations
    const deltaTime = animationCache.deltaTime || 0.016;
    const smoothDelta = Math.min(deltaTime, 0.05); // Cap delta to prevent jumps

    // === CAMERA SYSTEM ===
    if (this.cameraController) {
      // Update player position for camera tracking
      this.cameraController.setPlayerPosition(this.playerMesh.position);

      // Apply camera shake from game events only if setting enabled
      if (this.cameraShake > 0) {
        const shakeEnabled = this.gameData.getSetting("cameraShake");
        if (shakeEnabled) {
          this.cameraController.shake(this.cameraShake, 0.2);
        }
        this.cameraShake = Math.max(0, this.cameraShake - smoothDelta * 3);
      }

      // Update camera with mouse offset for interactive feel
      this.cameraController.update({
        x: this.mouseX,
        y: this.mouseY,
      });
    } else {
      // === LEGACY CAMERA (fallback) - using smooth lerp ===
      // Reduced mouse sensitivity for comfort (was 2.0)
      let targetCamX = this.playerMesh.position.x + this.mouseX * 1.0;
      let targetCamZ = this.playerMesh.position.z + 14 + this.mouseY * 1.0;
      let targetCamY = 22;

      // Camera shake disabled by default to prevent motion sickness
      // Only apply if user explicitly enables it in settings
      if (this.cameraShake > 0) {
        const shakeEnabled = this.gameData.getSetting("cameraShake");
        if (shakeEnabled) {
          const shakeIntensity = this.cameraShake * 0.5;
          targetCamX += (Math.random() - 0.5) * shakeIntensity;
          targetCamZ += (Math.random() - 0.5) * shakeIntensity;
        }
        // Always decay the shake value even if disabled (to keep game logic consistent)
        this.cameraShake = Math.max(0, this.cameraShake - smoothDelta * 3);
      }

      const camSpeedSetting = this.gameData.getSetting("cameraSpeed") || 5;
      // Reduced max speed for smoother follow (was 2.5 multiplier, now 1.2)
      // This creates a "heavy" camera feel that absorbs sudden movements
      const baseSpeed = Math.min((camSpeedSetting / 100) * 1.2, 0.15);

      // Smooth lerp camera position
      // Using time-based lerp for consistency
      const lerpFactor = 1 - Math.pow(1 - baseSpeed, smoothDelta * 60);

      this.camera.position.x +=
        (targetCamX - this.camera.position.x) * lerpFactor;
      this.camera.position.y +=
        (targetCamY - this.camera.position.y) * lerpFactor;
      this.camera.position.z +=
        (targetCamZ - this.camera.position.z) * lerpFactor;

      const lookAheadX = this.playerMesh.position.x;
      const lookAheadY = 0.5;
      const lookAheadZ = this.playerMesh.position.z - 5;

      // Smooth LookAt transition to prevent shaking on move
      if (!this.cameraCurrentLookAt) {
        this.cameraCurrentLookAt = new THREE.Vector3(
          lookAheadX,
          lookAheadY,
          lookAheadZ,
        );
      }

      const targetLookAt = new THREE.Vector3(
        lookAheadX,
        lookAheadY,
        lookAheadZ,
      );

      // Very soft rotation smoothing (was 0.15, now 0.06)
      // This prevents the "snap" when player turns or teleports
      this.cameraCurrentLookAt.lerp(targetLookAt, 0.06);

      this.camera.lookAt(this.cameraCurrentLookAt);
    }

    // === PLAYER ANIMATION ===
    if (this.player) {
      this.player.update(smoothDelta);
    }

    // === COLLECTIBLES ANIMATION (delta-time based) ===
    // Goal animation using cached waves
    // Goal animation (3D Portal)
    if (this.goal) {
      // Bob entire goal slightly
      this.goal.position.y = 1.5 + Math.sin(Date.now() * 0.002) * 0.1;

      // === AMBIENT SOUNDS ===
      this.updateAmbientSounds();

      // Animate parts
      if (this.portalParts) {
        this.portalParts.forEach((part) => {
          if (part.mesh) {
            // Generic axis rotation
            if (part.axis === "x")
              part.mesh.rotation.x += smoothDelta * part.speed;
            else if (part.axis === "y")
              part.mesh.rotation.y += smoothDelta * part.speed;
            else if (part.axis === "z")
              part.mesh.rotation.z += smoothDelta * part.speed;
            // Legacy fallbacks (if axis not specified)
            else if (part.isParticles) {
              part.mesh.rotation.y += smoothDelta * part.speed;
              part.mesh.rotation.z += smoothDelta * 0.2;
            } else {
              part.mesh.rotation.z += smoothDelta * part.speed;
            }
          }
          if (part.light) {
            part.light.intensity =
              part.baseIntensity + Math.sin(Date.now() * 0.005) * 0.5;
          }
        });
      } else {
        // Fallback for old goal style if portalParts missing
        this.goal.rotation.y += smoothDelta * 1.2;
        this.goal.rotation.x += smoothDelta * 0.6;
      }
    }

    // Gem animation using cached waves with offset
    const gemRotSpeed = smoothDelta * 1.2;
    this.gems.forEach((gem) => {
      gem.rotation.y += gemRotSpeed;
      gem.position.y =
        1 + animationCache.getWave(0.5, 0.15, gem.userData.gridX);
    });

    // === SPAWN QUEUE PROCESSING (Staggered Spawning) ===
    this.processSpawnQueue();

    // === GAME LOGIC UPDATES ===
    // Decrement invincibility frames
    if (this.invincibilityFrames > 0) {
      this.invincibilityFrames--;

      // Blink player exactly 3 times at the START of invincibility
      // Only blink during the first 36 frames (3 blinks at 12 frames each)
      if (this.playerMesh) {
        const blinkPeriod = 12; // frames per blink cycle (on/off)
        const blinkDuration = 36; // total frames for 3 blinks
        const framesFromStart =
          (this.invincibilityFrames > 120 ? 90 : 120) -
          this.invincibilityFrames;

        if (framesFromStart < blinkDuration) {
          // During blink phase: toggle visibility every blinkPeriod/2 frames
          this.playerMesh.visible =
            Math.floor(framesFromStart / (blinkPeriod / 2)) % 2 === 0;
        } else {
          // After blink phase: stay visible (but still invincible)
          this.playerMesh.visible = true;
        }
      }
    } else if (this.playerMesh && !this.playerMesh.visible) {
      this.playerMesh.visible = true; // Ensure visible when invincibility ends
    }

    this.updatePowerUps();
    this.updatePotion();
    this.updateCoins();

    // === ZOMBIE AI (freeze if time freeze is active) ===
    if (!this.isTimeFreezeActive) {
      this.zombies.forEach((zombie) => {
        zombie.setPlayerPosition(
          this.playerPos.x,
          this.playerPos.z,
          this.isLightBoostActive,
        );
        zombie.update(smoothDelta); // Pass delta time!
      });

      this.zombieDogs.forEach((dog) => {
        dog.setPlayerPosition(
          this.playerPos.x,
          this.playerPos.z,
          this.isLightBoostActive,
        );
        dog.update(smoothDelta);
      });

      // === BOSS ZOMBIES (Always update if present) ===
      this.bossZombies.forEach((boss) => {
        boss.setPlayerPosition(
          this.playerPos.x,
          this.playerPos.z,
          this.isLightBoostActive,
        );
        boss.update(smoothDelta);
      });

      // === MONSTERS ===
      this.monsters.forEach((monster) => {
        monster.setPlayerPosition(
          this.playerPos.x,
          this.playerPos.z,
          this.isLightBoostActive,
        );
        monster.update(smoothDelta);
      });

      // === HORDE ENTITIES (active if spawned, darkness or not) ===
      if (this.hordeSpawned) {
        // Boss zombies already updated above

        // Update horde zombies
        this.hordeZombies.forEach((zombie) => {
          zombie.setPlayerPosition(
            this.playerPos.x,
            this.playerPos.z,
            this.isLightBoostActive,
          );
          zombie.update(smoothDelta);
        });

        // Update horde dogs
        this.hordeDogs.forEach((dog) => {
          dog.setPlayerPosition(
            this.playerPos.x,
            this.playerPos.z,
            this.isLightBoostActive,
          );
          dog.update(smoothDelta);
        });
      }
    }

    // Collision checks
    this.checkZombieCollision();
    this.checkZombieDogCollision();
    this.checkMonsterCollision();
    this.checkHordeCollisions();

    // === ENVIRONMENTAL EFFECTS (optimized with animation cache) ===
    const animTime = animationCache.animationTime;
    this.fireflies.forEach((f) => {
      const curve = f.userData.curve;
      const speed = f.userData.speed;
      f.position.x +=
        animationCache.fastSin((animTime * 60 + curve * 57) % 360) * speed;
      f.position.z +=
        animationCache.fastCos((animTime * 60 + curve * 57) % 360) * speed;
      f.position.y = 2 + animationCache.getWave(1, 1, f.userData.yOffset);
    });

    // === EFFECTS SYSTEMS UPDATE ===
    if (this.particleTrail) {
      this.particleTrail.update();
    }

    if (this.skybox) {
      this.skybox.update();
    }

    if (this.environment) {
      this.environment.update();
    }

    // Update weather effects (rain, lightning)
    if (this.weatherManager) {
      this.weatherManager.update(smoothDelta, this.playerMesh?.position);
    }

    // === RENDER ===
    if (this.postProcessing && this.postProcessing.enabled) {
      this.postProcessing.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  updateAmbientSounds() {
    // Only play if game is active and not paused
    if (this.isPaused || this.won || this.ui.currentScreen !== "gameScreen")
      return;

    const now = Date.now();
    // Min interval for ANY ambient sound check: 2 seconds
    if (now - this.lastAmbientSoundTime < 2000) return;

    if (this.audioManager) {
      // Helper: Linear falloff (1.0 at dist 0, 0.0 at maxDist)
      const getVol = (dist, maxDist) => Math.max(0, 1 - dist / maxDist);

      // 1. Zombies (Hearing range: 8)
      let minZombieDist = Infinity;
      const checkZ = (list) => {
        if (!list) return;
        for (const z of list) {
          const dist =
            Math.abs(z.gridX - this.playerPos.x) +
            Math.abs(z.gridZ - this.playerPos.z);
          if (dist < minZombieDist) minZombieDist = dist;
        }
      };
      checkZ(this.zombies);
      checkZ(this.hordeZombies);

      if (minZombieDist < 2) {
        if (Math.random() < 0.1) {
          this.audioManager.playZombieGrowl(getVol(minZombieDist, 2));
          this.lastAmbientSoundTime = now;
          return;
        }
      }

      // 1.2 Boss Check (Bigfoot & Horde Angel)
      let minBigfootDist = Infinity;
      let minHordeBossDist = Infinity;

      for (const boss of this.bossZombies) {
        const d =
          Math.abs(boss.gridX - this.playerPos.x) +
          Math.abs(boss.gridZ - this.playerPos.z);
        if (boss instanceof BigfootBoss) {
          if (d < minBigfootDist) minBigfootDist = d;
        } else {
          if (d < minHordeBossDist) minHordeBossDist = d;
        }
      }

      if (minBigfootDist < 3) {
        if (Math.random() < 0.12) {
          this.audioManager.playBigfootRoar(getVol(minBigfootDist, 3));
          this.lastAmbientSoundTime = now;
          return;
        }
      } else if (minHordeBossDist < 3) {
        if (Math.random() < 0.1) {
          // Use Monster Growl for Angel Bosses (distinct from Bigfoot)
          this.audioManager.playMonsterGrowl(getVol(minHordeBossDist, 3));
          this.lastAmbientSoundTime = now;
          return;
        }
      }

      // 1.5 Monster Check (Specific for the new Monster entity)
      let minMonsterDist = Infinity;
      if (this.monsters) {
        for (const m of this.monsters) {
          const d =
            Math.abs(m.gridX - this.playerPos.x) +
            Math.abs(m.gridZ - this.playerPos.z);
          if (d < minMonsterDist) minMonsterDist = d;
        }
      }

      if (minMonsterDist < 4) {
        if (Math.random() < 0.08) {
          // Higher chance for monster growl
          this.audioManager.playMonsterGrowl(getVol(minMonsterDist, 4));
          this.lastAmbientSoundTime = now;
          return;
        }
      }

      // 1.8 Dog Check (Horde or Normal)
      let minDogDist = Infinity;
      const checkDogs = (list) => {
        if (!list) return;
        for (const d of list) {
          const dist =
            Math.abs(d.gridX - this.playerPos.x) +
            Math.abs(d.gridZ - this.playerPos.z);
          if (dist < minDogDist) minDogDist = dist;
        }
      };
      checkDogs(this.zombieDogs);
      checkDogs(this.hordeDogs);

      if (minDogDist < 2) {
        // High chance for bark (fast aggressive enemy)
        if (Math.random() < 0.15) {
          this.audioManager.playDogBark(getVol(minDogDist, 2));
          this.lastAmbientSoundTime = now;
          return;
        }
      }

      // 2. Distant Ambient (Low Priority)
      // Only if no growl played recently
      if (now - this.lastAmbientSoundTime > 12000) {
        if (Math.random() < 0.01) {
          this.audioManager.playZombieAmbient();
          this.lastAmbientSoundTime = now;
        }
      }
    }
  }

  /**
   * Start periodic auto-refresh of game data from blockchain
   * Runs every 60 seconds to ensure local state matches verified state
   */
  startAutoRefresh() {
    // Clear any existing interval
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }

    // refresh every 60 seconds
    this.autoRefreshInterval = setInterval(() => {
      this.refreshData();
    }, 60000);
  }

  /**
   * Fetch latest data from blockchain and update local state
   * Only updates if blockchain has *more* progress/coins than local
   * (to avoid overwriting current session progress)
   */
  async refreshData() {
    if (!steemIntegration.isConnected || !steemIntegration.username) return;

    try {
      // Sync via UIManager reusing the existing logic
      if (this.ui && typeof this.ui.syncFromBlockchain === "function") {
        await this.ui.syncFromBlockchain(steemIntegration.username);

        // After sync, update local Game instance state if we are in menu/idle
        // or if blockchain has MORE coins than we do (e.g. bought something on mobile)
        const savedCoins = this.gameData.get("totalCoins") || 0;
        if (savedCoins > this.totalCoins) {
          this.totalCoins = savedCoins;
          const coinEl = document.getElementById("coinsDisplay");
          if (coinEl) coinEl.textContent = this.totalCoins;
          this.ui.showToast("Data synced from blockchain", "sync");
        }
      }
    } catch (e) {
      console.warn("Auto-refresh failed:", e);
    }
  }
}
