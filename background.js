// Initialize storage when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ 
    historyData: [],
    timeSpentData: {},
    readingInsights: [],
    apiKey: '', // Store the API key in local storage
    processingStatus: {}, // Store processing status by tabId
    autoAnalyze: false // Setting for auto-analyzing all pages
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

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background script received message:", request.action);
  
  if (request.action === "analyzeContent") {
    // Immediately respond to the content script
    sendResponse({ success: true, message: "Content received for analysis" });
    
    // Process the content
    if (request.data && request.data.content) {
      // Simple processing without promises
      processSimpleContent(request.data, sender.tab.id);
    } else {
      console.error("Invalid content data:", request.data);
    }
    
    return false; // No need for async response
  } else if (request.action === "processWithGPT") {
    // Handle both formats - direct content or data with content
    const content = request.content || (request.data ? request.data.pageContent : null);
    const metadata = request.metadata || {
      url: request.data ? request.data.url : '',
      title: request.data ? request.data.title : '',
      domain: request.data ? request.data.domain : ''
    };
    
    // Log what we're processing
    console.log("Processing content:", content ? content.substring(0, 100) + "..." : "No content");
    console.log("Metadata:", metadata);
    
    processContentWithGPT(content, metadata, sender.tab.id)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Required for async response
  } else if (request.action === 'processContent') {
    // New handler for processContent action
    if (request.data && request.data.content) {
      console.log("Received content for processing:", request.data.content.substring(0, 100) + "...");
      
      // Forward to popup with status update
      chrome.runtime.sendMessage({
        action: 'updateContentStatus',
        status: {
          message: 'Content received. Ready for analysis.',
          type: 'success',
          content: request.data.content,
          metadata: {
            url: request.data.url,
            domain: request.data.domain,
            title: request.data.title,
            timestamp: request.data.timestamp
          }
        }
      });
      
      // Store the content temporarily
      chrome.storage.local.set({
        'currentExtractedContent': request.data
      }, () => {
        console.log("Content stored for processing");
      });
      
    } else {
      console.error("Received processContent action with invalid data");
    }
    
    if (sendResponse) {
      sendResponse({ success: true });
    }
    return true;
  } else if (request.action === 'contentExtractionFailed') {
    // Handle content extraction failure
    console.error("Content extraction failed:", request.error);
    
    // Forward error to popup
    chrome.runtime.sendMessage({
      action: 'updateContentStatus',
      status: {
        message: request.error || 'Content extraction failed',
        type: 'error',
        timestamp: Date.now()
      }
    });
    
    if (sendResponse) {
      sendResponse({ success: false, error: request.error });
    }
    return true;
  } else if (request.action === 'updateTimeSpent') {
    updateTimeSpent(request.data);
    console.log('Received time update:', request.data.url, request.data.timeSpent, 'seconds');
    return false; // No response needed
  } else if (request.action === 'resetTimeData') {
    resetTimeData();
    if (sendResponse) {
      sendResponse({ success: true });
    }
    return false; // Synchronous response
  } else if (request.action === 'extractInsightsWithGPT' && request.data) {
    extractInsightsWithGPT(request.data, sendResponse);
    return true; // Keep the message channel open for async response
  } else if (request.action === 'processExtractedContent') {
    console.log('Received processExtractedContent with data:', request);
    
    // Handle different data formats
    const contentData = request.data || request;
    
    // Send immediate acknowledgement response
    if (sendResponse) {
      sendResponse({ success: true, status: 'processing' });
    }
    
    // Validate data format
    if (!contentData || (!contentData.content && !contentData.data)) {
      console.error('Invalid data format for processExtractedContent:', contentData);
      return false;
    }
    
    // Normalize data format
    const processData = {
      content: contentData.content || (contentData.data ? contentData.data.content : ''),
      title: contentData.title || (contentData.data ? contentData.data.title : 'Untitled'),
      url: contentData.url || (contentData.data ? contentData.data.url : 'unknown'),
      domain: contentData.domain || (contentData.data ? contentData.data.domain : extractDomain(contentData.url || ''))
    };
    
    // Then process the content asynchronously
    processExtractedContent(processData).then(result => {
      // Update status through storage or other means
      console.log('Processed content with result:', result);
    }).catch(error => {
      console.error('Error processing content:', error);
    });
    
    return false; // We've already responded, no need to keep the message channel open
  } else if (request.action === 'saveReadingInsights' && request.data) {
    saveReadingInsights(request.data);
    console.log('Received reading insights from:', request.data.url);
    return false; // No response needed
  } else if (request.action === 'saveApiKey' && request.apiKey) {
    saveApiKey(request.apiKey, sendResponse);
    return true; // Keep the message channel open for async response
  } else if (request.action === 'getApiKey') {
    getApiKey(sendResponse);
    return true; // Keep the message channel open for async response
  } else if (request.action === 'getProcessingStatus') {
    getProcessingStatus(request.tabId, sendResponse);
    return true; // Keep the message channel open for async response
  } else if (request.action === 'setAutoAnalyze') {
    setAutoAnalyze(request.value, sendResponse);
    return true; // Keep the message channel open for async response
  } else if (request.action === 'getAutoAnalyze') {
    getAutoAnalyze(sendResponse);
    return true; // Keep the message channel open for async response
  }
  
  // If we get here, we don't recognize the action
  if (sendResponse) {
    sendResponse({ success: false, error: "Unknown action" });
  }
  return false; // No async response
});

