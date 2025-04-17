// Initialize storage when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ 
    historyData: [],
    timeSpentData: {},
    readingInsights: []
  });
  console.log('Extension installed, storage initialized');
});

// Function to extract domain from URL
const extractDomain = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return url;
  }
};

// Function to get a friendly title from domain if no title is available
const getFriendlyTitle = (url) => {
  const domain = extractDomain(url);
  return domain.replace(/^www\./, '').split('.')[0].charAt(0).toUpperCase() + 
         domain.replace(/^www\./, '').split('.')[0].slice(1);
};

// Listen for time spent updates from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateTimeSpent' && message.data) {
    updateTimeSpent(message.data);
    console.log('Received time update:', message.data.url, message.data.timeSpent, 'seconds');
  } else if (message.action === 'resetTimeData') {
    resetTimeData();
    if (sendResponse) {
      sendResponse({ success: true });
    }
  } else if (message.action === 'saveReadingInsights' && message.data) {
    saveReadingInsights(message.data);
    console.log('Received reading insights from:', message.data.url);
  }
  // Keep the message channel open for async responses
  return true;
});

// Function to save reading insights
const saveReadingInsights = (data) => {
  if (!data.insights || !Array.isArray(data.insights) || data.insights.length === 0) {
    console.log('No valid insights to save');
    return;
  }
  
  chrome.storage.local.get(['readingInsights'], (result) => {
    const readingInsights = result.readingInsights || [];
    
    // Add domain and metadata to each insight
    const newInsights = data.insights.map(insight => ({
      ...insight,
      domain: data.domain,
      insightId: generateInsightId(insight.url, insight.content.substring(0, 50)) // Create unique ID for deduplication
    }));
    
    // Filter out existing insights from the same URL with similar content
    const existingInsightIds = new Set();
    const filteredCurrentInsights = readingInsights.filter(insight => {
      // Keep insights from different URLs
      if (insight.url !== data.url) {
        existingInsightIds.add(insight.insightId || generateInsightId(insight.url, insight.content.substring(0, 50)));
        return true;
      }
      return false;
    });
    
    // Only add new insights that don't exist already
    const uniqueNewInsights = newInsights.filter(insight => 
      !existingInsightIds.has(insight.insightId)
    );
    
    console.log(`Found ${uniqueNewInsights.length} new unique insights from ${data.url}`);
    
    // Add new insights, limit total to 500 to prevent storage issues
    const updatedInsights = [...uniqueNewInsights, ...filteredCurrentInsights].slice(0, 500);
    
    // Save to storage
    chrome.storage.local.set({ readingInsights: updatedInsights }, () => {
      console.log('Reading insights saved, count:', updatedInsights.length);
    });
  });
};

// Helper function to generate a consistent ID for insights based on URL and content
function generateInsightId(url, contentPrefix) {
  // Use URL + first 50 chars of content to create a unique identifier
  return `${url.replace(/^https?:\/\//, '')}:${contentPrefix}`.replace(/[^a-zA-Z0-9]/g, '');
}

// Function to update time spent data
const updateTimeSpent = (data) => {
  // Validate time data to prevent errors
  if (typeof data.timeSpent !== 'number' || data.timeSpent <= 0) {
    console.log('Invalid time data:', data.timeSpent);
    return;
  }
  
  chrome.storage.local.get(['timeSpentData'], (result) => {
    const timeSpentData = result.timeSpentData || {};
    const domain = data.domain || extractDomain(data.url);
    
    // Initialize domain data if it doesn't exist
    if (!timeSpentData[domain]) {
      timeSpentData[domain] = {
        totalTime: 0,
        visits: 0,
        lastVisit: null,
        pages: {}
      };
    }
    
    // Update domain level statistics
    timeSpentData[domain].totalTime += data.timeSpent;
    timeSpentData[domain].lastVisit = new Date().toISOString();
    
    // Initialize page data if it doesn't exist
    if (!timeSpentData[domain].pages[data.url]) {
      timeSpentData[domain].pages[data.url] = {
        title: data.title || 'Untitled',
        totalTime: 0,
        visits: 0
      };
      timeSpentData[domain].visits++;
    }
    
    // Update page level statistics
    timeSpentData[domain].pages[data.url].totalTime += data.timeSpent;
    timeSpentData[domain].pages[data.url].title = data.title || timeSpentData[domain].pages[data.url].title;
    
    // Save updated data
    chrome.storage.local.set({ timeSpentData }, () => {
      console.log('Time spent data updated for', domain, '+', data.timeSpent, 'seconds, total:', timeSpentData[domain].totalTime);
    });
    
    // Also update the time spent in history data
    updateHistoryItemTimeSpent(data.url, data.timeSpent);
  });
};

