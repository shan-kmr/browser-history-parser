// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTitle') {
    sendResponse({ title: document.title });
  } else if (request.action === 'forceRefreshInsights') {
    console.log('Force refreshing insights from current page');
    // Reset the extraction flag to allow re-extraction
    hasExtractedInsights = false;
    // Extract insights immediately
    extractReadingInsights();
    sendResponse({ success: true });
  }
  return true;
});

// Track time spent on page
let startTime = Date.now();
let lastActiveTime = startTime;
let lastReportedTime = 0; // Track time already reported to avoid double counting
let isPageActive = document.visibilityState === 'visible';

// Track if insights have been extracted from this page already
let hasExtractedInsights = false;

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

// Reading insights extraction
function extractReadingInsights() {
  // Skip if we've already extracted insights
  if (hasExtractedInsights) {
    console.log('Insights already extracted from this page');
    return;
  }
  
  // Simple categories for prototype
  const categories = ['Technology', 'Business', 'Science', 'Health', 'Education', 'Entertainment'];
  
  // Keywords associated with each category
  const categoryKeywords = {
    'Technology': ['software', 'programming', 'app', 'tech', 'digital', 'computer', 'code', 'data', 'ai', 'artificial intelligence'],
    'Business': ['company', 'market', 'finance', 'investment', 'startup', 'entrepreneur', 'economy', 'stock', 'revenue'],
    'Science': ['research', 'study', 'scientist', 'experiment', 'discovery', 'physics', 'biology', 'chemistry', 'theory'],
    'Health': ['medical', 'health', 'disease', 'treatment', 'doctor', 'patient', 'therapy', 'medicine', 'wellness'],
    'Education': ['learn', 'student', 'school', 'university', 'course', 'education', 'teacher', 'academy', 'degree'],
    'Entertainment': ['movie', 'music', 'game', 'show', 'artist', 'play', 'actor', 'film', 'entertainment']
  };
  
  // Extract meaningful content from the page
  const insights = [];
  
  // Get paragraphs with reasonable length (likely to contain meaningful content)
  const paragraphs = Array.from(document.querySelectorAll('p'))
    .filter(p => p.textContent.trim().length > 100 && p.textContent.trim().split(' ').length > 15)
    .map(p => p.textContent.trim());
  
  // Get headings
  const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .map(h => h.textContent.trim())
    .filter(h => h.length > 10);
  
  // Function to categorize text
  function categorizeText(text) {
    const lowerText = text.toLowerCase();
    const matches = {};
    
    // Count keyword matches for each category
    Object.entries(categoryKeywords).forEach(([category, keywords]) => {
      matches[category] = keywords.filter(keyword => lowerText.includes(keyword.toLowerCase())).length;
    });
    
    // Find category with most keyword matches
    const topCategory = Object.entries(matches)
      .filter(([_, count]) => count > 0) // Only consider categories with matches
      .sort(([_, countA], [__, countB]) => countB - countA)[0];
    
    return topCategory ? topCategory[0] : 'General'; // Default to General if no clear match
  }
  
  // Process paragraphs (limit to 3 for prototype)
  paragraphs.slice(0, 3).forEach(text => {
    // Truncate long paragraphs
    const truncatedText = text.length > 200 ? text.substring(0, 200) + '...' : text;
    
    insights.push({
      category: categorizeText(text),
      content: truncatedText,
      source: document.title,
      url: window.location.href,
      timestamp: new Date().toISOString()
    });
  });
  
  // Process headings
  headings.slice(0, 2).forEach(text => {
    insights.push({
      category: categorizeText(text),
      content: text,
      source: document.title,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      isHeading: true
    });
  });
  
  // Only send if we found insights
  if (insights.length > 0) {
    chrome.runtime.sendMessage({
      action: 'saveReadingInsights',
      data: {
        url: window.location.href,
        title: document.title,
        domain: window.location.hostname,
        insights: insights
      }
    });
    
    // Mark that we've extracted insights from this page
    hasExtractedInsights = true;
    console.log(`Extracted ${insights.length} insights from page`);
  }
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

// Extract reading insights when page has loaded and user has spent some time (10 seconds)
setTimeout(() => {
  if (document.visibilityState === 'visible' && !hasExtractedInsights) {
    extractReadingInsights();
  }
}, 10000);

// Also extract insights when the user has scrolled significantly (they've likely read content)
let hasExtractedAfterScroll = false;
window.addEventListener('scroll', () => {
  if (!hasExtractedAfterScroll && !hasExtractedInsights && window.scrollY > window.innerHeight) {
    hasExtractedAfterScroll = true;
    extractReadingInsights();
  }
}); 