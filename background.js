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
        enableGentleWarnings: true
      };
      
      chrome.storage.sync.set({ tiltBreakerSettings: defaultSettings });
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'closeTab') {
    chrome.tabs.remove(sender.tab.id);
    sendResponse({ success: true });
  } else if (request.action === 'getTabInfo') {
    sendResponse({ tabId: sender.tab.id });
  } else if (request.action === 'updateBadge') {
    const { consecutiveLosses } = request.data;
    
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
  // Keep message channel open for any async sendResponse calls
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