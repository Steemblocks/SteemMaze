/**
 * Manual.js
 * Handles the game manual modal interactions (Opening, Closing, Tabs)
 */

export class Manual {
  constructor() {
    this.modal = document.getElementById("manualModal");
    this.openBtn = document.getElementById("manualBtn");
    this.closeBtn = document.getElementById("closeManualBtn");
    this.tabs = document.querySelectorAll(".tab-btn");
    this.panes = document.querySelectorAll(".tab-pane");
    this.versionBadge = document.getElementById("gameVersion");

    this.setupEventListeners();
    this.initializeVersion();
  }

  /**
   * Initialize game version display
   * Fetches version from package.json and displays it in the manual
   */
  async initializeVersion() {
    try {
      const response = await fetch("/package.json");
      const packageData = await response.json();
      if (this.versionBadge) {
        this.versionBadge.textContent = `v${packageData.version}`;
      }
      // Store version globally for reference
      window.GAME_VERSION = packageData.version;
    } catch (error) {
      console.warn("Could not load version from package.json:", error);
      // Fallback to v1.0.0 if fetch fails
      if (this.versionBadge) {
        this.versionBadge.textContent = "v1.0.0";
      }
      window.GAME_VERSION = "1.0.0";
    }
  }

  setupEventListeners() {
    // Open Manual
    if (this.openBtn) {
      this.openBtn.addEventListener("click", () => this.open());
    }

    // Close Manual
    if (this.closeBtn) {
      this.closeBtn.addEventListener("click", () => this.close());
    }

    // Close on overlay click
    if (this.modal) {
      this.modal.addEventListener("click", (e) => {
        if (e.target === this.modal) {
          this.close();
        }
      });
    }

    // Tab Navigation
    this.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const targetTab = tab.dataset.tab;
        this.switchTab(targetTab);
      });
    });
  }

  open() {
    if (this.modal) {
      this.modal.classList.add("active");
    }
  }

  close() {
    if (this.modal) {
      this.modal.classList.remove("active");
    }
  }

  switchTab(tabId) {
    // Update Buttons
    this.tabs.forEach((t) => {
      if (t.dataset.tab === tabId) t.classList.add("active");
      else t.classList.remove("active");
    });

    // Update Panes
    this.panes.forEach((p) => {
      if (p.id === `tab-${tabId}`) p.classList.add("active");
      else p.classList.remove("active");
    });
  }
}
