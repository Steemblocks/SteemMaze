/**
 * Steem Integration Module - Main Entry Point
 * Exports all Steem integration classes and utilities
 *
 * BACKWARDS COMPATIBLE WRAPPER: This index maintains compatibility with
 * existing code that expects the old steemIntegration API
 */

// Core configuration
export {
  SteemConfig,
  steemConfig,
  STEEM_WEB_URL,
  STEEM_NODES,
  PLAYER_REGISTRY_CONFIG,
  GAME_RECORDS_CONFIG,
} from "./steem.js";

// Player registry management
export { PlayerRegistry, playerRegistry } from "./playerlist.js";

// Game records management
export { GameRecords, gameRecords } from "./gamerecord.js";

// Game sharing functionality
export { GameShare, gameShare } from "./gameshare.js";

// Leaderboard management
export { Leaderboard, leaderboard } from "./leaderboard.js";

// Import singletons for wrapper
import { steemConfig } from "./steem.js";
import { playerRegistry } from "./playerlist.js";
import { gameRecords } from "./gamerecord.js";
import { gameShare } from "./gameshare.js";
import { leaderboard } from "./leaderboard.js";

/**
 * Backwards-compatible wrapper
 * Provides the old steemIntegration API but uses new modular system internally
 */
export const steemIntegration = {
  // ============================================
  // NEW MODULAR STRUCTURE ACCESS
  // ============================================
  config: steemConfig,
  players: playerRegistry,
  records: gameRecords,
  share: gameShare,
  leaderboard: leaderboard,

  // ============================================
  // BACKWARDS COMPATIBILITY - OLD API
  // ============================================
  // Properties from steemConfig
  get username() {
    return steemConfig.username;
  },

  get isConnected() {
    return steemConfig.isConnected;
  },

  get currentNode() {
    return steemConfig.currentNode;
  },

  get customNode() {
    return steemConfig.customNode;
  },

  /**
   * Set username (from Keychain login)
   */
  setUsername(username) {
    steemConfig.setUsername(username);
    playerRegistry.addPlayerToRegistry(username);
  },

  /**
   * Set active Steem node
   */
  setNode(nodeName) {
    return steemConfig.setNode(nodeName);
  },

  /**
   * Set custom Steem node URL
   */
  setCustomNode(nodeUrl) {
    return steemConfig.setCustomNode(nodeUrl);
  },

  /**
   * Register active player for leaderboard discovery
   */
  registerActivePlayer(username) {
    playerRegistry.registerActivePlayer(username);
  },

  /**
   * Post game record (from old API)
   * Delegates to gameShare.postGameRecord()
   */
  async postGameRecord(gameData) {
    return await gameShare.postGameRecord(gameData);
  },

  /**
   * Post game blog (from old API)
   * Delegates to gameShare.postGameBlog()
   */
  async postGameBlog(blogData) {
    return await gameShare.postGameBlog(blogData);
  },

  /**
   * Fetch game records from blockchain (from old API)
   * Delegates to gameShare.fetchPlayerGameRecords()
   */
  async fetchGameRecordsFromCustomJson(username, maxRecords) {
    return await gameShare.fetchPlayerGameRecords(username, maxRecords);
  },

  /**
   * Fetch global leaderboard (from old API)
   * Delegates to leaderboard.fetchGlobalLeaderboard()
   */
  async fetchGlobalLeaderboard(limit) {
    return await leaderboard.fetchGlobalLeaderboard(limit);
  },

  /**
   * Disconnect (called on logout)
   */
  disconnect() {
    steemConfig.disconnect?.();
  },
};