// Function to save the OpenAI API key
const saveApiKey = (apiKey, sendResponse) => {
  chrome.storage.local.set({ apiKey }, () => {
    console.log('API key saved');
    if (sendResponse) {
      sendResponse({ success: true });
    }
  });
};

// Function to get the OpenAI API key
const getApiKey = (sendResponse) => {
  chrome.storage.local.get(['apiKey'], (result) => {
    if (sendResponse) {
      sendResponse({ apiKey: result.apiKey || '' });
    }
  });
};

// Function to extract insights using OpenAI GPT-4o
const extractInsightsWithGPT = async (data, sendResponse) => {
  try {
    // Set initial status to loading
    chrome.storage.local.set({
      insightStatus: {
        type: 'loading',
        message: 'Processing content with GPT-4o...'
      }
    });
    
    // Get API key from storage
    chrome.storage.local.get(['apiKey'], async (result) => {
      try {
        const apiKey = result.apiKey;
        
        if (!apiKey) {
          console.error('OpenAI API key not set');
          chrome.storage.local.set({
            insightStatus: {
              type: 'error',
              message: 'Error: OpenAI API key not set. Please add your API key below.'
            }
          });
          
          if (sendResponse) {
            sendResponse({ success: false, error: 'API key not set' });
          }
          return;
        }

        if (!data.pageContent || data.pageContent.trim() === '') {
          console.error('No page content provided');
          chrome.storage.local.set({
            insightStatus: {
              type: 'error',
              message: 'Error: No content found on this page to analyze.'
            }
          });
          
          if (sendResponse) {
            sendResponse({ success: false, error: 'No page content provided' });
          }
          return;
        }

        // Call OpenAI API directly with fetch instead of using the SDK
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              {role: "system", content: "You are a helpful assistant that extracts the 5 most important and insightful takeaways from web content. For each insight, identify the most appropriate category (Technology, Business, Science, Health, Education, or Entertainment). Keep each insight concise (under 120 characters)."},
              {role: "user", content: `Extract 5 key insights from this webpage content, categorize each:\n\nTitle: ${data.title}\nURL: ${data.url}\n\nContent:\n\n${data.pageContent}`}
            ],
            temperature: 0.3
          })
        });
        
        // Check for API errors
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
        }
        
        // Parse the response
        const data = await response.json();
        const responseText = data.choices[0].message.content;
        let insights = [];
        
        try {
          // Try to extract JSON from the response
          const jsonMatch = responseText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            insights = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error("Could not extract JSON from response");
          }
        } catch (error) {
          console.error("Error parsing insights:", error);
          notifyUser(data.tabId, "Error parsing insights from GPT response", "error");
          return;
        }
        
        // Process insights and save them
        const processedInsights = insights.map(insight => ({
          content: insight.content,
          category: insight.category,
          source: data.title,
          url: data.url,
          timestamp: new Date().toISOString()
        }));

        // Save insights
        saveReadingInsights({
          url: data.url,
          title: data.title,
          domain: data.domain,
          insights: processedInsights
        });
        
        // Update status to success
        chrome.storage.local.set({
          insightStatus: {
            type: 'success',
            message: `Successfully extracted ${processedInsights.length} insights!`
          }
        });

        // Send response back to content script
        if (sendResponse) {
          sendResponse({ success: true, insights: processedInsights });
        }
      } catch (error) {
        console.error('Error calling OpenAI API:', error);
        
        // Update status to error
        chrome.storage.local.set({
          insightStatus: {
            type: 'error',
            message: `Error: ${error.message}`
          }
        });
        
        if (sendResponse) {
          sendResponse({ success: false, error: error.message });
        }
      }
    });
  } catch (error) {
    console.error('Error in extractInsightsWithGPT:', error);
    
    // Update status to error
    chrome.storage.local.set({
      insightStatus: {
        type: 'error',
        message: `Error: ${error.message}`
      }
    });
    
    if (sendResponse) {
      sendResponse({ success: false, error: error.message });
    }
  }
};

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

