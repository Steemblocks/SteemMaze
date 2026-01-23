/**
 * UIManager Class
 * Handles all UI interactions, screen management, and user interface updates
 */

import { steemIntegration } from "../../steem-integration.js";
import { ACHIEVEMENTS } from "../core/Achievements.js";

export class UIManager {
  constructor(gameData) {
    this.gameData = gameData;
    this.currentScreen = "loginScreen"; // Start at login screen
    this.screens = {
      loginScreen: document.getElementById("loginScreen"),
      mainMenu: document.getElementById("mainMenu"),
      gameScreen: document.getElementById("gameScreen"),
      profileScreen: document.getElementById("profileScreen"),
      leaderboardScreen: document.getElementById("leaderboardScreen"),
      settingsScreen: document.getElementById("settingsScreen"),
    };

    // Toast Notification Queue
    this.toastQueue = [];
    this.isToastShowing = false;

    // Check if already logged in
    const savedUsername = this.gameData.get("steemUsername");
    if (savedUsername && savedUsername !== "Developer") {
      // User is already logged in, go to main menu
      steemIntegration.setUsername(savedUsername);
      this.showScreen("mainMenu");

      // Sync data from blockchain in background
      this.syncFromBlockchain(savedUsername)
        .then(() => {
          this.updateAllStats();
        })
        .catch((error) => {
          console.warn("Background blockchain sync failed:", error);
        });
    } else {
      // No valid login, show login screen
      this.showScreen("loginScreen");
    }

    this.setupEventListeners();
    this.updateAllStats();
  }

  showScreen(screenId) {
    // Detect if we're leaving the game screen
    const leavingGameScreen =
      this.currentScreen === "gameScreen" && screenId !== "gameScreen";

    Object.values(this.screens).forEach((s) => s?.classList.remove("active"));
    if (this.screens[screenId]) {
      this.screens[screenId].classList.add("active");
      this.currentScreen = screenId;

      // Handle Background Music & Game Audio
      if (window.game?.audioManager) {
        const musicScreens = [
          "loginScreen",
          "mainMenu",
          "settingsScreen",
          "leaderboardScreen",
          "profileScreen",
        ];

        // If leaving game screen, stop all game sounds first
        if (leavingGameScreen) {
          window.game.audioManager.stopAllSounds();
        }

        if (musicScreens.includes(screenId)) {
          window.game.audioManager.playMusic();
        } else if (screenId === "gameScreen") {
          window.game.audioManager.stopMusic();
        }
      }
    }

    if (screenId === "profileScreen") this.updateProfile();
    if (screenId === "leaderboardScreen") {
      // Always fetch leaderboard data from blockchain
      this.updateLeaderboard();

      const lastRefresh = localStorage.getItem("leaderboardLastRefresh");
      const now = Date.now();
      const fiveMinutesAgo = now - 5 * 60 * 1000;

      // Refresh if never refreshed or if more than 5 minutes old
      if (!lastRefresh || parseInt(lastRefresh) < fiveMinutesAgo) {
        this.refreshLeaderboardFromBlockchain();
        localStorage.setItem("leaderboardLastRefresh", now.toString());
      }
    }
    if (screenId === "settingsScreen") this.loadSettings();
    if (screenId === "mainMenu") this.updateMenuStats();
  }

