document.addEventListener('DOMContentLoaded', () => {
  const historyList = document.getElementById('historyList');
  const searchBox = document.getElementById('searchBox');
  const timeFilter = document.getElementById('timeFilter');
  const domainFilter = document.getElementById('domainFilter');
  const exportBtn = document.getElementById('exportBtn');
  
  let allHistoryData = [];
  
  // Function to format date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
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
    
    domainFilter.innerHTML = '<option value="all">All Domains</option>';
    [...domains].sort().forEach(domain => {
      const option = document.createElement('option');
      option.value = domain;
      option.textContent = domain;
      domainFilter.appendChild(option);
    });
    
    domainFilter.value = currentValue;
  };
  
  // Function to export history to CSV
  const exportToCSV = () => {
    const filtered = filterHistoryData();
    const csvContent = [
      ['Title', 'Domain', 'Visit Time'],
      ...filtered.map(item => [
        item.title || 'Untitled',
        extractDomain(item.url),
        formatDate(item.visitTime)
      ])
    ].map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `website_history_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };
  
  // Add event listeners
  searchBox.addEventListener('input', updateDisplay);
  timeFilter.addEventListener('change', updateDisplay);
  domainFilter.addEventListener('change', updateDisplay);
  exportBtn.addEventListener('click', exportToCSV);
  
  // Load and display history
  chrome.storage.local.get(['historyData'], (result) => {
    allHistoryData = result.historyData || [];
    console.log('Loaded history data, count:', allHistoryData.length);
    updateDomainFilter();
    updateDisplay();
  });
}); 