// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTitle') {
    sendResponse({ title: document.title });
    return false; // We've responded synchronously
  } else if (request.action === 'forceRefreshInsights') {
    console.log('Force refreshing insights from current page');
    // Extract insights immediately
    extractPageContentForGPT(true);
    // Send immediate response
    sendResponse({ success: true });
    return false; // We've responded synchronously
  } else if (request.action === "extractForGPT") {
    extractContent();
    // Send immediate response
    sendResponse({ success: true });
    return false; // We've responded synchronously
  }
  
  // If we get here, we don't recognize the message action
  sendResponse({ success: false, error: "Unknown action" });
  return false; // Always respond synchronously
});

// Track time spent on page
let startTime = Date.now();
let lastActiveTime = startTime;
let lastReportedTime = 0; // Track time already reported to avoid double counting
let isPageActive = document.visibilityState === 'visible';

// Track if insights have been extracted from this page already
let hasExtractedInsights = false;

// Check auto-analyze setting when page loads
document.addEventListener('DOMContentLoaded', () => {
  // Only check if we haven't already extracted insights
  if (!hasExtractedInsights) {
    chrome.storage.local.get(['autoAnalyze'], (result) => {
      const autoAnalyze = result.autoAnalyze || false;
      
      if (autoAnalyze) {
        console.log('Auto-analyze enabled, extracting content automatically');
        // Wait a moment for page to fully load
        setTimeout(() => {
          if (!hasExtractedInsights && document.visibilityState === 'visible') {
            extractPageContentForGPT();
          }
        }, 3000);
      }
    });
  }
  
  // Continue with other DOMContentLoaded handlers
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('scrollToInsight')) {
    console.log('This page was opened from an insight, attempting to scroll...');
    
    // Wait for the page to be more fully loaded before scrolling
    setTimeout(() => {
      // Get the insight data from storage
      chrome.storage.local.get(['currentInsight'], (result) => {
        if (result.currentInsight) {
          const insight = result.currentInsight;
          
          // Verify this is the correct page and recent request (within last minute)
          const currentUrl = window.location.href.split('?')[0]; // Remove query params
          const insightUrl = insight.url.split('?')[0]; // Remove query params
          const isRecentRequest = (new Date().getTime() - insight.timestamp) < 60000; // Within a minute
          
          if (currentUrl === insightUrl && isRecentRequest) {
            console.log('Found insight data for this page, scrolling to content');
            scrollToInsight(insight);
          }
        }
      });
    }, 1000); // Give page time to render
  }
});

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

