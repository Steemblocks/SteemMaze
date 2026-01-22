/**
 * ThunderEffect - Handles lightning flashes and thunder atmosphere
 * Separated from WeatherManager for easier debugging
 */

import * as THREE from "three";

export class ThunderEffect {
  constructor(scene) {
    this.scene = scene;

    // Thunder state
    this.isActive = false;
    this.intensity = 0;
    this.currentFlashValue = 0;

    // Lightning light
    this.lightningLight = null;

    // Thunder timing
    this.thunderTimeout = null;
    this.lastThunderTime = 0;
    this.minInterval = 5000; // 5 seconds minimum
    this.maxInterval = 15000; // 15 seconds maximum

    // Callbacks
    this.onThunderCallback = null;

    // Atmosphere settings
    this.originalFogColor = null;
    this.originalFogDensity = null;
    this.fogPaused = false;
    this.densityLocked = false;

    this.init();
  }

  init() {
    this.createLightningLight();
    console.log("⚡ ThunderEffect initialized");
  }

  /**
   * Create the lightning flash light
   */
  createLightningLight() {
    this.lightningLight = new THREE.DirectionalLight(0xffffff, 0);
    this.lightningLight.position.set(50, 100, 0);
    this.scene.add(this.lightningLight);
    console.log("⚡ Lightning light created");
  }

  /**
   * Store original fog settings for atmosphere effects
   */
  captureOriginalFog() {
    if (this.scene.fog) {
      this.originalFogColor = this.scene.fog.color.clone();
      this.originalFogDensity = this.scene.fog.density;
      console.log("⚡ Captured original fog settings");
    }
  }

  /**
   * Start thunder effects
   */
  start(intensity = 1.0) {
    if (this.isActive) return;

    this.isActive = true;
    this.intensity = Math.min(1.0, Math.max(0, intensity));

    // Capture fog settings if not already done
    if (!this.originalFogColor) {
      this.captureOriginalFog();
    }

    // Schedule first thunder
    this.scheduleNextThunder();

    console.log("⚡ Thunder started with intensity:", this.intensity);
  }

  /**
   * Stop thunder effects
   */
  stop() {
    if (!this.isActive) return;

    this.isActive = false;
    this.intensity = 0;

    // Clear scheduled thunder
    if (this.thunderTimeout) {
      clearTimeout(this.thunderTimeout);
      this.thunderTimeout = null;
    }

    // Restore fog
    this.restoreFog();

    console.log("⚡ Thunder stopped");
  }

  /**
   * Schedule next thunder strike
   */
  scheduleNextThunder() {
    if (!this.isActive) return;

    const delay =
      this.minInterval + Math.random() * (this.maxInterval - this.minInterval);

    this.thunderTimeout = setTimeout(() => {
      this.triggerLightning();
      this.scheduleNextThunder();
    }, delay);
  }

  /**
   * Trigger a lightning flash
   */
  triggerLightning() {
    if (!this.isActive) return;

    // Random position for lightning
    this.lightningLight.position.set(
      (Math.random() - 0.5) * 200,
      100,
      (Math.random() - 0.5) * 200,
    );

    // Flash sequence for realistic effect
    const flashSequence = [
      { intensity: 5, duration: 50 },
      { intensity: 0, duration: 50 },
      { intensity: 8, duration: 80 },
      { intensity: 3, duration: 40 },
      { intensity: 0, duration: 100 },
      { intensity: 4, duration: 60 },
      { intensity: 0, duration: 0 },
    ];

    let delay = 0;
    flashSequence.forEach((flash) => {
      setTimeout(() => {
        this.currentFlashValue = flash.intensity * this.intensity;
      }, delay);
      delay += flash.duration;
    });

    // Trigger thunder callback (for camera shake, etc.)
    const thunderDelay = 200 + Math.random() * 500;
    setTimeout(() => {
      if (this.onThunderCallback) {
        this.onThunderCallback(thunderDelay);
      }
    }, thunderDelay);

    this.lastThunderTime = performance.now();
    console.log("⚡ Lightning triggered!");
  }

  /**
   * Update storm atmosphere (fog effects)
   */
  updateAtmosphere() {
    if (!this.scene.fog || !this.originalFogColor) return;
    if (!this.isActive) return;

    // --- 1. Update Lightning Light (Always Active) ---
    // This ensures flashes work even if fog potion is active
    if (this.currentFlashValue > 0) {
      // Flash color (Bright Blue-White)
      const flashColor = new THREE.Color(0xaaccff);

      // Calculate light intensity
      // If fog is paused (clear weather), reduce flash intensity slightly to prevent blinding glare
      const intensityMult = this.fogPaused ? 1.0 : 2.0;
      this.lightningLight.intensity = this.currentFlashValue * intensityMult;
    } else {
      this.lightningLight.intensity = 0;
    }

    // --- 2. Update Fog (Only if NOT paused/potion active) ---
    // unique logic to prevent storm fog from overriding potion effect
    if (this.fogPaused) return;

    // Calculate Base Storm Target
    // Darken fog color during storm (deep blue/black)
    const stormFogColor = new THREE.Color(0x050510);
    const baseTargetColor = this.originalFogColor
      .clone()
      .lerp(stormFogColor, this.intensity * 0.7);

    // Mix Flash Color into Fog
    const finalColor = baseTargetColor.clone();

    if (this.currentFlashValue > 0) {
      const flashColor = new THREE.Color(0xaaccff);
      // Mix based on flash intensity (normalized roughly 0-8 -> 0-0.9)
      const flashFactor = Math.min(this.currentFlashValue / 6, 0.9);
      finalColor.lerp(flashColor, flashFactor);
    }

    // Apply to Fog Color
    // Use faster lerp when flashing for snappy effect, slower for atmosphere drift
    const lerpFactor = this.currentFlashValue > 0 ? 0.4 : 0.05;
    this.scene.fog.color.lerp(finalColor, lerpFactor);

    // Apply to Fog Density (only if not locked by external event like Darkness)
    if (!this.densityLocked) {
      // Slightly reduce density during bright flashes to simulate light penetration
      const densityMod = this.currentFlashValue > 0 ? 0.8 : 1.0;
      const targetDensity =
        this.originalFogDensity * (1 + this.intensity * 0.3) * densityMod;

      this.scene.fog.density += (targetDensity - this.scene.fog.density) * 0.05;
    }
  }

  /**
   * Lock fog density (prevent updates)
   * Used when other events (like Darkness) need to control density
   */
  lockDensity(locked) {
    this.densityLocked = locked;
  }

  /**
   * Restore original fog settings
   */
  restoreFog() {
    if (this.scene.fog && this.originalFogColor) {
      this.scene.fog.color.copy(this.originalFogColor);
      this.scene.fog.density = this.originalFogDensity;
    }
  }

  /**
   * Pause fog modifications (for potions, etc.)
   */
  pauseFogEffects() {
    this.fogPaused = true;
  }

  /**
   * Resume fog modifications
   */
  resumeFogEffects() {
    this.fogPaused = false;
    this.restoreFog();
  }

  /**
   * Set thunder callback (for camera shake, sound, etc.)
   */
  setThunderCallback(callback) {
    this.onThunderCallback = callback;
  }

  /**
   * Set thunder intensity
   */
  setIntensity(intensity) {
    this.intensity = Math.min(1.0, Math.max(0, intensity));
  }

  /**
   * Update (call every frame)
   */
  update(deltaTime) {
    this.updateAtmosphere();
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.stop();

    if (this.lightningLight) {
      this.scene.remove(this.lightningLight);
    }

    console.log("⚡ ThunderEffect disposed");
  }
}
