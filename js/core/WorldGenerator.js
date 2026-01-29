/**
 * WorldGenerator Class
 * Handles all world/level generation: terrain, lighting, background, fireflies, maze
 * Extracted from Game.js for better code organization
 */

import * as THREE from "three";
import { animationCache } from "../../animation-cache.js";
import { MazeGenerator } from "./MazeGenerator.js";

export class WorldGenerator {
  constructor(game) {
    this.game = game; // Reference to parent Game instance for scene/renderer access
    
    // Background scene components
    this.bgScene = null;
    this.bgCamera = null;
    this.bgRenderer = null;
    this.bgParticles = null;
    
    // World elements
    this.mountains = [];
    this.ground = null;
    this.fireflies = [];
  }

  /**
   * Initialize background scene with particle system
   */
  initBackground() {
    this.bgScene = new THREE.Scene();
    this.bgCamera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.bgRenderer = new THREE.WebGLRenderer({
      canvas: this.game.bgCanvas,
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

  /**
   * Animate background particles
   */
  animateBackground() {
    requestAnimationFrame(() => this.animateBackground());
    if (this.bgParticles) {
      this.bgParticles.rotation.y += 0.0005;
      this.bgParticles.rotation.x += 0.0002;
    }
    this.bgRenderer.render(this.bgScene, this.bgCamera);
  }

  /**
   * Setup scene lighting
   */
  setupLights() {
    // High Ambient light to ensure visibility (Non-PBR workaround)
    this.game.scene.add(new THREE.AmbientLight(0xffffff, 2.2));

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
    this.game.scene.add(sun);

    // Stronger interior fill light
    const fillLight = new THREE.PointLight(0xffffff, 1.5, 150);
    fillLight.position.set(0, 30, 0);
    this.game.scene.add(fillLight);
  }

  /**
   * Setup ground plane with slight noise
   */
  setupGround() {
    const size = this.game.MAZE_SIZE * this.game.CELL_SIZE + 200;
    const geo = new THREE.PlaneGeometry(size, size, 100, 100);
    const verts = geo.attributes.position.array;
    for (let i = 0; i < verts.length; i += 3) {
      if (
        Math.abs(verts[i]) < (this.game.MAZE_SIZE * this.game.CELL_SIZE) / 2 &&
        Math.abs(verts[i + 1]) < (this.game.MAZE_SIZE * this.game.CELL_SIZE) / 2
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
    this.game.scene.add(this.ground);

    // Add distant mountains
    this.createMountains();
  }

  /**
   * Create realistic mountain terrain surrounding the maze
   * Uses procedural noise for jagged, dramatic peaks like real mountains
   */
  createMountains() {
    this.mountains = [];

    const baseDistance = 60 + (this.game.MAZE_SIZE * this.game.CELL_SIZE) / 2;

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

    this.game.scene.add(terrain);
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

      this.game.scene.add(spire);
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

  /**
   * Create fireflies decorative entities
   */
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
      this.game.scene.add(f);
      this.fireflies.push(f);
    }
  }

  /**
   * Generate maze using recursive backtracker
   */
  generateMaze() {
    return MazeGenerator.generate(this.game.MAZE_SIZE);
  }

  /**
   * Clean up world generator resources
   */
  dispose() {
    if (this.bgRenderer) {
      this.bgRenderer.dispose();
    }
    this.mountains.forEach((m) => {
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
    });
    this.mountains = [];
    
    if (this.ground) {
      if (this.ground.geometry) this.ground.geometry.dispose();
      if (this.ground.material) this.ground.material.dispose();
    }
    
    this.fireflies.forEach((f) => {
      this.game.scene.remove(f);
      if (f.geometry) f.geometry.dispose();
    });
    this.fireflies = [];
  }
}
