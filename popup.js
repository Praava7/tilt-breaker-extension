// Popup Settings Management

// Swap this URL when the final Google Form link is ready
const FEEDBACK_URL = 'https://forms.gle/EQkUN3gCFXuNzq4Z8';

class TiltBreakerPopup {
  constructor() {
    this.settings = {
      maxConsecutiveLosses: 3,
      enableWinStreakProtection: true,
      winStreakThreshold: 5,
      enableTimeLimit: false,
      timeLimitHours: 2,
      enableCooldown: true,
      cooldownMinutes: 10,
      customMessages: [
        "Take a break! You're on tilt 🎯",
        "Step away from the board and reset 🧘‍♂️",
        "Your rating will thank you for this pause ⭐",
        "Time to analyze instead of playing 📚"
      ],
      enableStats: true,
      enableGentleWarnings: true,
      resetOnClose: false
    };
    
    this.gameData = {
      consecutiveLosses: 0,
      currentStreak: 0,
      totalGames: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      sessionStartTime: Date.now(),
      lastGameResult: null,
      winStreak: 0,
      maxWinStreak: 0,
      isInCooldown: false,
      cooldownEndTime: null
    };
    
    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.loadGameData();
    this.setupEventListeners();
    this.setupMessageListDelegation();
    this.setupFeedbackButton();
    this.updateUI();
    this.updateStats();
  }

  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['tiltBreakerSettings'], (result) => {
        if (result.tiltBreakerSettings) {
          this.settings = { ...this.settings, ...result.tiltBreakerSettings };
        }
        resolve();
      });
    });
  }

  async loadGameData() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['tiltBreakerData'], (result) => {
        if (result.tiltBreakerData) {
          this.gameData = { ...this.gameData, ...result.tiltBreakerData };
        }
        resolve();
      });
    });
  }

  async saveSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ tiltBreakerSettings: this.settings }, () => {
        this.showStatus('Settings saved successfully!', 'success');
        resolve();
      });
    });
  }

  async resetGameData() {
    this.gameData = {
      consecutiveLosses: 0,
      currentStreak: 0,
      totalGames: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      sessionStartTime: Date.now(),
      lastGameResult: null,
      winStreak: 0,
      maxWinStreak: 0,
      isInCooldown: false,
      cooldownEndTime: null
    };
    
    return new Promise((resolve) => {
      chrome.storage.local.set({ tiltBreakerData: this.gameData }, () => {
        this.updateStats();
        this.showStatus('Session stats reset successfully!', 'success');
        resolve();
      });
    });
  }

  setupEventListeners() {
    // Allowlist of valid setting keys — prevents prototype pollution
    const VALID_TOGGLE_SETTINGS = new Set([
      'enableWinStreakProtection', 'enableTimeLimit', 'enableCooldown',
      'enableStats', 'enableGentleWarnings', 'resetOnClose'
    ]);
    const VALID_NUMBER_SETTINGS = new Set([
      'maxConsecutiveLosses', 'winStreakThreshold', 'timeLimitHours', 'cooldownMinutes'
    ]);

    document.querySelectorAll('.toggle-switch').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        const settingName = e.target.id;
        if (!VALID_TOGGLE_SETTINGS.has(settingName)) return;
        this.settings[settingName] = !this.settings[settingName];
        this.updateToggle(e.target, this.settings[settingName]);
        this.saveSettings();
      });
    });

    document.querySelectorAll('input[type="number"]').forEach(input => {
      input.addEventListener('change', (e) => {
        const settingName = e.target.id;
        if (!VALID_NUMBER_SETTINGS.has(settingName)) return;
        const value = parseFloat(e.target.value);
        if (!Number.isFinite(value)) return;
        this.settings[settingName] = value;
        this.saveSettings();
      });
    });

    document.getElementById('addMessageBtn').addEventListener('click', () => {
      this.addCustomMessage();
    });

    document.getElementById('newMessageInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addCustomMessage();
      }
    });

    document.getElementById('resetStatsBtn').addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all session statistics?')) {
        this.resetGameData();
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0] && tabs[0].url.includes('lichess.org')) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'resetStats' });
          }
        });
      }
    });
  }

  updateUI() {
    Object.keys(this.settings).forEach(key => {
      const toggle = document.getElementById(key);
      if (toggle && toggle.classList.contains('toggle-switch')) {
        this.updateToggle(toggle, this.settings[key]);
      }
    });

    Object.keys(this.settings).forEach(key => {
      const input = document.getElementById(key);
      if (input && input.type === 'number') {
        input.value = this.settings[key];
      }
    });

    this.updateMessageList();
  }

  updateToggle(toggle, isActive) {
    if (isActive) {
      toggle.classList.add('active');
    } else {
      toggle.classList.remove('active');
    }
  }

  updateStats() {
    document.getElementById('totalGames').textContent = this.gameData.totalGames;
    
    const winRate = this.gameData.totalGames > 0 ? 
      Math.round((this.gameData.wins / this.gameData.totalGames) * 100) : 0;
    document.getElementById('winRate').textContent = winRate + '%';
    
    const streakText = this.gameData.currentStreak > 0 ? 
      '+' + this.gameData.currentStreak : 
      this.gameData.currentStreak.toString();
    document.getElementById('currentStreak').textContent = streakText;
    
    document.getElementById('consecutiveLosses').textContent = this.gameData.consecutiveLosses;
  }

  addCustomMessage() {
    const input = document.getElementById('newMessageInput');
    const message = input.value.trim();
    
    if (message && message.length <= 100) {
      if (!this.settings.customMessages.includes(message)) {
        this.settings.customMessages.push(message);
        this.updateMessageList();
        this.saveSettings();
        input.value = '';
      } else {
        this.showStatus('This message already exists!', 'error');
      }
    } else if (message.length > 100) {
      this.showStatus('Message must be 100 characters or less!', 'error');
    }
  }

  removeCustomMessage(index) {
    if (this.settings.customMessages.length > 1) {
      this.settings.customMessages.splice(index, 1);
      this.updateMessageList();
      this.saveSettings();
    } else {
      this.showStatus('You must have at least one custom message!', 'error');
    }
  }

  updateMessageList() {
    const messageList = document.getElementById('messageList');
    messageList.innerHTML = '';
    
    this.settings.customMessages.forEach((message, index) => {
      const messageItem = document.createElement('div');
      messageItem.className = 'message-item';

      const span = document.createElement('span');
      span.style.cssText = 'flex: 1; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;';
      span.textContent = message; // Safe: textContent, no HTML parsing

      const btn = document.createElement('button');
      btn.className = 'delete-btn';
      btn.dataset.index = index;
      btn.setAttribute('aria-label', 'Remove message');
      btn.textContent = '\u00d7';

      messageItem.appendChild(span);
      messageItem.appendChild(btn);
      messageList.appendChild(messageItem);
    });
  }

  setupMessageListDelegation() {
    // Bug 6: Single delegated listener on the container — no inline handlers needed
    document.getElementById('messageList').addEventListener('click', (e) => {
      const btn = e.target.closest('.delete-btn');
      if (btn) {
        const index = parseInt(btn.dataset.index, 10);
        if (!isNaN(index)) this.removeCustomMessage(index);
      }
    });
  }

  setupFeedbackButton() {
    const btn = document.getElementById('feedbackBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      chrome.tabs.create({ url: FEEDBACK_URL });
    });
  }

  showStatus(message, type) {
    const statusElement = document.getElementById('statusMessage');
    statusElement.textContent = message;
    statusElement.className = `status-message status-${type}`;
    statusElement.style.display = 'block';
    
    setTimeout(() => {
      statusElement.style.display = 'none';
    }, 3000);
  }
}

const popup = new TiltBreakerPopup();
window.popup = popup;