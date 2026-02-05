/**
 * Leaderboard & Ranking Logic
 * Handles fetching, calculating, and caching the global leaderboard
 */

import { playerRegistry } from "./playerlist.js";
import { gameShare } from "./gameshare.js";

export class Leaderboard {
  /**
   * Fetch global leaderboard by scanning all known players
   * Aggregates game records to find the best stats for each player
   */
  async fetchGlobalLeaderboard(limit = 100) {
    try {
      // 1. Fetch updated player registry (Background sync, non-blocking)
      playerRegistry
        .fetchPlayerRegistryFromBlockchain()
        .catch((e) => console.warn(e));

      // 2. FETCH GLOBAL HISTORY IN ONE PASS (Optimization)
      // Instead of N requests, we make 1 request for the last 2000 records
      console.log("Fetching global leaderboard data...");
      const globalRecords = await gameShare.fetchGlobalGameRecords(2000);

      console.log(
        `Processing ${globalRecords.length} global records for leaderboard...`,
      );

      const playerStats = {};
      const recordsByPlayer = {};

      // 3. Group records by player
      for (const record of globalRecords) {
        const p = record.player;
        if (!p) continue;
        if (!recordsByPlayer[p]) recordsByPlayer[p] = [];
        recordsByPlayer[p].push(record);
      }

      // 4. Calculate stats for each player found in history
      for (const [username, records] of Object.entries(recordsByPlayer)) {
        try {
          // Sort records by timestamp descending
          records.sort((a, b) => new Date(b.posted_at) - new Date(a.posted_at));

          // Get most recent for "current status" references
          const mostRecentRecord = records[0];
          const latestStats = mostRecentRecord.stats || {};

          // --- RESET DETECTION ---
          let validRecords = records;
          let resetIndex = -1;

          for (let i = 0; i < records.length; i++) {
            const r = records[i];
            if (
              r.stats &&
              r.stats.games_played === 0 &&
              r.stats.highest_level <= 1
            ) {
              resetIndex = i;
              break;
            }
          }

          if (resetIndex >= 0) {
            validRecords = records.slice(0, resetIndex + 1);
          }

          // --- COMPUTE TRUE BESTS ---
          let trueHighestLevel = 0;
          let trueBestScore = 0;
          let trueBestTime = null;
          let totalGems = 0;
          let threeStarCount = 0;

          for (const record of validRecords) {
            const g = record.game;
            const s = record.stats;

            if (g) {
              if ((g.level || 0) > trueHighestLevel) trueHighestLevel = g.level;
              if ((g.score || 0) > trueBestScore) trueBestScore = g.score;
              if (g.time && (trueBestTime === null || g.time < trueBestTime)) {
                trueBestTime = g.time;
              }
              totalGems += g.gems_collected || 0;
              if (g.stars === 3) threeStarCount++;
            }

            if (s) {
              // Some stats might be cumulative in the payload
              if ((s.highest_level || 0) > trueHighestLevel)
                trueHighestLevel = s.highest_level;
              if ((s.best_score || 0) > trueBestScore)
                trueBestScore = s.best_score;
              if (
                s.best_time &&
                (trueBestTime === null || s.best_time < trueBestTime)
              ) {
                trueBestTime = s.best_time;
              }
            }
          }

          // Build the player entry
          playerStats[username] = {
            name: username,
            steemUsername: username,
            gamesCount: latestStats.games_played || records.length,

            // Computed Stats
            score: trueBestScore || latestStats.best_score || 0,
            highestLevel: trueHighestLevel || latestStats.highest_level || 1,
            bestTime: trueBestTime || latestStats.best_time || null,
            totalCoins: latestStats.total_coins || 0,
            totalGemsCollected:
              totalGems || latestStats.total_gems_collected || 0,
            threeStarGames: threeStarCount || latestStats.three_star_games || 0,
            wins: latestStats.wins || records.length,

            lastPlayed: mostRecentRecord.posted_at,
          };
        } catch (e) {
          console.warn(`Failed to process records for ${username}:`, e);
        }
      }

      // 3. Calculate Rankings & Sort
      const allPlayers = Object.values(playerStats).map((player) => {
        const rankScore = this.calculatePlayerRank(player);
        return { ...player, rankScore };
      });

      // 4. Split and Sort
      const activePlayers = allPlayers
        .filter((p) => p.gamesCount > 0)
        .sort((a, b) => b.rankScore - a.rankScore)
        .slice(0, limit);

      const inactivePlayers = allPlayers
        .filter((p) => p.gamesCount === 0)
        .sort((a, b) => a.steemUsername.localeCompare(b.steemUsername));

      const leaderboardData = {
        active: activePlayers,
        inactive: inactivePlayers,
      };

      // 5. Cache result
      try {
        localStorage.setItem(
          "steemmaze_leaderboard_cache",
          JSON.stringify({
            data: leaderboardData,
            timestamp: Date.now(),
          }),
        );
      } catch (e) {
        console.warn("Failed to cache leaderboard", e);
      }

      return leaderboardData;
    } catch (error) {
      console.error("Error fetching global leaderboard:", error);

      // Fallback to cache
      const cached = localStorage.getItem("steemmaze_leaderboard_cache");
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          return parsed.data || { active: [], inactive: [] };
        } catch (e) {}
      }
      return { active: [], inactive: [] };
    }
  }

  /**
   * Calculate a ranking score for a player
   * Higher score = better ranking
   */
  calculatePlayerRank(playerStats) {
    let rankScore = 0;

    // Score is 40% of ranking
    rankScore += (playerStats.score || 0) * 0.4;

    // Level is 30% of ranking (approx 1000 pts per level)
    rankScore += (playerStats.highestLevel || 0) * 1000 * 0.3;

    // Three-star games are 15% of ranking (approx 500 pts per perf game)
    rankScore += (playerStats.threeStarGames || 0) * 500 * 0.15;

    // Gems collected are 10% of ranking
    rankScore += (playerStats.totalGemsCollected || 0) * 100 * 0.1;

    // Best time bonus (lower is better) - 5% of ranking
    if (playerStats.bestTime) {
      // Bonus decreases as time increases, capped at 0
      rankScore += Math.max(0, 500 - playerStats.bestTime) * 0.05;
    }

    return Math.round(rankScore);
  }
}

// Export singleton
export const leaderboard = new Leaderboard();
