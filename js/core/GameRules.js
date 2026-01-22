/**
 * Advanced GameRules - Enhanced Edition
 * Comprehensive game mechanics, difficulty scaling, and progression system
 */

export const GameRules = {
  // --- Core Game Configuration ---
  INITIAL_LIVES: 3,
  MAX_LIVES: 5,

  // --- Maze Dimensions ---
  CELL_SIZE: 4,
  WALL_HEIGHT: 3.5,
  WALL_THICKNESS: 0.5,

  // --- Difficulty Tiers ---
  DIFFICULTY_TIERS: {
    BEGINNER: { minLevel: 1, maxLevel: 3, multiplier: 0.8 },
    EASY: { minLevel: 4, maxLevel: 6, multiplier: 1.0 },
    MEDIUM: { minLevel: 7, maxLevel: 10, multiplier: 1.3 },
    HARD: { minLevel: 11, maxLevel: 15, multiplier: 1.6 },
    EXPERT: { minLevel: 16, maxLevel: 20, multiplier: 2.0 },
    MASTER: { minLevel: 21, maxLevel: Infinity, multiplier: 2.5 },
  },

  // --- Scoring & Rewards ---
  BASE_SCORE: 1000,
  POINTS_PER_GEM: 150,
  POINTS_PER_LEVEL: 250,
  POINTS_PER_COIN: 25,
  PENALTY_PER_WALL_HIT: 50,
  BONUS_PER_COMBO_POINT: 25,
  GEM_LIFE_BONUS: 1,

  // --- Combo System ---
  COMBO_THRESHOLDS: {
    MINOR: 5, // Minor bonus starts
    MODERATE: 10, // Better bonus
    MAJOR: 20, // Major rewards
    SUPER: 35, // Super combo
    LEGENDARY: 50, // Legendary status
  },
  COMBO_MULTIPLIERS: {
    MINOR: 1.1,
    MODERATE: 1.25,
    MAJOR: 1.5,
    SUPER: 2.0,
    LEGENDARY: 3.0,
  },

  // --- Time Bonuses ---
  TIME_BONUS_TIERS: {
    PERFECT: { threshold: 0.5, bonus: 1000, label: "PERFECT!" },
    EXCELLENT: { threshold: 0.7, bonus: 500, label: "EXCELLENT!" },
    GOOD: { threshold: 0.9, bonus: 200, label: "Good" },
    OK: { threshold: 1.0, bonus: 50, label: "Completed" },
    SLOW: { threshold: 1.5, bonus: 0, label: "Slow" },
  },

  // --- Power-Ups ---
  POWERUP_DURATION: 300, // Frames (5s at 60fps)
  POWERUP_TYPES: {
    SHIELD: { duration: 3600, color: 0x3b82f6, label: "Shield" }, // 60 seconds (effectively until hit)
    SPEED: { duration: 300, color: 0xfbbf24, label: "Speed Boost" },
    FREEZE: { duration: 240, color: 0x06b6d4, label: "Time Freeze" },
    MAGNET: { duration: 420, color: 0xa855f7, label: "Coin Magnet" },
    DOUBLE_SCORE: { duration: 300, color: 0x22c55e, label: "2X Score" },
  },

  // --- Economy ---
  COIN_VALUE: 15,
  POTION_COST: 50,
  ZOMBIE_KILL_REWARD_BASE: 100, // Higher starting reward (was 75)
  ZOMBIE_KILL_REWARD_MIN: 20, // Lower minimum for difficulty curve
  DOG_KILL_REWARD_BASE: 60, // Higher starting reward (was 40)
  DOG_KILL_REWARD_MIN: 15,
  BOSS_KILL_REWARD_BASE: 150, // Higher reward (was 100)
  BOSS_KILL_REWARD_MIN: 50,
  POTION_DURATION: 600,

  // Level Completion Rewards
  LEVEL_COMPLETE_BASE_REWARD: 50, // Base coins for completing a level
  LEVEL_COMPLETE_PER_LEVEL: 10, // Extra coins per level number
  LEVEL_COMPLETE_PER_STAR: 25, // Extra coins per star earned
  LEVEL_COMPLETE_PERFECT_BONUS: 100, // Bonus for 3 stars

  // --- Zombie Mechanics (Level Scaling) ---
  ZOMBIE_BASE_INTERVAL: 90, // Frames between moves at level 1
  ZOMBIE_MIN_INTERVAL: 12, // Faster max speed (was 15)
  ZOMBIE_SPEED_SCALING: 8,
  ZOMBIE_MAX_COUNT: 20, // Much higher cap (was 10)
  DOG_MAX_COUNT: 10, // Higher cap (was 6)
  HORDE_BASE_ZOMBIES: 2,
  HORDE_BASE_DOGS: 2,
  HORDE_SCALING_FACTOR: 0.5, // Faster horde scaling (was 0.3)

  // --- Feedback Intensity ---
  SHAKE_INTENSITY_WALL: 0.5,
  SHAKE_INTENSITY_ZOMBIE: 1.2,
  SHAKE_INTENSITY_DAMAGE: 1.5,
  SHAKE_INTENSITY_POWERUP: 0.3,
  VIBRATION_ZOMBIE: [50, 30, 50, 30, 50],
  VIBRATION_WALL: [30, 20, 30],
  VIBRATION_COLLECT: [10, 10, 10],

  // --- Star Rating Thresholds (Rebalanced for fair progression) ---
  STAR_REQUIREMENTS: {
    // 1 Star: Just complete the level
    ONE_STAR: { completionRequired: true },
    // 2 Stars: Reasonable time, moderate wall hits
    TWO_STAR: { timeRatio: 2.5, wallHitMax: 25 },
    // 3 Stars: Good performance across metrics
    THREE_STAR: { timeRatio: 1.5, wallHitMax: 10, gemsRequired: 0.4 },
  },

  /**
   * Get the difficulty tier for a level
   */
  getDifficultyTier(level) {
    for (const [name, tier] of Object.entries(this.DIFFICULTY_TIERS)) {
      if (level >= tier.minLevel && level <= tier.maxLevel) {
        return { name, ...tier };
      }
    }
    return { name: "MASTER", ...this.DIFFICULTY_TIERS.MASTER };
  },

  /**
   * Calculate Maze Size based on level with smooth scaling
   */
  getMazeSize(level, baseSize = 15) {
    // Smooth, gradual progression is usually better for player flow.
    // Use a formula that adds 1 unit of size roughly every 2 levels.
    // L1: 15, L10: 20, L20: 25, L30: 30, L50: 40

    const sizeGrowth = Math.floor(level / 2);

    // Cap at 45 to prevent performance issues
    return Math.min(baseSize + sizeGrowth, 45);
  },

  /**
   * Calculate number of zombies for current level
   * Scales more aggressively at higher levels
   * Level 1 = 1, Level 10 = 10, Level 30 = 30
   */
  getZombieCount(level) {
    // Base count starts at 1, increases by 1 per level
    const baseCount = Math.floor(1 + (level - 1) * 1.0);
    return Math.min(baseCount, 50); // Higher cap (was 20)
  },

  /**
   * Calculate number of zombie dogs for current level
   * Dogs appear from level 2, scale with level
   */
  getZombieDogCount(level) {
    if (level < 2) return 0;
    // Almost 1 per level
    const dogCount = Math.floor(level * 0.8);
    return Math.min(dogCount, 30); // Higher cap (was 10)
  },

  /**
   * Get zombie base speed (move interval) for a level
   * Lower interval = faster zombies
   */
  getZombieSpeed(level) {
    const interval = Math.max(
      this.ZOMBIE_BASE_INTERVAL - level * this.ZOMBIE_SPEED_SCALING,
      this.ZOMBIE_MIN_INTERVAL,
    );
    return interval;
  },

  /**
   * Get zombie chase range for a level
   * Higher levels = zombies can detect you from farther
   */
  getZombieChaseRange(level) {
    // Base range 4, increases by 0.5 per level, max 12
    return Math.min(4 + Math.floor(level * 0.5), 12);
  },

  /**
   * Get zombie dog speed (move interval) for a level
   * Dogs are faster than regular zombies
   */
  getZombieDogSpeed(level) {
    const baseInterval = Math.max(45 - level * 5, 10);
    return baseInterval;
  },

  /**
   * Get zombie dog chase range for a level
   */
  getZombieDogChaseRange(level) {
    // Dogs have slightly better detection, base 5
    return Math.min(5 + Math.floor(level * 0.6), 14);
  },

  /**
   * Get zombie kill reward for a level (decreases as level increases)
   * Early kills are more valuable!
   */
  getZombieKillReward(level) {
    // Decrease by 5 coins per level, but never below minimum
    const reward = Math.max(
      this.ZOMBIE_KILL_REWARD_BASE - (level - 1) * 5,
      this.ZOMBIE_KILL_REWARD_MIN,
    );
    return Math.floor(reward);
  },

  /**
   * Get zombie dog kill reward for a level (decreases as level increases)
   */
  getZombieDogKillReward(level) {
    const reward = Math.max(
      this.DOG_KILL_REWARD_BASE - (level - 1) * 3,
      this.DOG_KILL_REWARD_MIN,
    );
    return Math.floor(reward);
  },

  /**
   * Get boss zombie kill reward for a level
   */
  getBossKillReward(level) {
    const reward = Math.max(
      this.BOSS_KILL_REWARD_BASE - (level - 1) * 6,
      this.BOSS_KILL_REWARD_MIN,
    );
    return Math.floor(reward);
  },

  /**
   * Get horde configuration for a level
   * Returns zombie and dog counts for horde spawns
   */
  getHordeConfig(level) {
    // Horde scales massively with level
    const extraZombies = Math.floor((level - 5) * 0.8);
    const extraDogs = Math.floor((level - 5) * 0.6);

    return {
      bossCount: 1, // Base boss count (Game.js adds more)
      zombieCount: Math.min(5 + extraZombies, 25), // Max 25 horde zombies
      dogCount: Math.min(3 + extraDogs, 15), // Max 15 horde dogs
    };
  },

  /**
   * Calculate Par Time (target time) with difficulty scaling
   */
  getParTime(mazeSize, level) {
    const tier = this.getDifficultyTier(level);
    const baseTime = mazeSize * 3 + level * 3;
    return Math.floor(baseTime / tier.multiplier);
  },

  /**
   * Calculate Par Moves (optimal steps)
   */
  getParMoves(mazeSize) {
    return Math.floor(mazeSize * 1.8);
  },

  /**
   * Get number of gems based on level and maze size
   */
  getGemCount(level, mazeSize) {
    const baseGems = 3;
    const levelBonus = Math.floor(level / 2);
    const sizeBonus = Math.floor((mazeSize - 11) / 2);
    return Math.min(baseGems + levelBonus + sizeBonus, 12);
  },

  /**
   * Get number of coins based on level and maze size
   */
  getCoinCount(level, mazeSize) {
    const base = Math.floor(mazeSize * 0.6);
    const levelBonus = Math.floor(level * 0.5);
    return Math.min(base + levelBonus, 25);
  },

  /**
   * Get number of power-ups for level
   */
  getPowerUpCount(level) {
    if (level < 2) return 0;
    if (level < 5) return 1;
    if (level < 10) return 2;
    return 3;
  },

  /**
   * Get available power-up types for level
   */
  getAvailablePowerUpTypes(level) {
    const types = ["SHIELD"];
    if (level >= 3) types.push("SPEED");
    if (level >= 5) types.push("FREEZE");
    if (level >= 8) types.push("MAGNET");
    if (level >= 12) types.push("DOUBLE_SCORE");
    return types;
  },

  /**
   * Get combo tier based on combo count
   */
  getComboTier(combo) {
    if (combo >= this.COMBO_THRESHOLDS.LEGENDARY) return "LEGENDARY";
    if (combo >= this.COMBO_THRESHOLDS.SUPER) return "SUPER";
    if (combo >= this.COMBO_THRESHOLDS.MAJOR) return "MAJOR";
    if (combo >= this.COMBO_THRESHOLDS.MODERATE) return "MODERATE";
    if (combo >= this.COMBO_THRESHOLDS.MINOR) return "MINOR";
    return null;
  },

  /**
   * Get combo multiplier
   */
  getComboMultiplier(combo) {
    const tier = this.getComboTier(combo);
    return tier ? this.COMBO_MULTIPLIERS[tier] : 1.0;
  },

  /**
   * Calculate combo bonus points
   */
  calculateComboBonus(combo) {
    const tier = this.getComboTier(combo);
    if (!tier) return 0;

    // Progressive bonus system
    const thresholds = this.COMBO_THRESHOLDS;
    const multipliers = this.COMBO_MULTIPLIERS;

    let bonus = 0;
    if (combo >= thresholds.MINOR)
      bonus += (combo - thresholds.MINOR) * 5 * multipliers.MINOR;
    if (combo >= thresholds.MODERATE)
      bonus += (combo - thresholds.MODERATE) * 8 * multipliers.MODERATE;
    if (combo >= thresholds.MAJOR)
      bonus += (combo - thresholds.MAJOR) * 12 * multipliers.MAJOR;
    if (combo >= thresholds.SUPER)
      bonus += (combo - thresholds.SUPER) * 20 * multipliers.SUPER;
    if (combo >= thresholds.LEGENDARY)
      bonus += (combo - thresholds.LEGENDARY) * 50 * multipliers.LEGENDARY;

    return Math.floor(bonus);
  },

  /**
   * Check for combo milestone (for visual feedback)
   */
  checkComboMilestone(previousCombo, currentCombo) {
    for (const [tier, threshold] of Object.entries(this.COMBO_THRESHOLDS)) {
      if (previousCombo < threshold && currentCombo >= threshold) {
        return {
          tier,
          threshold,
          multiplier: this.COMBO_MULTIPLIERS[tier],
          bonus: this.calculateComboBonus(currentCombo),
        };
      }
    }
    return null;
  },

  /**
   * Get time bonus based on completion time vs par time
   */
  getTimeBonus(actualTime, parTime) {
    const ratio = actualTime / parTime;

    for (const [, tier] of Object.entries(this.TIME_BONUS_TIERS)) {
      if (ratio <= tier.threshold) {
        return { ...tier };
      }
    }
    return { bonus: 0, label: "Try faster next time!" };
  },

  /**
   * Calculate move efficiency bonus
   */
  getMoveEfficiencyBonus(actualMoves, parMoves) {
    // Handle edge case: no moves yet (prevents division by zero)
    if (actualMoves === 0) {
      return 0; // No bonus or penalty when player hasn't moved
    }

    if (actualMoves <= parMoves) {
      // Perfect or better - bonus scales with how much better
      const efficiency = parMoves / actualMoves;
      return Math.floor(200 * (efficiency - 1) + 100);
    }
    // Over par - no bonus, but no penalty up to 150%
    const overRatio = actualMoves / parMoves;
    if (overRatio <= 1.5) return 0;
    // Slight penalty for very inefficient paths
    return -Math.floor((overRatio - 1.5) * 50);
  },

  /**
   * Calculate star rating for a completed level
   * Uses a balanced multi-factor approach considering:
   * - Time performance vs par time
   * - Wall hits (skill indicator)
   * - Gems collected (exploration bonus)
   * - Combo performance (bonus consideration)
   */
  calculateStars(state) {
    const {
      time,
      parTime,
      wallHits,
      gemsCollected,
      totalGems,
      maxCombo = 0,
    } = state;

    const timeRatio = parTime > 0 ? time / parTime : 2;
    const gemRatio = totalGems > 0 ? gemsCollected / totalGems : 1;

    // Combo bonus can help offset slightly missed thresholds
    const hasGoodCombo = maxCombo >= 5;
    const comboBoost = hasGoodCombo ? 0.1 : 0;

    // 3 Stars: Good time, few wall hits, collected gems
    // With combo boost, slightly relaxed thresholds
    const threeStarTimeThreshold =
      this.STAR_REQUIREMENTS.THREE_STAR.timeRatio + comboBoost;
    const threeStarWallMax =
      this.STAR_REQUIREMENTS.THREE_STAR.wallHitMax + (hasGoodCombo ? 2 : 0);

    if (
      timeRatio <= threeStarTimeThreshold &&
      wallHits <= threeStarWallMax &&
      gemRatio >= this.STAR_REQUIREMENTS.THREE_STAR.gemsRequired
    ) {
      return 3;
    }

    // 2 Stars: Reasonable time, moderate wall hits
    const twoStarTimeThreshold =
      this.STAR_REQUIREMENTS.TWO_STAR.timeRatio + comboBoost;
    const twoStarWallMax =
      this.STAR_REQUIREMENTS.TWO_STAR.wallHitMax + (hasGoodCombo ? 5 : 0);

    if (timeRatio <= twoStarTimeThreshold && wallHits <= twoStarWallMax) {
      return 2;
    }

    // 1 Star: Completed the level
    return 1;
  },

  /**
   * Calculate total score based on comprehensive game state
   */
  calculateScore(state) {
    const {
      mazeSize,
      level,
      time,
      moves,
      wallHits,
      maxCombo,
      gemsCollected,
      coinsCollected = 0,
      zombiesKilled = 0,
      extraScore = 0,
      powerUpsUsed = 0,
      isDoubleScoreActive = false,
    } = state;

    const tier = this.getDifficultyTier(level);
    const parTime = this.getParTime(mazeSize, level);
    const parMoves = this.getParMoves(mazeSize);

    // Base score components
    const sizeBonus = mazeSize * 50;
    const levelBonus = level * this.POINTS_PER_LEVEL;

    // Efficiency bonuses
    const timeResult = this.getTimeBonus(time, parTime);
    const timeBonus = timeResult.bonus;
    const moveBonus = this.getMoveEfficiencyBonus(moves, parMoves);

    // Collection bonuses
    const gemBonus = gemsCollected * this.POINTS_PER_GEM;
    const coinBonus = coinsCollected * this.POINTS_PER_COIN;
    const zombieBonus = zombiesKilled * this.getZombieKillReward(level);

    // Combo bonus
    const comboBonus = this.calculateComboBonus(maxCombo);

    // Penalty
    const wallPenalty = wallHits * this.PENALTY_PER_WALL_HIT;

    // Power-up usage bonus (small reward for using them)
    const powerUpBonus = powerUpsUsed * 25;

    // Calculate subtotal
    let subtotal =
      this.BASE_SCORE +
      sizeBonus +
      levelBonus +
      timeBonus +
      moveBonus +
      gemBonus +
      coinBonus +
      zombieBonus +
      comboBonus +
      powerUpBonus +
      (extraScore || 0) -
      wallPenalty;

    // Apply difficulty tier multiplier
    subtotal = Math.floor(subtotal * tier.multiplier);

    // Apply double score power-up if active
    if (isDoubleScoreActive) {
      subtotal = Math.floor(subtotal * 1.5); // 50% bonus during double score, not full 2x
    }

    return Math.max(0, subtotal);
  },

  /**
   * Get detailed score breakdown
   */
  getScoreBreakdown(state) {
    const tier = this.getDifficultyTier(state.level);
    const parTime = this.getParTime(state.mazeSize, state.level);
    const parMoves = this.getParMoves(state.mazeSize);
    const timeResult = this.getTimeBonus(state.time, parTime);

    return {
      baseScore: this.BASE_SCORE,
      sizeBonus: state.mazeSize * 50,
      levelBonus: state.level * this.POINTS_PER_LEVEL,
      timeBonus: timeResult.bonus,
      timeLabel: timeResult.label,
      moveBonus: this.getMoveEfficiencyBonus(state.moves, parMoves),
      gemBonus: state.gemsCollected * this.POINTS_PER_GEM,
      coinBonus: (state.coinsCollected || 0) * this.POINTS_PER_COIN,
      comboBonus: this.calculateComboBonus(state.maxCombo),
      zombieBonus:
        (state.zombiesKilled || 0) * this.getZombieKillReward(state.level),
      wallPenalty: state.wallHits * this.PENALTY_PER_WALL_HIT,
      difficultyMultiplier: tier.multiplier,
      difficultyTier: tier.name,
      total: this.calculateScore(state),
      stars: this.calculateStars({
        ...state,
        parTime,
      }),
      parTime,
      parMoves,
    };
  },

  /**
   * Calculate coin reward for completing a level
   * @param {number} level - Current level number
   * @param {number} stars - Stars earned (1-3)
   * @returns {Object} - Breakdown of coin rewards
   */
  calculateLevelReward(level, stars) {
    const baseReward = this.LEVEL_COMPLETE_BASE_REWARD;
    const levelBonus = level * this.LEVEL_COMPLETE_PER_LEVEL;
    const starBonus = stars * this.LEVEL_COMPLETE_PER_STAR;
    const perfectBonus = stars === 3 ? this.LEVEL_COMPLETE_PERFECT_BONUS : 0;

    const total = baseReward + levelBonus + starBonus + perfectBonus;

    return {
      baseReward,
      levelBonus,
      starBonus,
      perfectBonus,
      total,
    };
  },

  /**
   * Calculate experience points for progression
   */
  calculateXP(state) {
    const score = this.calculateScore(state);
    const stars = this.calculateStars(state);

    let xp = Math.floor(score / 10);
    xp += stars * 50;
    xp += state.level * 25;
    xp += state.gemsCollected * 20;

    return xp;
  },

  /**
   * Check if player unlocks anything at this level
   */
  checkLevelUnlocks(level) {
    const unlocks = [];

    // Unlock power-ups
    if (level === 3) unlocks.push({ type: "powerup", item: "SPEED" });
    if (level === 5) unlocks.push({ type: "powerup", item: "FREEZE" });
    if (level === 8) unlocks.push({ type: "powerup", item: "MAGNET" });
    if (level === 12) unlocks.push({ type: "powerup", item: "DOUBLE_SCORE" });

    // Unlock features
    if (level === 3)
      unlocks.push({ type: "feature", item: "Zombie Chase Mode" });
    if (level === 5)
      unlocks.push({ type: "feature", item: "Random Events Enabled" });
    if (level === 10)
      unlocks.push({ type: "feature", item: "Expert Difficulty Tier" });

    return unlocks;
  },

  /**
   * Get random event configuration for a level
   */
  getRandomEventConfig(level) {
    if (level < 5) return null;

    const tier = this.getDifficultyTier(level);

    return {
      enabled: true,
      probability: Math.min(0.05 + level * 0.01, 0.2), // 5-20% per move
      events: {
        darkness: { weight: 3, duration: 300 },
        zombieSurge: { weight: 2, duration: 180 },
        bonusTime: { weight: 4, duration: 0 },
        coinRain: { weight: 2, duration: 0 },
        speedChallenge: { weight: 1, duration: 240 },
      },
      intensityMultiplier: tier.multiplier,
    };
  },

  /**
   * Legacy compatibility - checkComboBonus
   */
  checkComboBonus(currentCombo) {
    if (currentCombo > 10) {
      return 5 + Math.floor((currentCombo - 10) / 5) * 3;
    }
    return 0;
  },
};
