// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTitle') {
    sendResponse({ title: document.title });
  }
  return true;
});

// Track time spent on page
let startTime = Date.now();
let lastActiveTime = startTime;
let lastReportedTime = 0; // Track time already reported to avoid double counting
let isPageActive = document.visibilityState === 'visible';

// Update active time when page is visible
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // Page became visible, start tracking
    lastActiveTime = Date.now();
    isPageActive = true;
  } else {
    // Page became hidden, update and report
    if (isPageActive) {
      const now = Date.now();
      const currentSessionTime = now - lastActiveTime;
      if (currentSessionTime > 1000) { // Only report if more than 1 second
        sendTimeUpdate(Math.floor(currentSessionTime / 1000));
      }
      isPageActive = false;
    }
  }
});

// Function to send time update to background script
function sendTimeUpdate(timeInSeconds) {
  if (!timeInSeconds || timeInSeconds <= 0) return;
  
  chrome.runtime.sendMessage({
    action: 'updateTimeSpent',
    data: {
      url: window.location.href,
      title: document.title,
      domain: window.location.hostname,
      timeSpent: timeInSeconds // Time in seconds
    }
  });
  
  // Reset tracking for reported interval
  lastReportedTime = Date.now();
}

// Send time spent data periodically
setInterval(() => {
  // Only calculate and send if page is active
  if (isPageActive) {
    const now = Date.now();
    const newSessionTime = now - lastActiveTime;
    
    // Only report if we've accumulated at least 2 seconds
    if (newSessionTime >= 2000) {
      sendTimeUpdate(Math.floor(newSessionTime / 1000));
      lastActiveTime = now; // Reset the active time counter
    }
  }
}, 3000); // Check every 3 seconds 