import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

export class EnvironmentManager {
  constructor(scene) {
    this.scene = scene;
    this.smallModels = [];
    this.largeModels = []; // For mountains
    this.instances = [];
    this.clouds = [];
    this.isLoaded = false;

    this.init();
  }

  async init() {
    if (this.isLoaded) return;

    try {
      // 1. Cloud Texture (Procedural)
      this.cloudTexture = this.createCloudTexture();
      this.cloudMaterialBase = new THREE.SpriteMaterial({
        map: this.cloudTexture,
        transparent: true,
        opacity: 0.3,
        color: 0xcccccc, // Misty grey
        depthWrite: false,
        blending: THREE.NormalBlending, // Soft blend
      });

      // 2. Rock Texture
      const textureLoader = new THREE.TextureLoader();
      const texture = await new Promise((resolve) =>
        textureLoader.load("/models/environment/texture.png", resolve),
      );

      const loader = new FBXLoader();

      // 3. Load Small/Mid Stones
      const smallFiles = [
        "Stone_mid_001.fbx",
        "Stone_mid_002.fbx",
        "Stone_lit_001.fbx",
        "Stone_lit_005.fbx",
        "Stone_mid_005.fbx",
        "Stone_lit_002.fbx",
      ];

      // 4. Load Big Stones
      const bigFiles = [
        "Stone_big_001.fbx",
        "Stone_big_002.fbx",
        "Stone_big_003.fbx",
        "Stone_big_004.fbx",
        "Stone_big_005.fbx",
      ];

      const loadModel = async (file, targetArray, scaleMultiplier = 1.0) => {
        try {
          const object = await new Promise((resolve, reject) => {
            loader.load(
              `/models/environment/${file}`,
              resolve,
              undefined,
              reject,
            );
          });

          object.traverse((child) => {
            if (child.isMesh) {
              child.material = new THREE.MeshStandardMaterial({
                map: texture,
                roughness: 0.9,
                metalness: 0.1,
                color: 0x888888,
              });
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          // Normalize scale roughly
          object.scale.set(
            0.05 * scaleMultiplier,
            0.05 * scaleMultiplier,
            0.05 * scaleMultiplier,
          );
          targetArray.push(object);
        } catch (e) {
          console.error(`Failed to load ${file}`, e);
        }
      };

      await Promise.all([
        ...smallFiles.map((f) => loadModel(f, this.smallModels, 1.0)),
        ...bigFiles.map((f) => loadModel(f, this.largeModels, 1.0)),
      ]);

      this.isLoaded = true;
    } catch (error) {
      console.warn("Failed to load environment assets:", error);
    }
  }

  createCloudTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.8)");
    gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.2)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }

  generate(mazeSize, cellSize) {
    this.clear();

    if (!this.isLoaded) {
      if (!this.isLoaded)
        setTimeout(() => this.generate(mazeSize, cellSize), 1000);
      return;
    }

    const mapWidthWorld = mazeSize * cellSize;

    // 1. NEAR BORDER ROCKS (Square perimeter)
    this.scatterBorder({
      models: this.smallModels,
      count: Math.floor(mazeSize * 25), // High density
      mazeWidth: mapWidthWorld,
      safeDist: 8,
      margin: 20,
      scaleRange: [0.2, 0.5], // Tiny
      yRange: [-0.1, 0.2],
    });

    // 2. FAR FIELD ROCKS (Circular)
    const cornerDist = Math.sqrt(2 * Math.pow(mapWidthWorld / 2, 2));
    const farStartRadius = cornerDist + 30;

    this.scatterRing({
      models: this.smallModels,
      count: 450,
      minDist: farStartRadius,
      maxDist: 300,
      scaleRange: [1.2, 2.5],
      yRange: [-1, 2],
    });

    // 3. MOUNTAINS + CLOUDS (Circular)
    this.scatterRing({
      models: this.largeModels,
      count: 120,
      minDist: 350,
      maxDist: 700,
      scaleRange: [5.0, 12.0],
      yRange: [-5, 10],
      spawnClouds: true, // Feature flag for clouds
    });
  }

