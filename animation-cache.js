/**
 * Animation Caching System - Enhanced Edition
 * Optimizes Three.js geometry, material, and animation performance
 * with frame rate limiting, object pooling, and GPU-friendly techniques
 */

import * as THREE from "three";

export class AnimationCache {
  constructor() {
    this.geometries = new Map();
    this.materials = new Map();
    this.meshPool = new Map(); // Object pooling for meshes
    this.animationFrameId = null;
    this.lastFrameTime = 0;
    this.deltaTime = 0;
    this.animationTime = 0;

    // Frame rate limiting for consistent performance
    this.targetFPS = 60;
    this.frameInterval = 1000 / this.targetFPS;
    this.lastRenderTime = 0;

    // Performance monitoring
    this.frameCount = 0;
    this.fpsUpdateInterval = 1000;
    this.lastFpsUpdate = 0;
    this.currentFPS = 60;

    // Pre-computed sin/cos tables for faster animation
    this.sinTable = new Float32Array(360);
    this.cosTable = new Float32Array(360);
    this.precomputeTrigTables();

    // Smooth interpolation cache
    this.interpolationCache = new Map();
  }

  /**
   * Pre-compute sin/cos tables for faster lookups
   */
  precomputeTrigTables() {
    for (let i = 0; i < 360; i++) {
      const rad = (i * Math.PI) / 180;
      this.sinTable[i] = Math.sin(rad);
      this.cosTable[i] = Math.cos(rad);
    }
  }

  /**
   * Fast sin lookup using pre-computed table
   */
  fastSin(degrees) {
    const normalized = ((degrees % 360) + 360) % 360;
    const index = Math.floor(normalized);
    const fraction = normalized - index;
    const nextIndex = (index + 1) % 360;
    return (
      this.sinTable[index] +
      fraction * (this.sinTable[nextIndex] - this.sinTable[index])
    );
  }

  /**
   * Fast cos lookup using pre-computed table
   */
  fastCos(degrees) {
    const normalized = ((degrees % 360) + 360) % 360;
    const index = Math.floor(normalized);
    const fraction = normalized - index;
    const nextIndex = (index + 1) % 360;
    return (
      this.cosTable[index] +
      fraction * (this.cosTable[nextIndex] - this.cosTable[index])
    );
  }

  /**
   * Smooth lerp with easing
   */
  smoothLerp(start, end, t, easing = "easeOutCubic") {
    let easedT;
    switch (easing) {
      case "easeOutCubic":
        easedT = 1 - Math.pow(1 - t, 3);
        break;
      case "easeInOutCubic":
        easedT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        break;
      case "easeOutElastic":
        const c4 = (2 * Math.PI) / 3;
        easedT =
          t === 0
            ? 0
            : t === 1
            ? 1
            : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
        break;
      default:
        easedT = t;
    }
    return start + (end - start) * easedT;
  }

  /**
   * Vector3 smooth interpolation
   */
  smoothLerpVector3(from, to, t, easing = "easeOutCubic") {
    return new THREE.Vector3(
      this.smoothLerp(from.x, to.x, t, easing),
      this.smoothLerp(from.y, to.y, t, easing),
      this.smoothLerp(from.z, to.z, t, easing)
    );
  }

  /**
   * Check if we should render this frame (frame rate limiting)
   */
  shouldRender(currentTime) {
    const elapsed = currentTime - this.lastRenderTime;
    if (elapsed >= this.frameInterval) {
      this.lastRenderTime = currentTime - (elapsed % this.frameInterval);
      this.updateFPS(currentTime);
      return true;
    }
    return false;
  }

  /**
   * Update FPS counter
   */
  updateFPS(currentTime) {
    this.frameCount++;
    if (currentTime - this.lastFpsUpdate >= this.fpsUpdateInterval) {
      this.currentFPS = Math.round(
        (this.frameCount * 1000) / (currentTime - this.lastFpsUpdate)
      );
      this.frameCount = 0;
      this.lastFpsUpdate = currentTime;
    }
  }

  /**
   * Get current FPS
   */
  getFPS() {
    return this.currentFPS;
  }

  /**
   * Get or create cached geometry
   */
  getGeometry(key, createFn) {
    if (!this.geometries.has(key)) {
      this.geometries.set(key, createFn());
    }
    return this.geometries.get(key);
  }

  /**
   * Get or create cached material
   */
  getMaterial(key, createFn) {
    if (!this.materials.has(key)) {
      this.materials.set(key, createFn());
    }
    return this.materials.get(key);
  }