// Function to process extracted content with GPT
const processExtractedContent = async (data) => {
  try {
    console.log("Processing extracted content with data:", {
      url: data.url,
      title: data.title,
      domain: data.domain,
      contentLength: data.content ? data.content.length : 0
    });
    
    // Validate data
    if (!data || !data.content || data.content.trim().length < 50) {
      const errorMsg = data ? 
        `Invalid content (${data.content ? data.content.length : 0} chars)` : 
        'No data provided';
      console.error('processExtractedContent validation error:', errorMsg);
      return Promise.reject(new Error(errorMsg));
    }
    
    // Get API key from storage
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['apiKey'], async (result) => {
        try {
          const apiKey = result.apiKey;
          
          if (!apiKey) {
            console.error('OpenAI API key not set');
            chrome.storage.local.set({
              currentExtractionStatus: 'Error: OpenAI API key not set. Please add your API key in settings.'
            });
            
            reject(new Error('API key not set'));
            return;
          }

          // Call OpenAI API directly with fetch instead of using the SDK
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: "gpt-4o",
              messages: [
                {role: "system", content: "You are a helpful assistant that extracts the 5 most important and insightful takeaways from web content. Identify the most appropriate category (Technology, Business, Science, Health, Education, or Entertainment) for each insight. Keep each insight concise (under 120 characters) and only pick categories from the list mentioned. Use your external knowledge about the subject matter to enhance these insights when relevant, adding context or connections to broader concepts."},
                {role: "user", content: `Extract 5 key insights from this webpage content, categorize each:\n\nTitle: ${data.title}\nURL: ${data.url}\n\nContent:\n\n${data.content}`}
              ],
              temperature: 0.3
            })
          });
          
          // Check for API errors
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
          }
          
          // Parse the response
          const responseData = await response.json();
          const responseText = responseData.choices[0].message.content;
          let insights = [];
          
          try {
            // Try to extract JSON from the response
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              insights = JSON.parse(jsonMatch[0]);
            } else {
              throw new Error("Could not extract JSON from response");
            }
          } catch (error) {
            console.error("Error parsing insights:", error);
            chrome.storage.local.set({
              currentExtractionStatus: 'Error parsing insights from GPT response'
            });
            reject(error);
            return;
          }
          
          // Process insights and save them
          const processedInsights = insights.map(insight => ({
            content: insight.content,
            category: insight.category,
            source: data.title,
            url: data.url,
            timestamp: new Date().toISOString()
          }));

          // Save insights
          saveReadingInsights({
            url: data.url,
            title: data.title,
            domain: data.domain,
            insights: processedInsights
          });
          
          // Update status to success
          chrome.storage.local.set({
            currentExtractionStatus: `Successfully extracted ${processedInsights.length} insights!`
          });

          // Send message to all open extension popups
          chrome.runtime.sendMessage({
            action: 'contentProcessed',
            status: 'success',
            insights: processedInsights
          });
          
          resolve({ status: 'success', insights: processedInsights });
        } catch (error) {
          console.error('Error calling OpenAI API:', error);
          
          // Update status to error
          chrome.storage.local.set({
            currentExtractionStatus: `Error: ${error.message}`
          });
          
          reject(error);
        }
      });
    });
  } catch (error) {
    console.error('Error in processExtractedContent:', error);
    
    // Update status to error
    chrome.storage.local.set({
      currentExtractionStatus: `Error: ${error.message}`
    });
    
    throw error;
  }
};

