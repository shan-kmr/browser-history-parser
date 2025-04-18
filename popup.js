// Function to update the status display
function updateStatusDisplay(status) {
  if (!status) return;
  
  // Get or create the status container
  let statusContainer = document.getElementById('status-container');
  if (!statusContainer) {
    statusContainer = createStatusContainer();
  }
  
  // Create or update status element
  const statusElement = document.createElement('div');
  statusElement.className = `status-message ${status.type || 'info'}`;
  statusElement.textContent = status.message;
  
  // Add timestamp
  const timestamp = new Date(status.timestamp).toLocaleTimeString();
  const timeSpan = document.createElement('span');
  timeSpan.className = 'status-time';
  timeSpan.textContent = timestamp;
  statusElement.appendChild(timeSpan);
  
  // Add close button
  const closeButton = document.createElement('span');
  closeButton.className = 'status-close';
  closeButton.textContent = '×';
  closeButton.addEventListener('click', () => {
    statusElement.remove();
    if (statusContainer.children.length === 0) {
      statusContainer.style.display = 'none';
    }
  });
  statusElement.appendChild(closeButton);
  
  // Add to container
  statusContainer.innerHTML = ''; // Clear previous status
  statusContainer.appendChild(statusElement);
  statusContainer.style.display = 'block';
  
  // Auto-hide after 10 seconds if it's a success message
  if (status.type === 'success') {
    setTimeout(() => {
      statusElement.remove();
      if (statusContainer.children.length === 0) {
        statusContainer.style.display = 'none';
      }
    }, 10000);
  }
}

