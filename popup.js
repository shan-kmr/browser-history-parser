document.addEventListener('DOMContentLoaded', () => {
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
      
      // Load time stats if needed
      if (tabName === 'time-stats') {
        loadTimeStats();
      }
    });
  });

  const historyList = document.getElementById('historyList');
  const searchBox = document.getElementById('searchBox');
  const timeFilter = document.getElementById('timeFilter');
  const domainFilter = document.getElementById('domainFilter');
  const exportBtn = document.getElementById('exportBtn');
  const resetTimeBtn = document.getElementById('resetTimeBtn');
  
  let allHistoryData = [];
  let timeSpentData = {};
  
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
  
  // Function to update the display
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
  
  // Function to load time statistics
  const loadTimeStats = () => {
    chrome.storage.local.get(['timeSpentData'], (result) => {
      timeSpentData = result.timeSpentData || {};
      updateTimeStats();
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
  
  // Load and display history
  chrome.storage.local.get(['historyData', 'timeSpentData'], (result) => {
    allHistoryData = result.historyData || [];
    timeSpentData = result.timeSpentData || {};
    console.log('Loaded history data, count:', allHistoryData.length);
    updateDomainFilter();
    updateDisplay();
  });
}); 