// Function to extract content and send to GPT for analysis
function extractPageContentForGPT(forceRefresh = false) {
  try {
    // Skip extraction if we've already processed this page
    if (hasExtractedInsights && !forceRefresh) {
      console.log('Insights already extracted for this page, skipping');
      return;
    }
    
    // First check if insights already exist for this URL in storage
    const currentUrl = window.location.href;
    chrome.storage.local.get(['readingInsights'], (result) => {
      const readingInsights = result.readingInsights || [];
      
      // Check if we already have insights for this URL
      const hasExistingInsights = readingInsights.some(insight => 
        insight.url === currentUrl || 
        insight.url.replace(/https?:\/\//, '') === currentUrl.replace(/https?:\/\//, '')
      );
      
      if (hasExistingInsights && !forceRefresh) {
        console.log('Insights already exist for this URL in storage, skipping extraction');
        hasExtractedInsights = true;
        return;
      }
      
      // Continue with extraction if no insights exist or force refresh is requested
      updateStatus("Extracting content...", "info");
      
      // Extract content from the page
      const extractedContent = document.body.innerText.trim().substring(0, 5000);
      console.log(`Extracted ${extractedContent.length} characters of content`);
      
      if (extractedContent.length < 100) {
        updateStatus("Error: Not enough content to analyze", "error");
        return;
      }
      
      // Simple data object with minimal properties
      const data = {
        content: extractedContent,
        url: window.location.href,
        title: document.title
      };
      
      // Send to background script
      updateStatus("Sending content for analysis...", "info");
      
      chrome.runtime.sendMessage({
        action: "analyzeContent",
        data: data
      }, response => {
        if (chrome.runtime.lastError) {
          console.error("Message error:", chrome.runtime.lastError);
          updateStatus("Error: " + chrome.runtime.lastError.message, "error");
          return;
        }
        
        if (response && response.success) {
          updateStatus("Content sent for analysis. Check extension popup for results.", "success");
          hasExtractedInsights = true;
        } else {
          updateStatus("Error: " + (response ? response.error : "Unknown error"), "error");
        }
      });
    });
  } catch (error) {
    console.error("Content extraction error:", error);
    updateStatus("Error: " + error.message, "error");
  }
}

function extractContentBySections() {
  const sections = [];
  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  
  if (headings.length === 0) {
    try {
      // No headings found, fall back to extracting all content from the page as text
      // First, collect all meaningful content elements
      const contentElements = document.querySelectorAll('p, article, main, .content, #content, h1, h2, h3, h4, h5, h6');
      let allContent = '';
      
      // Debug element count
      console.log(`Found ${contentElements.length} content elements on the page`);
      
      // If we found content elements, extract text from them
      if (contentElements.length > 0) {
        contentElements.forEach(element => {
          // Skip empty elements and scripts
          if (element.textContent && element.textContent.trim() && 
              !element.closest('script') && !element.closest('style')) {
            allContent += element.textContent.trim() + '\n\n';
          }
        });
      }
      
      // If we couldn't find enough content, fall back to body text
      if (!allContent || allContent.length < 500) {
        console.log("Not enough content from elements, using body.innerText");
        allContent = document.body.innerText.trim();
      }
      
      // Limit to a reasonable size and return
      const limitedContent = allContent.substring(0, 6000);
      console.log(`Extracted content sample (no headings): "${limitedContent.substring(0, 100)}..."`);
      return limitedContent;
    } catch (error) {
      console.error("Error extracting content without headings:", error);
      return document.body.innerText.trim().substring(0, 6000);
    }
  }
  
  try {
    // Process each heading and the content that follows it
    headings.forEach((heading, index) => {
      // Skip empty headings
      if (!heading.textContent.trim()) return;
      
      // Get heading level (1-6)
      const level = parseInt(heading.tagName.substring(1));
      
      // Get content between this heading and the next heading
      let content = "";
      let currentElement = heading.nextElementSibling;
      const nextHeading = headings[index + 1];
      
      while (currentElement && currentElement !== nextHeading) {
        // Only include paragraphs, lists, and other content elements (not scripts, styles, etc.)
        if (isContentElement(currentElement)) {
          content += currentElement.textContent.trim() + "\n";
        }
        currentElement = currentElement.nextElementSibling;
      }
      
      // Only add sections with actual content
      if (content.trim()) {
        sections.push({
          level: level,
          heading: heading.textContent.trim(),
          content: content.trim()
        });
      }
    });
    
    // Convert sections to a single string for better compatibility
    let combinedContent = '';
    sections.forEach(section => {
      combinedContent += `## ${section.heading}\n\n${section.content}\n\n`;
    });
    
    if (combinedContent.trim().length === 0) {
      // Fallback if sections are empty
      console.log("No section content found, using body text");
      return document.body.innerText.trim().substring(0, 6000);
    }
    
    console.log(`Extracted structured content: ${combinedContent.length} chars`);
    return combinedContent;
  } catch (error) {
    console.error("Error extracting content with headings:", error);
    return document.body.innerText.trim().substring(0, 6000);
  }
}

function updateStatus(message, type = 'info') {
  // Get or create the status element
  let statusElement = document.getElementById('rex-status-message');
  if (!statusElement) {
    statusElement = createStatusElement();
  }
  
  statusElement.textContent = message;
  statusElement.className = 'rex-status-message ' + type;
  
  // Auto-hide success and info messages after 5 seconds
  if (type === 'success' || type === 'info') {
    setTimeout(() => {
      statusElement.style.opacity = '0';
      // Remove after fade out
      setTimeout(() => {
        if (statusElement.parentNode) {
          statusElement.parentNode.removeChild(statusElement);
        }
      }, 500);
    }, 5000);
  }
}

function createStatusElement() {
  let statusElement = document.getElementById('rex-status-message');
  
  if (!statusElement) {
    statusElement = document.createElement('div');
    statusElement.id = 'rex-status-message';
    statusElement.className = 'rex-status-message';
    
    // Style the status element
    statusElement.style.position = 'fixed';
    statusElement.style.bottom = '20px';
    statusElement.style.right = '20px';
    statusElement.style.padding = '10px 15px';
    statusElement.style.backgroundColor = '#333';
    statusElement.style.color = 'white';
    statusElement.style.borderRadius = '5px';
    statusElement.style.zIndex = '10000';
    statusElement.style.transition = 'opacity 0.5s';
    statusElement.style.opacity = '1';
    statusElement.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    
    document.body.appendChild(statusElement);
  }
  
  return statusElement;
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
    extractPageContentForGPT();
  }
}, 10000);

