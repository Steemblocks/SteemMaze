/**
 * Advanced Camera Controller
 * Provides multiple camera modes, dynamic zoom, look-ahead, and cinematic effects
 */

import * as THREE from "three";

export const CameraMode = {
  CHASE: "chase", // Standard follow camera with momentum
  CINEMATIC: "cinematic", // Dramatic angles during events
  BIRDS_EYE: "birdsEye", // Top-down overview
  DYNAMIC: "dynamic", // Auto-switches based on gameplay
  FIRST_PERSON: "firstPerson", // Close follow (experimental)
};

export class CameraController {
  constructor(camera, gameData) {
    this.camera = camera;
    this.gameData = gameData;

    // Camera state
    this.mode = CameraMode.DYNAMIC;
    this.targetPosition = new THREE.Vector3();
    this.targetLookAt = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();
    this.velocity = new THREE.Vector3();

    // Dynamic zoom parameters
    this.currentZoom = 1.0;
    this.targetZoom = 1.0;
    this.minZoom = 0.6; // Closer view
    this.maxZoom = 1.8; // Farther view

    // Look-ahead parameters
    this.lookAheadDistance = 5;
    this.lookAheadSmoothing = 0.1;
    this.lastPlayerDirection = new THREE.Vector2(0, 0);
    this.lookAheadOffset = new THREE.Vector3();

    // Momentum and inertia
    this.momentum = new THREE.Vector3();
    this.momentumDecay = 0.5; // Was 0.85 - faster stop (less slide)
    this.playerVelocity = new THREE.Vector3();

    // Camera shake
    this.shakeIntensity = 0;
    this.shakeDuration = 0;
    this.shakeOffset = new THREE.Vector3();

    // Orbital parameters (for cinematic mode)
    this.orbitAngle = 0;
    this.orbitRadius = 15;
    this.orbitSpeed = 0.002;
    this.orbitHeight = 12;

    // Dynamic height based on action
    this.baseHeight = 22;
    this.currentHeight = 22;
    this.targetHeight = 22;

    // Transition handling
    this.isTransitioning = false;
    this.transitionProgress = 0;
    this.transitionDuration = 1.0; // seconds
    this.previousMode = null;

    // Player tracking
    this.playerPosition = new THREE.Vector3();
    this.lastPlayerPosition = new THREE.Vector3();
    this.playerMovementSpeed = 0;

    // Time tracking
    this.lastTime = performance.now();
    this.deltaTime = 0;

    // Mode-specific settings
    this.modeSettings = {
      [CameraMode.CHASE]: {
        height: 40, // High altitude for 2D view
        distance: 0.1, // Almost perfectly top-down (0 would break LookAt)
        speed: 0.5, // Very responsive
        fov: 60, // Flatter field of view
        lookAhead: 0, // No tilting - strict 2D feel
      },
      [CameraMode.CINEMATIC]: {
        height: 18,
        distance: 20,
        speed: 0.03,
        fov: 60,
        lookAhead: 8,
      },
      [CameraMode.BIRDS_EYE]: {
        height: 45,
        distance: 1,
        speed: 0.15,
        fov: 70,
        lookAhead: 0,
      },
      [CameraMode.DYNAMIC]: {
        height: 40,
        distance: 0.1,
        speed: 0.5,
        fov: 60,
        lookAhead: 0,
      },
      [CameraMode.FIRST_PERSON]: {
        height: 3,
        distance: 2,
        speed: 0.2,
        fov: 85,
        lookAhead: 10,
      },
    };

    // Event triggers for dynamic mode
    this.eventState = {
      isCollecting: false,
      isUnderAttack: false,
      nearGoal: false,
      inCombat: false,
      highCombo: false,
    };
  }

  /**
   * Set camera mode with smooth transition
   */
  setMode(newMode, instant = false) {
    if (this.mode === newMode && !instant) return;

    this.previousMode = this.mode;
    this.mode = newMode;

    if (instant) {
      this.isTransitioning = false;
      this.applyModeSettings(newMode);
    } else {
      this.isTransitioning = true;
      this.transitionProgress = 0;
    }
  }

