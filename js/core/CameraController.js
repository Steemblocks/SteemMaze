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
        height: 25,
        distance: 14, // Closer distance
        speed: 0.5,
        fov: 60,
        lookAhead: 0,
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
        height: 25, // Match Chase
        distance: 14, // Match Chase
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

    // Maze size scaling parameters
    this.baseSize = 15; // Base maze size for reference
    this.currentMazeSize = 15; // Current maze size
    this.mazeSizeRatio = 1.0; // Ratio for scaling (current / base)
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
      // CRITICAL: Also instantly apply height and zoom values to prevent camera jitter
      // This ensures the camera immediately uses the new mode's parameters
      this.currentHeight = this.modeSettings[newMode].height;
      this.targetHeight = this.modeSettings[newMode].height;
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
   * Update camera settings based on maze size
   * Smart scaling: as maze grows, camera pulls back proportionally
   * This maintains visual clarity while adapting to level difficulty
   */
  updateMazeSize(newMazeSize) {
    this.currentMazeSize = newMazeSize;
    this.mazeSizeRatio = newMazeSize / this.baseSize;

    // SMART SCALING FORMULA
    // Base: 15x15 maze = ratio 1.0 = base camera distance
    // Larger mazes: ratio increases, camera pulls back smoothly
    // Max scaling factor capped at 2.0 to prevent camera going too far back

    const scaleFactor = Math.min(this.mazeSizeRatio, 1.5);

    // Calculate scaled distance for all modes
    const baseDistances = {
      [CameraMode.CHASE]: 14,
      [CameraMode.CINEMATIC]: 20,
      [CameraMode.BIRDS_EYE]: 1,
      [CameraMode.DYNAMIC]: 14,
      [CameraMode.FIRST_PERSON]: 2,
    };

    const baseHeights = {
      [CameraMode.CHASE]: 25,
      [CameraMode.CINEMATIC]: 18,
      [CameraMode.BIRDS_EYE]: 45,
      [CameraMode.DYNAMIC]: 25,
      [CameraMode.FIRST_PERSON]: 3,
    };

    const baseFOVs = {
      [CameraMode.CHASE]: 60,
      [CameraMode.CINEMATIC]: 60,
      [CameraMode.BIRDS_EYE]: 70,
      [CameraMode.DYNAMIC]: 60,
      [CameraMode.FIRST_PERSON]: 85,
    };

    // Apply proportional scaling to distance and height
    // Distance scales to show larger maze
    // Height stays FIXED to prevent zoom-out feeling
    // FOV increases slightly to maintain viewing angle consistency
    for (const mode of Object.keys(baseDistances)) {
      const baseDist = baseDistances[mode];
      const baseHeight = baseHeights[mode];
      const baseFOV = baseFOVs[mode];

      // Scale distance: base + (scale - 1) * base * 0.5
      // This gives smooth progression without drastic changes
      this.modeSettings[mode].distance =
        baseDist * (1 + (scaleFactor - 1) * 0.25); // Reduced from 0.5 (Less zoom out)

      // IMPORTANT: Height remains fixed - only distance scales
      // This prevents the "zoom out" effect when leveling up
      // The viewing angle stays consistent, only the player appears smaller (correct perception)
      this.modeSettings[mode].height = baseHeight;

      // Increase FOV proportionally with distance to maintain viewing consistency
      // This compensates for the camera pulling further back
      // FOV increases by ~10% at maximum scale to keep visual perception stable
      this.modeSettings[mode].fov = baseFOV * (1 + (scaleFactor - 1) * 0.02); // Reduced from 0.08 (Less distortion)
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

    // ALL DYNAMIC ADJUSTMENTS DISABLED FOR STABILITY
    // The user prefers a steady, consistent camera without zooming/bobbing

    // Zoom out when near goal for dramatic effect
    if (this.eventState.nearGoal) {
      // heightOffset -= 3;
      // zoomFactor = 0.85;
      // speedMultiplier = 0.7;
    }

    // Zoom in during combat
    if (this.eventState.isUnderAttack || this.eventState.inCombat) {
      // heightOffset -= 2;
      // zoomFactor = 1.15;
      // speedMultiplier = 1.3;
    }

    // Pull back for overview on high combo
    if (this.eventState.highCombo) {
      // heightOffset += 2;
      // zoomFactor = 0.9;
    }

    // Quick pulse on collecting items
    if (this.eventState.isCollecting) {
      // zoomFactor *= 0.95;
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

    // Check if player is moving
    const playerVelocity = this.playerPosition
      .clone()
      .sub(this.lastPlayerPosition);
    const isPlayerMoving = playerVelocity.lengthSq() > 0.001; // Lower threshold

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

    // Get dynamic adjustments - DISABLE HEIGHT OFFSET IF MOVING to prevent bobbing
    const adjustments = this.getDynamicAdjustments();
    this.targetZoom = adjustments.zoomFactor;

    // Only apply height offset if NOT moving to keep ground plane stable
    const heightOffset = isPlayerMoving ? 0 : adjustments.heightOffset;
    this.targetHeight = this.modeSettings[this.mode].height + heightOffset;

    // Smooth zoom transition
    let speedMultiplier = adjustments.speedMultiplier;

    // Get user-configured speed
    let userSpeedMultiplier = 1.0;
    if (this.gameData) {
      const spd = this.gameData.getSetting("cameraSpeed") || 5;
      userSpeedMultiplier = 0.5 + (spd - 1) * (1.5 / 9);
    }

    this.currentZoom +=
      (this.targetZoom - this.currentZoom) * 0.1 * speedMultiplier;
    this.currentHeight += (this.targetHeight - this.currentHeight) * 0.08;

    // Calculate target position based on mode
    let targetPos;

    // Always use fluid chase logic for "Single Movie" feel
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

    // CINEMATIC SMOOTHING ("Single Movie View")
    // Instead of locking rigidly to player, we use gentle damping (lerp)
    // This allows the player to move slightly within the frame while the camera glides behind.
    // Damping factor: Lower = Smoother/Slower, Higher = Snappier
    const damping = 0.1;

    // Smooth X/Z interpolation
    const diffX = zoomedPos.x - this.camera.position.x;
    const diffZ = zoomedPos.z - this.camera.position.z;

    this.camera.position.x += diffX * damping;
    this.camera.position.z += diffZ * damping;

    // Apply Shake
    this.camera.position.x += this.shakeOffset.x;
    this.camera.position.z += this.shakeOffset.z;

    // Height smoothing (separate for vertical dynamics)
    const speed =
      this.modeSettings[this.mode].speed *
      speedMultiplier *
      userSpeedMultiplier *
      this.deltaTime *
      60;
    const adaptiveSpeed = Math.min(speed, 0.5);
    const diffY = zoomedPos.y - this.camera.position.y;
    this.camera.position.y += diffY * adaptiveSpeed * 0.5;
    this.camera.position.y += this.shakeOffset.y;

    // STABILITY FIX: Force fixed rotation to prevent ground wobble
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler(-Math.PI / 3.5, 0, 0, "YXZ");
    quaternion.setFromEuler(euler);
    this.camera.quaternion.copy(quaternion);

    // Manual sync
    this.camera.rotation.x = -Math.PI / 3.5;
    this.camera.rotation.y = 0;
    this.camera.rotation.z = 0;

    // We maintain the lookAt vector only for returning data to other systems
    const lookAtTarget = new THREE.Vector3(
      this.camera.position.x,
      0,
      this.camera.position.z - 10,
    );
    this.currentLookAt.copy(lookAtTarget);

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
