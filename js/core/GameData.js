/**
 * GameData Class
 * Handles game data persistence and storage
 */

export class GameData {
  constructor() {
    this.data = this.load();
  }

  getDefault() {
    return {
      playerName: "Player",
      steemUsername: null, // Steem account username
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      bestScore: null,
      bestTime: null,
      totalSteps: 0,
      highestLevel: 1,
      highestLevelPosted: 0,
      currentLevel: 1,
      totalCoins: 0,
      totalZombiesPurified: 0,
      achievements: [],
      settings: {
        mazeSize: 15,
        cameraSpeed: 5,
        quality: "high",
        shadows: true,
        fireflies: true,
        fogDensity: 50,
        sfx: true,
        music: true,
        volume: 70,
        mobileControls: true,
        vibration: true,
        cameraShake: false, // Disabled by default to prevent motion sickness

        // Detailed Audio Settings
        footstepSound: true,
        zombieSound: true, // Zombies & Monsters
        dogSound: true,
        monsterSound: true, // Standard Monsters
        bigfootSound: true, // Bigfoot Boss
        hordeBossSound: true, // Horde Boss & Events
      },
      leaderboard: [],
    };
  }

  load() {
    try {
      const saved = localStorage.getItem("steemmaze_data");
      if (saved) {
        const parsed = JSON.parse(saved);
        const merged = {
          ...this.getDefault(),
          ...parsed,
          settings: { ...this.getDefault().settings, ...parsed.settings },
        };
        // merged.leaderboard = []; // Keep cached leaderboard for instant UI!
        return merged;
      }
    } catch (e) {
      console.error("Failed to load:", e);
    }
    return this.getDefault();
  }

  save() {
    try {
      localStorage.setItem("steemmaze_data", JSON.stringify(this.data));
    } catch (e) {
      console.error("Failed to save:", e);
    }
  }

  reset() {
    this.data = this.getDefault();
    this.save();
  }

  /**
   * Restore game data from blockchain records
   * Merges blockchain data with current local data
   * SIMPLE LOGIC: The most recent record is the source of truth.
   */
  restoreFromBlockchain(gameRecords) {
    if (!gameRecords || gameRecords.length === 0) {
      console.warn("No game records to restore");
      return false;
    }

    // 1. Get the most recent record
    // records are sorted newest first
    const mostRecent = gameRecords[0];

    // 2. IF it has stats (Modern Record), usage is simple: Trust it fully.
    // This handles "Resets" perfectly because a Reset record has stats with 0s.
    if (mostRecent.stats) {
      console.log("Restoring from most recent blockchain record (Simple Mode)");
      const s = mostRecent.stats;

      this.data.gamesPlayed = s.games_played || 0;
      this.data.wins = s.wins || 0;
      this.data.losses = s.losses || 0;
      this.data.bestScore = s.best_score || 0;
      this.data.highestLevel = s.highest_level ?? 1;
      this.data.currentLevel = this.data.highestLevel + 1;
      this.data.totalCoins = s.total_coins || 0;
      this.data.totalZombiesPurified = s.total_zombies_purified || 0;
      this.data.totalSteps = s.total_steps || 0;

      // Time might be in game object or stats
      this.data.bestTime =
        s.best_time || (mostRecent.game ? mostRecent.game.time : null);

      this.save();
      return true;
    }

    // 3. FALLBACK: Legacy Scan
    // Only happens if the latest record is very old and has no 'stats' block.
    console.log("Modern stats not found, using legacy scan...");

    let updatedStats = {
      gamesPlayed: 0,
      wins: 0,
      bestScore: 0,
      bestTime: null,
      totalSteps: 0,
      highestLevel: 1,
      totalCoins: 0,
      totalZombiesPurified: 0,
    };

    for (const record of gameRecords) {
      const game = record.game;
      if (!game) continue;

      updatedStats.gamesPlayed++;
      updatedStats.wins++;
      if (game.moves) updatedStats.totalSteps += game.moves;
      if (game.score && game.score > updatedStats.bestScore)
        updatedStats.bestScore = game.score;
      if (game.level && game.level > updatedStats.highestLevel)
        updatedStats.highestLevel = game.level;

      if (game.time) {
        if (!updatedStats.bestTime || game.time < updatedStats.bestTime) {
          updatedStats.bestTime = game.time;
        }
      }
    }

    this.data.gamesPlayed = updatedStats.gamesPlayed;
    this.data.wins = updatedStats.wins;
    this.data.bestScore = updatedStats.bestScore;
    this.data.totalSteps = updatedStats.totalSteps;
    this.data.highestLevel = updatedStats.highestLevel;
    this.data.currentLevel = this.data.highestLevel + 1;
    this.data.bestTime = updatedStats.bestTime;

    this.save();
    return true;
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
  }

  getSetting(key) {
    return this.data.settings[key];
  }

  setSetting(key, value) {
    this.data.settings[key] = value;
    this.save();
  }
}
