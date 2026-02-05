/**
 * Steem Configuration File
 *
 * Rename is file into steem-config.local.js
 *
 * This file contains sensitive Steem blockchain credentials for the GAME ACCOUNT.
 * NEVER commit this file to Git!
 *
 * INSTRUCTIONS:
 * 1. Enter the posting key for the 'steemmaze' account below.
 * 2. This key is used by the app to auto-save game records and player lists.
 * 3. Players (users) do NOT need keys here; they use Steem Keychain.
 */

export const steemConfig = {
  // ============================================
  // GAME SYSTEM ACCOUNT (steemmaze)
  // ============================================
  // This account handles all the background data storage:
  // 1. Storing global game records
  // 2. Maintaining the active player registry
  gameAccount: {
    username: "steemmaze",

    // REQUIRED: The Posting Private Key for 'steemmaze'
    // This allows the game to auto-save data without asking the user.
    postingKey: "YOUR_STEEMMAZE_POSTING_KEY_HERE",
  },

  // ============================================
  // CONFIGURATION SETTINGS
  // ============================================
  settings: {
    // How often to broadcast batched game records (in milliseconds)
    // Default: 5 minutes
    recordsBroadcastInterval: 5 * 60 * 1000,

    // How often to backup the player registry (in milliseconds)
    // Default: 1 hour
    registryBroadcastInterval: 60 * 60 * 1000,
  },

  // ============================================
  // STEEM NODE CONFIGURATION
  // ============================================
  node: {
    // Default Node
    default: "steemit",

    // Optional: Custom Node URL
    custom: null,
  },
};
