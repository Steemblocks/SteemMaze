/**
 * BossZombie Entity Class
 * A larger, more powerful zombie that spawns with hordes during darkness events
 *
 * Features:
 * - 1.8x size of regular zombie
 * - Glowing red eyes
 * - Extended chase range
 * - Slower but more menacing
 * - Worth 50 coins when killed
 */

import * as THREE from "three";
import { GameRules } from "../core/GameRules.js";

export class BossZombie {
  constructor(x, z, maze, cellSize, mazeSize, scene, level = 1) {
    this.gridX = x;
    this.gridZ = z;
    this.startX = x;
    this.startZ = z;
    this.maze = maze;
    this.cellSize = cellSize;
    this.mazeSize = mazeSize;
    this.scene = scene;
    this.level = level;

    // Boss zombie attributes
    this.isBoss = true;
    this.killReward = GameRules.BOSS_KILL_REWARD_BASE || 150;

    // Movement settings - AGGRESSIVE and FAST
    // Starts at 60 (1s), drops to 30 (0.5s) at high levels
    this.moveInterval = Math.max(60 - level * 1.5, 30);
    this.moveTimer = 0;

    // Extended chase range - can chase across entire maze
    this.chaseRange = mazeSize; // Full maze range
    this.isChasing = true; // Always chasing by default for boss
    this.chaseTarget = null;
    this.lastKnownPlayerPos = null;

    // Animation
    this.animationTime = 0;

    // Visual
    this.mesh = this.createMesh();
    this.updatePosition();
    this.isDisposed = false;
  }

