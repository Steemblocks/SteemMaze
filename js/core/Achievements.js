/**
 * Achievements Configuration
 * Defines all game achievements and their unlock conditions
 */

export const ACHIEVEMENTS = [
  {
    id: "first_win",
    name: "First Victory",
    icon: "emoji_events",
    description: "Win your first game",
    condition: (d) => d.wins >= 1,
  },
  {
    id: "dedicated",
    name: "Dedicated",
    icon: "history",
    description: "Play 20 games",
    condition: (d) => d.gamesPlayed >= 20,
  },
  {
    id: "speed_runner",
    name: "Speed Runner",
    icon: "shutter_speed",
    description: "Win a level in under 30 seconds",
    condition: (d) => d.bestTime > 0 && d.bestTime <= 30,
  },
  {
    id: "marathon",
    name: "Marathon",
    icon: "directions_walk",
    description: "Walk a total of 5000 steps",
    condition: (d) => d.totalSteps >= 5000,
  },
  {
    id: "climber",
    name: "Level Up",
    icon: "trending_up",
    description: "Reach Level 5",
    condition: (d) => d.highestLevel >= 5,
  },
  {
    id: "maze_master",
    name: "Maze Master",
    icon: "military_tech",
    description: "Reach Level 10",
    condition: (d) => d.highestLevel >= 10,
  },
  {
    id: "coin_collector",
    name: "Coin Collector",
    icon: "savings",
    description: "Collect 200 Coins",
    condition: (d) => (d.totalCoins || 0) >= 200,
  },
  {
    id: "wealthy_walker",
    name: "Wealthy Walker",
    icon: "monetization_on",
    description: "Collect 1000 Coins",
    condition: (d) => (d.totalCoins || 0) >= 1000,
  },
  {
    id: "zombie_hunter",
    name: "Zombie Hunter",
    icon: "auto_fix_high",
    description: "Purify 5 Zombies",
    condition: (d) => (d.totalZombiesPurified || 0) >= 5,
  },
  {
    id: "sanctifier",
    name: "Sanctifier",
    icon: "verified",
    description: "Purify 25 Zombies",
    condition: (d) => (d.totalZombiesPurified || 0) >= 25,
  },
  {
    id: "high_scorer",
    name: "High Scorer",
    icon: "scoreboard",
    description: "Get a score of 5000+",
    condition: (d) => d.bestScore >= 5000,
  },
];

/**
 * Check if an achievement is unlocked
 * @param {string} achievementId - The achievement ID to check
 * @param {object} gameData - The player's game data
 * @returns {boolean} - Whether the achievement is unlocked
 */
export function isAchievementUnlocked(achievementId, gameData) {
  const achievement = ACHIEVEMENTS.find((a) => a.id === achievementId);
  return achievement ? achievement.condition(gameData) : false;
}

/**
 * Get all unlocked achievements for a player
 * @param {object} gameData - The player's game data
 * @returns {array} - Array of unlocked achievements
 */
export function getUnlockedAchievements(gameData) {
  return ACHIEVEMENTS.filter((a) => a.condition(gameData));
}

/**
 * Get achievement progress percentage
 * @param {object} gameData - The player's game data
 * @returns {number} - Percentage of achievements unlocked (0-100)
 */
export function getAchievementProgress(gameData) {
  const unlocked = getUnlockedAchievements(gameData).length;
  return Math.round((unlocked / ACHIEVEMENTS.length) * 100);
}
