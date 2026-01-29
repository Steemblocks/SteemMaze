/**
 * EventSystem.js
 * Manages random events, darkness, horde spawning, and environmental triggers
 * Handles: darkness events, zombie surges, bonus time, horde mechanics
 */

export class EventSystem {
  constructor(game) {
    this.game = game;

    // Event state
    this.eventTimer = 0;
    this.currentEvent = null;
    this.isDarknessActive = false;
    this.darknessStartTime = null;
    this.hordeSpawned = false;

    // Darkness timing
    this.darknessEndTimeout = null;
    this.hordeCheckTimeout = null;
    this.darknessPulseInterval = null;
    this.darknessEventTimer = null; // Periodic darkness trigger (first at 1min, then every 3min)
  }

  /**
   * Trigger random special events based on level
   * 5% chance per move to trigger (except darkness which is handled separately)
   */
  triggerRandomEvent() {
    if (this.game.level < 3) return; // Events start at level 3

    // 5% chance per move to trigger an event
    if (Math.random() > 0.05) return;

    // Darkness event should not trigger within first 10 seconds of the game
    const minTimeForDarkness = 10; // seconds

    const events = ["darkness", "zombie_surge", "bonus_time"];
    let event = events[Math.floor(Math.random() * events.length)];

    // If darkness was selected but game just started, pick a different event
    if (event === "darkness" && this.game.time < minTimeForDarkness) {
      const nonDarknessEvents = events.filter((e) => e !== "darkness");
      event =
        nonDarknessEvents[Math.floor(Math.random() * nonDarknessEvents.length)];
    }

    switch (event) {
      case "darkness":
        // Darkness is now handled by a dedicated timer (every 3 minutes)
        // We skip it here to keep it periodic and predictable as requested
        return;
        break;
      case "zombie_surge":
        this.triggerZombieSurge();
        break;
      case "bonus_time":
        this.triggerBonusTime();
        break;
    }
  }

  /**
   * Darkness event - reduced visibility
   * After level 5: Spawns zombie horde if player doesn't use light boost within 2 seconds
   */
  triggerDarknessEvent() {
    // Check if Fog Remover prevents darkness
    if (this.game.shop && this.game.shop.fogRemoverActive) {
      return;
    }

    this.game.ui.showToast(
      "⚠️ DARKNESS FALLS! Visibility reduced!",
      "visibility_off",
    );

    this.isDarknessActive = true;
    this.darknessStartTime = Date.now();
    this.hordeSpawned = false;

    // AUDIO: Play terrifying scream
    if (this.game.audioManager) {
      this.game.audioManager.playHordeScream();
    }

    // Store default fog for restoration
    if (!this.game.defaultFogDensity) {
      this.game.defaultFogDensity = this.game.scene.fog.density;
    }
    const originalFog = this.game.defaultFogDensity;
    this.game.scene.fog.density = originalFog * 2.5; // Heavier darkness

    // Lock weather density so it doesn't fight darkness, but keep color effects (flash) active
    if (this.game.weatherManager) {
      this.game.weatherManager.resumeFogEffects(); // Ensure it's active for color/flash
      this.game.weatherManager.lockFogDensity(true);
    }

    // Pulsing effect
    let pulseDirection = 1;
    const pulseInterval = setInterval(() => {
      if (!this.game.scene.fog || !this.isDarknessActive) {
        clearInterval(pulseInterval);
        return;
      }
      // Simple pulse between 2.0x and 3.0x density
      const current = this.game.scene.fog.density;
      if (current > originalFog * 3) pulseDirection = -1;
      if (current < originalFog * 2.0) pulseDirection = 1;
      this.game.scene.fog.density += 0.002 * pulseDirection;
    }, 50);

    // Save interval ID to clear it later if needed
    this.darknessPulseInterval = pulseInterval;

    // Check for horde spawn after 2 seconds (only level 5+)
    if (this.game.level >= 5) {
      this.hordeCheckTimeout = setTimeout(() => {
        // Check if player has activated protection
        if (this.isDarknessActive && !this.hordeSpawned) {
          this.spawnZombieHorde();
        }
      }, 1000); // 1 second delay (reduced from 2s)
    }

    // End darkness after 20 seconds
    this.darknessEndTimeout = setTimeout(() => {
      this.endDarknessEvent(originalFog);
    }, 20000);
  }