  createMesh() {
    const group = new THREE.Group();

    // Boss is MASSIVE (2.2x scale)
    const scale = 2.2;

    // Rotten skin material - darker, redder/blacker
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d0000, // Dark blood red
      emissive: 0x200000,
      emissiveIntensity: 0.4, // Glowing with rage
      roughness: 0.7,
      metalness: 0.2,
    });

    // Clothing material - tattered dark
    const clothMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.95,
      metalness: 0.0,
    });

    // BODY - larger torso
    const torsoGeo = new THREE.BoxGeometry(
      0.5 * scale,
      0.7 * scale,
      0.3 * scale,
    );
    this.torso = new THREE.Mesh(torsoGeo, clothMaterial);
    this.torso.position.y = 1.0 * scale;
    this.torso.castShadow = true;
    group.add(this.torso);

    // HEAD - larger, more grotesque
    const headGeo = new THREE.SphereGeometry(0.22 * scale, 12, 12);
    this.head = new THREE.Mesh(headGeo, skinMaterial);
    this.head.position.y = 1.6 * scale;
    this.head.castShadow = true;
    group.add(this.head);

    // GLOWING RED EYES - MeshBasicMaterial doesn't support emissive
    const eyeMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
    });

    const eyeGeo = new THREE.SphereGeometry(0.05 * scale, 8, 8);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMaterial);
    leftEye.position.set(-0.08 * scale, 1.65 * scale, 0.18 * scale);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMaterial);
    rightEye.position.set(0.08 * scale, 1.65 * scale, 0.18 * scale);
    group.add(rightEye);

    // Eye glow light
    this.eyeGlow = new THREE.PointLight(0xff0000, 1, 5);
    this.eyeGlow.position.set(0, 1.6 * scale, 0.2 * scale);
    group.add(this.eyeGlow);

    // ARMS - massive
    const armGeo = new THREE.BoxGeometry(
      0.15 * scale,
      0.6 * scale,
      0.15 * scale,
    );

    this.leftArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(-0.38 * scale, 1.2 * scale, 0);
    const leftArm = new THREE.Mesh(armGeo, skinMaterial);
    leftArm.position.y = -0.3 * scale;
    leftArm.castShadow = true;
    this.leftArmPivot.add(leftArm);
    group.add(this.leftArmPivot);

    this.rightArmPivot = new THREE.Group();
    this.rightArmPivot.position.set(0.38 * scale, 1.2 * scale, 0);
    const rightArm = new THREE.Mesh(armGeo, skinMaterial);
    rightArm.position.y = -0.3 * scale;
    rightArm.castShadow = true;
    this.rightArmPivot.add(rightArm);
    group.add(this.rightArmPivot);

    // LEGS - thick and sturdy
    const legGeo = new THREE.BoxGeometry(
      0.18 * scale,
      0.7 * scale,
      0.18 * scale,
    );

    this.leftLegPivot = new THREE.Group();
    this.leftLegPivot.position.set(-0.15 * scale, 0.6 * scale, 0);
    const leftLeg = new THREE.Mesh(legGeo, clothMaterial);
    leftLeg.position.y = -0.35 * scale;
    leftLeg.castShadow = true;
    this.leftLegPivot.add(leftLeg);
    group.add(this.leftLegPivot);

    this.rightLegPivot = new THREE.Group();
    this.rightLegPivot.position.set(0.15 * scale, 0.6 * scale, 0);
    const rightLeg = new THREE.Mesh(legGeo, clothMaterial);
    rightLeg.position.y = -0.35 * scale;
    rightLeg.castShadow = true;
    this.rightLegPivot.add(rightLeg);
    group.add(this.rightLegPivot);

    // GLSL SHADER: Pulsating Dark Matter Aura
    const vertexShader = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    const fragmentShader = `
        uniform float time;
        uniform vec3 color;
        varying vec2 vUv;

        // Simplex noise function (simplified)
        vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

        float snoise(vec2 v) {
            const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
            vec2 i  = floor(v + dot(v, C.yy) );
            vec2 x0 = v - i + dot(i, C.xx);
            vec2 i1;
            i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
            vec4 x12 = x0.xyxy + C.xxzz;
            x12.xy -= i1;
            i = mod(i, 289.0);
            vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
            vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
            m = m*m ;
            m = m*m ;
            vec3 x = 2.0 * fract(p * C.www) - 1.0;
            vec3 h = abs(x) - 0.5;
            vec3 ox = floor(x + 0.5);
            vec3 a0 = x - ox;
            m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
            vec3 g;
            g.x  = a0.x  * x0.x  + h.x  * x0.y;
            g.yz = a0.yz * x12.xz + h.yz * x12.yw;
            return 130.0 * dot(m, g);
        }

        void main() {
            vec2 center = vec2(0.5, 0.5);
            float dist = distance(vUv, center);
            
            // Create a ring
            float ring = smoothstep(0.5, 0.0, dist);
            
            // Add noise swirl
            float noiseVal = snoise(vUv * 8.0 - time * 1.5);
            
            // Create fiery texture
            float fire = smoothstep(0.1, 0.9, noiseVal * ring);
            
            // Edge fade
            float alpha = fire * (1.0 - smoothstep(0.4, 0.5, dist));
            
            gl_FragColor = vec4(color, alpha * 0.8);
        }
    `;

    const auraGeo = new THREE.PlaneGeometry(3.0, 3.0);
    this.auraMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color(0xff0000) },
      },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, // Glow effect
    });

    this.aura = new THREE.Mesh(auraGeo, this.auraMaterial);
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.position.y = 0.05;
    group.add(this.aura);

    this.scene.add(group);
    return group;
  }

  updatePosition() {
    const worldX =
      this.gridX * this.cellSize -
      (this.mazeSize * this.cellSize) / 2 +
      this.cellSize / 2;
    const worldZ =
      this.gridZ * this.cellSize -
      (this.mazeSize * this.cellSize) / 2 +
      this.cellSize / 2;
    this.mesh.position.set(worldX, 0, worldZ);
  }

  setPlayerPosition(playerX, playerZ, isLightBoostActive = false) {
    const distance =
      Math.abs(playerX - this.gridX) + Math.abs(playerZ - this.gridZ);

    // Boss flees from light boost
    if (isLightBoostActive && distance <= this.chaseRange) {
      this.isChasing = false;
      this.isFleeing = true;
      this.fleeTarget = { x: playerX, z: playerZ };
      return;
    }

    this.isFleeing = false;

    // Boss always chases if player is anywhere in range
    if (distance <= this.chaseRange) {
      this.isChasing = true;
      this.chaseTarget = { x: playerX, z: playerZ };
      this.lastKnownPlayerPos = { x: playerX, z: playerZ };
    }
  }

  canMove(dx, dz) {
    const newX = this.gridX + dx;
    const newZ = this.gridZ + dz;

    if (
      newX < 0 ||
      newX >= this.mazeSize ||
      newZ < 0 ||
      newZ >= this.mazeSize
    ) {
      return false;
    }

    // Check wall properties like other entities do
    const cell = this.maze[this.gridZ]?.[this.gridX];
    if (!cell) return false;

    if (dx === 1 && cell.right) return false;
    if (dx === -1 && cell.left) return false;
    if (dz === 1 && cell.bottom) return false;
    if (dz === -1 && cell.top) return false;

    return true;
  }

  moveTowardTarget() {
    if (!this.chaseTarget) return;

    const dx = this.chaseTarget.x - this.gridX;
    const dz = this.chaseTarget.z - this.gridZ;

    // Prioritize larger difference
    let moveX = 0,
      moveZ = 0;

    if (Math.abs(dx) > Math.abs(dz)) {
      moveX = dx > 0 ? 1 : -1;
      if (!this.canMove(moveX, 0)) {
        moveX = 0;
        moveZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
      }
    } else {
      moveZ = dz > 0 ? 1 : -1;
      if (!this.canMove(0, moveZ)) {
        moveZ = 0;
        moveX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
      }
    }

    if (this.canMove(moveX, moveZ)) {
      this.gridX += moveX;
      this.gridZ += moveZ;
      this.updatePosition();

      // Face direction of movement
      if (moveX !== 0 || moveZ !== 0) {
        this.mesh.rotation.y = Math.atan2(moveX, moveZ);
      }
    }
  }

  fleeFromPlayer() {
    if (!this.fleeTarget) return;

    const dx = this.gridX - this.fleeTarget.x;
    const dz = this.gridZ - this.fleeTarget.z;

    let moveX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    let moveZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

    if (this.canMove(moveX, moveZ)) {
      this.gridX += moveX;
      this.gridZ += moveZ;
      this.updatePosition();
    } else if (this.canMove(moveX, 0)) {
      this.gridX += moveX;
      this.updatePosition();
    } else if (this.canMove(0, moveZ)) {
      this.gridZ += moveZ;
      this.updatePosition();
    }
  }

  update() {
    // Guard: Skip update if disposed
    if (this.isDisposed || !this.mesh) return;

    this.moveTimer++;
    this.animationTime += 0.016;

    if (this.moveTimer >= this.moveInterval) {
      this.moveTimer = 0;

      if (this.isFleeing) {
        this.fleeFromPlayer();
      } else if (this.isChasing) {
        this.moveTowardTarget();
      }
    }

    this.animate();
  }

  animate() {
    // Menacing slow stomp animation
    const walkSpeed = 3;
    const time = this.animationTime * walkSpeed;

    // Heavy leg stomp
    if (this.leftLegPivot) {
      this.leftLegPivot.rotation.x = Math.sin(time) * 0.3;
    }
    if (this.rightLegPivot) {
      this.rightLegPivot.rotation.x = -Math.sin(time) * 0.3;
    }

    // Arms raised menacingly
    if (this.leftArmPivot) {
      this.leftArmPivot.rotation.x = -0.8 + Math.sin(time * 0.5) * 0.2;
      this.leftArmPivot.rotation.z = 0.3;
    }
    if (this.rightArmPivot) {
      this.rightArmPivot.rotation.x = -0.8 + Math.cos(time * 0.5) * 0.2;
      this.rightArmPivot.rotation.z = -0.3;
    }

    // Torso sway
    if (this.torso) {
      this.torso.rotation.z = Math.sin(time * 0.5) * 0.05;
    }

    // Head tracking (bob slightly)
    if (this.head) {
      this.head.rotation.z = Math.sin(time) * 0.08;
    }

    // Pulsing eye glow
    if (this.eyeGlow) {
      this.eyeGlow.intensity = 0.8 + Math.sin(time * 2) * 0.4;
    }

    // GLSL Shader update
    if (this.auraMaterial) {
      this.auraMaterial.uniforms.time.value += 0.05;
    }
  }

  checkCollision(playerX, playerZ) {
    const dx = playerX - this.gridX;
    const dz = playerZ - this.gridZ;
    const dist = Math.abs(dx) + Math.abs(dz);

    // 1. Exact match
    if (dist === 0) return true;

    // 2. Adjacent match (Boss is large)
    if (dist === 1) {
      const cell = this.maze[this.gridZ]?.[this.gridX];
      if (!cell) return false;
      if (dx === 1) return !cell.right;
      if (dx === -1) return !cell.left;
      if (dz === 1) return !cell.bottom;
      if (dz === -1) return !cell.top;
    }

    return false;
  }

  explode() {
    if (!this.mesh) return;

    const position = this.mesh.position.clone();
    const particleCount = 40; // More particles for boss
    const particles = [];

    // Dark red/black gore colors for boss
    const colors = [0x8b0000, 0x4a0000, 0x2d2d2d, 0x1a0000, 0x660000];

    for (let i = 0; i < particleCount; i++) {
      const size = 0.12 + Math.random() * 0.2; // Bigger particles
      const geo = new THREE.SphereGeometry(size, 6, 6);

      const color = colors[Math.floor(Math.random() * colors.length)];
      const mat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 1.0,
      });

      const particle = new THREE.Mesh(geo, mat);
      particle.position.copy(position);
      particle.position.y += 1.2 + Math.random() * 0.8;

      particle.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        0.3 + Math.random() * 0.4,
        (Math.random() - 0.5) * 0.6,
      );

      particle.userData.gravity = -0.012;
      particle.userData.life = 1.0;
      particle.userData.decay = 0.015 + Math.random() * 0.015;

      this.scene.add(particle);
      particles.push(particle);
    }

    const animateParticles = () => {
      let activeCount = 0;

      particles.forEach((p) => {
        if (p.userData.life <= 0) return;

        p.position.add(p.userData.velocity);
        p.userData.velocity.y += p.userData.gravity;
        p.userData.life -= p.userData.decay;
        p.material.opacity = Math.max(0, p.userData.life);

        const scale = Math.max(0.1, p.userData.life);
        p.scale.setScalar(scale);

        if (p.userData.life > 0) {
          activeCount++;
        }
      });

      if (activeCount > 0) {
        requestAnimationFrame(animateParticles);
      } else {
        particles.forEach((p) => {
          this.scene.remove(p);
          p.geometry.dispose();
          p.material.dispose();
        });
      }
    };

    requestAnimationFrame(animateParticles);

    // Bigger flash for boss death
    const flash = new THREE.PointLight(0xff0000, 5, 12);
    flash.position.copy(position);
    flash.position.y += 1.5;
    this.scene.add(flash);

    let flashIntensity = 5;
    const fadeFlash = () => {
      flashIntensity -= 0.1;
      if (flashIntensity > 0) {
        flash.intensity = flashIntensity;
        requestAnimationFrame(fadeFlash);
      } else {
        this.scene.remove(flash);
      }
    };
    requestAnimationFrame(fadeFlash);
  }

  dispose() {
    this.isDisposed = true;
    if (this.mesh) {
      this.mesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.scene.remove(this.mesh);
      this.mesh = null;
    }
  }
}
