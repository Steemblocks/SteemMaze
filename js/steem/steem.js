/**
 * Steem Integration Configuration
 * Centralized configuration for Steem account settings and posting keys
 * Handles node management and authentication
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

// ============================================
// PLAYER REGISTRY CONFIGURATION
// ============================================
const PLAYER_REGISTRY_CONFIG = {
  account: "steemmaze",
  postingKey: "YOUR_POSTING_KEY_HERE",
  broadcastInterval: 60 * 60 * 1000, // 1 hour
  jsonId: "steemmaze_players",
};

// ============================================
// GAME RECORDS CONFIGURATION
// ============================================
const GAME_RECORDS_CONFIG = {
  account: "steemmaze",
  postingKey: "YOUR_POSTING_KEY_HERE",
  broadcastInterval: 5 * 60 * 1000, // 5 minutes
  jsonId: "steemmaze_game_record",
};

/**
 * SteemConfig - Centralized configuration management
 */
export class SteemConfig {
  constructor() {
    this.username = null;
    this.isConnected = false;
    this.currentNode = "steemit"; // Default node
    this.currentNodeUrl = STEEM_NODES.steemit;
    this.customNode = null;

    this.loadNodePreference();
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
      } else if (STEEM_NODES[saved]) {
        this.currentNode = saved;
        this.currentNodeUrl = STEEM_NODES[saved];
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
    this.setNode("custom");
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
  }

  /**
   * Clear connection state
   */
  disconnect() {
    this.username = null;
    this.isConnected = false;
  }

  /**   * Load credentials from external steem-config.local.js
   * This is the preferred way to load credentials
   *
   * Usage:
   *   const config = await steemConfig.loadFromConfigFile();
   *   console.log(config.gameAccount.username); // 'steemmaze'
   */
  async loadFromConfigFile() {
    try {
      // Try to import the local config file
      // Note: This will only work if steem-config.local.js exists in the root
      // Try to fetch the config file from the root directory
      // This method avoids build-time import resolution issues
      const response = await fetch("/steem-config.local.js");

      if (!response.ok) {
        console.warn(
          "⚠ steem-config.local.js not found (will use environment variables)",
        );
        return null;
      }

      const text = await response.text();

      // Create a module from the text and evaluate it
      const blob = new Blob([text], { type: "application/javascript" });
      const moduleUrl = URL.createObjectURL(blob);
      const module = await import(/* @vite-ignore */ moduleUrl);
      const externalConfig = module.steemConfig;

      URL.revokeObjectURL(moduleUrl);

      if (externalConfig) {
        // Store the external config for later use
        this.externalConfig = externalConfig;

        // 1. Set GAME ACCOUNT keys (the primary purpose of this file now)
        if (
          externalConfig.gameAccount?.postingKey &&
          !externalConfig.gameAccount.postingKey.includes("YOUR_")
        ) {
          // Use this ONE key for BOTH registry and game records
          const key = externalConfig.gameAccount.postingKey;
          const account = externalConfig.gameAccount.username || "steemmaze";

          this.setPlayerRegistryKey(key);
          this.setGameRecordsKey(key);

          // Also allow overriding the account name if needed
          PLAYER_REGISTRY_CONFIG.account = account;
          GAME_RECORDS_CONFIG.account = account;
        }

        // 2. Set node preferences if available
        if (
          externalConfig.node?.default &&
          externalConfig.node.default in STEEM_NODES
        ) {
          this.setNode(externalConfig.node.default);
        }
        if (externalConfig.node?.custom) {
          this.setCustomNode(externalConfig.node.custom);
        }

        console.log("✓ Steem configuration loaded from steem-config.local.js");
        return externalConfig;
      }
    } catch (error) {
      // Silently fail if file not found or other errors
      // This is expected in production or if file doesn't exist
      if (import.meta.env.DEV) {
        console.debug(
          "Note: steem-config.local.js not available -",
          error.message,
        );
      }
      return null;
    }
  }

  /**
   * Load credentials from environment variables
   * Preferred for production deployments
   *
   * Supported env vars:
   *   VITE_STEEM_USERNAME - Your Steem username
   *   VITE_STEEM_POSTING_KEY - Your posting private key
   *   VITE_STEEM_REGISTRY_KEY - Registry posting key
   *   VITE_STEEM_GAME_RECORDS_KEY - Game records posting key
   *   VITE_STEEM_NODE - Default Steem node
   *
   * Usage:
   *   steemConfig.loadFromEnv();
   */
  loadFromEnv() {
    const env = import.meta.env;

    // Legacy support for specific registry key env var
    if (env?.VITE_STEEM_REGISTRY_KEY) {
      this.setPlayerRegistryKey(env.VITE_STEEM_REGISTRY_KEY);
    }

    // Legacy support for specific game records key env var
    if (env?.VITE_STEEM_GAME_RECORDS_KEY) {
      this.setGameRecordsKey(env.VITE_STEEM_GAME_RECORDS_KEY);
    }

    // Simplfied Env Var: VITE_STEEMMAZE_KEY (overrides both)
    if (env?.VITE_STEEMMAZE_KEY) {
      this.setPlayerRegistryKey(env.VITE_STEEMMAZE_KEY);
      this.setGameRecordsKey(env.VITE_STEEMMAZE_KEY);
    }

    if (env?.VITE_STEEM_NODE && env.VITE_STEEM_NODE in STEEM_NODES) {
      this.setNode(env.VITE_STEEM_NODE);
    }

    if (env?.VITE_STEEMMAZE_KEY || env?.VITE_STEEM_REGISTRY_KEY) {
      console.log("✓ Steem configuration loaded from environment variables");
    }
  }

  /**
   * Get full credentials object
   * Returns all loaded credentials in one object
   */
  getCredentials() {
    return {
      username: this.username,
      registryConfig: this.getPlayerRegistryConfig(),
      gameRecordsConfig: this.getGameRecordsConfig(),
      nodeUrl: this.currentNodeUrl,
      node: this.currentNode,
    };
  }

  /**   * Get player registry configuration
   */
  getPlayerRegistryConfig() {
    return { ...PLAYER_REGISTRY_CONFIG };
  }

  /**
   * Get game records configuration
   */
  getGameRecordsConfig() {
    return { ...GAME_RECORDS_CONFIG };
  }

  /**
   * Update player registry posting key (from config or env)
   */
  setPlayerRegistryKey(key) {
    PLAYER_REGISTRY_CONFIG.postingKey = key;
  }

  /**
   * Update game records posting key (from config or env)
   */
  setGameRecordsKey(key) {
    GAME_RECORDS_CONFIG.postingKey = key;
  }

  /**
   * Check if player registry is configured
   */
  isPlayerRegistryConfigured() {
    return PLAYER_REGISTRY_CONFIG.postingKey !== "YOUR_POSTING_KEY_HERE";
  }

  /**
   * Check if game records is configured
   */
  isGameRecordsConfigured() {
    return GAME_RECORDS_CONFIG.postingKey !== "YOUR_POSTING_KEY_HERE";
  }

  /**
   * Get Steem web URL
   */
  getSteemWebUrl() {
    return STEEM_WEB_URL;
  }
}

// Export constants
export {
  STEEM_WEB_URL,
  STEEM_NODES,
  PLAYER_REGISTRY_CONFIG,
  GAME_RECORDS_CONFIG,
};

// Export singleton instance
export const steemConfig = new SteemConfig();
