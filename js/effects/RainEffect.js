/**
 * RainEffect - Handles 3D rain particles using LineSegments
 * Separated from WeatherManager for easier debugging
 */

import * as THREE from "three";

export class RainEffect {
  constructor(scene) {
    this.scene = scene;

    // Rain state
    this.intensity = 0;
    this.targetIntensity = 0;

    // Main rain layer
    this.rainCount = 8000;
    this.rainVelocities = [];
    this.rainGeometry = null;
    this.rainMaterial = null;
    this.rainMesh = null;

    // Backdrop rain layer
    this.backdropCount = 3000;
    this.backdropVelocities = [];
    this.backdropStreakLengths = [];
    this.backdropGeometry = null;
    this.backdropMaterial = null;
    this.backdropMesh = null;

    // Rain area config
    this.spreadX = 120;
    this.spreadZ = 120;
    this.heightMin = 5;
    this.heightMax = 60;

    // Debug flag - set to true to always show rain
    this.debugMode = false;
    this.isVisible = true; // Visibility controlled by potions/events

    this.init();
  }

  /**
   * Generate a realistic, soft rain streak texture
   */
  createRainTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 256; // High aspect ratio for streaks
    const context = canvas.getContext("2d");

    // Clear
    context.clearRect(0, 0, 32, 256);