// Function to get processing status for a tab
const getProcessingStatus = (tabId, sendResponse) => {
  chrome.storage.local.get(['processingStatus'], (result) => {
    const status = result.processingStatus && result.processingStatus[tabId];
    if (sendResponse) {
      sendResponse({ status: status || null });
    }
  });
};

// Send a status update to the popup
function sendStatusToPopup(tabId, message, type = "info") {
  // Store status in storage
  chrome.storage.local.get(['processingStatus'], (result) => {
    const processingStatus = result.processingStatus || {};
    processingStatus[tabId] = {
      message,
      type,
      timestamp: Date.now()
    };
    chrome.storage.local.set({ processingStatus });
  });
  
  // Send message to popup if it's open
  chrome.runtime.sendMessage({
    action: "updateStatus",
    tabId: tabId,
    status: {
      message,
      type,
      timestamp: Date.now()
    }
  });
}

// Process content with GPT API
async function processContentWithGPT(content, metadata, tabId) {
  try {
    // Update badge to show processing
    chrome.action.setBadgeText({ text: "..." });
    chrome.action.setBadgeBackgroundColor({ color: "#FFA500" });
    
    // Update popup with status
    sendStatusToPopup(tabId, "Analyzing content with AI...", "info");
    
    // Handle different content formats
    let processedContent = "";
    
    if (typeof content === 'string') {
      // Already a string
      processedContent = content.trim();
      console.log("Content is a string, length:", processedContent.length);
    } else if (content && content.type === "plain" && content.content) {
      // Plain text object
      processedContent = content.content.toString().trim();
      console.log("Content is a plain text object, length:", processedContent.length);
    } else if (content && typeof content === 'object') {
      // Try to extract text content from object
      console.log("Content is an object:", JSON.stringify(content).substring(0, 200) + "...");
      processedContent = formatContentForAPI(content);
    } else {
      console.error("Invalid content format:", content);
      if (content === null || content === undefined) {
        console.error("Content is null or undefined");
      }
    }
    
    console.log("Processed content length:", processedContent.length);
    
    if (!processedContent || processedContent.trim().length < 50) {
      if (!processedContent) {
        console.error("Content is empty or undefined");
      } else {
        console.error("Content is too short:", processedContent);
      }
      throw new Error("No valid content to process - content is too short or empty");
    }
    
    // Get the API key from storage
    const apiKeyData = await new Promise((resolve) => {
      chrome.storage.local.get(["apiKey"], resolve);
    });
    
    const apiKey = apiKeyData.apiKey;
    if (!apiKey) {
      sendStatusToPopup(tabId, "No API key set. Please set your OpenAI API key in the extension options.", "error");
      throw new Error("No API key set. Please set your OpenAI API key in the extension options.");
    }
    
    // Make the API request
    const insights = await callGPTAPI(processedContent, metadata.url, metadata.title, apiKey);
    
    // Store results
    await storeProcessedInsights({
      url: metadata.url,
      domain: metadata.domain,
      title: metadata.title
    }, insights);
    
    // Update badge to show success
    chrome.action.setBadgeText({ text: "✓" });
    chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });
    
    // Update popup with status
    sendStatusToPopup(tabId, "Analysis complete! Found " + insights.length + " insights.", "success");
    
    // Return success to content script
    return { success: true, insights };
  } catch (error) {
    console.error("Error processing with GPT:", error);
    
    // Create a detailed error message
    let errorMessage = "Unknown error";
    if (error && error.message) {
      errorMessage = error.message;
    } else if (error && typeof error === 'string') {
      errorMessage = error;
    } else if (error) {
      try {
        errorMessage = JSON.stringify(error);
      } catch (e) {
        errorMessage = "Error occurred but details could not be stringified";
      }
    }
    
    console.error("Error details:", errorMessage);
    
    // Update badge to show error
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#F44336" });
    
    // Update popup with error status
    sendStatusToPopup(tabId, "Error: " + errorMessage, "error");
    
    return { success: false, error: errorMessage };
  }
}

