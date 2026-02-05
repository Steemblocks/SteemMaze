/**
 * Player Registry Management
 * Handles player list management and broadcasting to Steem blockchain
 * Maintains a registry of active players on the steemmaze account
 */

import { steemConfig, PLAYER_REGISTRY_CONFIG } from "./steem.js";

export class PlayerRegistry {
  constructor() {
    // Player registry cache (in-memory)
    this.playerRegistry = new Set();
    this.registryLastBroadcast = 0;
    this.pendingRegistryUpdate = false;
    this.registrySyncInterval = null;

    // Load cached player registry from localStorage
    this.loadPlayerRegistry();

    // Start periodic registry sync (every 1 hour backup)
    this.startPeriodicRegistrySync();
  }

  /**
   * Load player registry from localStorage
   */
  loadPlayerRegistry() {
    try {
      const cached = localStorage.getItem("steemmaze_player_registry");
      if (cached) {
        const data = JSON.parse(cached);
        this.playerRegistry = new Set(data.players || []);
        this.registryLastBroadcast = data.lastBroadcast || 0;
      }
    } catch (e) {
      console.warn("Failed to load player registry:", e);
      this.playerRegistry = new Set();
    }
  }

  /**
   * Save player registry to localStorage
   */
  savePlayerRegistry() {
    try {
      localStorage.setItem(
        "steemmaze_player_registry",
        JSON.stringify({
          players: Array.from(this.playerRegistry),
          lastBroadcast: this.registryLastBroadcast,
          lastUpdated: Date.now(),
        }),
      );
    } catch (e) {
      console.warn("Failed to save player registry:", e);
    }
  }

  /**
   * Add a player to the registry
   * Broadcasts IMMEDIATELY when a new player is discovered
   */
  addPlayerToRegistry(username) {
    if (!username) return;

    const wasNew = !this.playerRegistry.has(username);
    this.playerRegistry.add(username);

    if (wasNew) {
      this.savePlayerRegistry();
      this.pendingRegistryUpdate = true;

      // Broadcast IMMEDIATELY for new players
      this.broadcastPlayerRegistry().then((success) => {});
    }
  }

  /**
   * Start periodic registry broadcast (every 1 hour)
   * Acts as a backup to ensure registry stays synced
   */
  startPeriodicRegistrySync() {
    // Clear any existing interval
    if (this.registrySyncInterval) {
      clearInterval(this.registrySyncInterval);
    }

    // Check and broadcast every hour
    this.registrySyncInterval = setInterval(() => {
      if (this.pendingRegistryUpdate) {
        this.broadcastPlayerRegistry();
      }
    }, PLAYER_REGISTRY_CONFIG.broadcastInterval);
  }

  /**
   * Fetch player registry from the steemmaze account on blockchain
   * Returns array of player usernames
   */
  async fetchPlayerRegistryFromBlockchain() {
    try {
      const BATCH_SIZE = 100;
      const MAX_DEPTH = 1000;
      let start = -1; // Start from most recent
      let totalFetched = 0;
      let foundPlayers = new Set();
      let foundRegistry = false;

      // Loop to fetch history in batches
      while (totalFetched < MAX_DEPTH) {
        const response = await fetch(steemConfig.currentNodeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "condenser_api.get_account_history",
            params: [
              PLAYER_REGISTRY_CONFIG.account,
              start,
              start === -1 ? BATCH_SIZE : Math.min(BATCH_SIZE, start),
            ],
            id: 1,
          }),
        });

        if (!response.ok) {
          console.warn(`API Error in batch fetch: ${response.status}`);
          break;
        }

        const result = await response.json();
        if (result.error) {
          console.warn("API Error:", result.error.message);
          break;
        }

        const history = result.result || [];
        if (history.length === 0) break;

        // Process this batch history - iterate backwards (newest first)
        for (let i = history.length - 1; i >= 0; i--) {
          const entry = history[i];
          const [sequenceId, operation] = entry;

          if (!operation || !operation.op) continue;

          const [opType, opData] = operation.op;

          if (
            opType === "custom_json" &&
            opData.id === PLAYER_REGISTRY_CONFIG.jsonId
          ) {
            try {
              const json = JSON.parse(opData.json);
              if (json.players && Array.isArray(json.players)) {
                // Add ALL players found in this update to our set
                json.players.forEach((p) => {
                  this.playerRegistry.add(p);
                  foundPlayers.add(p);
                });
                foundRegistry = true;
              }
            } catch (e) {
              console.warn("Failed to parse registry JSON:", e);
            }
          }
        }

