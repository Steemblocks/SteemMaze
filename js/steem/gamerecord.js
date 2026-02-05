/**
 * Game Records Management
 * Handles game record queuing and batch broadcasting to Steem blockchain
 * Maintains a queue of game completions to be posted to the steemmaze account
 */

import { steemConfig, GAME_RECORDS_CONFIG } from "./steem.js";

export class GameRecords {
  constructor() {
    // Game records pending broadcast (in-memory queue)
    this.pendingGameRecords = [];
    this.gameRecordsSyncInterval = null;
    this.lastGameRecordsBroadcast = 0;
    this.isBroadcasting = false; // Lock flag to prevent concurrent broadcasts

    // Load cached game records from localStorage
    this.loadGameRecords();

    // Start periodic game records sync
    this.startPeriodicGameRecordsSync();
  }

  /**
   * Load game records from localStorage
   */
  loadGameRecords() {
    try {
      const cached = localStorage.getItem("steemmaze_game_records_queue");
      if (cached) {
        const data = JSON.parse(cached);
        this.pendingGameRecords = data.records || [];
        this.lastGameRecordsBroadcast = data.lastBroadcast || 0;
      }
    } catch (e) {
      console.warn("Failed to load game records queue:", e);
      this.pendingGameRecords = [];
    }
  }

  /**
   * Save game records queue to localStorage
   */
  saveGameRecords() {
    try {
      localStorage.setItem(
        "steemmaze_game_records_queue",
        JSON.stringify({
          records: this.pendingGameRecords,
          lastBroadcast: this.lastGameRecordsBroadcast,
          lastUpdated: Date.now(),
        }),
      );
    } catch (e) {
      console.warn("Failed to save game records queue:", e);
    }
  }

  /**
   * Add a game record to the queue for broadcasting
   * This is called when a player finishes a game
   */
  addGameRecordToQueue(gameData) {
    if (!gameData) return;

    const gameRecord = {
      player: steemConfig.username || gameData.player || "anonymous",
      level: gameData.level || 1,
      score: gameData.score || 0,
      time: gameData.time || 0,
      moves: gameData.moves || 0,
      gems_collected: gameData.gems || 0,
      total_gems: gameData.totalGems || 0,
      stars: gameData.stars || 0,
      maze_size: gameData.mazeSize || 15,
      timestamp: new Date().toISOString(),
      // Include full stats if available
      stats: gameData.stats || {
        games_played: gameData.gamesPlayed || 0,
        wins: gameData.wins || 0,
        losses: gameData.losses || 0,
        total_coins: gameData.totalCoins || 0,
        total_steps: gameData.totalSteps || 0,
        highest_level: gameData.highestLevel || 0,
        best_score: gameData.bestScore || 0,
      },
    };

    // Keep queue size manageable (max 100 records before forcing broadcast)
    if (this.pendingGameRecords.length >= 100) {
      // Remove oldest record if queue is too large
      this.pendingGameRecords.shift();
    }

    this.pendingGameRecords.push(gameRecord);
    this.saveGameRecords();

    return gameRecord;
  }

  /**
   * Start periodic game records broadcast (every 5 minutes)
   * Acts as a batch system to consolidate multiple game records
   */
  startPeriodicGameRecordsSync() {
    // Clear any existing interval
    if (this.gameRecordsSyncInterval) {
      clearInterval(this.gameRecordsSyncInterval);
    }

    // Check and broadcast every 5 minutes
    this.gameRecordsSyncInterval = setInterval(() => {
      // Only trigger if not already busy and we have records
      if (!this.isBroadcasting && this.pendingGameRecords.length > 0) {
        this.broadcastGameRecords();
      }
    }, GAME_RECORDS_CONFIG.broadcastInterval);
  }