// Function to update time spent in history data
const updateHistoryItemTimeSpent = (url, timeSpent) => {
  chrome.storage.local.get(['historyData'], (result) => {
    const historyData = result.historyData || [];
    let updated = false;
    
    // Find and update matching history items
    const updatedHistory = historyData.map(item => {
      // Normalize URLs for better matching
      const normalizedItemUrl = item.url.replace(/\/$/, '').toLowerCase();
      const normalizedUrl = url.replace(/\/$/, '').toLowerCase();
      
      // Match URLs with or without protocol differences (http vs https)
      if (normalizedItemUrl === normalizedUrl || 
          normalizedItemUrl.replace(/^https?:\/\//, '') === normalizedUrl.replace(/^https?:\/\//, '')) {
        updated = true;
        return {
          ...item,
          timeSpent: (item.timeSpent || 0) + timeSpent
        };
      }
      return item;
    });
    
    // Save updated history data
    if (updated) {
      chrome.storage.local.set({ historyData: updatedHistory });
    }
  });
};

// Reset time data function for debugging
const resetTimeData = () => {
  chrome.storage.local.set({ timeSpentData: {} });
  
  // Also reset time spent in history items
  chrome.storage.local.get(['historyData'], (result) => {
    const historyData = result.historyData || [];
    const resetHistory = historyData.map(item => ({
      ...item,
      timeSpent: 0
    }));
    chrome.storage.local.set({ historyData: resetHistory });
  });
  
  console.log('Time data has been reset');
};

// Listen for history changes
chrome.history.onVisited.addListener((historyItem) => {
  console.log('History item visited:', historyItem.url);
  
  // Get the current history data
  chrome.storage.local.get(['historyData'], (result) => {
    const historyData = result.historyData || [];
    const domain = extractDomain(historyItem.url);
    
    // Try to get a better title if it's missing
    let title = historyItem.title;
    if (!title || title === '' || title === domain) {
      title = getFriendlyTitle(historyItem.url);
    }
    
    // Get current tab info to retrieve favicon and ensure title
    chrome.tabs.query({url: historyItem.url}, (tabs) => {
      let faviconUrl = '';
      
      if (tabs && tabs.length > 0) {
        if (tabs[0].favIconUrl) {
          faviconUrl = tabs[0].favIconUrl;
        }
        if (tabs[0].title && (!title || title === domain)) {
          title = tabs[0].title;
        }
      }
      
      // Add new history item
      const newItem = {
        url: historyItem.url,
        title: title || 'Untitled',
        visitTime: new Date().toISOString(),
        domain: domain,
        faviconUrl: faviconUrl,
        timeSpent: 0 // Initialize time spent
      };
      
      // Add to the beginning of the array
      historyData.unshift(newItem);
      
      // Keep only the last 1000 items to prevent storage issues
      if (historyData.length > 1000) {
        historyData.pop();
      }
      
      // Save back to storage
      chrome.storage.local.set({ historyData }, () => {
        console.log('History data saved, count:', historyData.length);
      });
    });
  });
}); 