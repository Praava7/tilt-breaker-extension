console.log("Tilt Breaker - Fixed Chrome Storage Version");

class TiltBreaker {
  constructor() {
    this.gameData = {
      sessionStartTime: Date.now(),
      totalGames: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      consecutiveLosses: 0,
      currentStreak: 0,
      maxWinStreak: 0,
      processedGames: new Set(),
      hasUsedContinue: false,
      lastActivityTime: Date.now()
    };
    
    this.settings = {
      maxConsecutiveLosses: 3,
      cooldownMinutes: 10,
      customMessages: [
        "Take a break! You're on tilt",
        "Step away from the board and reset",
        "Your rating will thank you for this pause"
      ],
      enableCooldown: true,
      enableGentleWarnings: true,
      resetOnClose: false
    };
    
    this.playerColor = null;
    this._intervalId = null; // Bug 2: store interval ID for cleanup
    this.init();
  }

  init() {
    // Load settings first (needed to decide whether to reset data on load)
    this.loadSettings().then(() => {
      return this.loadData();
    }).then(() => {
      this.detectPlayerColor();
      this.setupGameMonitoring();
      console.log("Tilt Breaker ready");
    });
  }

  loadData() {
    return new Promise((resolve) => {
      if (chrome && chrome.storage) {
        // resetOnClose: only wipe on a fresh tab/window, NOT on reload.
        // sessionStorage survives reloads but clears when the tab closes.
        if (this.settings.resetOnClose) {
          const isReload = sessionStorage.getItem('tiltBreakerSessionActive');
          if (!isReload) {
            // Fresh tab — clear session data
            console.log("resetOnClose: fresh tab detected — clearing session data.");
            this.gameData = {
              sessionStartTime: Date.now(),
              totalGames: 0,
              wins: 0,
              losses: 0,
              draws: 0,
              consecutiveLosses: 0,
              currentStreak: 0,
              maxWinStreak: 0,
              processedGames: new Set(),
              hasUsedContinue: false,
              lastActivityTime: Date.now()
            };
            this.saveData();
          } else {
            console.log("resetOnClose: page reload detected — keeping session data.");
          }
          // Mark this tab as having an active session
          sessionStorage.setItem('tiltBreakerSessionActive', 'true');
        }

        chrome.storage.local.get(['tiltBreakerData'], (result) => {
          if (chrome.runtime.lastError) {
            console.warn("Storage error:", chrome.runtime.lastError);
            resolve();
            return;
          }
          
          if (result.tiltBreakerData) {
            const data = result.tiltBreakerData;
            // Reset hasUsedContinue if this is a new browser session
            // (session is considered new if >12h have passed since last activity)
            const SESSION_TIMEOUT_MS = 12 * 60 * 60 * 1000;
            const isNewSession = !data.lastActivityTime ||
              (Date.now() - data.lastActivityTime > SESSION_TIMEOUT_MS);

            this.gameData = { ...this.gameData, ...data };
            this.gameData.processedGames = new Set(data.processedGames || []);

            if (isNewSession) {
              this.gameData.hasUsedContinue = false;
              console.log("New session detected — hasUsedContinue reset.");
            }

            console.log("Loaded session:", this.gameData.totalGames, "games");
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // Bug 4: Load user settings from chrome.storage.sync so popup changes take effect
  loadSettings() {
    return new Promise((resolve) => {
      if (chrome && chrome.storage) {
        chrome.storage.sync.get(['tiltBreakerSettings'], (result) => {
          if (chrome.runtime.lastError) {
            console.warn("Settings load error:", chrome.runtime.lastError);
            resolve();
            return;
          }
          if (result.tiltBreakerSettings) {
            // Merge only the keys content.js actually uses
            const s = result.tiltBreakerSettings;
            if (s.maxConsecutiveLosses) this.settings.maxConsecutiveLosses = s.maxConsecutiveLosses;
            if (s.cooldownMinutes)      this.settings.cooldownMinutes = s.cooldownMinutes;
            if (s.enableCooldown !== undefined) this.settings.enableCooldown = s.enableCooldown;
            if (s.enableGentleWarnings !== undefined) this.settings.enableGentleWarnings = s.enableGentleWarnings;
            if (s.resetOnClose !== undefined) this.settings.resetOnClose = s.resetOnClose;
            if (Array.isArray(s.customMessages) && s.customMessages.length > 0) {
              this.settings.customMessages = s.customMessages;
            }
            console.log("Settings loaded from sync storage.");
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  saveData() {
    if (chrome && chrome.storage) {
      const dataToSave = {
        ...this.gameData,
        processedGames: Array.from(this.gameData.processedGames)
      };
      
      chrome.storage.local.set({ tiltBreakerData: dataToSave }, () => {
        if (chrome.runtime.lastError) {
          console.warn("Save error:", chrome.runtime.lastError);
        }
      });
    }
  }

  detectPlayerColor() {
    // Method 1: Check if your pieces are at the bottom
    const board = document.querySelector('.cg-wrap');
    if (!board) return;
    
    // Look for user info sections to determine orientation
    const userElements = document.querySelectorAll('.ruser');
    const currentUser = this.getCurrentUsername();
    
    for (const element of userElements) {
      if (element.textContent.includes(currentUser)) {
        const rect = element.getBoundingClientRect();
        const boardRect = board.getBoundingClientRect();
        
        if (rect.top > boardRect.bottom) {
          this.playerColor = 'white';
        } else if (rect.bottom < boardRect.top) {
          this.playerColor = 'black';
        }
        break;
      }
    }
    
    // Fallback: Check board flipped class
    if (!this.playerColor) {
      this.playerColor = board.classList.contains('orientation-black') ? 'black' : 'white';
    }
    
    console.log("Player color detected:", this.playerColor);
  }

  getCurrentUsername() {
    const userLink = document.querySelector('.site-header .user-link, .site-title .user-link');
    return userLink ? userLink.textContent.trim() : '';
  }

  setupGameMonitoring() {
    // Bug 2: Store interval ID so it can be cleared on page unload
    this._intervalId = setInterval(() => this.checkForGameEnd(), 3000);
    
    // Clear interval when page is navigated away or closed
    window.addEventListener('beforeunload', () => {
      if (this._intervalId) {
        clearInterval(this._intervalId);
        this._intervalId = null;
      }
    });

    // Also monitor DOM changes
    const observer = new MutationObserver(() => this.checkForGameEnd());
    const gameArea = document.querySelector('.main-board') || document.body;
    observer.observe(gameArea, { childList: true, subtree: true });
  }

  checkForGameEnd() {
    const gameId = window.location.pathname.match(/^\/([a-zA-Z0-9]{8,12})$/);
    if (!gameId || this.gameData.processedGames.has(gameId[1])) return;
    
    const result = this.detectGameResult();
    if (result) {
      console.log("Game end detected:", result, "Player was:", this.playerColor);
      this.gameData.processedGames.add(gameId[1]);
      this.processResult(result);
    }
  }

  detectGameResult() {
    const pageText = document.body.innerText;
    
    // Ensure we have player color
    if (!this.playerColor) {
      this.detectPlayerColor();
    }
    
    // Method 1: Checkmate
    if (pageText.includes('Checkmate')) {
      if (pageText.includes('White is victorious')) {
        return this.playerColor === 'white' ? 'win' : 'loss';
      }
      if (pageText.includes('Black is victorious')) {
        return this.playerColor === 'black' ? 'win' : 'loss';
      }
    }
    
    // Method 2: Timeout
    if (pageText.includes('time out')) {
      if (pageText.includes('White time out') && pageText.includes('Black is victorious')) {
        return this.playerColor === 'black' ? 'win' : 'loss';
      }
      if (pageText.includes('Black time out') && pageText.includes('White is victorious')) {
        return this.playerColor === 'white' ? 'win' : 'loss';
      }
    }
    
    // Method 3: Resignation
    if (pageText.includes('resigned')) {
      if (pageText.includes('White resigned')) {
        return this.playerColor === 'black' ? 'win' : 'loss';
      }
      if (pageText.includes('Black resigned')) {
        return this.playerColor === 'white' ? 'win' : 'loss';
      }
    }
    
    // Method 4: Draw
    if (pageText.includes('Draw') || pageText.includes('Stalemate') || 
        pageText.includes('Repetition') || pageText.includes('Insufficient material')) {
      return 'draw';
    }
    
    // Method 5: Rating change (backup detection)
    const ratingElements = document.querySelectorAll('.rrating');
    for (const element of ratingElements) {
      const text = element.textContent;
      const match = text.match(/([+\-]\d+)/);
      if (match) {
        const change = parseInt(match[1]);
        return change > 0 ? 'win' : (change < 0 ? 'loss' : 'draw');
      }
    }
    
    return null;
  }

  processResult(result) {
    this.gameData.totalGames++;
    this.gameData[result + 's']++;
    this.gameData.lastActivityTime = Date.now();
    
    // Update streaks
    if (result === 'win') {
      this.gameData.consecutiveLosses = 0;
      this.gameData.currentStreak++;
      this.gameData.maxWinStreak = Math.max(this.gameData.maxWinStreak, this.gameData.currentStreak);
      this.gameData.hasUsedContinue = false;
    } else if (result === 'loss') {
      this.gameData.consecutiveLosses++;
      this.gameData.currentStreak = -this.gameData.consecutiveLosses;
      
      // Check if user chose "continue" and should be forced to close
      if (this.gameData.hasUsedContinue) {
        this.forceClose();
        return;
      }
      
      // Gentle warning: show a soft notification 1 loss before tilt threshold
      if (this.settings.enableGentleWarnings &&
          this.gameData.consecutiveLosses === this.settings.maxConsecutiveLosses - 1 &&
          this.gameData.consecutiveLosses >= 2) {
        this.showNotification(
          "⚠️ Heads Up",
          `You've lost ${this.gameData.consecutiveLosses} in a row. One more loss will trigger a tilt break.`,
          "warning"
        );
      }

      // Full tilt intervention
      if (this.gameData.consecutiveLosses >= this.settings.maxConsecutiveLosses) {
        this.showTiltPopup();
      }
    } else { // draw
      this.gameData.currentStreak = 0;
    }
    
    this.saveData();
    this.updateBadge();
    
    console.log(`Game processed: ${result}`, {
      totalGames: this.gameData.totalGames,
      consecutiveLosses: this.gameData.consecutiveLosses,
      winRate: Math.round((this.gameData.wins / this.gameData.totalGames) * 100) + '%'
    });
  }

  updateBadge() {
    if (chrome && chrome.runtime) {
      try {
        chrome.runtime.sendMessage({
          action: 'updateBadge',
          data: { consecutiveLosses: this.gameData.consecutiveLosses }
        });
      } catch (e) {
        // Ignore if extension context is invalid
      }
    }
  }

  showTiltPopup() {
    // Remove any existing popup
    const existingPopup = document.getElementById('tilt-popup');
    if (existingPopup) existingPopup.remove();

    const popup = document.createElement('div');
    popup.id = 'tilt-popup';
    popup.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.8); display: flex; justify-content: center;
      align-items: center; z-index: 10000; font-family: system-ui;
    `;

    const message = this.settings.customMessages[
      Math.floor(Math.random() * this.settings.customMessages.length)
    ];

    // Card container
    const card = document.createElement('div');
    card.style.cssText = 'background: #2c2c2c; border-radius: 12px; max-width: 500px; width: 90%; color: white; padding: 30px; text-align: center;';

    // Title
    const h2 = document.createElement('h2');
    h2.style.cssText = 'color: #e74c3c; margin: 0 0 20px;';
    h2.textContent = 'Tilt Alert!';
    card.appendChild(h2);

    // Loss count message
    const lossP = document.createElement('p');
    lossP.textContent = "You've lost " + this.gameData.consecutiveLosses + " games in a row.";
    card.appendChild(lossP);

    // Custom message
    const msgP = document.createElement('p');
    msgP.style.cssText = 'font-style: italic; color: #bdc3c7;';
    msgP.textContent = message;
    card.appendChild(msgP);

    // Stats container
    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = 'margin: 30px 0; padding: 15px; background: #34495e; border-radius: 8px;';

    // Consecutive Losses row
    const lossRow = document.createElement('div');
    lossRow.style.cssText = 'margin-bottom: 8px;';
    const lossLabel = document.createElement('span');
    lossLabel.textContent = 'Consecutive Losses:';
    const lossValue = document.createElement('span');
    lossValue.style.cssText = 'color: #e74c3c; font-weight: bold; float: right;';
    lossValue.textContent = this.gameData.consecutiveLosses;
    lossRow.appendChild(lossLabel);
    lossRow.appendChild(lossValue);
    statsDiv.appendChild(lossRow);

    // Session W/L/D row
    const wldRow = document.createElement('div');
    const wldLabel = document.createElement('span');
    wldLabel.textContent = 'Session W/L/D:';
    const wldValue = document.createElement('span');
    wldValue.style.cssText = 'color: #3498db; font-weight: bold; float: right;';
    wldValue.textContent = this.gameData.wins + '/' + this.gameData.losses + '/' + this.gameData.draws;
    wldRow.appendChild(wldLabel);
    wldRow.appendChild(wldValue);
    statsDiv.appendChild(wldRow);

    card.appendChild(statsDiv);

    // Continue button
    const continueBtn = document.createElement('button');
    continueBtn.id = 'tilt-continue-btn';
    continueBtn.style.cssText = 'padding: 12px 20px; margin: 10px; border: none; border-radius: 6px; background: #f39c12; color: white; cursor: pointer; display: block; width: calc(100% - 20px);';
    continueBtn.textContent = "I'm fine, let me play one more match";
    card.appendChild(continueBtn);

    // Rest button
    const restBtn = document.createElement('button');
    restBtn.id = 'tilt-rest-btn';
    restBtn.style.cssText = 'padding: 12px 20px; margin: 10px; border: none; border-radius: 6px; background: #27ae60; color: white; cursor: pointer; display: block; width: calc(100% - 20px);';
    restBtn.textContent = "Yeah, let's take a rest for a while";
    card.appendChild(restBtn);

    popup.appendChild(card);
    document.body.appendChild(popup);

    document.getElementById('tilt-continue-btn').onclick = () => {
      this.gameData.hasUsedContinue = true;
      this.saveData();
      popup.remove();

      // Show warning notification
      this.showNotification(
        "One More Chance",
        "You get one more game. If you lose, the site will close automatically.",
        "warning"
      );
    };

    document.getElementById('tilt-rest-btn').onclick = () => {
      popup.remove();
      if (this.settings.enableCooldown) {
        this.startCooldown();
      } else {
        this.forceClose();
      }
    };
  }

  showNotification(title, message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed; top: 20px; right: 20px; 
      background: ${type === 'warning' ? '#f39c12' : type === 'success' ? '#27ae60' : '#3498db'};
      color: white; padding: 15px 20px; border-radius: 8px; z-index: 9999;
      max-width: 350px; font-family: system-ui; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    const wrapper = document.createElement('div');

    const strong = document.createElement('strong');
    strong.style.cssText = 'display: block; margin-bottom: 5px;';
    strong.textContent = title;
    wrapper.appendChild(strong);

    const p = document.createElement('p');
    p.style.cssText = 'margin: 0; font-size: 0.9em;';
    p.textContent = message;
    wrapper.appendChild(p);

    notification.appendChild(wrapper);
    document.body.appendChild(notification);

    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 5000);
  }

  startCooldown() {
    const cooldownEnd = Date.now() + (this.settings.cooldownMinutes * 60 * 1000);

    const cooldownScreen = document.createElement('div');
    cooldownScreen.id = 'tilt-cooldown';
    cooldownScreen.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex; justify-content: center; align-items: center; z-index: 10000;
      font-family: system-ui; color: white; text-align: center;
    `;

    // Outer wrapper
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'max-width: 600px; padding: 40px;';

    // Emoji
    const emojiDiv = document.createElement('div');
    emojiDiv.style.cssText = 'font-size: 4em; margin-bottom: 20px;';
    emojiDiv.textContent = '⏳';
    wrapper.appendChild(emojiDiv);

    // Heading
    const h2 = document.createElement('h2');
    h2.style.cssText = 'font-size: 2.5em; margin: 0 0 15px 0;';
    h2.textContent = 'Cooling Down';
    wrapper.appendChild(h2);

    // Break message
    const breakP = document.createElement('p');
    breakP.style.cssText = 'font-size: 1.2em; margin: 0 0 25px 0;';
    breakP.textContent = 'Take a ' + this.settings.cooldownMinutes + '-minute break to reset your mindset.';
    wrapper.appendChild(breakP);

    // Timer
    const timerDiv = document.createElement('div');
    timerDiv.id = 'cooldown-timer';
    timerDiv.style.cssText = 'font-size: 1.5em; font-weight: 600; background: rgba(255,255,255,0.2); padding: 15px 25px; border-radius: 25px; margin: 20px 0 30px 0; display: inline-block;';
    timerDiv.textContent = this.settings.cooldownMinutes + ' minutes remaining';
    wrapper.appendChild(timerDiv);

    // Activities container
    const activitiesDiv = document.createElement('div');
    activitiesDiv.style.cssText = 'background: rgba(255,255,255,0.1); border-radius: 12px; padding: 25px; margin-top: 30px; text-align: left;';

    const activitiesH3 = document.createElement('h3');
    activitiesH3.style.cssText = 'margin: 0 0 15px 0; text-align: center;';
    activitiesH3.textContent = 'Try these activities:';
    activitiesDiv.appendChild(activitiesH3);

    const activities = [
      '🧘‍♂️ Take deep breaths or meditate',
      '📚 Analyze your recent games',
      '☕ Get a drink or snack',
      '🚶‍♂️ Take a short walk',
      '🧩 Solve some chess puzzles'
    ];
    activities.forEach(text => {
      const actDiv = document.createElement('div');
      actDiv.textContent = text;
      activitiesDiv.appendChild(actDiv);
    });

    wrapper.appendChild(activitiesDiv);
    cooldownScreen.appendChild(wrapper);
    document.body.appendChild(cooldownScreen);

    // Update timer — store ID so we can clear it when done
    let cooldownIntervalId;
    const updateTimer = () => {
      const remaining = cooldownEnd - Date.now();
      if (remaining <= 0) {
        clearInterval(cooldownIntervalId);
        cooldownScreen.remove();
        this.gameData.consecutiveLosses = 0;
        this.gameData.hasUsedContinue = false;
        this.saveData();
        this.showNotification("Cooldown Complete!", "You can now play with a fresh mindset. Good luck!", "success");
        return;
      }

      const minutes = Math.ceil(remaining / (1000 * 60));
      const timer = document.getElementById('cooldown-timer');
      if (timer) {
        timer.textContent = `${minutes} minute${minutes !== 1 ? 's' : ''} remaining`;
      }
    };

    cooldownIntervalId = setInterval(updateTimer, 1000);
    updateTimer();
  }

  forceClose() {
    this.showNotification("Taking a Break", "Closing Lichess in 3 seconds. See you later!", "info");
    
    setTimeout(() => {
      // Bug 3: window.close() only works on script-opened tabs.
      // Send a message to the background service worker to close the tab reliably.
      try {
        chrome.runtime.sendMessage({ action: 'closeTab' });
      } catch (e) {
        // Fallback if extension context is invalidated
        window.location.href = 'https://www.google.com';
      }
    }, 3000);
  }
}

const tiltBreaker = new TiltBreaker();
window.tiltBreaker = tiltBreaker;

// Handle messages from the popup — validate action before processing
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || typeof request.action !== 'string' || request.action !== 'resetStats') {
    sendResponse({ error: 'Invalid action' });
    return true;
  }

  tiltBreaker.gameData = {
    sessionStartTime: Date.now(),
    totalGames: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    consecutiveLosses: 0,
    currentStreak: 0,
    maxWinStreak: 0,
    processedGames: new Set(),
    hasUsedContinue: false,
    lastActivityTime: Date.now()
  };
  tiltBreaker.saveData();
  tiltBreaker.updateBadge();
  sendResponse({ success: true });
  return true;
});