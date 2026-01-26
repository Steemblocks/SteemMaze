export class AudioManager {
  constructor() {
    this.sounds = {};
    this.muted = false; // Master/SFX mute
    this.musicMuted = false;
    this.activeLoops = {};
    this.soundPools = {}; // Pooled sounds for frequently played audio
    this.lastPlayTime = {}; // Track last play time for throttling
    this.init();
  }

  init() {
    this.loadSound("click", "/audio/ui_click.mp3");
    this.loadSound("buy", "/audio/shop_buy.mp3");
    this.loadSound("toggle", "/audio/ui_toggle.mp3");
    this.loadSound("explosion", "/audio/zombie_explosion.mp3");
    this.loadSound("coin", "/audio/coin_collect.mp3");
    this.loadSound("gem", "/audio/gem_collect.mp3");
    this.loadSound("shield", "/audio/shield_collect.mp3");
    this.loadSound("thunder", "/audio/thunder.mp3");
    this.loadSound("rain", "/audio/rain.mp3");
    this.loadSound("victory", "/audio/victory.mp3");
    this.loadSound("gameOver", "/audio/game_over.mp3");
    this.loadSound("bgMusic", "/audio/bg_music.mp3");
    this.loadSound("potion", "/audio/potion_activate.mp3");
    this.loadSound("fogRemove", "/audio/fog_remove.mp3");
    this.loadSound("lightBurst", "/audio/light_burst.mp3");
    this.loadSound("zombieAmbient", "/audio/zombie_ambient.mp3");
    this.loadSound("zombieGrowl", "/audio/zombie_growl.mp3");
    this.loadSound("hordeScream", "/audio/zombie_horde_scream.mp3");
    this.loadSound("monsterGrowl", "/audio/monster_growl.mp3");
    this.loadSound("dogBark", "/audio/dog_bark.mp3");
    this.loadSound("bigfootRoar", "/audio/bigfoot_roar.mp3");
    this.loadSound("bigfootRoar", "/audio/bigfoot_roar.mp3");
    this.loadSound("bossSpawn", "/audio/boss_spawn.mp3");
    this.loadSound("footsteps", "/audio/footsteps_grass.mp3");

    // Pre-create sound pools for frequently played sounds
    this.createSoundPool("explosion", 5);
    this.createSoundPool("coin", 4);
    this.createSoundPool("footsteps", 3);
    this.createSoundPool("dogBark", 3); // Preload dog barks for rapid playback
  }

  loadSound(name, path) {
    const audio = new Audio(path);
    audio.preload = "auto";

    // Add error handling for cache/load failures
    audio.addEventListener("error", (e) => {
      console.warn(
        `Audio load error for "${name}":`,
        e.target.error?.message || "Unknown error",
      );
      // Attempt to reload on error
      this.reloadSound(name, path);
    });

    this.sounds[name] = audio;
  }

  /**
   * Attempt to reload a failed audio file
   */
  reloadSound(name, path) {
    // Add cache-busting parameter to force fresh load
    const cacheBuster = `?t=${Date.now()}`;
    const audio = new Audio(path + cacheBuster);
    audio.preload = "auto";

    audio.addEventListener("canplaythrough", () => {
      this.sounds[name] = audio;
    });

    audio.addEventListener("error", () => {
      // Mark as failed - play() will silently skip it
      this.sounds[name] = null;
      console.warn(`Audio "${name}" failed to reload, will be skipped`);
    });
  }

  /**
   * Create a pool of audio elements for a sound to allow concurrent playback
   */
  createSoundPool(name, size) {
    if (!this.sounds[name]) return;
    this.soundPools[name] = [];
    for (let i = 0; i < size; i++) {
      const audio = this.sounds[name].cloneNode();
      audio.preload = "auto";
      this.soundPools[name].push(audio);
    }
  }

  /**
   * Get an available sound from the pool or clone a new one
   */
  getPooledSound(name) {
    if (this.soundPools[name]) {
      // Find a sound that's not currently playing
      for (const audio of this.soundPools[name]) {
        if (audio.paused || audio.ended) {
          audio.currentTime = 0;
          return audio;
        }
      }
      // All sounds busy, return the first one (will restart it)
      const audio = this.soundPools[name][0];
      audio.currentTime = 0;
      return audio;
    }
    // No pool, clone as before
    return this.sounds[name].cloneNode();
  }

  // Sound volume config
  getVolume(name) {
    const volumes = {
      buy: 0.7,
      toggle: 0.6,
      explosion: 0.8,
      coin: 0.6,
      gem: 0.7,
      shield: 0.7,
      thunder: 1.0,
      victory: 0.9,
      gameOver: 0.9,
      potion: 0.8,
      fogRemove: 0.8,
      lightBurst: 0.7,
      zombieAmbient: 0.3, // Distant sound
      zombieGrowl: 0.6, // Close proximity sound
      hordeScream: 1.0, // Loud event sound
      monsterGrowl: 0.8, // Intimidating beast sound
      dogBark: 0.7, // Sharp attack sound
      bigfootRoar: 1.0, // Terrifying boss sound
      bossSpawn: 1.0, // Major event sound
      footsteps: 0.35, // Subtle walking sound
    };
    return volumes[name] || 0.5;
  }

  // Minimum time between plays of the same sound (ms)
  getThrottleTime(name) {
    const throttles = {
      explosion: 80, // Allow rapid explosions but not spam
      coin: 50, // Quick coin pickup sounds
      click: 50,
      footsteps: 350, // Approx 3 steps per second -> ~330ms
    };
    return throttles[name] || 0;
  }

  play(name, volumeScale = 1.0) {
    if (this.muted || !this.sounds[name]) return;

    // Throttle check for rapid-fire sounds
    const throttleTime = this.getThrottleTime(name);
    if (throttleTime > 0) {
      const now = Date.now();
      const lastPlay = this.lastPlayTime[name] || 0;
      if (now - lastPlay < throttleTime) return;
      this.lastPlayTime[name] = now;
    }

    // Use pooled sound if available, otherwise clone
    const sound = this.soundPools[name]
      ? this.getPooledSound(name)
      : this.sounds[name].cloneNode();

    // Clamp volume to 0.0 - 1.0 to avoid errors
    const baseVol = this.getVolume(name);
    const finalVol = Math.max(0, Math.min(1, baseVol * volumeScale));

    sound.volume = finalVol;

    // Don't play if volume is effectively zero
    if (finalVol < 0.01) return;

    sound.play().catch(() => {
      // Silently ignore - audio may be loading or cache failed
    });
  }

  playClick() {
    this.play("click");
  }

  playBuy() {
    this.play("buy");
  }

  playToggle() {
    this.play("toggle");
  }

  playExplosion() {
    this.play("explosion");
  }

  playCoin() {
    this.play("coin");
  }

  playGem() {
    this.play("gem");
  }

  playShield() {
    this.play("shield");
  }

  playThunder(delayMs = 0) {
    if (delayMs > 0) {
      setTimeout(() => this.play("thunder"), delayMs);
    } else {
      this.play("thunder");
    }
  }

  playRain() {
    if (this.muted || !this.sounds["rain"]) return;

    // Don't play if already raining
    if (this.activeLoops["rain"]) return;

    const sound = this.sounds["rain"].cloneNode();
    sound.volume = 0.5; // Ambient level
    sound.loop = true;
    sound.play().catch(() => {});

    this.activeLoops["rain"] = sound;
  }

  stopRain() {
    if (this.activeLoops["rain"]) {
      const sound = this.activeLoops["rain"];
      sound.pause();
      sound.currentTime = 0;
      delete this.activeLoops["rain"];
    }
  }

  playVictory() {
    this.stopRain();
    this.play("victory");
  }

  playGameOver() {
    this.stopRain();
    this.play("gameOver");
  }

  playPotion() {
    this.play("potion");
  }

  playFogRemove() {
    this.play("fogRemove");
  }

  playLightBurst() {
    this.play("lightBurst");
  }

  playZombieAmbient(volume = 1.0) {
    this.play("zombieAmbient", volume);
  }

  playZombieGrowl(volume = 1.0) {
    // Only play if not recently played (throttle to avoid spam)
    if (this.getThrottleTime("zombieGrowl") > 0) {
      const now = Date.now();
      if (now - (this.lastPlayTime["zombieGrowl"] || 0) < 3000) return; // 3 sec cooldown
    }
    this.play("zombieGrowl", volume);
  }

  playHordeScream(volume = 1.0) {
    this.play("hordeScream", volume);
  }

  playMonsterGrowl(volume = 1.0) {
    // Throttle to 4 seconds
    const throttle = 4000;
    const now = Date.now();
    if (now - (this.lastPlayTime["monsterGrowl"] || 0) < throttle) return;

    this.play("monsterGrowl", volume);
  }

  playDogBark(volume = 1.0) {
    // Shorter throttle for rapid attacks (1.5s)
    const throttle = 1500;
    const now = Date.now();
    if (now - (this.lastPlayTime["dogBark"] || 0) < throttle) return;

    this.play("dogBark", volume);
  }

  playBigfootRoar(volume = 1.0) {
    // Throttle to 5 seconds - needs to be impactful
    const throttle = 5000;
    const now = Date.now();
    if (now - (this.lastPlayTime["bigfootRoar"] || 0) < throttle) return;

    this.play("bigfootRoar", volume);
  }

  playBossSpawn() {
    this.play("bossSpawn");
  }

  playFootsteps() {
    this.play("footsteps");
  }

  playMusic() {
    if (this.musicMuted || !this.sounds["bgMusic"]) return;
    if (this.activeLoops["music"]) return; // Already playing

    const sound = this.sounds["bgMusic"].cloneNode();
    sound.volume = 0.4; // Background level
    sound.loop = true;
    sound.play().catch(() => {});

    this.activeLoops["music"] = sound;
  }

  stopMusic() {
    if (this.activeLoops["music"]) {
      const sound = this.activeLoops["music"];
      sound.pause();
      sound.currentTime = 0;
      delete this.activeLoops["music"];
    }
  }

  toggleMusic() {
    this.musicMuted = !this.musicMuted;
    if (this.musicMuted) {
      this.stopMusic();
    } else {
      this.playMusic();
    }
    return this.musicMuted;
  }

  /**
   * Stop ALL sounds - used when leaving game screen
   */
  stopAllSounds() {
    // Stop all active loops
    Object.keys(this.activeLoops).forEach((key) => {
      const sound = this.activeLoops[key];
      if (sound) {
        sound.pause();
        sound.currentTime = 0;
      }
    });
    this.activeLoops = {};

    // Stop and reset all pooled sounds
    Object.keys(this.soundPools).forEach((key) => {
      this.soundPools[key].forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
    });

    // Reset base sounds
    Object.keys(this.sounds).forEach((key) => {
      const sound = this.sounds[key];
      if (sound && !sound.paused) {
        sound.pause();
        sound.currentTime = 0;
      }
    });
  }

  toggleMute() {
    this.muted = !this.muted;

    // If muting, stop all currently playing sounds
    if (this.muted) {
      this.stopAllSounds();
    }

    return this.muted;
  }
}