// Also extract insights when the user has scrolled significantly (they've likely read content)
let hasExtractedAfterScroll = false;
window.addEventListener('scroll', () => {
  if (!hasExtractedAfterScroll && !hasExtractedInsights && window.scrollY > window.innerHeight) {
    hasExtractedAfterScroll = true;
    extractPageContentForGPT();
  }
});

// Try to find element by content first, then fallback to XPath
function findElementByContent(content) {
  // Look for paragraphs with this content
  const paragraphs = Array.from(document.querySelectorAll('p'));
  for (const p of paragraphs) {
    if (p.textContent.trim().includes(content.substring(0, 100))) {
      return p;
    }
  }
  
  // Look for headings with this content
  const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
  for (const h of headings) {
    if (h.textContent.trim().includes(content.substring(0, 50))) {
      return h;
    }
  }
  
  return null;
}

// Function to scroll to and highlight insight
function scrollToInsight(data) {
  if (!data) {
    console.error('No insight data provided');
    return;
  }
  
  let targetElement = null;
  
  // Try to find element by content first (more reliable than XPath)
  if (data.content) {
    targetElement = findElementByContent(data.content);
  }
  
  // If not found by content, try XPath
  if (!targetElement && data.position && data.position.xpath) {
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
  
  // If element found, scroll to it
  if (targetElement) {
    console.log('Element found, scrolling into view');
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } 
  // Fallback to using stored Y position
  else if (data.position && data.position.offsetY) {
    console.log('Using position fallback, scrolling to Y position');
    window.scrollTo({
      top: data.position.offsetY,
      behavior: 'smooth'
    });
  } else {
    console.error('Could not find element to scroll to');
  }
}

// Function to extract domain from URL
function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    // Remove www. if present
    return hostname.replace(/^www\./, '');
  } catch (error) {
    console.error('Error extracting domain:', error);
    return url;
  }
}

// Function to extract content by headers from the webpage
function extractContent() {
  try {
    // Extract content from the page
    const extractedContent = extractContentBySections();
    console.log(`Successfully extracted ${extractedContent.length} characters of content`);
    
    // Validate content
    if (!extractedContent || typeof extractedContent !== 'string' || extractedContent.length < 100) {
      const errorMsg = "No valid content to process. Please try another page.";
      console.error(errorMsg);
      
      // Send error message to popup
      chrome.runtime.sendMessage({
        action: "contentExtractionFailed",
        error: errorMsg
      });
      return;
    }
    
    // Prepare data
    const data = {
      title: document.title,
      url: window.location.href,
      domain: extractDomain(window.location.href),
      content: extractedContent,
      timestamp: new Date().toISOString()
    };
    
    // Send to background script
    try {
      console.log(`Sending ${extractedContent.length} characters of content to background script`);
      chrome.runtime.sendMessage({
        action: "processContent",
        data: data
      });
    } catch (error) {
      console.error("Error sending message:", error);
      chrome.runtime.sendMessage({
        action: "contentExtractionFailed",
        error: error.message || "Failed to send content to background"
      });
    }
  } catch (error) {
    console.error("Error in extractContent:", error);
    chrome.runtime.sendMessage({
      action: "contentExtractionFailed",
      error: error.message || "Unknown extraction error"
    });
  }
}

// Helper function to determine if an element is a content element
function isContentElement(element) {
  const contentTags = ['P', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'TABLE', 'FIGURE'];
  
  // Check if it's a direct content tag
  if (contentTags.includes(element.tagName)) {
    return true;
  }
  
  // Check if it's a div with content but no nested headings
  if (element.tagName === 'DIV' && 
      element.textContent.trim().length > 0 && 
      !element.querySelector('h1, h2, h3, h4, h5, h6')) {
    return true;
  }
  
  return false;
}

// Extract main content as fallback
function extractMainContent() {
  // Try to find the main content of the page
  const mainContentSelectors = [
    'main',
    'article',
    '#content',
    '.content',
    '#main',
    '.main'
  ];
  
  let mainContent = null;
  
  // Try each selector until we find content
  for (const selector of mainContentSelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim().length > 100) {
      mainContent = element;
      break;
    }
  }
  
  // If no main content found, use body
  if (!mainContent) {
    mainContent = document.body;
  }
  
  // Extract text content, removing scripts and styles
  let content = '';
  const contentElements = mainContent.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote');
  contentElements.forEach(el => {
    content += el.textContent.trim() + '\n\n';
  });
  
  // If we still don't have enough content, just take the body text
  if (content.length < 100) {
    content = document.body.textContent.trim()
      .replace(/\s+/g, ' ')
      .substring(0, 5000); // Limit to 5000 chars
  }
  
  return content.trim();
} 