  /**
   * Broadcast pending game records to the steemmaze account
   * Batches multiple game records into a single custom_json operation
   * Includes rate limiting to respect 3s Steem block time
   */
  async broadcastGameRecords(force = false) {
    // 1. Basic checks
    if (GAME_RECORDS_CONFIG.postingKey === "YOUR_POSTING_KEY_HERE") {
      console.warn(
        "Game records broadcast skipped: posting key not configured",
      );
      return false;
    }

    if (this.pendingGameRecords.length === 0) return false;

    // 2. RATE LIMITING & LOCKING check
    const now = Date.now();
    const timeSinceLast = now - this.lastGameRecordsBroadcast;
    // Safety buffer: Steem requires 3s per tx. We use 4s to be safe.
    const WAIT_TIME = 4000;

    if (timeSinceLast < WAIT_TIME) {
      const waitMs = WAIT_TIME - timeSinceLast;

      if (force) {
        console.debug(
          `Rate limit: Forced wait ${waitMs}ms before broadcasting...`,
        );
        // If forced, we return a Promise that waits and then retries
        return new Promise((resolve) => {
          setTimeout(async () => {
            // Retry with force=true to ensure it goes through
            const result = await this.broadcastGameRecords(true);
            resolve(result);
          }, waitMs + 100);
        });
      } else {
        console.debug(`Rate limit: Waiting ${waitMs}ms before broadcasting...`);
        // If not forced, exit and let periodic interval pick it up
        return false;
      }
    }

    if (this.isBroadcasting) {
      console.debug("Broadcast already in progress, skipping...");
      // If forced, we might want to wait for the current one?
      // For now, assume if locked, it's being handled.
      return false;
    }

    // 3. Start Broadcast
    this.isBroadcasting = true;

    try {
      // Create batch (max 50 to avoid size limits)
      const records = this.pendingGameRecords.slice(0, 50);
      const timestamp = new Date().toISOString();

      const customJsonData = {
        app: "steemmaze",
        version: "1.0",
        type: "game_records_batch",
        records: records,
        batch_size: records.length,
        broadcasted_at: timestamp,
      };

      if (typeof steem === "undefined")
        throw new Error("Steem library not loaded");

      // Set node
      steem.api.setOptions({ url: steemConfig.currentNodeUrl });

      const result = await new Promise((resolve, reject) => {
        steem.broadcast.customJson(
          GAME_RECORDS_CONFIG.postingKey,
          [],
          [GAME_RECORDS_CONFIG.account], // required_posting_auths
          GAME_RECORDS_CONFIG.jsonId,
          JSON.stringify(customJsonData),
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          },
        );
      });

      // 4. Success Handling
      // Remove ONLY the records we just broadcasted
      this.pendingGameRecords.splice(0, records.length);

      this.lastGameRecordsBroadcast = Date.now();
      this.saveGameRecords();

      console.log(`Successfully broadcast ${records.length} game records.`);
      return true;
    } catch (error) {
      console.error("Failed to broadcast game records:", error);

      // If error is related to bandwidth/rc or active transaction, we essentially just wait
      // The records remain in pendingGameRecords to be retried next time
      return false;
    } finally {
      // 5. Release Lock
      this.isBroadcasting = false;

      // If we still have pending records (because we only took 50),
      // schedule another run in 4 seconds
      if (this.pendingGameRecords.length > 0) {
        setTimeout(() => {
          this.broadcastGameRecords();
        }, 4500);
      }
    }
  }

  /**
   * Force broadcast game records immediately
   * Useful after game completion to ensure record is saved
   * Call from console: gameRecords.forceBroadcastGameRecords()
   */
  async forceBroadcastGameRecords() {
    if (this.pendingGameRecords.length === 0) {
      console.log("No pending game records to broadcast");
      return false;
    }

    const result = await this.broadcastGameRecords();
    if (result) {
      console.log("Game records broadcast successful");
    } else {
      console.log("Game records broadcast failed");
    }
    return result;
  }

  /**
   * Get status of pending game records
   */
  getGameRecordsStatus() {
    return {
      pending_count: this.pendingGameRecords.length,
      last_broadcast: new Date(this.lastGameRecordsBroadcast).toLocaleString(),
      next_broadcast_in_ms:
        GAME_RECORDS_CONFIG.broadcastInterval -
        (Date.now() - this.lastGameRecordsBroadcast),
      recent_records: this.pendingGameRecords.slice(-5),
    };
  }

  /**
   * Check if broadcast should happen immediately for this record
   */
  shouldBroadcastImmediately(gameData) {
    return (
      gameData.level === 0 || // Explicitly broadcast Reset
      gameData.stars === 3 || // Perfect completion
      (gameData.level && gameData.level % 5 === 0) || // Every 5th level
      this.pendingGameRecords.length >= 10 // Queue full
    );
  }
}

// Export singleton instance
export const gameRecords = new GameRecords();
