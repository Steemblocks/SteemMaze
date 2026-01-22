/**
 * WeatherManager - Coordinates weather effects for the game
 * Now delegates to RainEffect and ThunderEffect for separation of concerns
 * Activated at level 7+ for increased atmosphere and challenge
 */

import { RainEffect } from "./RainEffect.js";
import { ThunderEffect } from "./ThunderEffect.js";

export class WeatherManager {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    // Weather state
    this.isStormActive = false;
    this.stormIntensity = 0;

    // Create separated effect instances
    this.rainEffect = new RainEffect(scene);
    this.thunderEffect = new ThunderEffect(scene);

    console.log(
      "🌩️ WeatherManager initialized with separated Rain and Thunder effects",
    );
  }

  /**
   * Start the storm (called when level 7+ begins)
   */
  startStorm(intensity = 1.0) {
    if (this.isStormActive) return;

    this.isStormActive = true;
    this.stormIntensity = intensity;

    // Start both effects
    this.rainEffect.start(intensity);
    this.thunderEffect.start(intensity);

    console.log("⛈️ Storm started at intensity:", intensity);
  }

  /**
   * Stop the storm
   */
  stopStorm() {
    if (!this.isStormActive) return;

    this.isStormActive = false;
    this.stormIntensity = 0;

    // Stop both effects
    this.rainEffect.stop();
    this.thunderEffect.stop();

    console.log("☀️ Storm ended");
  }

  /**
   * Update weather effects (called every frame)
   */
  update(deltaTime, playerPosition) {
    // Update rain effect
    this.rainEffect.update(deltaTime, playerPosition);

    // Update thunder effect
    this.thunderEffect.update(deltaTime);
  }

  /**
   * Pause fog effects (called when fog potions are activated)
   */
  pauseFogEffects() {
    this.thunderEffect.pauseFogEffects();
    // Rain continues regardless of fog potion, similar to thunder
  }

  /**
   * Resume fog effects
   */
  resumeFogEffects() {
    this.thunderEffect.resumeFogEffects();
  }

  lockFogDensity(locked) {
    this.thunderEffect.lockDensity(locked);
  }

  /**
   * Set callback for thunder events (for camera shake)
   */
  setThunderCallback(callback) {
    this.thunderEffect.setThunderCallback(callback);
  }

  /**
   * Enable debug mode for rain (forces visibility)
   */
  enableRainDebug() {
    this.rainEffect.enableDebug();
  }

  /**
   * Disable rain debug mode
   */
  disableRainDebug() {
    this.rainEffect.disableDebug();
  }

  /**
   * Check if storm should be active based on level
   */
  static shouldActivateStorm(level) {
    return level >= 7;
  }

  /**
   * Get storm intensity based on level (higher levels = stronger storms)
   */
  static getStormIntensity(level) {
    if (level < 7) return 0;
    // Gradually increase intensity from level 7 onwards
    return Math.min(0.5 + (level - 7) * 0.1, 1.0);
  }

  /**
   * Get the rain effect instance for direct access
   */
  getRainEffect() {
    return this.rainEffect;
  }

  /**
   * Get the thunder effect instance for direct access
   */
  getThunderEffect() {
    return this.thunderEffect;
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    this.stopStorm();
    this.rainEffect.dispose();
    this.thunderEffect.dispose();
    console.log("🌩️ WeatherManager disposed");
  }
}