  /**
   * End darkness event and clean up
   */
  endDarknessEvent(originalFog) {
    this.isDarknessActive = false;
    this.darknessStartTime = null;

    // Ambient Sound Timer
    this.game.lastAmbientSoundTime = 0;

    if (this.hordeCheckTimeout) {
      clearTimeout(this.hordeCheckTimeout);
      this.hordeCheckTimeout = null;
    }

    // Clear pulse interval
    if (this.darknessPulseInterval) {
      clearInterval(this.darknessPulseInterval);
      this.darknessPulseInterval = null;
    }

    // Restore fog
    if (this.game.scene.fog && originalFog) {
      this.game.scene.fog.density = originalFog;
    }

    // Resume weather fog effects fully
    if (this.game.weatherManager) {
      this.game.weatherManager.lockFogDensity(false);
    }

    // NOTE: We NO LONGER despawn horde entities when darkness ends!
    // Entities persist until killed by player or level restarts.
    // This makes gameplay more consistent and prevents visual bugs.

    this.game.ui.showToast("☀️ Light returns!", "wb_sunny");
  }

  /**
   * Spawn zombie horde (delegates to EntityManager)
   */
  spawnZombieHorde() {
    this.hordeSpawned = true;
    return this.game.entityManager.spawnZombieHorde();
  }

  /**
   * Trigger zombie surge - zombies move faster temporarily
   * (Delegates to EntityManager)
   */
  triggerZombieSurge() {
    return this.game.entityManager.triggerZombieSurge();
  }

  /**
   * Bonus time event - adds 10 seconds to remaining time
   */
  triggerBonusTime() {
    this.game.ui.showToast("BONUS TIME! +10 seconds!", "schedule");
    this.game.time = Math.max(0, this.game.time - 10);
    document.getElementById("time").textContent = this.game.ui.formatTime(
      this.game.time,
    );
  }

  /**
   * Schedule periodic darkness events
   * First at 1 minute, then every 3 minutes (level 5+)
   * Called from Game.resetGame()
   */
  scheduleDarknessEvents() {
    // Only schedule for level 5+
    if (this.game.level < 5) {
      return;
    }

    // Clear any existing timer
    if (this.darknessEventTimer) {
      clearTimeout(this.darknessEventTimer);
      clearInterval(this.darknessEventTimer);
      this.darknessEventTimer = null;
    }

    // Use a timeout for the first event (1 minute)
    this.darknessEventTimer = setTimeout(() => {
      if (!this.game.isPaused && this.game.isRunning && !this.game.won) {
        this.triggerDarknessEvent();
      }

      // Then switch to interval (3 minutes recurring)
      this.darknessEventTimer = setInterval(() => {
        if (!this.game.isPaused && this.game.isRunning && !this.game.won) {
          this.triggerDarknessEvent();
        }
      }, 180000); // 3 Minutes recurring
    }, 60000); // 1 Minute initial delay
  }

  /**
   * Reset event state (called from Game.resetGame())
   * Clears all event timers and state
   */
  resetEventState() {
    this.isDarknessActive = false;
    this.darknessStartTime = null;
    this.hordeSpawned = false;
    this.currentEvent = null;
    this.eventTimer = 0;

    // Clear all pending timeouts and intervals
    if (this.darknessEndTimeout) {
      clearTimeout(this.darknessEndTimeout);
      this.darknessEndTimeout = null;
    }

    if (this.hordeCheckTimeout) {
      clearTimeout(this.hordeCheckTimeout);
      this.hordeCheckTimeout = null;
    }

    if (this.darknessPulseInterval) {
      clearInterval(this.darknessPulseInterval);
      this.darknessPulseInterval = null;
    }

    // Clear periodic darkness event timer
    if (this.darknessEventTimer) {
      clearTimeout(this.darknessEventTimer);
      clearInterval(this.darknessEventTimer);
      this.darknessEventTimer = null;
    }
  }

  /**
   * Dispose of EventSystem resources
   */
  dispose() {
    this.resetEventState();
  }
}
