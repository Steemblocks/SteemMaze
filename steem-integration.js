/**
 * Steem Integration Module
 * Handles posting game records to Steem blockchain and fetching data
 * Uses Steem Keychain for posting and direct API calls for fetching
 * Supports multiple Steem nodes with user preference selection
 */

const STEEM_WEB_URL = "https://steemit.com";

// Available Steem nodes
const STEEM_NODES = {
  moecki: "https://api.moecki.online",
  steemworld: "https://steemd.steemworld.org",
  pennsif: "https://api.pennsif.net",
  steemit: "https://api.steemit.com",
  justyy: "https://api.justyy.com",
  wherein: "https://api.wherein.io",
  steememory: "https://api.steememory.com",
  boylikegirl: "https://steemapi.boylikegirl.club",
  steemitdev: "https://api.steemitdev.com",
};

export class SteemIntegration {
  constructor() {
    this.username = null;
    this.isConnected = false;
    this.currentNode = "steemit"; // Default node
    this.currentNodeUrl = STEEM_NODES.steemit;
    this.customNode = null;
    this.loadNodePreference();

    // ============================================
    // PLAYER REGISTRY CONFIGURATION
    // ============================================
    // This dedicated account broadcasts the list of active players
    // The posting key allows broadcasting custom_json only (no fund transfers)
    // SECURITY: This key is visible in client code - use a dedicated game account only!
    this.registryConfig = {
      account: "steemmaze",
      // SECURITY: Do NOT commit real keys to Git!
      // Set this via environment variable or local config file
      // The posting key allows broadcasting custom_json only (no fund transfers)
      postingKey: "YOUR_POSTING_KEY_HERE",
      // How often to broadcast updates (in milliseconds) - default 1 hour
      broadcastInterval: 60 * 60 * 1000,
      // Custom JSON ID for player registry
      jsonId: "steemmaze_players",
    };

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
   * Load user's node preference from localStorage
   */
  loadNodePreference() {
    const saved = localStorage.getItem("steemNodePreference");
    if (saved) {
      if (saved.startsWith("custom:")) {
        this.customNode = saved.substring(7);
        this.currentNodeUrl = this.customNode;
        this.currentNode = "custom";
        console.log("Loaded custom Steem node:", this.customNode);
      } else if (STEEM_NODES[saved]) {
        this.currentNode = saved;
        this.currentNodeUrl = STEEM_NODES[saved];
        console.log(
          "Loaded Steem node:",
          this.currentNode,
          this.currentNodeUrl,
        );
      }
    }
  }

  /**
   * Set the active Steem node
   */
  setNode(nodeName) {
    if (nodeName === "custom") {
      if (!this.customNode) {
        console.warn("No custom node set");
        return false;
      }
      this.currentNode = "custom";
      this.currentNodeUrl = this.customNode;
    } else if (STEEM_NODES[nodeName]) {
      this.currentNode = nodeName;
      this.currentNodeUrl = STEEM_NODES[nodeName];
    } else {
      console.error("Unknown node:", nodeName);
      return false;
    }
    localStorage.setItem(
      "steemNodePreference",
      this.currentNode === "custom"
        ? `custom:${this.customNode}`
        : this.currentNode,
    );
    console.log("Switched to node:", this.currentNode, this.currentNodeUrl);
    return true;
  }

  /**
   * Add or update a custom node
   */
  setCustomNode(nodeUrl) {
    if (!nodeUrl || !nodeUrl.startsWith("http")) {
      console.error("Invalid node URL");
      return false;
    }
    this.customNode = nodeUrl;
    // Automatically switch to custom node
    this.setNode("custom");
    console.log("Custom node set:", nodeUrl);
    return true;
  }

  /**
   * Get list of available nodes
   */
  getAvailableNodes() {
    return {
      preset: Object.entries(STEEM_NODES).map(([key, url]) => ({
        name: key,
        url: url,
        label: this.formatNodeName(key),
      })),
      custom: this.customNode ? { url: this.customNode } : null,
    };
  }

  /**
   * Format node name for display
   */
  formatNodeName(name) {
    return name
      .split(/(?=[A-Z])|_/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  /**
   * Set the username (from Keychain login)
   */
  setUsername(username) {
    this.username = username;
    this.isConnected = true;
    console.log(`Steem Integration: Connected as @${username}`);

    // Add this player to the registry
    this.addPlayerToRegistry(username);
  }

  // ============================================
  // PLAYER REGISTRY METHODS
  // ============================================

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
        console.log(
          `Loaded ${this.playerRegistry.size} players from registry cache`,
        );
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
      console.log(`🆕 New player discovered: ${username}`);
      this.savePlayerRegistry();
      this.pendingRegistryUpdate = true;

      // Broadcast IMMEDIATELY for new players
      this.broadcastPlayerRegistry().then((success) => {
        if (success) {
          console.log(`✅ Player ${username} added to blockchain registry`);
        }
      });
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
        console.log("⏰ Periodic registry sync triggered");
        this.broadcastPlayerRegistry();
      }
    }, this.registryConfig.broadcastInterval);