  /**
   * Apply settings for a specific mode
   */
  applyModeSettings(mode) {
    const settings = this.modeSettings[mode];
    if (!settings) return;

    this.targetHeight = settings.height;
    this.lookAheadDistance = settings.lookAhead;

    // Smooth FOV transition
    if (this.camera.fov !== settings.fov) {
      this.camera.fov = settings.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Update player position for tracking
   */
  setPlayerPosition(position) {
    this.lastPlayerPosition.copy(this.playerPosition);
    this.playerPosition.copy(position);

    // Calculate player movement velocity
    this.playerVelocity.subVectors(
      this.playerPosition,
      this.lastPlayerPosition,
    );
    this.playerMovementSpeed = this.playerVelocity.length();
  }

  /**
   * Set player movement direction for look-ahead
   */
  setPlayerDirection(dx, dz) {
    if (dx !== 0 || dz !== 0) {
      // Smooth the direction change
      const targetDir = new THREE.Vector2(dx, dz).normalize();
      this.lastPlayerDirection.lerp(targetDir, 0.3);
    }
  }

  /**
   * Trigger camera shake
   */
  shake(intensity = 1.0, duration = 0.3) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeDuration = Math.max(this.shakeDuration, duration);
  }

  /**
   * Trigger dynamic zoom
   */
  zoomTo(factor, duration = 0.5) {
    this.targetZoom = THREE.MathUtils.clamp(factor, this.minZoom, this.maxZoom);
  }

  /**
   * Update event states for dynamic camera
   */
  updateEventState(events) {
    Object.assign(this.eventState, events);
  }

  /**
   * Get dynamic camera adjustments based on game state
   */
  getDynamicAdjustments() {
    let heightOffset = 0;
    let zoomFactor = 1.0;
    let speedMultiplier = 1.0;

    // Zoom out when near goal for dramatic effect
    if (this.eventState.nearGoal) {
      heightOffset -= 3;
      zoomFactor = 0.85;
      speedMultiplier = 0.7;
    }

    // Zoom in during combat
    if (this.eventState.isUnderAttack || this.eventState.inCombat) {
      heightOffset -= 2;
      zoomFactor = 1.15;
      speedMultiplier = 1.3;
    }

    // Pull back for overview on high combo
    if (this.eventState.highCombo) {
      heightOffset += 2;
      zoomFactor = 0.9;
    }

    // Quick pulse on collecting items
    if (this.eventState.isCollecting) {
      zoomFactor *= 0.95;
    }

    return { heightOffset, zoomFactor, speedMultiplier };
  }

  /**
   * Update camera shake effect
   */
  updateShake(dt) {
    if (this.shakeDuration > 0) {
      const intensity = this.shakeIntensity * (this.shakeDuration / 0.3);
      this.shakeOffset.set(
        (Math.random() - 0.5) * intensity,
        (Math.random() - 0.5) * intensity * 0.5,
        (Math.random() - 0.5) * intensity,
      );
      this.shakeDuration -= dt;
      this.shakeIntensity *= 0.92;
    } else {
      this.shakeOffset.set(0, 0, 0);
      this.shakeIntensity = 0;
    }
  }

  /**
   * Calculate look-ahead offset based on movement direction
   */
  calculateLookAhead() {
    const lookAheadX = this.lastPlayerDirection.x * this.lookAheadDistance;
    const lookAheadZ = this.lastPlayerDirection.y * this.lookAheadDistance;

    // Smoothly interpolate look-ahead offset
    this.lookAheadOffset.x +=
      (lookAheadX - this.lookAheadOffset.x) * this.lookAheadSmoothing;
    this.lookAheadOffset.z +=
      (lookAheadZ - this.lookAheadOffset.z) * this.lookAheadSmoothing;
  }

  /**
   * Get camera position for Chase mode
   */
  getChasePosition(mouseOffset = { x: 0, y: 0 }) {
    const settings = this.modeSettings[CameraMode.CHASE];
    this.calculateLookAhead();

    return new THREE.Vector3(
      this.playerPosition.x + mouseOffset.x * 2 - this.lookAheadOffset.x * 0.3,
      this.currentHeight,
      this.playerPosition.z +
        settings.distance +
        mouseOffset.y * 2 -
        this.lookAheadOffset.z * 0.3,
    );
  }

  /**
   * Get camera position for Cinematic mode (orbiting)
   */
  getCinematicPosition() {
    this.orbitAngle += this.orbitSpeed * this.deltaTime * 60;

    return new THREE.Vector3(
      this.playerPosition.x + Math.sin(this.orbitAngle) * this.orbitRadius,
      this.orbitHeight,
      this.playerPosition.z + Math.cos(this.orbitAngle) * this.orbitRadius,
    );
  }

  /**
   * Get camera position for Bird's Eye mode
   */
  getBirdsEyePosition() {
    return new THREE.Vector3(
      this.playerPosition.x,
      this.modeSettings[CameraMode.BIRDS_EYE].height,
      this.playerPosition.z + this.modeSettings[CameraMode.BIRDS_EYE].distance,
    );
  }

  /**
   * Get camera position for First Person mode
   */
  getFirstPersonPosition() {
    this.calculateLookAhead();

    return new THREE.Vector3(
      this.playerPosition.x - this.lookAheadOffset.x * 0.1,
      this.modeSettings[CameraMode.FIRST_PERSON].height,
      this.playerPosition.z +
        this.modeSettings[CameraMode.FIRST_PERSON].distance -
        this.lookAheadOffset.z * 0.1,
    );
  }

  /**
   * Main update function - call each frame
   */
  update(mouseOffset = { x: 0, y: 0 }) {
    const now = performance.now();
    this.deltaTime = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // Update shake
    this.updateShake(this.deltaTime);

    // Handle mode transitions
    if (this.isTransitioning) {
      this.transitionProgress += this.deltaTime / this.transitionDuration;
      if (this.transitionProgress >= 1.0) {
        this.isTransitioning = false;
        this.transitionProgress = 1.0;
        this.applyModeSettings(this.mode);
      }
    }

    // Get dynamic adjustments
    const adjustments = this.getDynamicAdjustments();
    this.targetZoom = adjustments.zoomFactor;
    this.targetHeight =
      this.modeSettings[this.mode].height + adjustments.heightOffset;

    // Smooth zoom transition
    this.currentZoom +=
      (this.targetZoom - this.currentZoom) * 0.1 * adjustments.speedMultiplier;
    this.currentHeight += (this.targetHeight - this.currentHeight) * 0.08;

    // Calculate target position based on mode
    let targetPos;
    switch (this.mode) {
      case CameraMode.CINEMATIC:
        targetPos = this.getCinematicPosition();
        break;
      case CameraMode.BIRDS_EYE:
        targetPos = this.getBirdsEyePosition();
        break;
      case CameraMode.FIRST_PERSON:
        targetPos = this.getFirstPersonPosition();
        break;
      case CameraMode.CHASE:
      case CameraMode.DYNAMIC:
      default:
        targetPos = this.getChasePosition(mouseOffset);
        break;
    }

    // Apply zoom factor to position
    const zoomedPos = targetPos.clone();
    zoomedPos.y *= this.currentZoom;

    // Get user-configured speed from GameData
    let userSpeedMultiplier = 1.0;
    if (this.gameData) {
      const spd = this.gameData.getSetting("cameraSpeed") || 5;
      // Map 1-10 to 0.5x - 2.0x
      userSpeedMultiplier = 0.5 + (spd - 1) * (1.5 / 9);
    }

    // Calculate smooth camera movement with momentum
    const speed =
      this.modeSettings[this.mode].speed *
      adjustments.speedMultiplier *
      userSpeedMultiplier *
      this.deltaTime *
      60;

    // RIGID LOCK: X and Z axes are locked 1:1 to target (no smoothing)
    // This prevents "view angle lag" where camera trails behind player movement.
    // We only smooth Y (height) and Zoom.
    this.camera.position.x = zoomedPos.x + this.shakeOffset.x;
    this.camera.position.z = zoomedPos.z + this.shakeOffset.z;

    // Smooth Y interpolation (Height)
    const adaptiveSpeed = Math.min(speed, 0.5); // Cap smoothing speed
    const diffY = zoomedPos.y - this.camera.position.y;
    this.camera.position.y += diffY * adaptiveSpeed * 0.5; // Smoother height
    this.camera.position.y += this.shakeOffset.y; // Add shake offset

    // Calculate and apply look-at target
    this.calculateLookAhead();

    const lookAtTarget = new THREE.Vector3(
      this.playerPosition.x + this.lookAheadOffset.x * 0.5,
      0.5, // Look at player torso level
      this.playerPosition.z + this.lookAheadOffset.z * 0.5,
    );

    // Lock LookAt X/Z instantly as well to match position
    this.currentLookAt.x = lookAtTarget.x;
    this.currentLookAt.z = lookAtTarget.z;
    // Smooth LookAt Y only
    this.currentLookAt.y += (lookAtTarget.y - this.currentLookAt.y) * 0.1;

    this.camera.lookAt(this.currentLookAt);

    return {
      position: this.camera.position.clone(),
      lookAt: this.currentLookAt.clone(),
      zoom: this.currentZoom,
      mode: this.mode,
    };
  }

  /**
   * Reset camera to default state
   */
  reset() {
    this.mode = CameraMode.DYNAMIC;
    this.currentZoom = 1.0;
    this.targetZoom = 1.0;
    this.momentum.set(0, 0, 0);
    this.shakeIntensity = 0;
    this.shakeDuration = 0;
    this.shakeOffset.set(0, 0, 0);
    this.lookAheadOffset.set(0, 0, 0);
    this.lastPlayerDirection.set(0, 0);
    this.applyModeSettings(this.mode);
  }

  /**
   * Get current camera info for debugging
   */
  getDebugInfo() {
    return {
      mode: this.mode,
      zoom: this.currentZoom.toFixed(2),
      height: this.currentHeight.toFixed(1),
      shaking: this.shakeDuration > 0,
      isTransitioning: this.isTransitioning,
      playerSpeed: this.playerMovementSpeed.toFixed(3),
    };
  }
}
