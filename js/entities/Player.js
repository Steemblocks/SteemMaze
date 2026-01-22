/**
 * Player Entity Class
 * Handles player avatar creation, animation, and visual effects
 *
 * Features:
 * - Humanoid 3D model with head, torso, arms, and legs
 * - Walking animation with leg/arm swing
 * - Idle breathing animation
 * - Direction facing based on movement
 * - Color effects for potions and power-ups
 */

import * as THREE from "three";

export class Player {
  constructor(scene, cellSize) {
    this.scene = scene;
    this.cellSize = cellSize;

    // Animation state
    this.animationTime = 0;
    this.isWalking = false;
    this.walkDirection = { x: 0, z: 0 };
    this.targetRotation = 0;
    this.currentRotation = 0;

    // Body parts references for animation
    this.head = null;
    this.torso = null;
    this.leftArm = null;
    this.rightArm = null;
    this.leftLeg = null;
    this.rightLeg = null;

    // Material reference for color changes
    this.bodyMaterial = null;

    // Create the mesh
    this.mesh = this.createMesh();
  }

  /**
   * Create the humanoid player mesh
   */
  createMesh() {
    const group = new THREE.Group();

    // Material for the player body - human skin tone
    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xffdbac, // Natural skin tone (peach)
      emissive: 0x000000, // No glow
      emissiveIntensity: 0.0,
      metalness: 0.1,
      roughness: 0.7,
    });

    // Head - sphere
    const headGeo = new THREE.SphereGeometry(0.22, 16, 16);
    this.head = new THREE.Mesh(headGeo, this.bodyMaterial);
    this.head.position.y = 1.55;
    this.head.castShadow = true;
    group.add(this.head);

    // Neck
    const neckGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.15, 8);
    const neck = new THREE.Mesh(neckGeo, this.bodyMaterial);
    neck.position.y = 1.35;
    neck.castShadow = true;
    group.add(neck);

    // Torso - tapered cylinder
    const torsoGeo = new THREE.CylinderGeometry(0.2, 0.16, 0.5, 12);
    this.torso = new THREE.Mesh(torsoGeo, this.bodyMaterial);
    this.torso.position.y = 1.0;
    this.torso.castShadow = true;
    group.add(this.torso);

    // Hips
    const hipsGeo = new THREE.CylinderGeometry(0.16, 0.14, 0.2, 12);
    const hips = new THREE.Mesh(hipsGeo, this.bodyMaterial);
    hips.position.y = 0.65;
    hips.castShadow = true;
    group.add(hips);

    // Left Leg (with pivot point at top for animation)
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.08, 0.55, 0);
    const legGeo = new THREE.CylinderGeometry(0.07, 0.05, 0.5, 8);
    this.leftLeg = new THREE.Mesh(legGeo, this.bodyMaterial);
    this.leftLeg.position.y = -0.25; // Offset from pivot
    this.leftLeg.castShadow = true;
    leftLegPivot.add(this.leftLeg);
    group.add(leftLegPivot);
    this.leftLegPivot = leftLegPivot;

    // Left Foot
    const footGeo = new THREE.BoxGeometry(0.1, 0.06, 0.15);
    const leftFoot = new THREE.Mesh(footGeo, this.bodyMaterial);
    leftFoot.position.set(0, -0.52, 0.02);
    leftFoot.castShadow = true;
    leftLegPivot.add(leftFoot);

    // Right Leg
    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.08, 0.55, 0);
    this.rightLeg = new THREE.Mesh(legGeo, this.bodyMaterial);
    this.rightLeg.position.y = -0.25;
    this.rightLeg.castShadow = true;
    rightLegPivot.add(this.rightLeg);
    group.add(rightLegPivot);
    this.rightLegPivot = rightLegPivot;

    // Right Foot
    const rightFoot = new THREE.Mesh(footGeo, this.bodyMaterial);
    rightFoot.position.set(0, -0.52, 0.02);
    rightFoot.castShadow = true;
    rightLegPivot.add(rightFoot);

    // Left Arm (with pivot at shoulder)
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.28, 1.2, 0);
    const armGeo = new THREE.CylinderGeometry(0.045, 0.035, 0.35, 8);
    this.leftArm = new THREE.Mesh(armGeo, this.bodyMaterial);
    this.leftArm.position.y = -0.18;
    this.leftArm.castShadow = true;
    leftArmPivot.add(this.leftArm);
    group.add(leftArmPivot);
    this.leftArmPivot = leftArmPivot;

    // Left Hand
    const handGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const leftHand = new THREE.Mesh(handGeo, this.bodyMaterial);
    leftHand.position.set(0, -0.38, 0);
    leftHand.castShadow = true;
    leftArmPivot.add(leftHand);

    // Right Arm
    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.28, 1.2, 0);
    this.rightArm = new THREE.Mesh(armGeo, this.bodyMaterial);
    this.rightArm.position.y = -0.18;
    this.rightArm.castShadow = true;
    rightArmPivot.add(this.rightArm);
    group.add(rightArmPivot);
    this.rightArmPivot = rightArmPivot;

    // Right Hand
    const rightHand = new THREE.Mesh(handGeo, this.bodyMaterial);
    rightHand.position.set(0, -0.38, 0);
    rightHand.castShadow = true;
    rightArmPivot.add(rightHand);

    // No lights attached to player - rely on scene lighting for natural appearance
    this.playerLight = null;

    // Ground halo ring - subtle white/cyan glow
    const haloGeo = new THREE.RingGeometry(0.4, 0.5, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x88ddff, // Light cyan/blue
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.02;
    group.add(halo);
    this.halo = halo;

    // Store material reference on group for compatibility
    group.material = this.bodyMaterial;

    // Scale up the player for better visibility
    group.scale.setScalar(1.5);

    return group;
  }

  /**
   * Add player to scene
   */
  addToScene() {
    this.scene.add(this.mesh);
  }

  /**
   * Update player position on the grid
   */
  setPosition(x, y, z) {
    this.mesh.position.set(x, y, z);
  }

  /**
   * Start walking animation in a direction
   */
  startWalking(dx, dz) {
    this.isWalking = true;
    this.walkDirection = { x: dx, z: dz };

    // Calculate target rotation based on movement direction
    if (dx !== 0 || dz !== 0) {
      this.targetRotation = Math.atan2(dx, dz);
    }
  }

  /**
   * Stop walking animation
   */
  stopWalking() {
    this.isWalking = false;
  }

  /**
   * Update animation frame
   * Call this every frame from the game loop
   */
  update(deltaTime = 0.016) {
    this.animationTime += deltaTime;

    // Smooth rotation towards target
    const rotationSpeed = 10 * deltaTime;
    const rotationDiff = this.targetRotation - this.currentRotation;

    // Normalize angle difference
    let normalizedDiff = rotationDiff;
    while (normalizedDiff > Math.PI) normalizedDiff -= Math.PI * 2;
    while (normalizedDiff < -Math.PI) normalizedDiff += Math.PI * 2;

    this.currentRotation += normalizedDiff * rotationSpeed;
    this.mesh.rotation.y = this.currentRotation;

    if (this.isWalking) {
      this.animateWalk();
    } else {
      this.animateIdle();
    }
  }

  /**
   * Walking animation - leg and arm swing
   */
  animateWalk() {
    const walkSpeed = 12; // Cycles per second
    const legSwing = Math.sin(this.animationTime * walkSpeed) * 0.5;
    const armSwing = Math.sin(this.animationTime * walkSpeed) * 0.4;

    // Legs swing opposite to each other
    if (this.leftLegPivot) {
      this.leftLegPivot.rotation.x = legSwing;
    }
    if (this.rightLegPivot) {
      this.rightLegPivot.rotation.x = -legSwing;
    }

    // Arms swing opposite to legs
    if (this.leftArmPivot) {
      this.leftArmPivot.rotation.x = -armSwing;
    }
    if (this.rightArmPivot) {
      this.rightArmPivot.rotation.x = armSwing;
    }

    // Subtle torso rotation
    if (this.torso) {
      this.torso.rotation.y = Math.sin(this.animationTime * walkSpeed) * 0.05;
    }

    // Head slight bob
    if (this.head) {
      this.head.position.y =
        1.55 + Math.abs(Math.sin(this.animationTime * walkSpeed * 2)) * 0.02;
    }
  }

  /**
   * Idle animation - subtle breathing
   */
  animateIdle() {
    const breathSpeed = 2; // Slow breathing
    const breathAmount = Math.sin(this.animationTime * breathSpeed) * 0.015;

    // Reset leg positions smoothly
    if (this.leftLegPivot) {
      this.leftLegPivot.rotation.x *= 0.9;
    }
    if (this.rightLegPivot) {
      this.rightLegPivot.rotation.x *= 0.9;
    }

    // Arms at rest with slight sway
    if (this.leftArmPivot) {
      this.leftArmPivot.rotation.x *= 0.9;
      this.leftArmPivot.rotation.z = 0.1 + breathAmount;
    }
    if (this.rightArmPivot) {
      this.rightArmPivot.rotation.x *= 0.9;
      this.rightArmPivot.rotation.z = -0.1 - breathAmount;
    }

    // Torso breathing
    if (this.torso) {
      this.torso.scale.y = 1 + breathAmount;
      this.torso.scale.x = 1 - breathAmount * 0.5;
      this.torso.rotation.y *= 0.95; // Return to center
    }

    // Head slight movement
    if (this.head) {
      this.head.position.y = 1.55 + breathAmount * 0.5;
    }
  }

  /**
   * Set player color (for potions, power-ups, etc.)
   */
  setColor(color, emissiveIntensity = 0.2) {
    if (this.bodyMaterial) {
      this.bodyMaterial.color.setHex(color);
      this.bodyMaterial.emissive.setHex(color);
      this.bodyMaterial.emissiveIntensity = emissiveIntensity;
    }
    if (this.playerLight) {
      this.playerLight.color.setHex(color);
    }
    if (this.halo) {
      this.halo.material.color.setHex(color);
    }
  }

  /**
   * Reset to default skin color
   */
  resetColor() {
    if (this.bodyMaterial) {
      this.bodyMaterial.color.setHex(0xffdbac); // Skin tone
      this.bodyMaterial.emissive.setHex(0x000000);
      this.bodyMaterial.emissiveIntensity = 0.0;
    }
    if (this.playerLight) {
      this.playerLight.color.setHex(0xffffff);
    }
    if (this.halo) {
      this.halo.material.color.setHex(0x88ddff);
    }
  }

  /**
   * Activate potion effect (purple glow)
   */
  activatePotionEffect() {
    this.setColor(0xff00ff, 1.5);
  }

  /**
   * Activate light boost effect (golden glow)
   */
  activateLightBoostEffect() {
    this.setColor(0xffd700, 0.8);
  }

  /**
   * Activate shield effect (blue)
   */
  activateShieldEffect() {
    this.setColor(0x3b82f6, 0.6);
  }

  /**
   * Activate speed boost effect (yellow)
   */
  activateSpeedEffect() {
    this.setColor(0xfbbf24, 0.5);
  }

  /**
   * Play hit burst effect when player is bitten by zombie
   * Creates a dramatic red particle explosion similar to zombie death
   */
  playHitBurst() {
    if (!this.mesh) return;

    const position = this.mesh.position.clone();
    const particleCount = 30;
    const particles = [];

    // Blood/damage colors - red tones
    const colors = [0xff0000, 0xcc0000, 0x990000, 0xff3333, 0xdd2222];

    for (let i = 0; i < particleCount; i++) {
      // Random particle size
      const size = 0.06 + Math.random() * 0.12;
      const geo = new THREE.SphereGeometry(size, 6, 6);

      // Random color from blood palette
      const color = colors[Math.floor(Math.random() * colors.length)];
      const mat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 1.0,
      });

      const particle = new THREE.Mesh(geo, mat);

      // Start at player center position
      particle.position.copy(position);
      particle.position.y += 1.0 + Math.random() * 0.5;

      // Random velocity - exploding outward faster than zombie
      particle.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        0.15 + Math.random() * 0.35,
        (Math.random() - 0.5) * 0.5
      );

      particle.userData.gravity = -0.018;
      particle.userData.life = 1.0;
      particle.userData.decay = 0.025 + Math.random() * 0.02;

      this.scene.add(particle);
      particles.push(particle);
    }

    // Animate particles
    const animateParticles = () => {
      let activeCount = 0;

      particles.forEach((p) => {
        if (p.userData.life <= 0) return;

        // Apply velocity
        p.position.add(p.userData.velocity);

        // Apply gravity
        p.userData.velocity.y += p.userData.gravity;

        // Decay life and opacity
        p.userData.life -= p.userData.decay;
        p.material.opacity = Math.max(0, p.userData.life);

        // Shrink as it fades
        const scale = Math.max(0.1, p.userData.life);
        p.scale.setScalar(scale);

        if (p.userData.life > 0) {
          activeCount++;
        }
      });

      if (activeCount > 0) {
        requestAnimationFrame(animateParticles);
      } else {
        // Cleanup particles
        particles.forEach((p) => {
          this.scene.remove(p);
          p.geometry.dispose();
          p.material.dispose();
        });
      }
    };

    // Start animation
    requestAnimationFrame(animateParticles);

    // Add a quick red flash at hit point
    const flash = new THREE.PointLight(0xff0000, 4, 10);
    flash.position.copy(position);
    flash.position.y += 1.5;
    this.scene.add(flash);

    // Fade out flash
    let flashIntensity = 4;
    const fadeFlash = () => {
      flashIntensity -= 0.2;
      if (flashIntensity > 0) {
        flash.intensity = flashIntensity;
        requestAnimationFrame(fadeFlash);
      } else {
        this.scene.remove(flash);
      }
    };
    requestAnimationFrame(fadeFlash);

    // Brief red tint on player
    const originalColor = this.bodyMaterial.color.getHex();
    const originalEmissive = this.bodyMaterial.emissive.getHex();
    const originalEmissiveIntensity = this.bodyMaterial.emissiveIntensity;

    this.bodyMaterial.color.setHex(0xff3333);
    this.bodyMaterial.emissive.setHex(0xff0000);
    this.bodyMaterial.emissiveIntensity = 1.0;

    // Reset color after brief flash
    setTimeout(() => {
      this.bodyMaterial.color.setHex(originalColor);
      this.bodyMaterial.emissive.setHex(originalEmissive);
      this.bodyMaterial.emissiveIntensity = originalEmissiveIntensity;
    }, 200);
  }

  /**
   * Play death burst effect when player dies (final hit)
   * More dramatic than regular hit burst - bigger explosion, more particles
   */
  playDeathBurst() {
    if (!this.mesh) return;

    const position = this.mesh.position.clone();
    const particleCount = 50; // More particles for death
    const particles = [];

    // Darker blood/death colors
    const colors = [0xff0000, 0xcc0000, 0x880000, 0x660000, 0xff2222, 0xaa0000];

    for (let i = 0; i < particleCount; i++) {
      // Larger particle sizes for more dramatic effect
      const size = 0.08 + Math.random() * 0.18;
      const geo = new THREE.SphereGeometry(size, 6, 6);

      // Random color from death palette
      const color = colors[Math.floor(Math.random() * colors.length)];
      const mat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 1.0,
      });

      const particle = new THREE.Mesh(geo, mat);

      // Start at player center position
      particle.position.copy(position);
      particle.position.y += 0.8 + Math.random() * 0.8;

      // Random velocity - bigger explosion, higher velocity
      particle.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.7,
        0.2 + Math.random() * 0.4,
        (Math.random() - 0.5) * 0.7
      );

      particle.userData.gravity = -0.012; // Slower gravity for longer hang time
      particle.userData.life = 1.0;
      particle.userData.decay = 0.015 + Math.random() * 0.015; // Slower decay

      this.scene.add(particle);
      particles.push(particle);
    }

    // Animate particles
    const animateParticles = () => {
      let activeCount = 0;

      particles.forEach((p) => {
        if (p.userData.life <= 0) return;

        // Apply velocity
        p.position.add(p.userData.velocity);

        // Apply gravity
        p.userData.velocity.y += p.userData.gravity;

        // Decay life and opacity
        p.userData.life -= p.userData.decay;
        p.material.opacity = Math.max(0, p.userData.life);

        // Shrink as it fades
        const scale = Math.max(0.1, p.userData.life);
        p.scale.setScalar(scale);

        if (p.userData.life > 0) {
          activeCount++;
        }
      });

      if (activeCount > 0) {
        requestAnimationFrame(animateParticles);
      } else {
        // Cleanup particles
        particles.forEach((p) => {
          this.scene.remove(p);
          p.geometry.dispose();
          p.material.dispose();
        });
      }
    };

    // Start animation
    requestAnimationFrame(animateParticles);

    // Add a stronger, lingering red flash
    const flash = new THREE.PointLight(0xff0000, 6, 15);
    flash.position.copy(position);
    flash.position.y += 1.5;
    this.scene.add(flash);

    // Slower fade for death flash
    let flashIntensity = 6;
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

    // Make player turn red and fade
    this.bodyMaterial.color.setHex(0xff0000);
    this.bodyMaterial.emissive.setHex(0xff0000);
    this.bodyMaterial.emissiveIntensity = 1.5;
    this.bodyMaterial.transparent = true;

    // Fade out player
    let opacity = 1.0;
    const fadePlayer = () => {
      opacity -= 0.05;
      if (opacity > 0) {
        this.bodyMaterial.opacity = opacity;
        requestAnimationFrame(fadePlayer);
      }
    };
    requestAnimationFrame(fadePlayer);
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    this.mesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    this.scene.remove(this.mesh);
  }
}