    console.log("🔄 Periodic registry sync started (every 1 hour)");
  }

  /**
   * Check if posting key is configured
   */
  isRegistryConfigured() {
    return this.registryConfig.postingKey !== "YOUR_POSTING_KEY_HERE";
  }
  /**
   * Fetch player registry from the steemmaze account on blockchain
   * Returns array of player usernames
   */
  async fetchPlayerRegistryFromBlockchain() {
    try {
      console.log("Fetching player registry from blockchain...");

      const response = await fetch(this.currentNodeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "condenser_api.get_account_history",
          params: [this.registryConfig.account, -1, 100],
          id: 1,
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error.message);
      }

      const history = result.result || [];

      // Find the most recent steemmaze_players custom_json
      for (const entry of history) {
        if (!Array.isArray(entry) || entry.length < 2) continue;

        const operation = entry[1];
        if (!operation || !operation.op) continue;

        const [opType, opData] = operation.op;

        if (
          opType === "custom_json" &&
          opData.id === this.registryConfig.jsonId
        ) {
          try {
            const json = JSON.parse(opData.json);
            if (json.players && Array.isArray(json.players)) {
              console.log(
                `Found player registry with ${json.players.length} players`,
              );

              // Merge with local registry
              json.players.forEach((p) => this.playerRegistry.add(p));
              this.savePlayerRegistry();

              return json.players;
            }
          } catch (e) {
            console.warn("Failed to parse registry JSON:", e);
          }
        }
      }

      console.log("No player registry found on blockchain");
      return [];
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
    if (this.registryConfig.postingKey === "YOUR_POSTING_KEY_HERE") {
      console.warn(
        "Player registry broadcast skipped: posting key not configured",
      );
      return false;
    }

    try {
      console.log(
        `Broadcasting player registry with ${this.playerRegistry.size} players...`,
      );

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
      // The client-side steem library should be loaded
      if (typeof steem === "undefined") {
        console.error("Steem library not loaded");
        return false;
      }

      // Set node
      steem.api.setOptions({ url: this.currentNodeUrl });

      const result = await new Promise((resolve, reject) => {
        steem.broadcast.customJson(
          this.registryConfig.postingKey,
          [], // required_auths (empty for posting)
          [this.registryConfig.account], // required_posting_auths
          this.registryConfig.jsonId,
          JSON.stringify(customJsonData),
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          },
        );
      });

      console.log("✓ Player registry broadcast successful:", result);
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
   * Call from console: steemIntegration.forceBroadcastRegistry()
   */
  async forceBroadcastRegistry() {
    console.log("🚀 Force broadcasting player registry...");
    this.pendingRegistryUpdate = true;
    const result = await this.broadcastPlayerRegistry();
    if (result) {
      console.log("✅ Registry broadcast successful!");
    } else {
      console.log("❌ Registry broadcast failed!");
    }
    return result;
  }

  /**
   * Debug: Show current registry status
   * Call from console: steemIntegration.debugRegistry()
   */
  debugRegistry() {
    console.log("=== PLAYER REGISTRY DEBUG ===");
    console.log("Account:", this.registryConfig.account);
    console.log(
      "Key configured:",
      this.registryConfig.postingKey !== "YOUR_POSTING_KEY_HERE",
    );
    console.log("Players in registry:", this.playerRegistry.size);
    console.log("Player list:", Array.from(this.playerRegistry));
    console.log(
      "Last broadcast:",
      this.registryLastBroadcast
        ? new Date(this.registryLastBroadcast).toISOString()
        : "Never",
    );
    console.log("Pending update:", this.pendingRegistryUpdate);
    console.log(
      "Broadcast interval:",
      this.registryConfig.broadcastInterval / 1000 / 60,
      "minutes",
    );
    console.log("=============================");
  }
  /**
   * Post game record to Steem blockchain using Keychain
   * Uses custom_json operation for pure data storage
   */
  async postGameRecord(gameData) {
    if (!this.username) {
      console.warn("Not connected to Steem - no username set");
      return null;
    }

    try {
      // Create pure JSON game data structure
      const gameRecord = {
        app: "steemmaze",
        version: "1.0",
        type: "game_completion",
        player: this.username,
        game: {
          level: gameData.level,
          score: gameData.score,
          time: gameData.time,
          moves: gameData.moves,
          gems_collected: gameData.gems,
          total_gems: gameData.totalGems,
          stars: gameData.stars,
          maze_size: gameData.mazeSize,
          timestamp: new Date().toISOString(),
        },
        stats: {
          games_played: gameData.gamesPlayed,
          wins: gameData.wins,
          losses: gameData.losses,
          total_coins: gameData.totalCoins,
          total_zombies_purified: gameData.totalZombiesPurified,
          total_steps: gameData.totalSteps,
          highest_level: gameData.highestLevel,
          best_score: gameData.bestScore,
          achievements: gameData.achievements,
        },
      };

      // Check if window.steem_keychain exists (Keychain extension)
      if (typeof window.steem_keychain === "undefined") {
        console.error(
          "Steem Keychain extension not found - make sure it's installed",
        );
        throw new Error("Steem Keychain extension not found");
      }

      console.log(
        "Attempting to post game record to Steem with username:",
        this.username,
      );
      console.log("Game data:", gameRecord);

      // Create custom_json operation for pure JSON data storage (more efficient than posts)
      const customJsonOperation = [
        "custom_json",
        {
          required_auths: [],
          required_posting_auths: [this.username],
          id: "steemmaze_game_record",
          json: JSON.stringify(gameRecord),
        },
      ];

      // Use Keychain requestBroadcast API
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(
            new Error(
              "Steem Keychain posting timeout - no response from extension",
            ),
          );
        }, 10000); // 10 second timeout

        window.steem_keychain.requestBroadcast(
          this.username,
          [customJsonOperation],
          "posting",
          (response) => {
            clearTimeout(timeoutId);
            console.log("Keychain response:", response);

            if (response.success) {
              console.log("Game record posted to Steem blockchain:", response);
              console.log("Transaction ID:", response.result?.transaction_id);

              // Register this player as active for leaderboard discovery
              this.registerActivePlayer(this.username);

              resolve({
                success: true,
                txId: response.result?.transaction_id,
                timestamp: new Date().toISOString(),
              });
            } else {
              // Extract error message properly - Keychain sometimes returns object
              let errorMessage = "Unknown error";
              if (typeof response.error === "string") {
                errorMessage = response.error;
              } else if (typeof response.message === "string") {
                errorMessage = response.message;
              } else if (response.error?.message) {
                errorMessage = response.error.message;
              } else if (response.error) {
                errorMessage = JSON.stringify(response.error);
              }

              console.error("Failed to post game record:", errorMessage);
              console.error(
                "Full response:",
                JSON.stringify(response, null, 2),
              );

              reject(new Error(`Keychain error: ${errorMessage}`));
            }
          },
        );
      });
    } catch (error) {
      console.error("Error posting game record to Steem:", error);
      throw error;
    }
  }

  /**
   * Post a blog post about game achievement to Steem blockchain
   * Creates a formatted blog post with game stats
   */
  async postGameBlog(gameData) {
    if (!this.username) {
      throw new Error("Not connected to Steem");
    }

    // Generate permlink from username and timestamp
    const timestamp = Date.now();
    const permlink = `steemmaze-level-${gameData.level}-${timestamp}`;

    // Generate stars display
    const starsDisplay =
      "⭐".repeat(gameData.stars) + "☆".repeat(3 - gameData.stars);

    // Create blog post body with markdown
    const body = `
# 🎮 SteemMaze Level ${gameData.level} Complete!

${starsDisplay}

---

## 📊 Game Stats

| Stat | Value |
|------|-------|
| 🏆 Score | **${gameData.score.toLocaleString()}** |
| ⏱️ Time | **${gameData.timeFormatted}** |
| 👣 Steps | **${gameData.moves}** |
| 💎 Gems | **${gameData.gems}/${gameData.totalGems}** |
| 💰 Coins Earned | **${gameData.coinsEarned}** |
| 💀 Zombies Killed | **${gameData.zombiesKilled}** |
| ⚡ Max Combo | **${gameData.maxCombo}** |

---

## 🎯 Achievement Summary

${gameData.stars === 3 ? "🌟 **PERFECT COMPLETION!** All 3 stars earned!" : ""}
${gameData.isNewRecord ? "🏅 **NEW PERSONAL RECORD!**" : ""}
${
  gameData.zombiesKilled > 0
    ? `🧟 **Zombie Slayer:** Defeated ${gameData.zombiesKilled} zombies!`
    : ""
}
${
  gameData.maxCombo >= 10
    ? `🔥 **Combo Master:** Reached ${gameData.maxCombo}x combo!`
    : ""
}

---

<center>

**Play SteemMaze: The Enchanted Garden**

*A blockchain-integrated 3D maze game on Steem*

[🎮 Play Now](https://steemmaze.com)

</center>

---

*This post was automatically generated by SteemMaze.*
*Posted by @${this.username}*

#steemmaze #gaming #blockchain #steem #play2earn
`;

    // Create post metadata
    const jsonMetadata = JSON.stringify({
      app: "steemmaze/1.0",
      format: "markdown",
      tags: ["steemmaze", "gaming", "blockchain", "steem", "play2earn"],
      game: {
        level: gameData.level,
        score: gameData.score,
        stars: gameData.stars,
        time: gameData.time,
        gems: gameData.gems,
        totalGems: gameData.totalGems,
      },
    });

    const title = `🎮 SteemMaze: Level ${
      gameData.level
    } Complete! | Score: ${gameData.score.toLocaleString()} | ${starsDisplay}`;

    console.log("Posting blog to Steem:", { title, permlink });

    // Check for Keychain
    if (typeof window.steem_keychain === "undefined") {
      throw new Error("Steem Keychain extension not found");
    }

    // Create the comment operation (blog posts are comments with empty parent_author)
    const commentOperation = [
      "comment",
      {
        parent_author: "", // Empty for main posts (not a reply)
        parent_permlink: "steemmaze", // First tag / category
        author: this.username,
        permlink: permlink,
        title: title,
        body: body,
        json_metadata: jsonMetadata,
      },
    ];

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Steem Keychain posting timeout"));
      }, 60000); // 60 second timeout

      // Use requestBroadcast with posting key
      window.steem_keychain.requestBroadcast(
        this.username,
        [commentOperation],
        "posting", // Use posting key for blog posts
        (response) => {
          clearTimeout(timeoutId);
          console.log("Blog post response:", response);

          if (response.success) {
            console.log("Blog posted successfully!");
            const postUrl = `https://steemit.com/@${this.username}/${permlink}`;
            resolve({
              success: true,
              url: postUrl,
              permlink: permlink,
              txId: response.result?.id,
            });
          } else {
            let errorMessage = "Unknown error";
            if (typeof response.error === "string") {
              errorMessage = response.error;
            } else if (response.message) {
              errorMessage = response.message;
            } else if (response.error?.message) {
              errorMessage = response.error.message;
            }
            reject(new Error(`Keychain error: ${errorMessage}`));
          }
        },
      );
    });
  }

  /**
   * Fetch game records from Steem blockchain
   */
  async fetchGameRecords(username, limit = 10) {
    try {
      // Use the selected Steem node for API calls
      const response = await fetch(this.currentNodeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "call",
          params: [
            "database_api",
            "get_discussions_by_blog",
            {
              tag: username,
              limit: 100,
            },
          ],
          id: 1,
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const result = await response.json();
      const posts = result.result || [];

      // Filter for SteemMaze game records
      const gameRecords = [];
      for (const post of posts) {
        try {
          const metadata = JSON.parse(post.json_metadata);
          if (
            metadata.app &&
            metadata.app.includes("steemmaze") &&
            metadata.game
          ) {
            gameRecords.push({
              title: post.title,
              url: `${STEEM_WEB_URL}/@${post.author}/${post.permlink}`,
              game: metadata.game,
              posted_at: post.created,
              votes: post.net_votes,
              rewards: post.pending_payout_value,
            });
          }
        } catch (e) {
          // Skip posts with invalid JSON
          continue;
        }
      }

      return gameRecords.slice(0, limit);
    } catch (error) {
      console.error("Error fetching game records:", error);
      throw error;
    }
  }

  /**
   * Get player's best achievements from blockchain
   */
  async getPlayerAchievements(username) {
    try {
      const records = await this.fetchGameRecords(username, 100);

      const achievements = {
        highest_level: 0,
        highest_score: 0,
        total_games: records.length,
        three_star_games: 0,
        total_gems_collected: 0,
        average_time: 0,
        records: records,
      };

      let totalTime = 0;

      for (const record of records) {
        if (record.game.level > achievements.highest_level) {
          achievements.highest_level = record.game.level;
        }
        if (record.game.score > achievements.highest_score) {
          achievements.highest_score = record.game.score;
        }
        if (record.game.stars === 3) {
          achievements.three_star_games++;
        }
        achievements.total_gems_collected += record.game.gems_collected || 0;
        totalTime += record.game.time || 0;
      }

      if (records.length > 0) {
        achievements.average_time = Math.round(totalTime / records.length);
      }

      return achievements;
    } catch (error) {
      console.error("Error getting player achievements:", error);
      throw error;
    }
  }

  /**
   * Fetch game records from custom_json operations on blockchain
   * Uses pagination since API limits to 100 entries per request
   */
  async fetchGameRecordsFromCustomJson(username, maxRecords = 1000) {
    try {
      console.log("Fetching custom_json game records for:", username);
      console.log("Using node:", this.currentNodeUrl);

      const gameRecords = [];
      let from = -1; // Start from most recent
      const batchSize = 100; // API limit
      let totalFetched = 0;
      let hasMore = true;

      while (hasMore && totalFetched < maxRecords) {
        console.log(`Fetching batch from index ${from}...`);

        const requestBody = {
          jsonrpc: "2.0",
          method: "condenser_api.get_account_history",
          params: [username, from, batchSize],
          id: 1,
        };

        const response = await fetch(this.currentNodeUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error(`API Error: ${response.status}`);
        }

        const result = await response.json();

        if (result.error) {
          console.error("API returned error:", result.error);
          throw new Error(result.error.message || JSON.stringify(result.error));
        }

        const history = result.result || [];
        console.log(`Received ${history.length} entries in this batch`);

        if (history.length === 0) {
          hasMore = false;
          break;
        }

        totalFetched += history.length;

        // Process each entry
        for (const entry of history) {
          if (!Array.isArray(entry) || entry.length < 2) continue;

          const entryIndex = entry[0];
          const operation = entry[1];
          if (!operation || !operation.op) continue;

          const [opType, opData] = operation.op;

          if (
            opType === "custom_json" &&
            opData.id === "steemmaze_game_record"
          ) {
            try {
              const json = JSON.parse(opData.json);

              if (json.app && json.app === "steemmaze" && json.game) {
                gameRecords.push({
                  game: json.game,
                  stats: json.stats,
                  timestamp: operation.timestamp,
                  posted_at: operation.timestamp,
                  block: operation.block,
                  trx_id: operation.trx_id,
                });
                console.log(
                  `✓ Found game record: Level ${json.game.level}, Score ${json.game.score}`,
                );
              }
            } catch (e) {
              console.warn("Failed to parse game record JSON:", e);
            }
          }
        }

        // Get the lowest index for next batch
        const lowestIndex = history.reduce(
          (min, entry) => Math.min(min, entry[0]),
          Infinity,
        );

        // If we got the same or lower index, we've reached the beginning
        if (lowestIndex <= 0 || lowestIndex >= from - 1) {
          hasMore = false;
        } else {
          from = lowestIndex - 1;
        }

        // Small delay to not hammer the API
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      console.log(
        `Total fetched: ${totalFetched} entries, found ${gameRecords.length} game records`,
      );

      // Sort by timestamp descending (newest first)
      gameRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return gameRecords;
    } catch (error) {
      console.error("Error fetching custom_json game records:", error);
      throw error;
    }
  }

  /**
   * Fetch global leaderboard from blockchain
   * Uses the MOST RECENT game record from each player (contains their best stats)
   */
  async fetchGlobalLeaderboard(limit = 100) {
    try {
      console.log("Fetching global leaderboard from blockchain...");

      // First, try to fetch the player registry from blockchain
      await this.fetchPlayerRegistryFromBlockchain();

      // Get all known players (registry + local cache + hardcoded fallbacks)
      const uniquePlayers = this.getAllKnownPlayers();

      console.log(`Checking ${uniquePlayers.length} known players...`);

      const playerStats = {};
      let totalRecordsFound = 0;

      // Fetch records for each known player
      for (const username of uniquePlayers) {
        try {
          // Fetch more records to scan for true highest values (200 games covers most players)
          const records = await this.fetchPlayerGameRecords(username, 200);

          if (records.length > 0) {
            totalRecordsFound += records.length;

            // Get the MOST RECENT record (first in array, as they're sorted newest first)
            const mostRecentRecord = records[0];
            const game = mostRecentRecord.game;
            const stats = mostRecentRecord.stats;

            if (!game) continue;

            // Scan ALL records to find the TRUE highest values
            // This prevents issues where replaying a lower level shows incorrect data
            let trueHighestLevel = 0;
            let trueBestScore = 0;
            let trueBestTime = null;
            let totalGems = 0;
            let threeStarCount = 0;

            for (const record of records) {
              const g = record.game;
              const s = record.stats;

              if (g) {
                // Check game record for highest level
                if ((g.level || 0) > trueHighestLevel) {
                  trueHighestLevel = g.level;
                }
                // Check game record for best score
                if ((g.score || 0) > trueBestScore) {
                  trueBestScore = g.score;
                }
                // Check for best time (lower is better)
                if (
                  g.time &&
                  (trueBestTime === null || g.time < trueBestTime)
                ) {
                  trueBestTime = g.time;
                }
                // Accumulate gems
                totalGems += g.gems_collected || 0;
                // Count 3-star games
                if (g.stars === 3) threeStarCount++;
              }

              // Also check stats object which may have cumulative best values
              if (s) {
                if ((s.highest_level || 0) > trueHighestLevel) {
                  trueHighestLevel = s.highest_level;
                }
                if ((s.best_score || 0) > trueBestScore) {
                  trueBestScore = s.best_score;
                }
                if (
                  s.best_time &&
                  (trueBestTime === null || s.best_time < trueBestTime)
                ) {
                  trueBestTime = s.best_time;
                }
              }
            }

            // Use the computed true values, with fallbacks to most recent record's stats
            playerStats[username] = {
              name: username,
              steemUsername: username,
              gamesCount: stats?.games_played || records.length,

              // Use TRUE highest values computed from ALL records
              score: trueBestScore || stats?.best_score || game.score || 0,
              highestLevel:
                trueHighestLevel || stats?.highest_level || game.level || 0,
              bestTime: trueBestTime || stats?.best_time || game.time || null,
              totalCoins: stats?.total_coins || 0,
              totalGemsCollected: totalGems || game.gems_collected || 0,
              threeStarGames:
                threeStarCount ||
                stats?.three_star_games ||
                (game.stars === 3 ? 1 : 0),
              wins: stats?.wins || records.length,

              // Store the timestamp for reference
              lastPlayed: mostRecentRecord.timestamp,
            };

            console.log(
              `✓ ${username}: Level ${playerStats[username].highestLevel}, Score ${playerStats[username].score} (from ${records.length} records, scanned all)`,
            );
          }
        } catch (e) {
          console.warn(`Failed to fetch records for ${username}:`, e.message);
          continue;
        }
      }

      // Calculate rankings (each player appears only ONCE)
      const leaderboard = Object.values(playerStats)
        .map((player) => {
          const rankScore = this.calculatePlayerRank({
            score: player.score,
            highestLevel: player.highestLevel,
            bestTime: player.bestTime,
            threeStarGames: player.threeStarGames,
            totalGemsCollected: player.totalGemsCollected,
            gamesCount: player.gamesCount,
          });

          return {
            ...player,
            rankScore,
          };
        })
        .filter((p) => p.gamesCount > 0)
        .sort((a, b) => b.rankScore - a.rankScore)
        .slice(0, limit);

      console.log(
        `✓ Leaderboard complete! Found ${totalRecordsFound} records from ${
          Object.keys(playerStats).length
        } unique players`,
      );

      // Cache the leaderboard with timestamp
      localStorage.setItem(
        "steemmaze_leaderboard_cache",
        JSON.stringify({
          data: leaderboard,
          timestamp: Date.now(),
        }),
      );

      return leaderboard;
    } catch (error) {
      console.error("Error fetching global leaderboard:", error);

      // Try to return cached leaderboard
      const cached = localStorage.getItem("steemmaze_leaderboard_cache");
      if (cached) {
        const { data } = JSON.parse(cached);
        console.log("Returning cached leaderboard due to error");
        return data || [];
      }

      return [];
    }
  }

  /**
   * Fetch game records for a specific player from their account history
   * This is much faster than scanning all blocks
   */
  async fetchPlayerGameRecords(username, maxRecords = 50) {
    try {
      const response = await fetch(this.currentNodeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "condenser_api.get_account_history",
          params: [username, -1, 1000], // Last 1000 transactions to capture full game history
          id: 1,
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error.message || "API error");
      }

      const history = result.result || [];
      const gameRecords = [];

      for (const entry of history) {
        if (!Array.isArray(entry) || entry.length < 2) continue;

        const operation = entry[1];
        if (!operation || !operation.op) continue;

        const [opType, opData] = operation.op;

        if (opType === "custom_json" && opData.id === "steemmaze_game_record") {
          try {
            const json = JSON.parse(opData.json);

            if (json.app === "steemmaze" && json.game) {
              gameRecords.push({
                game: json.game,
                stats: json.stats,
                timestamp: operation.timestamp,
                block: operation.block,
              });

              // Register this player as active
              this.registerActivePlayer(username);

              if (gameRecords.length >= maxRecords) break;
            }
          } catch (e) {
            continue;
          }
        }
      }

      // Sort by timestamp (newest first) to ensure most recent is at index 0
      gameRecords.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeB - timeA;
      });

      return gameRecords;
    } catch (error) {
      console.warn(`Error fetching records for ${username}:`, error.message);
      return [];
    }
  }

  /**
   * Register a player as active when they post a game record
   * This can help optimize future scans
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
      console.log("Registered active player:", username);
    }
  }

  /**
   * Calculate a ranking score for a player based on multiple factors
   * Higher score = better ranking
   */
  calculatePlayerRank(playerStats) {
    let rankScore = 0;

    // Score is 40% of ranking
    rankScore += (playerStats.score || 0) * 0.4;

    // Level is 30% of ranking
    rankScore += (playerStats.highestLevel || 0) * 1000 * 0.3;

    // Three-star games are 15% of ranking
    rankScore += (playerStats.threeStarGames || 0) * 500 * 0.15;

    // Gems collected are 10% of ranking
    rankScore += (playerStats.totalGemsCollected || 0) * 100 * 0.1;

    // Best time bonus (lower is better) - 5% of ranking
    if (playerStats.bestTime) {
      rankScore += Math.max(0, 500 - playerStats.bestTime) * 0.05;
    }

    return Math.round(rankScore);
  }

  /**
   * Helper function to format time
   */
  _formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }
}

// Export singleton instance
export const steemIntegration = new SteemIntegration();