        // Prepare for next batch
        // The first item in the list is the oldest of this batch (lowest sequence ID)
        const oldestItem = history[0];
        const oldestSequenceId = oldestItem[0];

        if (oldestSequenceId === 0) break; // Reached the beginning of history

        // Update start for next iteration (one less than the oldest we just saw)
        start = oldestSequenceId - 1;
        totalFetched += history.length;

        // Optimization: If we found a registry and have searched enough, we can maybe stop?
        // But for now, let's search deep to be sure we get the full list if updates were incremental.
      }

      this.savePlayerRegistry();
      return Array.from(foundPlayers);
    } catch (error) {
      console.error("Failed to fetch player registry:", error);
      return [];
    }
  }

  /**
   * Broadcast the current player registry to the Steem blockchain
   * Uses the steemmaze account's posting key
   */
  async broadcastPlayerRegistry() {
    if (PLAYER_REGISTRY_CONFIG.postingKey === "YOUR_POSTING_KEY_HERE") {
      console.warn(
        "Player registry broadcast skipped: posting key not configured",
      );
      return false;
    }

    try {
      const players = Array.from(this.playerRegistry);

      const customJsonData = {
        app: "steemmaze",
        version: "1.0",
        type: "player_registry",
        players: players,
        updated_at: new Date().toISOString(),
        count: players.length,
      };

      // Use steem-js library for direct broadcast
      if (typeof steem === "undefined") {
        console.error("Steem library not loaded");
        return false;
      }

      // Set node
      steem.api.setOptions({ url: steemConfig.currentNodeUrl });

      const result = await new Promise((resolve, reject) => {
        steem.broadcast.customJson(
          PLAYER_REGISTRY_CONFIG.postingKey,
          [], // required_auths (empty for posting)
          [PLAYER_REGISTRY_CONFIG.account], // required_posting_auths
          PLAYER_REGISTRY_CONFIG.jsonId,
          JSON.stringify(customJsonData),
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          },
        );
      });

      this.registryLastBroadcast = Date.now();
      this.pendingRegistryUpdate = false;
      this.savePlayerRegistry();

      return true;
    } catch (error) {
      console.error("Failed to broadcast player registry:", error);
      return false;
    }
  }

  /**
   * Get all known players (from registry + local cache)
   */
  getAllKnownPlayers() {
    // Combine registry with localStorage active players
    const localPlayers = JSON.parse(
      localStorage.getItem("steemmaze_active_players") || "[]",
    );

    const allPlayers = new Set([
      ...this.playerRegistry,
      ...localPlayers,
      // Hardcoded known players as fallback
      "tomoyan",
      "justyy",
      "steevc",
      "pennsif",
      "boylikegirl",
      "moecki",
      "steemchiller",
      "cryptomaker",
    ]);

    return Array.from(allPlayers);
  }

  /**
   * Force broadcast player registry immediately (for testing/debugging)
   * Call from console: playerRegistry.forceBroadcastRegistry()
   */
  async forceBroadcastRegistry() {
    this.pendingRegistryUpdate = true;
    const result = await this.broadcastPlayerRegistry();
    return result;
  }

  /**
   * Register a player as active when they post a game record
   */
  registerActivePlayer(username) {
    if (!username) return;

    let activePlayers = JSON.parse(
      localStorage.getItem("steemmaze_active_players") || "[]",
    );

    if (!activePlayers.includes(username)) {
      activePlayers.push(username);
      localStorage.setItem(
        "steemmaze_active_players",
        JSON.stringify(activePlayers),
      );
    }
  }

  /**
   * Get player registry status
   */
  getRegistryStatus() {
    return {
      total_players: this.playerRegistry.size,
      last_broadcast: new Date(this.registryLastBroadcast).toLocaleString(),
      pending_update: this.pendingRegistryUpdate,
      players_list: Array.from(this.playerRegistry),
    };
  }
}

// Export singleton instance
export const playerRegistry = new PlayerRegistry();