  scatterBorder(options) {
    if (!options.models || options.models.length === 0) return;

    const halfWidth = options.mazeWidth / 2;

    for (let i = 0; i < options.count; i++) {
      const model =
        options.models[
          Math.floor(Math.random() * options.models.length)
        ].clone();

      const side = Math.floor(Math.random() * 4);
      const offset =
        (Math.random() - 0.5) * (options.mazeWidth + options.margin);
      const depth = options.safeDist + Math.random() * options.margin;

      let x, z;
      switch (side) {
        case 0:
          z = -halfWidth - depth;
          x = offset;
          break;
        case 1:
          z = halfWidth + depth;
          x = offset;
          break;
        case 2:
          x = -halfWidth - depth;
          z = offset;
          break;
        case 3:
          x = halfWidth + depth;
          z = offset;
          break;
      }

      const y =
        options.yRange[0] +
        Math.random() * (options.yRange[1] - options.yRange[0]);
      model.position.set(x, y, z);
      model.rotation.set(
        Math.random() * 0.5,
        Math.random() * Math.PI * 2,
        Math.random() * 0.5,
      );

      const scale =
        options.scaleRange[0] +
        Math.random() * (options.scaleRange[1] - options.scaleRange[0]);
      model.scale.multiplyScalar(scale);

      this.scene.add(model);
      this.instances.push(model);
    }
  }

  scatterRing(options) {
    if (!options.models || options.models.length === 0) return;

    const center = 0;
    for (let i = 0; i < options.count; i++) {
      const model =
        options.models[
          Math.floor(Math.random() * options.models.length)
        ].clone();

      const angle = Math.random() * Math.PI * 2;
      const dist =
        options.minDist + Math.random() * (options.maxDist - options.minDist);

      const x = center + Math.cos(angle) * dist;
      const z = center + Math.sin(angle) * dist;

      const y =
        options.yRange[0] +
        Math.random() * (options.yRange[1] - options.yRange[0]);

      model.position.set(x, y, z);
      model.rotation.set(
        Math.random() * 0.5,
        Math.random() * Math.PI * 2,
        Math.random() * 0.5,
      );

      const scale =
        options.scaleRange[0] +
        Math.random() * (options.scaleRange[1] - options.scaleRange[0]);
      model.scale.multiplyScalar(scale);

      this.scene.add(model);
      this.instances.push(model);

      // Spawn Clouds if requested
      if (options.spawnClouds) {
        const cloud = new THREE.Sprite(this.cloudMaterialBase.clone());
        // Position cloud above mountain
        cloud.position.copy(model.position);
        cloud.position.y += 10 + Math.random() * 10;

        // Random large scale
        const cloudScale = 30 + Math.random() * 30;
        cloud.scale.set(cloudScale, cloudScale * 0.6, 1);

        this.scene.add(cloud);
        this.instances.push(cloud);
        this.clouds.push({
          sprite: cloud,
          baseY: cloud.position.y,
          speed: 0.5 + Math.random(),
          offset: Math.random() * 100,
        });
      }
    }
  }

  update() {
    const time = performance.now() / 1000;
    this.clouds.forEach((c) => {
      // Bob up and down lightly
      c.sprite.position.y = c.baseY + Math.sin(time * c.speed + c.offset) * 2;
      // Slowly fade opacity? No, material rotation isn't per-instance unless cloned.
      // Since I cloned it above, I can rotate!
      c.sprite.material.rotation += 0.001 * c.speed;
    });
  }

  clear() {
    this.instances.forEach((mesh) => {
      // Dispose geometry/material if needed, but for now just remove from scene
      if (mesh.isSprite) {
        mesh.material.dispose();
      }
      this.scene.remove(mesh);
    });
    this.instances = [];
    this.clouds = [];
  }
}