// Format the content for the API based on whether it's sectioned or plain text
function formatContentForAPI(content) {
  if (!content) return "";
  
  let fullText = "";
  
  // Extract full text regardless of content type
  if (content.type === "sectioned" && Array.isArray(content.sections)) {
    // Extract text from all sections
    fullText = content.sections.map(section => section.content || "").join("\n\n");
  } else if (content.type === "plain") {
    // Plain text
    fullText = content.content.toString();
  } else {
    // Handle unexpected format
    fullText = typeof content === 'string' ? content : JSON.stringify(content);
  }
  
  // Limit content to a reasonable size (2000 characters is ~500 tokens)
  return fullText.substring(0, 2000);
}

// Call the GPT API to process the content
async function callGPTAPI(content, url, title, apiKey) {
  const endpoint = "https://api.openai.com/v1/chat/completions";
  
  try {
    console.log(`Making OpenAI API request for: ${title} with ${content.length} characters`);
    
    const prompt = `
    Analyze the following webpage content and extract 3-5 key insights that would be valuable for the user to remember later. 
    The insights should be specific to the content, not generic observations.
    
    Webpage Title: ${title}
    URL: ${url}
    
    Content:
    ${content}
    
    Return ONLY a JSON array of insights, each with:
    1. A short title summarizing the insight (under 15 words)
    2. The specific insight text (under 75 words)
    3. A direct quote from the content that supports this insight
    
    Example format:
    [
      {
        "title": "Short insight title",
        "insight": "The specific insight in a sentence or two",
        "quote": "A direct quote from the content that supports this insight"
      }
    ]
    `;
    
    const payload = {
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant that extracts insights from webpage content." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1000
    };
    
    console.log("API payload:", JSON.stringify(payload).substring(0, 200) + "...");
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("API error response:", errorData);
      throw new Error(`API error (${response.status}): ${errorData.error?.message || "Unknown error"}`);
    }
    
    const data = await response.json();
    console.log("API response status:", response.status);
    console.log("API response:", JSON.stringify(data).substring(0, 200) + "...");
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error("Unexpected API response format:", data);
      throw new Error("Invalid API response format");
    }
    
    const messageContent = data.choices[0].message.content;
    console.log("Message content:", messageContent.substring(0, 200) + "...");
    
    // Handle potential JSON formatting issues
    let cleanedContent = messageContent.replace(/```json|```/g, '').trim();
    
    try {
      return JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      console.error("Content that failed to parse:", cleanedContent);
      throw new Error(`Failed to parse API response: ${parseError.message}`);
    }
  } catch (error) {
    console.error("Error in callGPTAPI:", error);
    throw error; // Rethrow to be handled by the caller
  }
}

// Store the processed insights
async function storeProcessedInsights(data, insights) {
  // Store that this domain has been processed
  const storageData = await new Promise(resolve => {
    chrome.storage.local.get(['extractedInsights'], resolve);
  });
  
  const extractedInsights = storageData.extractedInsights || {};
  extractedInsights[data.domain] = true;
  
  // Store the insights
  const insightData = {
    url: data.url,
    domain: data.domain,
    title: data.title,
    insights: insights,
    timestamp: Date.now()
  };
  
  // Get existing insights
  const allInsightsData = await new Promise(resolve => {
    chrome.storage.local.get(['allInsights'], resolve);
  });
  
  const allInsights = allInsightsData.allInsights || [];
  
  // Add new insights
  allInsights.push(insightData);
  
  // Limit to most recent 100 pages
  const limitedInsights = allInsights.slice(-100);
  
  // Format insights for readingInsights storage
  const formattedInsights = insights.map(insight => ({
    content: insight.insight,
    category: insight.title.split(' ')[0], // Use first word of title as category
    source: data.title,
    url: data.url,
    domain: data.domain,
    timestamp: Date.now(),
    insightId: generateInsightId(data.url, insight.insight.substring(0, 50))
  }));
  
  // Get existing readingInsights
  const readingInsightsData = await new Promise(resolve => {
    chrome.storage.local.get(['readingInsights'], resolve);
  });
  
  const readingInsights = readingInsightsData.readingInsights || [];
  
  // Add new insights, avoiding duplicates
  const existingInsightIds = new Set(readingInsights.map(insight => 
    insight.insightId || generateInsightId(insight.url, insight.content.substring(0, 50))
  ));
  
  const uniqueNewInsights = formattedInsights.filter(insight => 
    !existingInsightIds.has(insight.insightId)
  );
  
  // Combine and limit to 500 total insights
  const updatedReadingInsights = [...uniqueNewInsights, ...readingInsights].slice(0, 500);
  
  // Update storage
  return new Promise(resolve => {
    chrome.storage.local.set({
      'extractedInsights': extractedInsights,
      'allInsights': limitedInsights,
      'lastInsight': insightData,
      'readingInsights': updatedReadingInsights
    }, resolve);
  });
}

