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
// SYSTEM ACCOUNT CONFIGURATION
// ============================================
// This account is used to auto-save game results and player lists.
// Enter the system account username and its POSTING Private Key below.
const STEEM_SYSTEM_ACCOUNT = {
  username: "steemmaze",
  postingKey: "Your_Posting_key",
};

const PLAYER_REGISTRY_CONFIG = {
  account: STEEM_SYSTEM_ACCOUNT.username,
  postingKey: STEEM_SYSTEM_ACCOUNT.postingKey,
  broadcastInterval: 60 * 60 * 1000, // 1 hour
  jsonId: "steemmaze_players",
};

const GAME_RECORDS_CONFIG = {
  account: STEEM_SYSTEM_ACCOUNT.username,
  postingKey: STEEM_SYSTEM_ACCOUNT.postingKey,
  broadcastInterval: 5 * 60 * 1000, // 5 minutes
  jsonId: "steemmaze_game_record",
};

/**
 * SteemConfig - Basic configuration management
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
      if (!this.customNode) return false;
      this.currentNode = "custom";
      this.currentNodeUrl = this.customNode;
    } else if (STEEM_NODES[nodeName]) {
      this.currentNode = nodeName;
      this.currentNodeUrl = STEEM_NODES[nodeName];
    } else {
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
    if (!nodeUrl || !nodeUrl.startsWith("http")) return false;
    this.customNode = nodeUrl;
    return this.setNode("custom");
  }

  /**
   * Get list of available nodes for UI
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

  /**
   * Get player registry configuration
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
   * Check if system account is configured
   */
  isConfigured() {
    return PLAYER_REGISTRY_CONFIG.postingKey !== "YOUR_POSTING_KEY_HERE";
  }

  isPlayerRegistryConfigured() {
    return this.isConfigured();
  }

  isGameRecordsConfigured() {
    return this.isConfigured();
  }

  /**
   * Get Steem web URL for links
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