// Create status container if it doesn't exist
function createStatusContainer() {
  const container = document.createElement('div');
  container.id = 'status-container';
  container.style.display = 'none';
  
  // Add CSS for status container
  const style = document.createElement('style');
  style.textContent = `
    #status-container {
      position: fixed;
      bottom: 10px;
      left: 10px;
      right: 10px;
      z-index: 1000;
    }
    .status-message {
      padding: 10px;
      margin-bottom: 5px;
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .status-message.info {
      background-color: #e3f2fd;
      color: #0d47a1;
    }
    .status-message.success {
      background-color: #e8f5e9;
      color: #1b5e20;
    }
    .status-message.error {
      background-color: #ffebee;
      color: #b71c1c;
    }
    .status-time {
      font-size: 0.8em;
      opacity: 0.7;
      margin-left: 10px;
    }
    .status-close {
      cursor: pointer;
      font-weight: bold;
      margin-left: 10px;
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(container);
  return container;
}

// Listen for status updates from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateStatus') {
    updateStatusDisplay({
      message: message.status,
      type: message.type || 'info',
      timestamp: Date.now()
    });
    return false; // No async response needed
  } else if (message.action === 'contentProcessed') {
    // Handle content processing completion
    updateStatusDisplay({
      message: `Analysis complete! Found ${message.insights ? message.insights.length : 0} insights.`,
      type: message.status === 'success' ? 'success' : 'error',
      timestamp: Date.now()
    });
    
    // If we're on the insights tab, reload the insights
    if (document.getElementById('reading-insights-tab') && 
        document.getElementById('reading-insights-tab').classList.contains('active')) {
      loadReadingInsights();
    }
    
    return false; // No async response needed
  }
  
  // If we get here, we don't recognize the action
  if (sendResponse) {
    sendResponse({ success: false, error: "Unknown action" });
  }
  return false; // No async response
});

// Function to extract content from a page
function extractContent() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs.length > 0) {
      const currentTab = tabs[0];
      
      // Show loading status
      updateStatusDisplay({
        message: 'Extracting content from the page...',
        type: 'info',
        timestamp: Date.now()
      });
      
      // Send message to content script
      chrome.tabs.sendMessage(
        currentTab.id,
        { action: 'extractContent' },
        function(response) {
          if (chrome.runtime.lastError) {
            console.error('Error:', chrome.runtime.lastError);
            updateStatusDisplay({
              message: 'Content script not loaded. Try refreshing the page.',
              type: 'error',
              timestamp: Date.now()
            });
            return;
          }
          
          if (response && response.success) {
            // Content extracted successfully
            updateStatusDisplay({
              message: 'Content extracted. Processing with AI...',
              type: 'info',
              timestamp: Date.now()
            });
            
            // Process with GPT
            chrome.runtime.sendMessage(
              {
                action: 'processWithGPT',
                content: response.content,
                metadata: {
                  url: currentTab.url,
                  domain: extractDomain(currentTab.url),
                  title: currentTab.title
                }
              },
              function(gptResponse) {
                if (gptResponse && gptResponse.success) {
                  console.log('GPT processing successful:', gptResponse);
                } else {
                  console.error('GPT processing failed:', gptResponse ? gptResponse.error : 'Unknown error');
                }
              }
            );
          } else {
            // Failed to extract content
            updateStatusDisplay({
              message: 'Could not extract content: ' + (response ? response.error : 'Unknown error'),
              type: 'error',
              timestamp: Date.now()
            });
          }
        }
      );
    }
  });
}

// Function to request content analysis from active tab
function analyzeActiveTab() {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]) {
      updateStatusDisplay({
        message: "Requesting content extraction...",
        type: "info",
        timestamp: Date.now()
      });
      
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "extractForGPT"
      });
    }
  });
}

// Add analyze button if it doesn't exist already
function addAnalyzeButton() {
  if (!document.getElementById('analyze-button')) {
    const actionContainer = document.createElement('div');
    actionContainer.className = 'action-container';
    actionContainer.style.textAlign = 'center';
    actionContainer.style.marginTop = '10px';
    
    const analyzeButton = document.createElement('button');
    analyzeButton.id = 'analyze-button';
    analyzeButton.className = 'analyze-button';
    analyzeButton.textContent = 'Analyze this page';
    analyzeButton.style.padding = '8px 16px';
    analyzeButton.style.backgroundColor = '#4285f4';
    analyzeButton.style.color = 'white';
    analyzeButton.style.border = 'none';
    analyzeButton.style.borderRadius = '4px';
    analyzeButton.style.cursor = 'pointer';
    
    analyzeButton.addEventListener('click', analyzeActiveTab);
    
    actionContainer.appendChild(analyzeButton);
    
    // Add button below the stats section
    const statsSection = document.querySelector('.stats-section');
    if (statsSection) {
      statsSection.parentNode.insertBefore(actionContainer, statsSection.nextSibling);
    } else {
      document.body.appendChild(actionContainer);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Check for existing processing status
  chrome.runtime.sendMessage({ action: 'getExtractionStatus' }, function(response) {
    if (response && response.status) {
      updateStatusDisplay({
        message: response.status,
        type: response.type || 'info',
        timestamp: Date.now()
      });
    }
  });
  
  // Add "Always On" toggle to UI
  const actionContainer = document.createElement('div');
  actionContainer.className = 'action-container';
  actionContainer.style.display = 'flex';
  actionContainer.style.alignItems = 'center';
  actionContainer.style.justifyContent = 'space-between';
  actionContainer.style.margin = '10px 0';
  actionContainer.style.padding = '10px';
  actionContainer.style.backgroundColor = '#f5f5f5';
  actionContainer.style.borderRadius = '4px';
  
  const toggleLabel = document.createElement('label');
  toggleLabel.textContent = 'Always analyze pages:';
  toggleLabel.style.fontWeight = 'bold';
  
  const toggleSwitch = document.createElement('div');
  toggleSwitch.className = 'toggle-switch';
  toggleSwitch.innerHTML = `
    <label class="switch">
      <input type="checkbox" id="auto-analyze-toggle">
      <span class="slider round"></span>
    </label>
  `;
  toggleSwitch.style.display = 'inline-block';
  
  // Add styles for the toggle switch
  const style = document.createElement('style');
  style.textContent = `
    .switch {
      position: relative;
      display: inline-block;
      width: 50px;
      height: 24px;
    }
    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    .slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #ccc;
      transition: .4s;
    }
    .slider:before {
      position: absolute;
      content: "";
      height: 16px;
      width: 16px;
      left: 4px;
      bottom: 4px;
      background-color: white;
      transition: .4s;
    }
    input:checked + .slider {
      background-color: #4285f4;
    }
    input:checked + .slider:before {
      transform: translateX(26px);
    }
    .slider.round {
      border-radius: 24px;
    }
    .slider.round:before {
      border-radius: 50%;
    }
  `;
  document.head.appendChild(style);
  
  actionContainer.appendChild(toggleLabel);
  actionContainer.appendChild(toggleSwitch);
  
  // Add container below the analyze button
  const statsSection = document.querySelector('.stats-section');
  if (statsSection) {
    statsSection.parentNode.insertBefore(actionContainer, statsSection.nextSibling);
  } else {
    document.body.appendChild(actionContainer);
  }
  
  // Initialize toggle state from storage
  chrome.runtime.sendMessage({ action: 'getAutoAnalyze' }, (response) => {
    if (response && response.autoAnalyze !== undefined) {
      document.getElementById('auto-analyze-toggle').checked = response.autoAnalyze;
    }
  });
  
  // Add toggle event listener
  document.getElementById('auto-analyze-toggle').addEventListener('change', function() {
    const isEnabled = this.checked;
    chrome.runtime.sendMessage({ 
      action: 'setAutoAnalyze', 
      value: isEnabled 
    }, (response) => {
      if (response && response.success) {
        updateStatusDisplay({
          message: isEnabled ? 
            'Auto-analyze enabled! All new pages will be analyzed.' : 
            'Auto-analyze disabled. Pages will only be analyzed manually.',
          type: 'info',
          timestamp: Date.now()
        });
      }
    });
  });
  
  // Add analyze button
  addAnalyzeButton();
  
  // Tab handling
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      
      // Update active state
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');
      
      // Load appropriate data for the tab
      if (tabName === 'time-stats') {
        loadTimeStats();
      } else if (tabName === 'reading-insights') {
        loadReadingInsights();
      }
    });
  });

  const historyList = document.getElementById('historyList');
  const searchBox = document.getElementById('searchBox');
  const timeFilter = document.getElementById('timeFilter');
  const domainFilter = document.getElementById('domainFilter');
  const exportBtn = document.getElementById('exportBtn');
  const resetTimeBtn = document.getElementById('resetTimeBtn');
  
  // Reading insights elements
  const insightsList = document.getElementById('insightsList');
  const insightSearchBox = document.getElementById('insightSearchBox');
  const categoryFilter = document.getElementById('categoryFilter');
  
  let allHistoryData = [];
  let timeSpentData = {};
  let readingInsights = [];
  let activeCategories = new Set(['all']);
  
  // Function to format date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };
  
  // Function to format time spent with proper units
  const formatTimeSpent = (seconds) => {
    if (!seconds) return '0s';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}s`;
    }
  };
  
  // Function to extract domain from URL
  const extractDomain = (url) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      return url;
    }
  };
  
  // Function to create history item element
  const createHistoryItem = (item) => {
    const div = document.createElement('div');
    div.className = 'history-item';
    
    // Add favicon if available
    if (item.faviconUrl) {
      const favicon = document.createElement('img');
      favicon.className = 'favicon';
      favicon.src = item.faviconUrl;
      favicon.onerror = () => favicon.src = 'images/icon16.png';
      div.appendChild(favicon);
    }
    
    const domain = extractDomain(item.url);
    const domainTag = document.createElement('span');
    domainTag.className = 'domain-tag';
    domainTag.textContent = domain;
    
    const title = document.createElement('div');
    title.textContent = item.title || 'Untitled';
    title.style.fontWeight = 'bold';
    
    const time = document.createElement('div');
    time.className = 'time';
    time.textContent = formatDate(item.visitTime);
    
    // Add time spent badge if available
    const timeSpent = document.createElement('span');
    timeSpent.className = 'time-spent';
    if (item.timeSpent) {
      timeSpent.textContent = formatTimeSpent(item.timeSpent);
      div.appendChild(timeSpent);
    }
    
    div.appendChild(domainTag);
    div.appendChild(title);
    div.appendChild(time);
    
    // Add click handler to open the URL
    div.addEventListener('click', () => {
      chrome.tabs.create({ url: item.url });
    });
    
    return div;
  };
  
  // Function to create insight item element
  const createInsightItem = (insight) => {
    const div = document.createElement('div');
    div.className = 'insight-item';
    
    const category = document.createElement('div');
    category.className = 'insight-category';
    category.textContent = insight.category;
    
    const content = document.createElement('div');
    content.className = 'insight-content';
    content.textContent = insight.content;
    
    const source = document.createElement('div');
    source.className = 'insight-source';
    source.textContent = `From: ${insight.source} · ${formatDate(insight.timestamp)}`;
    
    div.appendChild(category);
    div.appendChild(content);
    div.appendChild(source);
    
    // Add click handler to open the URL
    div.addEventListener('click', () => {
      chrome.tabs.create({ url: insight.url });
    });
    
    return div;
  };
  
  // Function to update statistics
  const updateStats = (filteredData) => {
    const totalVisits = document.getElementById('totalVisits');
    const uniqueSites = document.getElementById('uniqueSites');
    const topDomain = document.getElementById('topDomain');
    const totalTimeSpent = document.getElementById('totalTimeSpent');
    
    totalVisits.textContent = filteredData.length;
    
    const domains = filteredData.map(item => extractDomain(item.url));
    const uniqueDomains = new Set(domains);
    uniqueSites.textContent = uniqueDomains.size;
    
    // Find most visited domain
    const domainCounts = {};
    domains.forEach(domain => {
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    });
    
    const topDomainName = Object.entries(domainCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || '-';
    topDomain.textContent = topDomainName;
    
    // Calculate total time spent for filtered data
    // Ensure we're only counting time once per URL to avoid duplication
    const uniqueUrls = new Map();
    filteredData.forEach(item => {
      const normalizedUrl = item.url.replace(/\/$/, '').toLowerCase().replace(/^https?:\/\//, '');
      if (!uniqueUrls.has(normalizedUrl) || (item.timeSpent || 0) > uniqueUrls.get(normalizedUrl)) {
        uniqueUrls.set(normalizedUrl, item.timeSpent || 0);
      }
    });
    
    const totalSeconds = Array.from(uniqueUrls.values()).reduce((total, time) => total + time, 0);
    totalTimeSpent.textContent = formatTimeSpent(totalSeconds);
  };
  
  // Function to update insight statistics
  const updateInsightStats = (filteredInsights) => {
    const totalInsights = document.getElementById('totalInsights');
    const totalCategories = document.getElementById('totalCategories');
    const topCategory = document.getElementById('topCategory');
    
    totalInsights.textContent = filteredInsights.length;
    
    const categories = filteredInsights.map(item => item.category);
    const uniqueCategories = new Set(categories);
    totalCategories.textContent = uniqueCategories.size;
    
    // Find top category
    const categoryCounts = {};
    categories.forEach(category => {
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });
    
    const topCategoryName = Object.entries(categoryCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || '-';
    topCategory.textContent = topCategoryName;
  };
  
  // Function to filter history data
  const filterHistoryData = () => {
    const searchTerm = searchBox.value.toLowerCase();
    const timeValue = timeFilter.value;
    const domainValue = domainFilter.value;
    
    let filtered = allHistoryData;
    
    // Apply search filter - prioritize title search
    if (searchTerm) {
      filtered = filtered.filter(item => 
        (item.title && item.title.toLowerCase().includes(searchTerm)) ||
        extractDomain(item.url).toLowerCase().includes(searchTerm)
      );
    }
    
    // Apply time filter
    const now = new Date();
    switch (timeValue) {
      case 'today':
        filtered = filtered.filter(item => {
          const date = new Date(item.visitTime);
          return date.toDateString() === now.toDateString();
        });
        break;
      case 'yesterday':
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        filtered = filtered.filter(item => {
          const date = new Date(item.visitTime);
          return date.toDateString() === yesterday.toDateString();
        });
        break;
      case 'week':
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        filtered = filtered.filter(item => {
          const date = new Date(item.visitTime);
          return date >= weekAgo;
        });
        break;
      case 'month':
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        filtered = filtered.filter(item => {
          const date = new Date(item.visitTime);
          return date >= monthAgo;
        });
        break;
    }
    
    // Apply domain filter
    if (domainValue !== 'all') {
      filtered = filtered.filter(item => extractDomain(item.url) === domainValue);
    }
    
    return filtered;
  };
  
  // Function to filter reading insights
  const filterReadingInsights = () => {
    const searchTerm = insightSearchBox ? insightSearchBox.value.toLowerCase() : '';
    
    let filtered = readingInsights;
    
    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(item => 
        (item.content && item.content.toLowerCase().includes(searchTerm)) ||
        (item.source && item.source.toLowerCase().includes(searchTerm)) ||
        (item.category && item.category.toLowerCase().includes(searchTerm))
      );
    }
    
    // Apply category filter
    if (activeCategories.size > 0 && !activeCategories.has('all')) {
      filtered = filtered.filter(item => activeCategories.has(item.category));
    }
    
    return filtered;
  };
  
  // Function to update the history display
  const updateDisplay = () => {
    const filtered = filterHistoryData();
    historyList.innerHTML = '';
    
    if (filtered.length === 0) {
      historyList.innerHTML = '<div class="history-item">No matching history items</div>';
      return;
    }
    
    filtered.forEach(item => {
      historyList.appendChild(createHistoryItem(item));
    });
    
    updateStats(filtered);
  };
  
  // Function to update the insights display
  const updateInsightsDisplay = () => {
    const filtered = filterReadingInsights();
    insightsList.innerHTML = '';
    
    if (filtered.length === 0) {
      insightsList.innerHTML = '<div class="insight-item">No matching insights found</div>';
      return;
    }
    
    // Generate category data for spider chart
    const categoryData = generateCategoryData(filtered);
    
    // Add spider chart at the top
    const chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';
    chartContainer.style.width = '100%';
    chartContainer.style.height = '250px';
    chartContainer.style.marginBottom = '20px';
    
    insightsList.appendChild(chartContainer);
    
    // Group insights by URL/source
    const groupedInsights = groupInsightsBySource(filtered);
    
    // Display grouped insights
    Object.keys(groupedInsights).forEach(source => {
      const insights = groupedInsights[source];
      if (insights.length === 0) return;
      
      // Create collapsible group
      const groupHeader = document.createElement('div');
      groupHeader.className = 'insight-group-header';
      groupHeader.style.padding = '8px 12px';
      groupHeader.style.backgroundColor = '#f5f5f5';
      groupHeader.style.borderRadius = '4px';
      groupHeader.style.marginBottom = '8px';
      groupHeader.style.cursor = 'pointer';
      groupHeader.style.display = 'flex';
      groupHeader.style.justifyContent = 'space-between';
      groupHeader.style.alignItems = 'center';
      
      const sourceTitle = document.createElement('div');
      sourceTitle.className = 'source-title';
      sourceTitle.style.fontWeight = 'bold';
      sourceTitle.textContent = insights[0].source || 'Unknown Source';
      
      const insightCount = document.createElement('div');
      insightCount.className = 'insight-count';
      insightCount.style.backgroundColor = '#4285f4';
      insightCount.style.color = 'white';
      insightCount.style.borderRadius = '50%';
      insightCount.style.width = '24px';
      insightCount.style.height = '24px';
      insightCount.style.display = 'flex';
      insightCount.style.alignItems = 'center';
      insightCount.style.justifyContent = 'center';
      insightCount.textContent = insights.length;
      
      groupHeader.appendChild(sourceTitle);
      groupHeader.appendChild(insightCount);
      
      const groupContent = document.createElement('div');
      groupContent.className = 'insight-group-content';
      groupContent.style.display = 'none';
      groupContent.style.marginBottom = '15px';
      
      // Add insights to group
      insights.forEach(insight => {
        groupContent.appendChild(createInsightItem(insight));
      });
      
      // Toggle visibility on click
      groupHeader.addEventListener('click', () => {
        const isHidden = groupContent.style.display === 'none';
        groupContent.style.display = isHidden ? 'block' : 'none';
        groupHeader.style.backgroundColor = isHidden ? '#e0e0e0' : '#f5f5f5';
      });
      
      insightsList.appendChild(groupHeader);
      insightsList.appendChild(groupContent);
    });
    
    // Create and render the spider chart
    renderSpiderChart(chartContainer, categoryData);
    
    updateInsightStats(filtered);
  };
  
  // Function to group insights by source
  const groupInsightsBySource = (insights) => {
    const grouped = {};
    
    insights.forEach(insight => {
      const key = insight.url || 'unknown';
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(insight);
    });
    
    return grouped;
  };
  
  // Function to generate category data for spider chart
  const generateCategoryData = (insights) => {
    const categories = {};
    
    // First get all domains from all insights
    const insightsByDomain = {};
    insights.forEach(insight => {
      const domain = extractDomain(insight.url || '');
      if (!domain) return;
      
      if (!insightsByDomain[domain]) {
        insightsByDomain[domain] = [];
      }
      insightsByDomain[domain].push(insight);
    });
    
    // Get time spent data from storage
    // Note: This needs to be handled differently since we're in a synchronous function
    // We'll need to update the chart after we get the data
    chrome.storage.local.get(['timeSpentData'], (result) => {
      const timeSpentData = result.timeSpentData || {};
      
      // Process time spent data and distribute across categories
      Object.keys(timeSpentData).forEach(domain => {
        if (!timeSpentData[domain] || !timeSpentData[domain].totalTime) return;
        
        const timeSpent = timeSpentData[domain].totalTime;
        const domainInsights = insightsByDomain[domain] || [];
        
        if (domainInsights.length === 0) {
          // No insights for this domain, assign to "Uncategorized"
          categories['Uncategorized'] = (categories['Uncategorized'] || 0) + timeSpent;
          return;
        }
        
        // Count occurrences of each category for this domain
        const domainCategories = {};
        domainInsights.forEach(insight => {
          const category = insight.category || 'Uncategorized';
          domainCategories[category] = (domainCategories[category] || 0) + 1;
        });
        
        // Calculate total insights for this domain
        const totalInsightsForDomain = domainInsights.length;
        
        // Distribute time proportionally across categories
        Object.keys(domainCategories).forEach(category => {
          const proportion = domainCategories[category] / totalInsightsForDomain;
          const categoryTimeSpent = timeSpent * proportion;
          categories[category] = (categories[category] || 0) + categoryTimeSpent;
        });
      });
      
      // After processing data, update the chart
      const chartContainer = document.querySelector('.chart-container');
      if (chartContainer) {
        renderSpiderChart(chartContainer, categories);
      }
    });
    
    // Return empty categories object initially, it will be updated asynchronously
    return categories;
  };
  
  // Function to render spider chart
  const renderSpiderChart = (container, categoryData) => {
    // Clear container
    container.innerHTML = '';
    
    // Get categories and counts
    const categories = Object.keys(categoryData);
    const timeCounts = Object.values(categoryData);
    
    if (categories.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:20px;">No category data available</div>';
      return;
    }
    
    // Create SVG element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', '-10 -10 220 220');
    container.appendChild(svg);
    
    // Calculate center and radius
    const centerX = 100;
    const centerY = 100;
    const radius = 80;
    
    // Find max count for scaling
    const maxTime = Math.max(...timeCounts) || 1;
    
    // Draw axis lines and labels
    categories.forEach((category, i) => {
      const angle = (i / categories.length) * Math.PI * 2 - Math.PI / 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      
      // Draw axis line
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', centerX);
      line.setAttribute('y1', centerY);
      line.setAttribute('x2', x);
      line.setAttribute('y2', y);
      line.setAttribute('stroke', '#ccc');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
      
      // Draw label
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const labelX = centerX + Math.cos(angle) * (radius + 15);
      const labelY = centerY + Math.sin(angle) * (radius + 15);
      text.setAttribute('x', labelX);
      text.setAttribute('y', labelY);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('alignment-baseline', 'middle');
      text.setAttribute('font-size', '10px');
      text.textContent = category;
      svg.appendChild(text);
    });
    
    // Draw concentric circles
    [0.25, 0.5, 0.75, 1].forEach(factor => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', centerX);
      circle.setAttribute('cy', centerY);
      circle.setAttribute('r', radius * factor);
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', '#eee');
      circle.setAttribute('stroke-width', '1');
      svg.appendChild(circle);
    });
    
    // Create data points
    const points = categories.map((category, i) => {
      const angle = (i / categories.length) * Math.PI * 2 - Math.PI / 2;
      const value = categoryData[category] / maxTime;
      const x = centerX + Math.cos(angle) * radius * value;
      const y = centerY + Math.sin(angle) * radius * value;
      return `${x},${y}`;
    });
    
    // Draw data polygon
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', points.join(' '));
    polygon.setAttribute('fill', 'rgba(66, 133, 244, 0.6)');
    polygon.setAttribute('stroke', 'rgb(66, 133, 244)');
    polygon.setAttribute('stroke-width', '2');
    svg.appendChild(polygon);
    
    // Add data points
    categories.forEach((category, i) => {
      const angle = (i / categories.length) * Math.PI * 2 - Math.PI / 2;
      const value = categoryData[category] / maxTime;
      const x = centerX + Math.cos(angle) * radius * value;
      const y = centerY + Math.sin(angle) * radius * value;
      
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', 'rgb(66, 133, 244)');
      circle.setAttribute('stroke', '#fff');
      circle.setAttribute('stroke-width', '1');
      svg.appendChild(circle);
      
      // Add time label with proper formatting
      const formattedTime = formatTimeSpent(categoryData[category]);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', x);
      text.setAttribute('y', y - 8);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '8px');
      text.textContent = formattedTime;
      svg.appendChild(text);
    });
    
    // Add title
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', centerX);
    title.setAttribute('y', centerY - radius - 15);
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('font-weight', 'bold');
    title.setAttribute('font-size', '14px');
    // title.textContent = 'Reading Themes';
    svg.appendChild(title);
  };
  
  // Function to update domain filter options
  const updateDomainFilter = () => {
    const domains = new Set(allHistoryData.map(item => extractDomain(item.url)));
    const currentValue = domainFilter.value;
    
    domainFilter.innerHTML = '<option value="all">All Sites</option>';
    [...domains].sort().forEach(domain => {
      const option = document.createElement('option');
      option.value = domain;
      option.textContent = domain;
      domainFilter.appendChild(option);
    });
    
    domainFilter.value = currentValue;
  };
  
  // Function to update category filter options
  const updateCategoryFilter = () => {
    const categories = new Set(readingInsights.map(item => item.category));
    categoryFilter.innerHTML = '';
    
    // Add "All" button
    const allBtn = document.createElement('div');
    allBtn.className = 'category-btn' + (activeCategories.has('all') ? ' active' : '');
    allBtn.textContent = 'All';
    allBtn.dataset.category = 'all';
    categoryFilter.appendChild(allBtn);
    
    // Add category buttons
    [...categories].sort().forEach(category => {
      const btn = document.createElement('div');
      btn.className = 'category-btn' + (activeCategories.has(category) ? ' active' : '');
      btn.textContent = category;
      btn.dataset.category = category;
      categoryFilter.appendChild(btn);
    });
    
    // Add click handlers
    document.querySelectorAll('.category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const category = btn.dataset.category;
        
        if (category === 'all') {
          // If "All" is clicked, make it the only active category
          activeCategories.clear();
          activeCategories.add('all');
        } else {
          // If a specific category is clicked, remove "All" and toggle this category
          activeCategories.delete('all');
          if (activeCategories.has(category)) {
            activeCategories.delete(category);
            // If no categories are selected, select "All"
            if (activeCategories.size === 0) {
              activeCategories.add('all');
            }
          } else {
            activeCategories.add(category);
          }
        }
        
        // Update UI and display
        document.querySelectorAll('.category-btn').forEach(b => {
          if (b.dataset.category === 'all') {
            b.classList.toggle('active', activeCategories.has('all'));
          } else {
            b.classList.toggle('active', activeCategories.has(b.dataset.category));
          }
        });
        
        updateInsightsDisplay();
      });
    });
  };
  
  // Function to load time statistics
  const loadTimeStats = () => {
    chrome.storage.local.get(['timeSpentData'], (result) => {
      timeSpentData = result.timeSpentData || {};
      updateTimeStats();
    });
  };
  
  // Function to load reading insights
  const loadReadingInsights = () => {
    chrome.storage.local.get(['readingInsights', 'insightStatus'], (result) => {
      readingInsights = result.readingInsights || [];
      console.log('Loaded reading insights data:', readingInsights.length, 'insights');
      
      if (readingInsights.length === 0) {
        console.log('No reading insights found in storage');
      } else {
        // Debug log first insight to check structure
        console.log('First insight sample:', readingInsights[0]);
      }
      
      updateCategoryFilter();
      updateInsightsDisplay();
      loadApiKey(); // Also load the API key
      
      // Check if there's a status message to display
      if (result.insightStatus) {
        updateStatusDisplay({
          message: result.insightStatus.message,
          type: result.insightStatus.type || 'info',
          timestamp: Date.now()
        });
      }
    });
  };
  
  // Function to update time statistics display
  const updateTimeStats = () => {
    const totalBrowsingTime = document.getElementById('totalBrowsingTime');
    const avgTimePerSite = document.getElementById('avgTimePerSite');
    const mostTimeSpent = document.getElementById('mostTimeSpent');
    const domainTimeStats = document.getElementById('domainTimeStats');
    
    // Calculate total browsing time across all domains
    let totalSeconds = 0;
    const domainTimeData = [];
    
    Object.entries(timeSpentData).forEach(([domain, data]) => {
      totalSeconds += data.totalTime || 0;
      
      domainTimeData.push({
        domain,
        totalTime: data.totalTime || 0,
        visits: data.visits || 0
      });
    });
    
    // Set total browsing time
    totalBrowsingTime.textContent = formatTimeSpent(totalSeconds);
    
    // Calculate average time per site
    const domainsWithTime = Object.values(timeSpentData).filter(data => data.totalTime > 0).length;
    const averageSeconds = domainsWithTime > 0 ? Math.floor(totalSeconds / domainsWithTime) : 0;
    avgTimePerSite.textContent = formatTimeSpent(averageSeconds);
    
    // Find domain with most time spent
    if (domainTimeData.length > 0) {
      const topTimeDomain = domainTimeData.sort((a, b) => b.totalTime - a.totalTime)[0];
      mostTimeSpent.textContent = topTimeDomain.domain;
    }
    
    // Display time stats per domain
    domainTimeStats.innerHTML = '';
    
    if (domainTimeData.length === 0) {
      domainTimeStats.innerHTML = '<div class="time-stats-item">No time data available yet</div>';
      return;
    }
    
    // Sort domains by time spent (descending)
    domainTimeData
      .sort((a, b) => b.totalTime - a.totalTime)
      .forEach(data => {
        const div = document.createElement('div');
        div.className = 'time-stats-item';
        
        const domain = document.createElement('div');
        domain.className = 'time-stats-domain';
        domain.textContent = data.domain;
        
        const timeSpent = document.createElement('div');
        timeSpent.className = 'time-stats-time';
        timeSpent.textContent = formatTimeSpent(data.totalTime);
        
        div.appendChild(domain);
        div.appendChild(timeSpent);
        domainTimeStats.appendChild(div);
      });
  };
  
  // Function to export history to CSV
  const exportToCSV = () => {
    const filtered = filterHistoryData();
    const csvContent = [
      ['Title', 'Domain', 'Visit Time', 'Time Spent'],
      ...filtered.map(item => [
        item.title || 'Untitled',
        extractDomain(item.url),
        formatDate(item.visitTime),
        formatTimeSpent(item.timeSpent || 0)
      ])
    ].map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `website_history_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };
  
  // Reset time data function
  const resetTime = () => {
    if (confirm('Are you sure you want to reset all time data? This cannot be undone.')) {
      chrome.runtime.sendMessage({ action: 'resetTimeData' }, () => {
        timeSpentData = {};
        // Also reset time spent in history items
        allHistoryData = allHistoryData.map(item => ({ ...item, timeSpent: 0 }));
        updateDisplay();
        if (document.getElementById('time-stats-tab').classList.contains('active')) {
          updateTimeStats();
        }
        alert('Time data has been reset.');
      });
    }
  };
  
  // Add event listeners
  searchBox.addEventListener('input', updateDisplay);
  timeFilter.addEventListener('change', updateDisplay);
  domainFilter.addEventListener('change', updateDisplay);
  exportBtn.addEventListener('click', exportToCSV);
  if (resetTimeBtn) {
    resetTimeBtn.addEventListener('click', resetTime);
  }
  
  // Add insight search event listener
  if (insightSearchBox) {
    insightSearchBox.addEventListener('input', updateInsightsDisplay);
  }
  
  // Add reading insights buttons event listeners
  const refreshInsightsBtn = document.getElementById('refreshInsightsBtn');
  const clearInsightsBtn = document.getElementById('clearInsightsBtn');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
  
  // Load and display API key from storage
  function loadApiKey() {
    chrome.runtime.sendMessage({ action: 'getApiKey' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error getting API key:', chrome.runtime.lastError);
        updateStatusDisplay({
          message: 'Error checking API key. Please try again.',
          type: 'error',
          timestamp: Date.now()
        });
        return;
      }
      
      if (response && response.apiKey) {
        apiKeyInput.value = response.apiKey;
        apiKeyInput.placeholder = '••••••••••••••••••••••••••';
      }
    });
  }
  
  // Handle API key save button
  if (saveApiKeyBtn) {
    saveApiKeyBtn.addEventListener('click', () => {
      const apiKey = apiKeyInput.value.trim();
      
      if (!apiKey) {
        alert('Please enter a valid OpenAI API key');
        return;
      }
      
      chrome.runtime.sendMessage({ action: 'saveApiKey', apiKey }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error saving API key:', chrome.runtime.lastError);
          alert('Error saving API key. Please try again.');
          return;
        }
        
        if (response && response.success) {
          alert('API key saved successfully');
          apiKeyInput.placeholder = '••••••••••••••••••••••••••';
        }
      });
    });
  }
  
  if (refreshInsightsBtn) {
    refreshInsightsBtn.addEventListener('click', () => {
      // First check if API key is set
      chrome.runtime.sendMessage({ action: 'getApiKey' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error getting API key:', chrome.runtime.lastError);
          updateStatusDisplay({
            message: 'Error checking API key. Please try again.',
            type: 'error',
            timestamp: Date.now()
          });
          return;
        }
        
        if (!response || !response.apiKey) {
          updateStatusDisplay({
            message: 'Please set your OpenAI API key first',
            type: 'error',
            timestamp: Date.now()
          });
          return;
        }
        
        // Get the current active tab
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs && tabs.length > 0) {
            const activeTab = tabs[0];
            
            updateStatusDisplay({
              message: 'Requesting new content extraction...',
              type: 'info',
              timestamp: Date.now()
            });
            
            // Send message to content script to force refresh insights
            chrome.tabs.sendMessage(activeTab.id, {action: 'forceRefreshInsights'}, (response) => {
              if (chrome.runtime.lastError) {
                console.error("Error sending message:", chrome.runtime.lastError);
                updateStatusDisplay({
                  message: 'Error: Content script not loaded. Please reload the page and try again.',
                  type: 'error',
                  timestamp: Date.now()
                });
                return;
              }
              
              if (response && response.success) {
                updateStatusDisplay({
                  message: 'Analysis started! Check back in a moment for new insights.',
                  type: 'success',
                  timestamp: Date.now()
                });
                
                // Wait a moment for insights to be processed, then refresh
                setTimeout(() => {
                  loadReadingInsights();
                }, 3000);
              }
            });
          }
        });
      });
    });
  }
  
  if (clearInsightsBtn) {
    clearInsightsBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all reading insights? This cannot be undone.')) {
        chrome.storage.local.set({readingInsights: []}, () => {
          readingInsights = [];
          updateCategoryFilter();
          updateInsightsDisplay();
          alert('All reading insights have been cleared.');
        });
      }
    });
  }
  
  // Load and display history and insights
  chrome.storage.local.get(['historyData', 'timeSpentData', 'readingInsights'], (result) => {
    allHistoryData = result.historyData || [];
    timeSpentData = result.timeSpentData || {};
    readingInsights = result.readingInsights || [];
    console.log('Loaded history data, count:', allHistoryData.length);
    console.log('Loaded insights data, count:', readingInsights.length);
    
    updateDomainFilter();
    updateDisplay();
    
    // Initialize Reading Insights if it's the active tab
    if (document.getElementById('reading-insights-tab').classList.contains('active')) {
      updateCategoryFilter();
      updateInsightsDisplay();
    }
  });
  
}); 