// Simple content processing function
function processSimpleContent(data, tabId) {
  console.log(`Processing content from ${data.url}, length: ${data.content.length}`);
  
  // Get the API key
  chrome.storage.local.get(['apiKey'], async (result) => {
    try {
      const apiKey = result.apiKey;
      
      if (!apiKey) {
        console.error("No API key found");
        notifyUser(tabId, "Error: API key not set. Please add your OpenAI API key in settings.", "error");
        return;
      }
      
      // Notify user we're processing
      notifyUser(tabId, "Processing content with GPT-4o...", "info");
      
      // Simple prompt
      const prompt = `
        Extract 5 key insights from this webpage:
        Title: ${data.title}
        URL: ${data.url}
        
        Content:
        ${data.content.substring(0, 4000)}
        
        Format as a JSON array of objects with:
        1. category (Technology, Business, Science, Health, Education, or Entertainment)
        2. content (the insight text, under 120 characters)
      `;
      
      // Call OpenAI API directly with fetch instead of using the SDK
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {role: "system", content: "You extract key insights from web content in JSON format. Use your external knowledge about the subject matter to enhance these insights when relevant. Add context, connections to broader concepts, or important background information that would help the user better understand the content."},
            {role: "user", content: prompt}
          ],
          temperature: 0.3
        })
      });
      
      // Check for API errors
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
      }
      
      // Parse the response
      const responseData = await response.json();
      const responseText = responseData.choices[0].message.content;
      let insights = [];
      
      try {
        // Try to extract JSON from the response
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          insights = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("Could not extract JSON from response");
        }
      } catch (error) {
        console.error("Error parsing insights:", error);
        notifyUser(tabId, "Error parsing insights from GPT response", "error");
        return;
      }
      
      // Add metadata to insights
      const processedInsights = insights.map(insight => ({
        content: insight.content,
        category: insight.category,
        source: data.title,
        url: data.url,
        timestamp: new Date().toISOString()
      }));
      
      // Save insights
      saveReadingInsights({
        url: data.url,
        title: data.title,
        domain: extractDomain(data.url),
        insights: processedInsights
      });
      
      // Notify user
      notifyUser(tabId, `Successfully extracted ${processedInsights.length} insights!`, "success");
      
      // Notify all open popups
      chrome.runtime.sendMessage({
        action: 'contentProcessed',
        status: 'success',
        insights: processedInsights
      });
      
    } catch (error) {
      console.error("Error processing content:", error);
      notifyUser(tabId, "Error: " + error.message, "error");
    }
  });
}

// Simple notification function
function notifyUser(tabId, message, type) {
  console.log(`Notification (${type}): ${message}`);
  
  // Store status in storage
  chrome.storage.local.set({
    processingStatus: {
      [tabId]: {
        message: message,
        type: type,
        timestamp: Date.now()
      }
    }
  });
  
  // Send message to any open popups
  chrome.runtime.sendMessage({
    action: "updateStatus",
    status: message,
    type: type,
    tabId: tabId
  });
}

// Function to set auto-analyze setting
const setAutoAnalyze = (value, sendResponse) => {
  chrome.storage.local.set({ autoAnalyze: value }, () => {
    console.log('Auto-analyze setting updated:', value);
    if (sendResponse) {
      sendResponse({ success: true });
    }
  });
};

// Function to get auto-analyze setting
const getAutoAnalyze = (sendResponse) => {
  chrome.storage.local.get(['autoAnalyze'], (result) => {
    if (sendResponse) {
      sendResponse({ autoAnalyze: result.autoAnalyze || false });
    }
  });
}; 