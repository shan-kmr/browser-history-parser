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
let totalActiveTime = 0;

// Update active time when page is visible
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    lastActiveTime = Date.now();
  }
});

// Send time spent data periodically
setInterval(() => {
  const now = Date.now();
  if (document.visibilityState === 'visible') {
    totalActiveTime += now - lastActiveTime;
  }
  lastActiveTime = now;
  
  // Send time spent data every minute
  chrome.runtime.sendMessage({
    action: 'updateTimeSpent',
    data: {
      url: window.location.href,
      timeSpent: Math.floor(totalActiveTime / 1000) // Convert to seconds
    }
  });
}, 6000); // Update every 6 seconds 