  setupEventListeners() {
    // Login
    document.getElementById("loginBtn")?.addEventListener("click", () => {
      this.handleLogin();
    });

    // Menu buttons
    document.getElementById("resumeBtn").addEventListener("click", () => {
      this.showScreen("gameScreen");
      window.game?.continueGame();
    });

    document.getElementById("newGameBtn").addEventListener("click", () => {
      this.showScreen("gameScreen");
      window.game?.startNewGame();
    });
    document
      .getElementById("profileBtn")
      .addEventListener("click", () => this.showScreen("profileScreen"));
    document
      .getElementById("leaderboardBtn")
      .addEventListener("click", () => this.showScreen("leaderboardScreen"));
    document
      .getElementById("settingsBtn")
      .addEventListener("click", () => this.showScreen("settingsScreen"));

    // Back buttons
    [
      "profileBackBtn",
      "leaderboardBackBtn",
      "settingsBackBtn",
      "backToMenuBtn",
      "quitBtn",
      "victoryMenuBtn",
    ].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", () => {
        document.getElementById("victoryScreen").style.display = "none";
        document.getElementById("pauseScreen").style.display = "none";
        this.showScreen("mainMenu");
        window.game?.stopGame();
      });
    });

    // Game controls
    document
      .getElementById("pauseBtn")
      ?.addEventListener("click", () => window.game?.togglePause());
    document
      .getElementById("pauseResumeBtn")
      ?.addEventListener("click", () => window.game?.togglePause());
    document
      .getElementById("gameResumeBtn")
      ?.addEventListener("click", () => window.game?.togglePause());
    document.getElementById("restartBtn")?.addEventListener("click", () => {
      window.game?.restartLevel();
      document.getElementById("pauseScreen").style.display = "none";
    });
    document
      .getElementById("nextLevelBtn")
      ?.addEventListener("click", () => window.game?.nextLevel());
    document
      .getElementById("replayBtn")
      ?.addEventListener("click", () => window.game?.replayLevel());

    // Share to Steem Blog button
    document
      .getElementById("shareToSteemBtn")
      ?.addEventListener("click", async () => {
        const btn = document.getElementById("shareToSteemBtn");
        const game = window.game;

        if (!steemIntegration.username) {
          this.showToast("Please login with Steem Keychain first");
          return;
        }

        if (!game || !game.lastVictoryData) {
          this.showToast("No game data to share");
          return;
        }

        // Add loading state
        btn.classList.add("loading");
        btn.querySelector(".material-icons-round").textContent = "sync";

        try {
          const data = game.lastVictoryData;

          // Prepare game data for blog post
          const blogData = {
            level: data.level || game.level,
            score: data.score || game.calculateScore(),
            stars: data.stars || 0,
            time: data.time || game.time,
            timeFormatted: this.formatTime(data.time || game.time),
            moves: data.moves || game.moves,
            gems: data.gems || game.gemsCollected,
            totalGems: data.totalGems || game.gems?.length || 0,
            coinsEarned: data.coinsCollected || 0,
            zombiesKilled:
              (data.zombiesKilled || 0) + (data.zombieDogsKilled || 0),
            maxCombo: data.maxCombo || game.maxCombo || 0,
            isNewRecord: data.isNewRecord || false,
          };

          const result = await steemIntegration.postGameBlog(blogData);

          if (result.success) {
            this.showToast("🎉 Blog posted to Steem!");
            // Open the post in new tab
            window.open(result.url, "_blank");
          }
        } catch (error) {
          console.error("Failed to post blog:", error);
          this.showToast(`❌ ${error.message}`);
        } finally {
          // Remove loading state
          btn.classList.remove("loading");
          btn.querySelector(".material-icons-round").textContent = "share";
        }
      });

    // Game Over handlers
    document
      .getElementById("gameOverRetryBtn")
      ?.addEventListener("click", () => {
        window.game?.restartLevel();
        document.getElementById("gameOverScreen").style.display = "none";
      });

    document
      .getElementById("gameOverMenuBtn")
      ?.addEventListener("click", () => {
        document.getElementById("gameOverScreen").style.display = "none";
        this.showScreen("mainMenu");
        window.game?.stopGame();
      });

    // Steem Share Modal handlers
    document
      .getElementById("steemShareYesBtn")
      ?.addEventListener("click", async () => {
        const data = window.ui?.pendingShareData;
        if (data) {
          try {
            const result = await steemIntegration.postGameRecord(data.gameData);
            if (result) {
              // Register player as active
              steemIntegration.registerActivePlayer(steemIntegration.username);
              // Update highest level posted to Steem
              const currentHighest =
                window.ui?.gameData.get("highestLevelPosted") || 0;
              if (data.gameData.level > currentHighest) {
                window.ui?.gameData.set(
                  "highestLevelPosted",
                  data.gameData.level,
                );
              }
              window.ui?.showToast("Game posted to Steem!");
            }
          } catch (error) {
            console.error("Error posting to Steem:", error);
            window.ui?.showToast(`Failed to post: ${error.message}`);
          }
        }
        window.ui?.hideShareModal();
      });

    document.getElementById("steemSkipBtn")?.addEventListener("click", () => {
      window.ui?.hideShareModal();
      // Skip and continue - just continue to next level
      setTimeout(() => window.game?.nextLevel(), 300);
    });

    document
      .getElementById("steemShareCancelBtn")
      ?.addEventListener("click", () => {
        window.ui?.hideShareModal();
      });

    document
      .getElementById("steemShareCloseBtn")
      ?.addEventListener("click", () => {
        window.ui?.hideShareModal();
      });

    // Mobile controls are handled in Game.js with touchstart/mousedown events
    // to avoid double-movement issues. Do NOT add click handlers here.

    // Player name
    document.getElementById("playerName")?.addEventListener("change", (e) => {
      this.gameData.set("playerName", e.target.value.trim() || "Player");
      this.showToast("Name saved!");
    });

    // Leaderboard tabs
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll(".tab-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.updateLeaderboard(btn.dataset.tab);
      });
    });

    // Leaderboard refresh button
    document
      .getElementById("leaderboardRefreshBtn")
      ?.addEventListener("click", async () => {
        await this.refreshLeaderboardFromBlockchain();
      });

    // Settings
    this.setupSettingsListeners();

    // Blockchain records
    document
      .getElementById("viewBlockchainBtn")
      ?.addEventListener("click", () => {
        const username =
          this.gameData.data.steemUsername || this.gameData.data.playerName;
        const url = `https://steemit.com/@${username}/created`;
        window.open(url, "_blank");
      });

    // Restore from blockchain
    document
      .getElementById("restoreFromBlockchainBtn")
      ?.addEventListener("click", async () => {
        const username = this.gameData.data.steemUsername;

        if (!username) {
          this.showToast("You must be logged in with Steem to restore data");
          return;
        }

        try {
          this.showToast("Fetching your game records from blockchain...");

          const records = await steemIntegration.fetchGameRecordsFromCustomJson(
            username,
            1000,
          );

          if (records.length === 0) {
            this.showToast("No game records found on blockchain");
            return;
          }

          // Find best stats from records for display
          let bestLevel = 0,
            bestScore = 0,
            bestTime = null;
          for (const r of records) {
            if (r.game?.level > bestLevel) bestLevel = r.game.level;
            if (r.game?.score > bestScore) bestScore = r.game.score;
            if (r.game?.time && (!bestTime || r.game.time < bestTime)) {
              bestTime = r.game.time;
            }
          }

          // Restore directly - button click is the confirmation
          this.showToast(`Found ${records.length} records! Restoring...`);

          try {
            const success = this.gameData.restoreFromBlockchain(records);

            if (success) {
              // Show what was restored
              const stats = this.gameData.data;

              this.showToast(
                `✅ Restored! Level ${stats.highestLevel}, Score ${stats.bestScore}. Reloading...`,
              );
              // Reload to show updated stats
              setTimeout(() => window.location.reload(), 2000);
            } else {
              this.showToast("❌ Failed to restore data");
            }
          } catch (restoreError) {
            console.error("Restore error:", restoreError);
            this.showToast(`❌ Restore failed: ${restoreError.message}`);
          }
        } catch (error) {
          console.error("Error restoring from blockchain:", error);
          this.showToast(`Failed to restore: ${error.message}`);
        }
      });

    // Reset data
    document.getElementById("resetDataBtn")?.addEventListener("click", () => {
      document.getElementById("confirmationModal").style.display = "grid";
    });

    document.getElementById("logoutBtn")?.addEventListener("click", () => {
      this.gameData.set("steemUsername", null);
      this.gameData.set("playerName", "Player"); // Reset name default
      window.location.reload();
    });

    document.getElementById("cancelResetBtn")?.addEventListener("click", () => {
      document.getElementById("confirmationModal").style.display = "none";
    });

    document
      .getElementById("confirmResetBtn")
      ?.addEventListener("click", async () => {
        const username = this.gameData?.data?.steemUsername;

        if (username) {
          this.showToast("Resetting data on blockchain...", "cloud_upload");

          try {
            // Post 0 stats to blockchain to effectively reset progress
            const resetData = {
              level: 1,
              score: 0,
              time: 0,
              moves: 0,
              gems: 0,
              totalGems: 0,
              stars: 0,
              mazeSize: 15, // Default
              gamesPlayed: 0,
              wins: 0,
              losses: 0,
              totalCoins: 0,
              totalZombiesPurified: 0,
              totalSteps: 0,
              highestLevel: 1,
              bestScore: 0,
              achievements: [], // Clear achievements
            };

            await steemIntegration.postGameRecord(resetData);
          } catch (err) {
            console.error("Failed to reset blockchain data:", err);
            // Continue with local reset even if blockchain fails
          }
        }

        this.gameData.reset();
        this.showToast("Data reset! Reloading...");
        setTimeout(() => window.location.reload(), 1000);
      });
  }

  handleLogin() {
    const usernameInput = document.getElementById("steemUsername");
    const statusMsg = document.getElementById("keychainStatus");
    const username = usernameInput.value.trim();

    if (!username) {
      statusMsg.textContent = "Please enter a username";
      statusMsg.className = "status-msg error";
      return;
    }

    if (!window.steem_keychain) {
      statusMsg.textContent = "Steem Keychain extension not found!";
      statusMsg.className = "status-msg error";
      return;
    }

    statusMsg.textContent = "Requesting signature...";
    statusMsg.className = "status-msg";

    window.steem_keychain.requestSignBuffer(
      username,
      "Login to SteemMaze",
      "Posting",
      async (response) => {
        if (response.success) {
          statusMsg.textContent = "Login Successful! Syncing data...";
          statusMsg.className = "status-msg success";

          // ALWAYS reset local data first - we'll restore from blockchain
          // This ensures we never show stale data from a previous account
          const previousUsername = this.gameData.data.steemUsername;

          // Reset all game data to defaults
          this.gameData.reset();

          // Set the new username
          this.gameData.set("steemUsername", username);
          this.gameData.set("playerName", username);

          // Set Steem integration username
          steemIntegration.setUsername(username);

          // Register this player as active
          steemIntegration.registerActivePlayer(username);

          // Fetch and restore data from blockchain
          try {
            statusMsg.textContent = "Fetching your data from blockchain...";
            await this.syncFromBlockchain(username, statusMsg);
          } catch (error) {
            console.error("Failed to sync from blockchain:", error);
            statusMsg.textContent =
              "Login Successful! (Could not fetch blockchain data)";
          }

          // Update UI with current data (either from blockchain or fresh defaults)
          this.updateAllStats();

          // CRITICAL: Reload game level from gameData
          // This ensures the Game instance uses the correct level for this account
          if (
            window.game &&
            typeof window.game.reloadLevelFromData === "function"
          ) {
            window.game.reloadLevelFromData();
          }

          setTimeout(() => {
            this.showScreen("mainMenu");
            this.showToast(`Welcome, ${username}!`);
          }, 800);
        } else {
          statusMsg.textContent = response.message || "Login Failed";
          statusMsg.className = "status-msg error";
        }
      },
    );
  }

  /**
   * Sync game data from blockchain
   * Fetches the most recent records and updates local data if blockchain has newer/better data
   */
  async syncFromBlockchain(username, statusEl = null) {
    try {
      if (statusEl) {
        statusEl.textContent = "Fetching data from blockchain...";
      }

      // Fetch game records from custom_json operations
      const records = await steemIntegration.fetchGameRecordsFromCustomJson(
        username,
        100, // Fetch last 100 records for sync
      );

      if (records.length === 0) {
        if (statusEl) {
          statusEl.textContent =
            "Welcome! Starting fresh - no previous game data found.";
        }
        return;
      }

      // Analyze blockchain data to find stats
      let blockchainStats = {
        highestLevel: 0,
        bestScore: 0,
        gamesPlayed: records.length,
        totalCoins: 0,
        totalZombiesPurified: 0,
        totalSteps: 0,
        wins: records.length, // Every completed game is a win
        losses: 0,
        bestTime: null,
      };

      // Get the most recent record's stats (contains cumulative data)
      const mostRecentRecord = records[0]; // Already sorted by timestamp desc
      if (mostRecentRecord.stats) {
        const stats = mostRecentRecord.stats;
        blockchainStats.gamesPlayed = stats.games_played || records.length;
        blockchainStats.wins = stats.wins || records.length;
        blockchainStats.losses = stats.losses || 0;
        blockchainStats.totalCoins = stats.total_coins || 0;
        blockchainStats.totalZombiesPurified =
          stats.total_zombies_purified || 0;
        blockchainStats.totalSteps = stats.total_steps || 0;
        blockchainStats.highestLevel = stats.highest_level || 0;
        blockchainStats.bestScore = stats.best_score || 0;
      }

      // Also scan all records to find absolute best values
      for (const record of records) {
        if (record.game) {
          const game = record.game;
          if ((game.level || 0) > blockchainStats.highestLevel) {
            blockchainStats.highestLevel = game.level;
          }
          if ((game.score || 0) > blockchainStats.bestScore) {
            blockchainStats.bestScore = game.score;
          }
          if (
            game.time &&
            (!blockchainStats.bestTime || game.time < blockchainStats.bestTime)
          ) {
            blockchainStats.bestTime = game.time;
          }
          if (game.moves) {
            blockchainStats.totalSteps += game.moves;
          }
        }
      }

      // Apply all blockchain data to local storage (we start from defaults, so just set everything)
      this.gameData.set("highestLevel", blockchainStats.highestLevel);
      this.gameData.set("currentLevel", blockchainStats.highestLevel + 1);
      this.gameData.set("bestScore", blockchainStats.bestScore);
      this.gameData.set("bestTime", blockchainStats.bestTime);
      this.gameData.set("gamesPlayed", blockchainStats.gamesPlayed);
      this.gameData.set("wins", blockchainStats.wins);
      this.gameData.set("losses", blockchainStats.losses);
      this.gameData.set("totalCoins", blockchainStats.totalCoins);
      this.gameData.set(
        "totalZombiesPurified",
        blockchainStats.totalZombiesPurified,
      );
      this.gameData.set("totalSteps", blockchainStats.totalSteps);

      if (statusEl) {
        statusEl.textContent = `Data restored! ${records.length} game records found.`;
      }
    } catch (error) {
      console.error("Error syncing from blockchain:", error);
      if (statusEl) {
        statusEl.textContent = "Sync failed - starting fresh.";
      }
      throw error;
    }
  }

  setupSettingsListeners() {
    const settings = {
      mazeSizeSelect: { key: "mazeSize", parse: (v) => parseInt(v) },
      cameraSpeedSlider: { key: "cameraSpeed", parse: (v) => parseInt(v) },
      qualitySelect: { key: "quality" },
      shadowsToggle: { key: "shadows", isToggle: true },
      firefliesToggle: { key: "fireflies", isToggle: true },
      fogSlider: { key: "fogDensity", parse: (v) => parseInt(v) },
      sfxToggle: { key: "sfx", isToggle: true },
      musicToggle: { key: "music", isToggle: true },
      volumeSlider: { key: "volume", parse: (v) => parseInt(v) },
      mobileControlsToggle: { key: "mobileControls", isToggle: true },
      vibrationToggle: { key: "vibration", isToggle: true },
    };

    Object.entries(settings).forEach(([id, config]) => {
      const el = document.getElementById(id);
      if (!el) return;

      // Prevent generic click sound for toggles so we can play the specific one
      if (
        config.isToggle ||
        el.tagName === "INPUT" ||
        el.tagName === "SELECT"
      ) {
        el.setAttribute("data-no-click-sound", "true");
        // Also set parent label if it exists to avoid click bubbling trigger
        if (el.parentElement && el.parentElement.tagName === "LABEL") {
          el.parentElement.setAttribute("data-no-click-sound", "true");
        }
      }

      el.addEventListener("change", () => {
        const value = config.isToggle
          ? el.checked
          : config.parse
            ? config.parse(el.value)
            : el.value;

        // Play toggle sound for switches
        if (config.isToggle && window.game?.audioManager) {
          window.game.audioManager.playToggle();
        }

        this.gameData.setSetting(config.key, value);
        window.game?.applySettings();
      });
    });

    // Setup Steem node selector
    const steemNodeSelect = document.getElementById("steemNodeSelect");
    const customNodeContainer = document.getElementById("customNodeContainer");
    const customNodeInput = document.getElementById("customNodeInput");

    if (steemNodeSelect) {
      // Load saved node preference
      steemNodeSelect.value = steemIntegration.currentNode;
      this.updateNodeDisplay();

      steemNodeSelect.addEventListener("change", () => {
        if (steemNodeSelect.value === "custom") {
          customNodeContainer.style.display = "block";
          if (steemIntegration.customNode) {
            customNodeInput.value = steemIntegration.customNode;
          }
        } else {
          customNodeContainer.style.display = "none";
          steemIntegration.setNode(steemNodeSelect.value);
          this.updateNodeDisplay();
          this.showToast(`Switched to ${steemNodeSelect.value} node`);
        }
      });

      if (customNodeInput) {
        customNodeInput.addEventListener("change", () => {
          const url = customNodeInput.value.trim();
          if (url) {
            if (steemIntegration.setCustomNode(url)) {
              steemNodeSelect.value = "custom";
              this.updateNodeDisplay();
              this.showToast("Custom node set successfully");
            } else {
              this.showToast("Invalid node URL", "error");
            }
          }
        });

        // Also handle Enter key
        customNodeInput.addEventListener("keypress", (e) => {
          if (e.key === "Enter") {
            const url = customNodeInput.value.trim();
            if (url) {
              if (steemIntegration.setCustomNode(url)) {
                steemNodeSelect.value = "custom";
                this.updateNodeDisplay();
                this.showToast("Custom node set successfully");
              } else {
                this.showToast("Invalid node URL", "error");
              }
            }
          }
        });
      }
    }
  }

  updateNodeDisplay() {
    const nodeNameMap = {
      moecki: "Moecki",
      steemworld: "Steem World",
      pennsif: "Pennsif",
      steemit: "Steemit",
      justyy: "Justyy",
      wherein: "Wherein",
      steememory: "Steem Memory",
      boylikegirl: "Boy Like Girl",
      steemitdev: "Steemit Dev",
      custom: "Custom",
    };
    const display = document.getElementById("currentNodeDisplay");
    if (display) {
      display.textContent =
        nodeNameMap[steemIntegration.currentNode] ||
        steemIntegration.currentNode;
    }
  }

  loadSettings() {
    const s = this.gameData.data.settings;
    const set = (id, val, isToggle = false) => {
      const el = document.getElementById(id);
      if (el) isToggle ? (el.checked = val) : (el.value = val);
    };
    set("mazeSizeSelect", s.mazeSize);
    set("cameraSpeedSlider", s.cameraSpeed);
    set("qualitySelect", s.quality);
    set("shadowsToggle", s.shadows, true);
    set("firefliesToggle", s.fireflies, true);
    set("fogSlider", s.fogDensity);
    set("sfxToggle", s.sfx, true);
    set("musicToggle", s.music, true);
    set("volumeSlider", s.volume);
    set("mobileControlsToggle", s.mobileControls, true);
    set("vibrationToggle", s.vibration, true);

    // Load node selector
    const steemNodeSelect = document.getElementById("steemNodeSelect");
    if (steemNodeSelect) {
      steemNodeSelect.value = steemIntegration.currentNode;
      this.updateNodeDisplay();
    }
  }

  updateAllStats() {
    this.updateMenuStats();
    this.updateProfile();
  }

  updateMenuStats() {
    const d = this.gameData.data;
    document.getElementById("menuBestScore").textContent = d.bestScore ?? "--";
    document.getElementById("menuGamesPlayed").textContent = d.gamesPlayed;
    document.getElementById("menuBestTime").textContent = d.bestTime
      ? this.formatTime(d.bestTime)
      : "--";

    // Update resume button text with current level
    const currentLevel = d.currentLevel || 1;
    const resumeBtnText = document.getElementById("resumeBtnText");
    if (resumeBtnText) {
      resumeBtnText.textContent =
        currentLevel > 1 ? `Resume Level ${currentLevel}` : `Play Now`;
    }
  }

  updateProfile() {
    const d = this.gameData.data;
    document.getElementById("playerName").value = d.playerName;
    document.getElementById("profileGamesPlayed").textContent = d.gamesPlayed;
    document.getElementById("profileBestScore").textContent =
      d.bestScore ?? "--";
    document.getElementById("profileBestTime").textContent = d.bestTime
      ? this.formatTime(d.bestTime)
      : "--";
    document.getElementById("profileTotalSteps").textContent = d.totalSteps;
    document.getElementById("profileWins").textContent = d.wins;
    document.getElementById("profileLosses").textContent = d.losses || 0;
    document.getElementById("profileHighestLevel").textContent = d.highestLevel;
    document.getElementById("profileTotalCoins").textContent =
      d.totalCoins || 0;
    document.getElementById("profileZombiesPurified").textContent =
      d.totalZombiesPurified || 0;

    // Set profile image from Steem account
    const avatar = document.querySelector(".avatar");
    const steemUsername = d.steemUsername || "steemit";
    const steemAvatarUrl = `https://steemitimages.com/u/${steemUsername}/avatar`;

    const img = document.createElement("img");
    img.src = steemAvatarUrl;
    img.alt = steemUsername;
    img.style.cssText =
      "width: 100%; height: 100%; border-radius: 50%; object-fit: cover;";
    img.onerror = () => {
      img.style.display = "none";
      avatar.innerHTML = '<span class="material-icons-round">person</span>';
    };

    avatar.innerHTML = "";
    avatar.appendChild(img);

    const titles = [
      "Maze Explorer",
      "Maze Wanderer",
      "Maze Navigator",
      "Maze Expert",
      "Maze Master",
      "Maze Legend",
    ];
    document.getElementById("playerTitle").textContent =
      titles[Math.min(Math.floor(d.wins / 5), titles.length - 1)];

    const grid = document.getElementById("achievementsGrid");
    grid.innerHTML = ACHIEVEMENTS.map((a) => {
      const unlocked = a.condition(d);
      return `<div class="achievement ${unlocked ? "unlocked" : ""}" title="${
        a.description || ""
      }"><span class="material-icons-round">${a.icon}</span><span>${
        a.name
      }</span></div>`;
    }).join("");
  }

  async refreshLeaderboardFromBlockchain() {
    try {
      this.showToast(
        "Refreshing leaderboard from blockchain...",
        "cloud_download",
      );

      // Show loading state in leaderboard list
      const listEl = document.getElementById("leaderboardList");
      if (listEl) {
        listEl.innerHTML = `
          <div style="text-align: center; padding: 40px; color: #aaa;">
            <span class="material-icons-round" style="font-size: 48px; animation: spin 1s linear infinite;">sync</span>
            <p style="margin-top: 16px;">Fetching leaderboard from blockchain...</p>
          </div>
        `;
      }

      // Register current user as active player before fetching
      const currentUsername = this.gameData.data.steemUsername;
      if (currentUsername) {
        steemIntegration.registerActivePlayer(currentUsername);
      }

      const leaderboard = await steemIntegration.fetchGlobalLeaderboard(100);

      if (leaderboard && leaderboard.length > 0) {
        // Leaderboard already has rankScore from fetchGlobalLeaderboard
        // Update stored leaderboard
        this.gameData.data.leaderboard = leaderboard;
        this.gameData.save();

        this.updateLeaderboard("score");
        this.showToast(
          `Leaderboard updated! ${leaderboard.length} players found`,
        );
      } else {
        this.showToast("No players found on blockchain yet", "info");
        // Clear old leaderboard data
        this.gameData.data.leaderboard = [];
        this.gameData.save();
        this.updateLeaderboard("score");
      }
    } catch (error) {
      console.error("Error refreshing leaderboard:", error);
      this.showToast("Failed to refresh leaderboard", "error_outline");
      // Try to display cached data
      this.updateLeaderboard("score");
    }
  }

  updateLeaderboard(tab = "score") {
    const lb = this.gameData.data.leaderboard;

    if (!lb || lb.length === 0) {
      document.getElementById("leaderboardList").innerHTML =
        `<div style="text-align: center; padding: 20px; color: #aaa;">
          No players found yet. Play and share your records to appear on the leaderboard!
        </div>`;
      document.getElementById("playerRank").textContent = "--";
      document.getElementById("playerRankName").textContent =
        this.gameData.data.playerName;
      document.getElementById("playerRankValue").textContent = "--";
      return;
    }

    const sorted = [...lb].sort((a, b) => {
      if (tab === "score") return b.score - a.score;
      if (tab === "time") {
        // Lower time is better, handle null/undefined times
        const aTime = a.bestTime || Infinity;
        const bTime = b.bestTime || Infinity;
        return aTime - bTime;
      }
      if (tab === "level") return b.highestLevel - a.highestLevel;
      return b.score - a.score; // default to score
    });

    const list = document.getElementById("leaderboardList");
    list.innerHTML = sorted
      .slice(0, 10)
      .map((entry, i) => {
        let val;
        if (tab === "score") {
          val = entry.score || 0;
        } else if (tab === "time") {
          val = entry.bestTime ? this.formatTime(entry.bestTime) : "--";
        } else if (tab === "level") {
          val = `Lv.${entry.highestLevel || 1}`;
        } else {
          val = entry.rankScore || 0;
        }

        const topClass =
          i === 0 ? "top-1" : i === 1 ? "top-2" : i === 2 ? "top-3" : "";
        const steemUsername = entry.steemUsername || entry.name;
        const avatarUrl = `https://steemitimages.com/u/${steemUsername}/avatar`;

        return `<div class="leaderboard-entry ${topClass}">
          <span class="entry-rank">${i + 1}</span>
          <img class="entry-avatar" src="${avatarUrl}" alt="${steemUsername}" onerror="this.style.display='none'">
          <span class="entry-name">${entry.name}</span>
          <span class="entry-value">${val}</span>
        </div>`;
      })
      .join("");

    const d = this.gameData.data;
    let playerVal = "--";
    let playerRank = sorted.length + 1;

    if (tab === "score") {
      playerVal = d.bestScore || 0;
      playerRank = sorted.findIndex((e) => (d.bestScore || 0) >= e.score);
    } else if (tab === "time") {
      playerVal = d.bestTime ? this.formatTime(d.bestTime) : "--";
      playerRank = sorted.findIndex((e) => {
        const eTime = e.bestTime || Infinity;
        return d.bestTime && d.bestTime <= eTime;
      });
    } else if (tab === "level") {
      playerVal = `Lv.${d.highestLevel || 1}`;
      playerRank = sorted.findIndex(
        (e) => (d.highestLevel || 0) >= e.highestLevel,
      );
    }

    document.getElementById("playerRank").textContent = `#${
      playerRank === -1 ? sorted.length + 1 : playerRank + 1
    }`;
    document.getElementById("playerRankName").textContent = d.playerName;
    document.getElementById("playerRankValue").textContent = playerVal;
  }

  formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  showToast(message, icon = "check_circle", id = null) {
    const container = document.getElementById("toast-container");
    if (!container) return; // Should exist

    // Clean message: Remove common emojis to avoid double-icon look
    const cleanMessage = message
      .replace(
        /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
        "",
      )
      .trim();

    // Check if the last toast matches this ID
    if (id && container.lastElementChild) {
      const last = container.lastElementChild;
      if (last.dataset.toastId === id) {
        // Coalesce!
        let count = parseInt(last.dataset.count || "1") + 1;
        last.dataset.count = count;

        const msgSpan = last.querySelector(".toast-text");
        if (msgSpan) {
          msgSpan.textContent = `${cleanMessage} (x${count})`;
        }

        // Reset removal timeout
        if (last.removalTimeout) {
          clearTimeout(last.removalTimeout);
        }

        last.removalTimeout = setTimeout(() => {
          this.removeToast(last, container);
        }, 3000);

        // Reset animation to pop it slightly?
        last.style.animation = "none";
        last.offsetHeight; /* trigger reflow */
        last.style.animation =
          "toastSlideInRight 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards";
        return;
      }
    }

    // Create toast element
    const toast = document.createElement("div");
    toast.className = "toast-notification";
    if (id) {
      toast.dataset.toastId = id;
      toast.dataset.count = "1";
    }

    // HTML Structure
    toast.innerHTML = `
      <span class="material-icons-round">${icon}</span>
      <span class="toast-text">${cleanMessage}</span>
    `;

    // Add to container
    container.appendChild(toast);

    // Limit number of toasts (remove oldest if > 3)
    if (container.children.length > 3) {
      const oldest = container.firstElementChild;
      if (oldest) {
        this.removeToast(oldest, container);
      }
    }

    // Auto remove
    toast.removalTimeout = setTimeout(() => {
      this.removeToast(toast, container);
    }, 3000); // 3 seconds visible
  }

  removeToast(toast, container) {
    if (toast.parentNode !== container) return;
    toast.classList.add("hide");
    setTimeout(() => {
      if (toast.parentNode === container) {
        container.removeChild(toast);
      }
    }, 300);
  }

  clearToasts() {
    const container = document.getElementById("toast-container");
    if (container) {
      container.innerHTML = "";
    }
  }

  showVictory(moves, time, score, isNewRecord, extras) {
    document.getElementById("victoryMoves").textContent = moves;
    document.getElementById("victoryTime").textContent = this.formatTime(time);
    document.getElementById("victoryScore").textContent = score;

    if (extras) {
      // Level display
      const levelEl = document.getElementById("victoryLevel");
      if (levelEl) levelEl.textContent = extras.level || 1;

      // Gems display
      document.getElementById("victoryGems").textContent =
        `${extras.gems}/${extras.totalGems}`;

      // Stars display
      const starsContainer = document.getElementById("victoryStars");
      starsContainer.innerHTML = "";
      for (let i = 1; i <= 3; i++) {
        const star = document.createElement("span");
        star.className = "material-icons-round";
        star.textContent = "star";
        if (i <= extras.stars) {
          setTimeout(() => star.classList.add("active"), i * 200);
        }
        starsContainer.appendChild(star);
      }

      // Coins collected during level
      const coinsEl = document.getElementById("victoryCoins");
      if (coinsEl) coinsEl.textContent = extras.coinsCollected || 0;

      // Zombies killed
      const zombiesEl = document.getElementById("victoryZombies");
      if (zombiesEl) {
        const totalKilled =
          (extras.zombiesKilled || 0) + (extras.zombieDogsKilled || 0);
        zombiesEl.textContent = totalKilled;
      }

      // Wall hits
      const wallsEl = document.getElementById("victoryWalls");
      if (wallsEl) wallsEl.textContent = extras.wallHits || 0;

      // Max combo
      const comboEl = document.getElementById("victoryCombo");
      if (comboEl) comboEl.textContent = extras.maxCombo || 0;

      // Level completion reward
      if (extras.levelReward) {
        const rewardEl = document.getElementById("victoryReward");
        if (rewardEl) {
          rewardEl.textContent = `+${extras.levelReward.total}`;
        }

        // Show reward breakdown tooltip or details
        const rewardBreakdownEl = document.getElementById(
          "victoryRewardBreakdown",
        );
        if (rewardBreakdownEl) {
          let breakdown = `Base: ${extras.levelReward.baseReward}`;
          breakdown += ` + Level: ${extras.levelReward.levelBonus}`;
          breakdown += ` + Stars: ${extras.levelReward.starBonus}`;
          if (extras.levelReward.perfectBonus > 0) {
            breakdown += ` + Perfect: ${extras.levelReward.perfectBonus}`;
          }
          rewardBreakdownEl.textContent = breakdown;
        }
      }

      // Time label (PERFECT, EXCELLENT, etc.)
      const timeLabelEl = document.getElementById("victoryTimeLabel");
      if (timeLabelEl && extras.timeLabel) {
        timeLabelEl.textContent = extras.timeLabel;
        timeLabelEl.style.display = "block";
      }
    }

    document.getElementById("newRecordBadge").style.display = isNewRecord
      ? "flex"
      : "none";
    document.getElementById("victoryScreen").style.display = "grid";
  }

  showShareModal(score, stars, gameData) {
    // Store the data for use in the event handlers
    this.pendingShareData = { score, stars, gameData };
    document.getElementById("steemShareModal").style.display = "grid";
  }

  hideShareModal() {
    document.getElementById("steemShareModal").style.display = "none";
    this.pendingShareData = null;
  }
}
