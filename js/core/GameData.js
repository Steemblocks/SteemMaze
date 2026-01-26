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
   * Merges blockchain data with current local data, taking the maximum values
   */
  restoreFromBlockchain(gameRecords) {
    if (!gameRecords || gameRecords.length === 0) {
      console.warn("No game records to restore");
      return false;
    }

    let updatedStats = {
      gamesPlayed: 0,
      wins: 0,
      bestScore: this.data.bestScore || 0,
      bestTime: this.data.bestTime,
      totalSteps: 0,
      highestLevel: this.data.highestLevel || 1,
      totalCoins: this.data.totalCoins || 0,
      totalZombiesPurified: this.data.totalZombiesPurified || 0,
      totalGemsCollected: 0,
      threeStarGames: 0,
    };

    // Process each game record from blockchain
    for (const record of gameRecords) {
      const game = record.game;
      if (!game) continue;

      // Count games
      updatedStats.gamesPlayed++;

      // Track steps/moves
      if (game.moves) {
        updatedStats.totalSteps += game.moves;
      }

      // Count wins and three-star games
      if (game.stars === 3) {
        updatedStats.threeStarGames++;
      }
      // Any completed game is a win
      updatedStats.wins++;

      // Track gems
      if (game.gems_collected) {
        updatedStats.totalGemsCollected += game.gems_collected;
      }

      // Best score (take maximum)
      if (game.score && game.score > updatedStats.bestScore) {
        updatedStats.bestScore = game.score;
      }

      // Best time (take minimum - lower is better)
      if (game.time) {
        if (!updatedStats.bestTime || game.time < updatedStats.bestTime) {
          updatedStats.bestTime = game.time;
        }
      }

      // Highest level reached
      if (game.level && game.level > updatedStats.highestLevel) {
        updatedStats.highestLevel = game.level;
      }

      // If this record has stats object, use the highest values
      if (record.stats) {
        if (record.stats.total_coins > updatedStats.totalCoins) {
          updatedStats.totalCoins = record.stats.total_coins;
        }
        if (
          record.stats.total_zombies_purified >
          updatedStats.totalZombiesPurified
        ) {
          updatedStats.totalZombiesPurified =
            record.stats.total_zombies_purified;
        }
        if (record.stats.highest_level > updatedStats.highestLevel) {
          updatedStats.highestLevel = record.stats.highest_level;
        }
        if (
          record.stats.best_score &&
          record.stats.best_score > updatedStats.bestScore
        ) {
          updatedStats.bestScore = record.stats.best_score;
        }
      }
    }

    // Apply restored stats to local data (take max of local vs blockchain)
    this.data.gamesPlayed = Math.max(
      this.data.gamesPlayed || 0,
      updatedStats.gamesPlayed,
    );
    this.data.wins = Math.max(this.data.wins || 0, updatedStats.wins);
    this.data.bestScore = Math.max(
      this.data.bestScore || 0,
      updatedStats.bestScore,
    );
    this.data.totalSteps = Math.max(
      this.data.totalSteps || 0,
      updatedStats.totalSteps,
    );
    this.data.highestLevel = Math.max(
      this.data.highestLevel || 1,
      updatedStats.highestLevel,
    );
    // Set current level to next level after highest completed
    this.data.currentLevel = this.data.highestLevel + 1;
    this.data.totalCoins = Math.max(
      this.data.totalCoins || 0,
      updatedStats.totalCoins,
    );
    this.data.totalZombiesPurified = Math.max(
      this.data.totalZombiesPurified || 0,
      updatedStats.totalZombiesPurified,
    );

    // Best time - take lowest (best time means fastest)
    if (updatedStats.bestTime) {
      if (!this.data.bestTime || updatedStats.bestTime < this.data.bestTime) {
        this.data.bestTime = updatedStats.bestTime;
      }
    }

    // Save updated data
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
