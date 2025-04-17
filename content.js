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
  } else if (request.action === 'scrollToInsight') {
    scrollToInsight(request.data);
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
    .filter(p => p.textContent.trim().length > 100 && p.textContent.trim().split(' ').length > 15);
  
  // Get headings
  const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .filter(h => h.textContent.trim().length > 10);
  
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
  paragraphs.slice(0, 3).forEach(element => {
    const text = element.textContent.trim();
    // Truncate long paragraphs
    const truncatedText = text.length > 200 ? text.substring(0, 200) + '...' : text;
    
    // Store element position data for scrolling later
    const rect = element.getBoundingClientRect();
    const offsetY = window.pageYOffset + rect.top;
    const xpath = getElementXPath(element);
    
    insights.push({
      category: categorizeText(text),
      content: truncatedText,
      source: document.title,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      position: {
        offsetY: offsetY,
        xpath: xpath
      }
    });
  });
  
  // Process headings
  headings.slice(0, 2).forEach(element => {
    const text = element.textContent.trim();
    
    // Store element position data for scrolling later
    const rect = element.getBoundingClientRect();
    const offsetY = window.pageYOffset + rect.top;
    const xpath = getElementXPath(element);
    
    insights.push({
      category: categorizeText(text),
      content: text,
      source: document.title,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      isHeading: true,
      position: {
        offsetY: offsetY,
        xpath: xpath
      }
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

// Function to get XPath of an element (for finding it later)
function getElementXPath(element) {
  if (!element) return '';
  
  if (element.id) {
    return `//*[@id="${element.id}"]`;
  }
  
  if (element === document.body) {
    return '/html/body';
  }
  
  let index = 0;
  let sibling = element;
  
  // Count preceding siblings with same tag
  while (sibling) {
    if (sibling.nodeName === element.nodeName) {
      index++;
    }
    sibling = sibling.previousElementSibling;
  }
  
  // Get the xpath of the parent and append the current element
  const parentPath = getElementXPath(element.parentNode);
  return `${parentPath}/${element.nodeName.toLowerCase()}[${index}]`;
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

// Function to scroll to and highlight insight
function scrollToInsight(data) {
  if (!data || !data.position) {
    console.error('No position data for insight');
    return;
  }
  
  let targetElement = null;
  
  // Try to find element by XPath first
  if (data.position.xpath) {
    try {
      const result = document.evaluate(
        data.position.xpath, 
        document, 
        null, 
        XPathResult.FIRST_ORDERED_NODE_TYPE, 
        null
      );
      targetElement = result.singleNodeValue;
    } catch (e) {
      console.error('XPath evaluation failed:', e);
    }
  }
  
  // If element found by XPath, scroll to it
  if (targetElement) {
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    highlightElement(targetElement);
  } 
  // Fallback to using stored Y position
  else if (data.position.offsetY) {
    window.scrollTo({
      top: data.position.offsetY,
      behavior: 'smooth'
    });
  }
}

// Function to temporarily highlight an element
function highlightElement(element) {
  if (!element) return;
  
  // Save original styles
  const originalBackground = element.style.backgroundColor;
  const originalTransition = element.style.transition;
  
  // Add highlight effect
  element.style.transition = 'background-color 1s ease-in-out';
  element.style.backgroundColor = '#FFFF66';
  
  // Remove highlight after animation
  setTimeout(() => {
    element.style.backgroundColor = originalBackground;
    // Restore original transition after animation completes
    setTimeout(() => {
      element.style.transition = originalTransition;
    }, 1000);
  }, 2000);
} 