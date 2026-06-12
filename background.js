// Background Service Worker - Copy this EXACTLY into background.js
chrome.runtime.onInstalled.addListener(() => {
  console.log('Tilt Breaker extension installed');
  
  chrome.storage.sync.get(['tiltBreakerSettings'], (result) => {
    if (!result.tiltBreakerSettings) {
      const defaultSettings = {
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
      
      chrome.storage.sync.set({ tiltBreakerSettings: defaultSettings });
    }
  });
});

// Allowlist of valid message actions
const VALID_ACTIONS = new Set(['closeTab', 'getTabInfo', 'updateBadge']);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Secure message passing: validate action against allowlist
  if (!request || typeof request.action !== 'string' || !VALID_ACTIONS.has(request.action)) {
    sendResponse({ error: 'Invalid action' });
    return true;
  }

  if (request.action === 'closeTab') {
    if (sender.tab && typeof sender.tab.id === 'number') {
      chrome.tabs.remove(sender.tab.id);
    }
    sendResponse({ success: true });
  } else if (request.action === 'getTabInfo') {
    sendResponse({ tabId: sender.tab ? sender.tab.id : null });
  } else if (request.action === 'updateBadge') {
    // Validate data payload type and range
    const data = request.data;
    if (!data || typeof data.consecutiveLosses !== 'number' ||
        !Number.isInteger(data.consecutiveLosses) || data.consecutiveLosses < 0 || data.consecutiveLosses > 999) {
      sendResponse({ error: 'Invalid data payload' });
      return true;
    }

    const { consecutiveLosses } = data;
    
    if (consecutiveLosses > 0) {
      chrome.action.setBadgeText({
        text: consecutiveLosses.toString(),
        tabId: sender.tab.id
      });
      
      let badgeColor = '#4CAF50';
      if (consecutiveLosses >= 2) badgeColor = '#FF9800';
      if (consecutiveLosses >= 3) badgeColor = '#F44336';
      
      chrome.action.setBadgeBackgroundColor({
        color: badgeColor,
        tabId: sender.tab.id
      });
    } else {
      chrome.action.setBadgeText({
        text: '',
        tabId: sender.tab.id
      });
    }
    sendResponse({ success: true });
  }
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanupOldData') {
    chrome.storage.local.get(null, (data) => {
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const keysToRemove = [];
      
      Object.keys(data).forEach(key => {
        if (key.startsWith('tiltBreakerData_') && data[key].timestamp < oneWeekAgo) {
          keysToRemove.push(key);
        }
      });
      
      if (keysToRemove.length > 0) {
        chrome.storage.local.remove(keysToRemove);
      }
    });
  }
});

chrome.alarms.create('cleanupOldData', {
  delayInMinutes: 60,
  periodInMinutes: 24 * 60
});