  /**
   * Pre-cache common geometries
   */
  preloadCommonGeometries() {
    // Firefly sphere
    this.getGeometry(
      "firefly-sphere",
      () => new THREE.SphereGeometry(0.1, 8, 8)
    );

    // Ring halo for player
    this.getGeometry("halo-ring", () => new THREE.RingGeometry(0.8, 0.9, 32));

    // Goal box
    this.getGeometry("goal-box", () => new THREE.BoxGeometry(0.8, 0.8, 0.8));

    // Gem sphere
    this.getGeometry("gem-sphere", () => new THREE.IcosahedronGeometry(0.3, 4));

    // Wall cube
    this.getGeometry("wall-cube", () => new THREE.BoxGeometry(1, 1, 1));

    // Particle buffer geometry (for background)
    this.getGeometry("particle-buffer", () => {
      const particles = new THREE.BufferGeometry();
      const count = 150;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count * 3; i++) {
        positions[i] = (Math.random() - 0.5) * 100;
      }
      particles.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3)
      );
      return particles;
    });
  }

  /**
   * Pre-cache common materials
   */
  preloadCommonMaterials() {
    // Background particles
    this.getMaterial(
      "bg-particles",
      () =>
        new THREE.PointsMaterial({
          color: 0x4ade80,
          size: 0.5,
          transparent: true,
          opacity: 0.6,
          sizeAttenuation: true,
        })
    );

    // Player halo
    this.getMaterial(
      "player-halo",
      () =>
        new THREE.MeshBasicMaterial({
          color: 0x4ade80,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide,
        })
    );

    // Goal material
    this.getMaterial(
      "goal",
      () =>
        new THREE.MeshStandardMaterial({
          color: 0xfbbf24,
          emissive: 0xfbbf24,
          emissiveIntensity: 0.5,
          metalness: 0.8,
          roughness: 0.2,
        })
    );

    // Gem material
    this.getMaterial(
      "gem",
      () =>
        new THREE.MeshStandardMaterial({
          color: 0xff00ff,
          emissive: 0xff00ff,
          emissiveIntensity: 0.3,
          metalness: 0.9,
          roughness: 0.1,
        })
    );

    // Wall material
    this.getMaterial(
      "wall",
      () =>
        new THREE.MeshStandardMaterial({
          color: 0x1f2937,
          roughness: 0.8,
          metalness: 0.1,
        })
    );

    // Ground material
    this.getMaterial(
      "ground",
      () =>
        new THREE.MeshStandardMaterial({
          color: 0x064e3b,
          roughness: 0.9,
          metalness: 0.1,
          flatShading: true,
        })
    );

    // Firefly material
    this.getMaterial(
      "firefly",
      () =>
        new THREE.MeshBasicMaterial({
          color: 0xffff00,
        })
    );
  }

  /**
   * Update animation frame timing
   * Call once per animation frame
   */
  updateFrameTiming(currentTime) {
    if (this.lastFrameTime === 0) {
      this.lastFrameTime = currentTime;
    }
    this.deltaTime = (currentTime - this.lastFrameTime) / 1000; // Convert to seconds
    this.lastFrameTime = currentTime;
    this.animationTime += this.deltaTime;

    // Cap deltaTime to prevent large jumps
    if (this.deltaTime > 0.1) {
      this.deltaTime = 0.1;
    }
  }

  /**
   * Get smooth sin wave using cached animation time
   */
  getWave(frequency = 1, amplitude = 1, phase = 0) {
    return (
      Math.sin(this.animationTime * frequency * Math.PI * 2 + phase) * amplitude
    );
  }

  /**
   * Get smooth cos wave using cached animation time
   */
  getCosWave(frequency = 1, amplitude = 1, phase = 0) {
    return (
      Math.cos(this.animationTime * frequency * Math.PI * 2 + phase) * amplitude
    );
  }

  /**
   * Create a reusable animation loop manager
   */
  createAnimationLoop(callback) {
    const loop = (currentTime) => {
      this.updateFrameTiming(currentTime);
      callback(this.deltaTime, this.animationTime);
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  /**
   * Stop animation loop
   */
  stopAnimationLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Clear all cached geometries and materials
   */
  dispose() {
    this.geometries.forEach((geo) => geo.dispose());
    this.materials.forEach((mat) => mat.dispose());
    this.geometries.clear();
    this.materials.clear();
    this.stopAnimationLoop();
  }

  /**
   * Get cache statistics with FPS
   */
  getStats() {
    return {
      cachedGeometries: this.geometries.size,
      cachedMaterials: this.materials.size,
      pooledMeshes: this.meshPool.size,
      animationTime: this.animationTime.toFixed(2),
      deltaTime: this.deltaTime.toFixed(4),
      currentFPS: this.currentFPS,
    };
  }

  /**
   * Get pooled mesh or create new one
   */
  getPooledMesh(key, geometry, material) {
    if (!this.meshPool.has(key)) {
      this.meshPool.set(key, []);
    }
    const pool = this.meshPool.get(key);
    if (pool.length > 0) {
      return pool.pop();
    }
    return new THREE.Mesh(geometry, material);
  }

  /**
   * Return mesh to pool for reuse
   */
  returnToPool(key, mesh) {
    if (!this.meshPool.has(key)) {
      this.meshPool.set(key, []);
    }
    mesh.visible = false;
    this.meshPool.get(key).push(mesh);
  }

  /**
   * Frustum culling helper - check if object is in view
   */
  isInFrustum(camera, object) {
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();
    projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    frustum.setFromProjectionMatrix(projScreenMatrix);

    if (object.geometry && object.geometry.boundingSphere) {
      return frustum.intersectsSphere(object.geometry.boundingSphere);
    }
    return true;
  }

  /**
   * Batch render optimization - group similar objects
   */
  optimizeForBatchRendering(objects) {
    // Sort by material for better batching
    return objects.sort((a, b) => {
      const matA = a.material ? a.material.uuid : "";
      const matB = b.material ? b.material.uuid : "";
      return matA.localeCompare(matB);
    });
  }

  /**
   * Delta-time based animation value
   * Creates smooth animations independent of frame rate
   */
  getDeltaAnimatedValue(speed, offset = 0) {
    return (this.animationTime * speed + offset) % (Math.PI * 2);
  }

  /**
   * Get smooth oscillating value (0-1 range)
   */
  getOscillation(frequency = 1, offset = 0) {
    return (
      (Math.sin(this.animationTime * frequency * Math.PI * 2 + offset) + 1) / 2
    );
  }
}

// Export singleton instance
export const animationCache = new AnimationCache();