    // Soft gradient streak
    const gradient = context.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
    gradient.addColorStop(0.2, "rgba(200, 220, 255, 0.1)");
    gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.6)"); // Soft white center
    gradient.addColorStop(0.8, "rgba(200, 220, 255, 0.1)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    context.fillStyle = gradient;
    // Draw a tapered streak in the center - slightly wider
    context.fillRect(13, 0, 6, 256);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  init() {
    this.createMainRain();
    this.createBackdropRain();
  }

  createMainRain() {
    this.rainVelocities = [];
    this.rainCount = 10000; // Increased from 4000 for heavier storm

    // Use Points for reliable visibility
    this.rainGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.rainCount * 3);

    for (let i = 0; i < this.rainCount; i++) {
      const x = (Math.random() - 0.5) * this.spreadX;
      const y =
        Math.random() * (this.heightMax - this.heightMin) + this.heightMin;
      const z = (Math.random() - 0.5) * this.spreadZ;

      const velocity = 0.5 + Math.random() * 0.5; // Faster fall speed
      this.rainVelocities.push(velocity);

      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }

    this.rainGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
    );

    // Rain drop texture
    const rainTexture = this.createRainTexture();

    // Rain material - Realistic scaling
    this.rainMaterial = new THREE.PointsMaterial({
      color: 0xaaddff,
      size: 0.6, // Slight increase
      map: rainTexture,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      sizeAttenuation: true, // Particles shrink with distance
      fog: true, // Should be affected by fog for depth
    });

    this.rainMesh = new THREE.Points(this.rainGeometry, this.rainMaterial);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.renderOrder = 2000; // Very high render order
    this.scene.add(this.rainMesh);
  }

  createBackdropRain() {
    this.backdropVelocities = [];
    this.backdropCount = 5000; // Increased from 2000
    const spreadX = 160;
    const spreadZ = 160;
    const heightMax = 70;

    this.backdropGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.backdropCount * 3);

    for (let i = 0; i < this.backdropCount; i++) {
      const x = (Math.random() - 0.5) * spreadX;
      const y = Math.random() * heightMax;
      const z = (Math.random() - 0.5) * spreadZ;

      const velocity = 0.4 + Math.random() * 0.4;
      this.backdropVelocities.push(velocity);

      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }

    this.backdropGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
    );

    // Reuse texture
    const rainTexture = this.rainMaterial
      ? this.rainMaterial.map
      : this.createRainTexture();

    this.backdropMaterial = new THREE.PointsMaterial({
      color: 0x5588aa, // Clear blue for backdrop
      size: 1.2, // Slightly larger for background ambiance
      map: rainTexture,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      sizeAttenuation: true,
      fog: true, // Fog affects background rain for depth
    });

    this.backdropMesh = new THREE.Points(
      this.backdropGeometry,
      this.backdropMaterial,
    );
    this.backdropMesh.frustumCulled = false;
    this.backdropMesh.renderOrder = 1999;
    this.scene.add(this.backdropMesh);
  }

  /**
   * Start rain effect
   */
  start(intensity = 1.0) {
    this.targetIntensity = Math.min(1.0, Math.max(0, intensity));

    // Ensure meshes are in scene
    if (this.rainMesh && !this.rainMesh.parent) {
      this.scene.add(this.rainMesh);
    }
    if (this.backdropMesh && !this.backdropMesh.parent) {
      this.scene.add(this.backdropMesh);
    }
  }

  /**
   * Stop rain effect
   */
  stop() {
    this.targetIntensity = 0;
  }

  /**
   * Update rain animation (call every frame)
   */
  update(deltaTime, playerPosition) {
    if (!this.rainMesh || !this.rainGeometry) return;

    // Smoothly transition intensity
    const transitionSpeed = 1.0 * deltaTime; // Faster transition
    if (this.intensity < this.targetIntensity) {
      this.intensity = Math.min(
        this.intensity + transitionSpeed,
        this.targetIntensity,
      );
    } else if (this.intensity > this.targetIntensity) {
      this.intensity = Math.max(
        this.intensity - transitionSpeed,
        this.targetIntensity,
      );
    }

    // Debug mode: force visibility
    const effectiveIntensity = this.debugMode ? 1.0 : this.intensity;
    const visibilityMult = this.isVisible ? 1.0 : 0.0;

    // Update material opacity
    if (this.rainMaterial) {
      this.rainMaterial.opacity =
        Math.min(0.7, effectiveIntensity * 0.8) * visibilityMult;
    }
    if (this.backdropMaterial) {
      this.backdropMaterial.opacity =
        Math.min(0.4, effectiveIntensity * 0.5) * visibilityMult;
    }

    // Skip position updates if no rain visible
    if (effectiveIntensity < 0.01 || !this.isVisible) return;

    // Update main rain
    this.updateMainRain(effectiveIntensity);

    // Update backdrop rain
    this.updateBackdropRain(effectiveIntensity);

    // Follow player position
    if (playerPosition) {
      // Snap to integer or larger grid to prevent jittering?
      // No, smooth follow is better for immersion
      this.rainMesh.position.x = playerPosition.x;
      this.rainMesh.position.z = playerPosition.z;

      if (this.backdropMesh) {
        this.backdropMesh.position.x = playerPosition.x;
        this.backdropMesh.position.z = playerPosition.z;
      }
    }
  }

  /**
   * Set visibility of rain (e.g. for potions)
   */
  setVisibility(visible) {
    this.isVisible = visible;
    if (!visible) {
      if (this.rainMaterial) this.rainMaterial.opacity = 0;
      if (this.backdropMaterial) this.backdropMaterial.opacity = 0;
    }
  }

  updateMainRain(intensity) {
    const positions = this.rainGeometry.attributes.position.array;

    // Wind drift
    const time = performance.now() * 0.001;
    const windX = Math.sin(time * 0.5) * 0.2;

    for (let i = 0; i < this.rainCount; i++) {
      const idx = i * 3;
      const velocity = this.rainVelocities[i];

      // Fall down fast
      // velocity is 0.5-1.0
      positions[idx + 1] -= velocity * 1.5;

      // Apply wind
      positions[idx + 0] += windX;

      // Reset
      if (positions[idx + 1] < 0) {
        positions[idx + 0] = (Math.random() - 0.5) * this.spreadX;
        positions[idx + 1] = this.heightMax + Math.random() * 10;
        positions[idx + 2] = (Math.random() - 0.5) * this.spreadZ;
      }
    }

    this.rainGeometry.attributes.position.needsUpdate = true;
  }

  updateBackdropRain(intensity) {
    if (!this.backdropMesh || !this.backdropGeometry) return;
    const positions = this.backdropGeometry.attributes.position.array;

    for (let i = 0; i < this.backdropCount; i++) {
      const idx = i * 3;
      const velocity = this.backdropVelocities[i];

      positions[idx + 1] -= velocity * 1.0;

      if (positions[idx + 1] < 0) {
        const spreadX = 160;
        const spreadZ = 160;
        const heightMax = 70;
        positions[idx + 0] = (Math.random() - 0.5) * spreadX;
        positions[idx + 1] = heightMax + Math.random() * 10;
        positions[idx + 2] = (Math.random() - 0.5) * spreadZ;
      }
    }
    this.backdropGeometry.attributes.position.needsUpdate = true;
  }

  /**
   * Enable debug mode (forces rain to be visible)
   */
  enableDebug() {
    this.debugMode = true;
    this.targetIntensity = 1.0;
    this.intensity = 1.0;
  }

  /**
   * Disable debug mode
   */
  disableDebug() {
    this.debugMode = false;
  }

  /**
   * Get current intensity
   */
  getIntensity() {
    return this.intensity;
  }

  /**
   * Check if rain is active
   */
  isActive() {
    return this.intensity > 0.01 || this.targetIntensity > 0;
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    if (this.rainMesh) {
      this.scene.remove(this.rainMesh);
      this.rainGeometry.dispose();
      if (this.rainMaterial.map) this.rainMaterial.map.dispose(); // Dispose texture
      this.rainMaterial.dispose();
    }
    if (this.backdropMesh) {
      this.scene.remove(this.backdropMesh);
      this.backdropGeometry.dispose();
      this.backdropMaterial.dispose();
    }
  }
}
