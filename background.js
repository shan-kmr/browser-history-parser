// Initialize storage when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ historyData: [] });
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
        faviconUrl: faviconUrl
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