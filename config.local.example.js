/**
 * Local Configuration for SteemMaze
 *
 * This file contains sensitive configuration that should NOT be committed to Git.
 * The .gitignore file already excludes this file from version control.
 *
 * Copy this file and rename it to 'config.local.js', then fill in your actual values.
 */

const LOCAL_CONFIG = {
  // Steem Registry Configuration
  steem: {
    // The posting key for the steemmaze registry account (WIF format, starts with 5...)
    registryPostingKey: "YOUR_POSTING_KEY_HERE",

    // Optional: Custom Steem API node
    customNode: null,
  },
};

// Export for use in steem-integration.js if needed
if (typeof module !== "undefined" && module.exports) {
  module.exports = LOCAL_CONFIG;
}
