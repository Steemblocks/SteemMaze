/**
 * PostProcessing Effects System
 * Handles bloom, particle trails, and visual enhancement effects
 */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

// Custom vignette shader for atmospheric effect
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 1.0 },
    darkness: { value: 1.2 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
      float vignette = 1.0 - dot(uv, uv);
      texel.rgb *= smoothstep(0.2, 0.9, vignette);
      gl_FragColor = texel;
    }
  `,
};

export class PostProcessingManager {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = true;

    this.setupComposer();
  }

  setupComposer() {
    // Create the effect composer
    this.composer = new EffectComposer(this.renderer);

    // Add the render pass (renders the scene)
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Add bloom pass for glowing effects - reduced to prevent excessive glow
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.8, // Bloom strength (reduced)
      0.3, // Bloom radius (tighter)
      0.9, // Bloom threshold (higher - only very bright things glow)
    );
    bloomPass.threshold = 0.85; // High threshold - only emissive objects glow
    bloomPass.strength = 0.8; // Increased from 0.5 for better pop
    bloomPass.radius = 0.3;
    this.bloomPass = bloomPass;
    this.composer.addPass(bloomPass);

    // Add bright vignette for focus
    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms.offset.value = 1.1; // Wide opening
    vignettePass.uniforms.darkness.value = 0.6; // Moderate darkening
    this.vignettePass = vignettePass;
    this.composer.addPass(vignettePass);
  }

  render() {
    if (this.enabled) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
  }

  setBloomStrength(strength) {
    this.bloomPass.strength = strength;
  }

  setBloomIntensity(level) {
    // Level: 'low', 'medium', 'high'
    const settings = {
      low: { strength: 0.6, radius: 0.4, threshold: 0.85 },
      medium: { strength: 1.2, radius: 0.6, threshold: 0.7 },
      high: { strength: 1.8, radius: 0.8, threshold: 0.5 },
    };
    const s = settings[level] || settings.medium;
    this.bloomPass.strength = s.strength;
    this.bloomPass.radius = s.radius;
    this.bloomPass.threshold = s.threshold;
  }

  // Flash effect for damage or power-up collection
  flashScreen(color = 0xff0000, intensity = 0.5, duration = 150) {
    const originalDarkness = this.vignettePass.uniforms.darkness.value;
    this.vignettePass.uniforms.darkness.value = intensity; // Use darkness for flash intensity (inverted logic essentially or just change offset)

    // Actually, for a COLOR flash we need a separate pass or modification.
    // But reusing vignette darkness is a quick hack to pulse the screen.
    // Let's stick to the previous implementation which relied on `darkness` change.

    setTimeout(() => {
      this.vignettePass.uniforms.darkness.value = originalDarkness;
    }, duration);
  }

  dispose() {
    this.composer.dispose();
  }
}

/**
 * Particle Trail System
 * Creates beautiful particle effects following the player
 */
/**
 * Particle Trail System (Optimized)
 * Uses InstancedMesh for high-performance shared-frame rendering
 * Supports large particle counts for high-quality blasts
 */
export class ParticleTrailSystem {
  constructor(scene, color = 0x4ade80) {
    this.scene = scene;
    this.color = new THREE.Color(color);
    this.maxParticles = 500; // Increased limit for massive blasts
    this.trailEnabled = true;

    // Instance data management
    this.particleData = [];
    this.dummy = new THREE.Object3D(); // Helper for matrix calculations

    this.createParticlePool();
  }

  createParticlePool() {
    // Shared geometry for all particles (optimized)
    const geometry = new THREE.SphereGeometry(0.12, 8, 8);

    // Shared material - using white base to allow instance coloring
    // Note: InstancedMesh handles colors via setColorAt
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
    });

    // Create the InstancedMesh
    this.mesh = new THREE.InstancedMesh(geometry, material, this.maxParticles);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.mesh);

    // Initialize pool state
    for (let i = 0; i < this.maxParticles; i++) {
      this.particleData.push({
        active: false,
        life: 0,
        maxLife: 60,
        velocity: new THREE.Vector3(),
        scale: 0,
        position: new THREE.Vector3(),
        color: new THREE.Color(),
      });
      // Send off-screen initially
      this.mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    }
  }

  // Find next available particle index
  getNextFreeIndex() {
    // Simple linear search or cyclic cursor could work.
    // For 500 items, linear find is fast enough.
    return this.particleData.findIndex((p) => !p.active);
  }

  emit(position, count = 3) {
    if (!this.trailEnabled) return;

    for (let i = 0; i < count; i++) {
      const idx = this.getNextFreeIndex();
      if (idx === -1) break; // Pool full

      const p = this.particleData[idx];
      p.active = true;
      p.life = p.maxLife;

      // Reset position
      p.position.copy(position);
      p.position.x += (Math.random() - 0.5) * 0.3;
      p.position.y += Math.random() * 0.3;
      p.position.z += (Math.random() - 0.5) * 0.3;

      // Velocity
      p.velocity.set(
        (Math.random() - 0.5) * 0.05,
        0.02 + Math.random() * 0.03,
        (Math.random() - 0.5) * 0.05,
      );

      // Visuals
      p.scale = 1.0;
      p.color.copy(this.color);

      this.updateInstance(idx);
    }
    this.mesh.count = this.maxParticles;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  // Special burst effect for collecting items
  burst(position, count = 25, color = null) {
    for (let i = 0; i < count; i++) {
      const idx = this.getNextFreeIndex();
      if (idx === -1) break;

      const p = this.particleData[idx];
      p.active = true;
      p.life = p.maxLife * 1.5;

      p.position.copy(position);

      const angle = (Math.PI * 2 * i) / count;
      const speed = 0.08 + Math.random() * 0.05;
      p.velocity.set(
        Math.cos(angle) * speed,
        0.05 + Math.random() * 0.08,
        Math.sin(angle) * speed,
      );

      // Color
      if (color) {
        p.color.setHex(color);
      } else {
        p.color.copy(this.color);
      }

      p.scale = 1.5;
      this.updateInstance(idx);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  // Entity death explosion effect - shared by all entities
  // High quality blast using shared frames
  entityExplosion(
    position,
    count = 50,
    color = 0x8b0000,
    scaleMultiplier = 1.0,
  ) {
    for (let i = 0; i < count; i++) {
      const idx = this.getNextFreeIndex();
      if (idx === -1) break;

      const p = this.particleData[idx];
      p.active = true;
      p.life = p.maxLife * 2.5;

      // Position spread scales with entity size
      const spread = 0.5 * scaleMultiplier;
      p.position.copy(position);
      p.position.y += (0.5 + Math.random() * 0.5) * scaleMultiplier; // Higher start for big bosses
      p.position.x += (Math.random() - 0.5) * spread;
      p.position.z += (Math.random() - 0.5) * spread;

      // Random explosion velocity - aggressive spread
      const angle = Math.random() * Math.PI * 2;
      const elevation = Math.random() * Math.PI * 0.5;
      // Velocity slightly faster for bigger explosions to cover more ground
      const speed =
        (0.2 + Math.random() * 0.3) * (1 + (scaleMultiplier - 1) * 0.3);

      p.velocity.set(
        Math.cos(angle) * Math.cos(elevation) * speed,
        (0.2 + Math.random() * 0.4) * scaleMultiplier, // Higher upward force
        Math.sin(angle) * Math.cos(elevation) * speed,
      );

      // Vary colors
      const colorHex = color;
      const colorVariations = [
        colorHex,
        (colorHex & 0xffffff) * 0.8,
        (colorHex & 0xffffff) * 0.6,
        0x4a4a4a,
      ];
      const selectedColor =
        colorVariations[Math.floor(Math.random() * colorVariations.length)];
      p.color.setHex(selectedColor);

      // Scale particles larger for bigger entities (but not linearly, maybe sqrt)
      // Base scale 2.0 -> Boss scale ~3.0-4.0
      p.scale = (2.0 + Math.random() * 1.5) * (0.8 + 0.2 * scaleMultiplier);

      this.updateInstance(idx);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  updateInstance(index) {
    const p = this.particleData[index];
    this.dummy.position.copy(p.position);
    this.dummy.scale.setScalar(p.scale);
    this.dummy.updateMatrix();

    this.mesh.setMatrixAt(index, this.dummy.matrix);
    this.mesh.setColorAt(index, p.color);
  }

  update() {
    let needsUpdate = false;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particleData[i];
      if (!p.active) continue;

      p.life--;
      if (p.life <= 0) {
        p.active = false;
        p.scale = 0;
        this.updateInstance(i);
        needsUpdate = true;
        continue;
      }

      // Update position
      p.position.add(p.velocity);
      p.velocity.y -= 0.012; // Stronger gravity for realism

      // Fade out by scaling
      const lifeRatio = p.life / p.maxLife;
      // p.scale scales down as it dies
      // If it started at ~2.0, we want it to shrink
      const originalScale = p.scale > 1.5 ? 2.5 : 1.0; // Estimate original scale hint
      p.scale = lifeRatio * originalScale;

      // Update this instance
      this.dummy.position.copy(p.position);
      this.dummy.scale.setScalar(p.scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);

      needsUpdate = true;
    }

    if (needsUpdate) {
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  setColor(color) {
    this.color.setHex(color);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/**
 * Skybox Manager
 * Creates a dynamic procedural skybox with stars
 */
export class SkyboxManager {
  constructor(scene) {
    this.scene = scene;

    // Base colors
    this.baseTopColor = new THREE.Color(0x0f172a); // Deep Navy
    this.baseBottomColor = new THREE.Color(0x020617); // Darker base

    // Storm colors
    this.stormTopColor = new THREE.Color(0x050510); // Almost black/purple
    this.stormBottomColor = new THREE.Color(0x000000); // Pitch black

    this.currentTopColor = this.baseTopColor.clone();
    this.currentBottomColor = this.baseBottomColor.clone();

    this.stormIntensity = 0;

    this.createSkybox();
    this.createStars();
  }

  createSkybox() {
    // Create gradient sky with shader
    const skyGeo = new THREE.SphereGeometry(400, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: this.baseTopColor },
        bottomColor: { value: this.baseBottomColor },
        offset: { value: 33 },
        exponent: { value: 0.6 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
    });

    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.skyMat = skyMat; // Save reference for updates
    this.scene.add(this.skyMesh);
  }

  createStars() {
    // Create star field
    const starsGeometry = new THREE.BufferGeometry();
    const starCount = 2000;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
      // Random position on sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 300 + Math.random() * 50;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      // Star colors - mostly white with some blue and yellow
      const colorChoice = Math.random();
      if (colorChoice > 0.9) {
        // Blue star
        colors[i * 3] = 0.6;
        colors[i * 3 + 1] = 0.8;
        colors[i * 3 + 2] = 1.0;
      } else if (colorChoice > 0.8) {
        // Yellow star
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.9;
        colors[i * 3 + 2] = 0.6;
      } else {
        // White star
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 1.0;
        colors[i * 3 + 2] = 1.0;
      }

      sizes[i] = Math.random() * 2 + 0.5;
    }

    starsGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    starsGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    starsGeometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    const starsMaterial = new THREE.PointsMaterial({
      size: 1.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: false,
    });

    this.stars = new THREE.Points(starsGeometry, starsMaterial);
    this.scene.add(this.stars);
  }

  setStormIntensity(intensity) {
    this.stormIntensity = Math.min(1, Math.max(0, intensity));
  }

  update() {
    // Slowly rotate stars
    if (this.stars) {
      this.stars.rotation.y += 0.00005;
    }

    // Update sky colors based on storm intensity
    if (this.skyMat) {
      // Interpolate towards target colors
      const targetTop = this.baseTopColor
        .clone()
        .lerp(this.stormTopColor, this.stormIntensity);
      const targetBottom = this.baseBottomColor
        .clone()
        .lerp(this.stormBottomColor, this.stormIntensity);

      // Smooth transition (approx 5% per frame)
      this.currentTopColor.lerp(targetTop, 0.05);
      this.currentBottomColor.lerp(targetBottom, 0.05);

      this.skyMat.uniforms.topColor.value.copy(this.currentTopColor);
      this.skyMat.uniforms.bottomColor.value.copy(this.currentBottomColor);
    }
  }

  dispose() {
    if (this.skyMesh) {
      this.scene.remove(this.skyMesh);
      this.skyMesh.geometry.dispose();
      this.skyMesh.material.dispose();
    }
    if (this.stars) {
      this.scene.remove(this.stars);
      this.stars.geometry.dispose();
      this.stars.material.dispose();
    }
  }
}

/**
 * Screen Effects Manager
 * Handles screen shake, flash, and other visual feedback
 */
export class ScreenEffectsManager {
  constructor() {
    this.shakeIntensity = 0;
    this.shakeDuration = 0;
    this.flashOverlay = null;

    this.createFlashOverlay();
  }

  createFlashOverlay() {
    this.flashOverlay = document.createElement("div");
    this.flashOverlay.id = "screenFlashOverlay";
    this.flashOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      opacity: 0;
      z-index: 1000;
      transition: opacity 0.1s ease-out;
    `;
    document.body.appendChild(this.flashOverlay);
  }

  // Screen shake effect
  shake(intensity = 10, duration = 200) {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
  }

  // Screen flash effect (damage, collect, etc.)
  flash(color = "#ff0000", intensity = 0.4, duration = 150) {
    this.flashOverlay.style.backgroundColor = color;
    this.flashOverlay.style.opacity = intensity;

    setTimeout(() => {
      this.flashOverlay.style.opacity = 0;
    }, duration);
  }

  // Backward compatibility alias
  flashScreen(color, intensity, duration) {
    this.flash(color, intensity, duration);
  }

  // Get camera offset for shake effect
  getShakeOffset() {
    if (this.shakeIntensity <= 0) return { x: 0, y: 0, z: 0 };

    const offset = {
      x: (Math.random() - 0.5) * this.shakeIntensity * 0.1,
      y: (Math.random() - 0.5) * this.shakeIntensity * 0.05,
      z: (Math.random() - 0.5) * this.shakeIntensity * 0.1,
    };

    // Decay shake
    this.shakeIntensity *= 0.9;
    if (this.shakeIntensity < 0.1) {
      this.shakeIntensity = 0;
    }

    return offset;
  }

  // Positive feedback flash (green for collect, gold for level up)
  collectFlash() {
    this.flash("#4ade80", 0.2, 100);
  }

  damageFlash() {
    this.flash("#ef4444", 0.35, 150);
    this.shake(8, 200);
  }

  powerUpFlash(type) {
    const colors = {
      shield: "#3b82f6",
      speed: "#fbbf24",
      freeze: "#06b6d4",
    };
    this.flash(colors[type] || "#a855f7", 0.25, 120);
  }

  dispose() {
    if (this.flashOverlay && this.flashOverlay.parentNode) {
      this.flashOverlay.parentNode.removeChild(this.flashOverlay);
    }
  }
}
