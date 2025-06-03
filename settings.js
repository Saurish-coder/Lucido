// Focus Filter Settings
document.addEventListener('DOMContentLoaded', function() {
  // DOM elements
  const whitelistArea = document.getElementById('whitelist-area');
  const blacklistArea = document.getElementById('blacklist-area');
  const mixedArea = document.getElementById('mixed-area');
  
  const whitelistDomainInput = document.getElementById('whitelist-domain');
  const whitelistCategorySelect = document.getElementById('whitelist-category');
  const addWhitelistBtn = document.getElementById('add-whitelist-btn');
  
  const blacklistDomainInput = document.getElementById('blacklist-domain');
  const blacklistCategorySelect = document.getElementById('blacklist-category');
  const addBlacklistBtn = document.getElementById('add-blacklist-btn');
  
  const mixedDomainInput = document.getElementById('mixed-domain');
  const addMixedBtn = document.getElementById('add-mixed-btn');
  
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const statusDiv = document.getElementById('status');
  
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  // Temporary storage for modified lists
  let customWhitelist = {};
  let customBlacklist = {};
  let customMixedDomains = { MIXED_USE: [] };
  
  // Default lists (loaded from background.js)
  let defaultWhitelist = {};
  let defaultBlacklist = {};
  let defaultMixedDomains = {};
  
  // Load settings from storage
  loadSettings();
  
  // Setup event listeners
  setupEventListeners();
  
  // Setup tabs
  setupTabs();
  
  // Function to load settings from storage
  function loadSettings() {
    // Use message passing instead of direct background page access
    chrome.runtime.sendMessage({ action: 'getFilterLists' }, function(response) {
      if (chrome.runtime.lastError) {
        showStatus('Error getting lists: ' + chrome.runtime.lastError.message, false);
        return;
      }

      if (response && response.success) {
        // Load default lists from response
        defaultWhitelist = response.defaultWhitelist || {};
        defaultBlacklist = response.defaultBlacklist || {};
        defaultMixedDomains = response.defaultMixedDomains || {};
        
        // Get custom lists from storage
        chrome.storage.local.get([
          'customWhitelist', 
          'customBlacklist', 
          'customMixedDomains'
        ], function(result) {
          customWhitelist = result.customWhitelist || {};
          customBlacklist = result.customBlacklist || {};
          customMixedDomains = result.customMixedDomains || { MIXED_USE: [] };
          
          // Render lists
          renderWhitelist();
          renderBlacklist();
          renderMixedDomains();
        });
      } else {
        showStatus('Could not get filter lists from background page', false);
      }
    });
  }
  
  // Function to setup event listeners
  function setupEventListeners() {
    // Add whitelist item
    addWhitelistBtn.addEventListener('click', function() {
      const domain = whitelistDomainInput.value.trim();
      const category = whitelistCategorySelect.value;
      
      if (domain) {
        addWhitelistItem(domain, category);
        whitelistDomainInput.value = '';
      } else {
        showStatus('Please enter a domain', false);
      }
    });
    
    // Add blacklist item
    addBlacklistBtn.addEventListener('click', function() {
      const domain = blacklistDomainInput.value.trim();
      const category = blacklistCategorySelect.value;
      
      if (domain) {
        addBlacklistItem(domain, category);
        blacklistDomainInput.value = '';
      } else {
        showStatus('Please enter a domain', false);
      }
    });
    
    // Add mixed-use domain
    addMixedBtn.addEventListener('click', function() {
      const domain = mixedDomainInput.value.trim();
      
      if (domain) {
        addMixedDomainItem(domain);
        mixedDomainInput.value = '';
      } else {
        showStatus('Please enter a domain', false);
      }
    });
    
    // Save settings
    saveSettingsBtn.addEventListener('click', saveSettings);
  }
  
  // Function to setup tabs
  function setupTabs() {
    tabs.forEach(tab => {
      tab.addEventListener('click', function() {
        // Remove active class from all tabs
        tabs.forEach(t => t.classList.remove('active'));
        // Add active class to clicked tab
        this.classList.add('active');
        
        // Hide all tab content
        tabContents.forEach(content => content.classList.remove('active'));
        // Show content for active tab
        const tabId = this.getAttribute('data-tab');
        document.getElementById(`${tabId}-tab`).classList.add('active');
      });
    });
  }
  
  // Function to render whitelist
  function renderWhitelist() {
    whitelistArea.innerHTML = '';
    
    // Render default whitelist
    Object.entries(defaultWhitelist).forEach(([category, domains]) => {
      domains.forEach(domain => {
        const listItem = createListItem(domain, category, 'whitelist', true);
        whitelistArea.appendChild(listItem);
      });
    });
    
    // Render custom whitelist
    Object.entries(customWhitelist).forEach(([category, domains]) => {
      domains.forEach(domain => {
        const listItem = createListItem(domain, category, 'whitelist', false);
        whitelistArea.appendChild(listItem);
      });
    });
  }
  
  // Function to render blacklist
  function renderBlacklist() {
    blacklistArea.innerHTML = '';
    
    // Render default blacklist
    Object.entries(defaultBlacklist).forEach(([category, domains]) => {
      domains.forEach(domain => {
        const listItem = createListItem(domain, category, 'blacklist', true);
        blacklistArea.appendChild(listItem);
      });
    });
    
    // Render custom blacklist
    Object.entries(customBlacklist).forEach(([category, domains]) => {
      domains.forEach(domain => {
        const listItem = createListItem(domain, category, 'blacklist', false);
        blacklistArea.appendChild(listItem);
      });
    });
  }
  
  // Function to render mixed-use domains
  function renderMixedDomains() {
    mixedArea.innerHTML = '';
    
    // Render default mixed-use domains
    Object.entries(defaultMixedDomains).forEach(([category, domains]) => {
      domains.forEach(domain => {
        const listItem = createListItem(domain, category, 'mixed', true);
        mixedArea.appendChild(listItem);
      });
    });
    
    // Render custom mixed-use domains
    Object.entries(customMixedDomains).forEach(([category, domains]) => {
      domains.forEach(domain => {
        const listItem = createListItem(domain, category, 'mixed', false);
        mixedArea.appendChild(listItem);
      });
    });
  }
  
  // Function to create a list item
  function createListItem(domain, category, type, isDefault) {
    const listItem = document.createElement('div');
    listItem.className = `list-item ${type}-item`;
    
    const domainSpan = document.createElement('span');
    domainSpan.textContent = domain;
    
    const categorySpan = document.createElement('span');
    categorySpan.className = 'domain-category';
    categorySpan.textContent = formatCategoryName(category);
    
    const domainInfo = document.createElement('div');
    domainInfo.appendChild(domainSpan);
    domainInfo.appendChild(document.createElement('br'));
    domainInfo.appendChild(categorySpan);
    
    const actions = document.createElement('div');
    actions.className = 'actions';
    
    // Only allow removing custom items or adding custom removals
    if (!isDefault) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', function() {
        removeItem(domain, category, type);
      });
      actions.appendChild(removeBtn);
    } else {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = 'Hide';
      removeBtn.title = 'Hide this default item';
      removeBtn.addEventListener('click', function() {
        hideDefaultItem(domain, category, type);
      });
      actions.appendChild(removeBtn);
    }
    
    listItem.appendChild(domainInfo);
    listItem.appendChild(actions);
    
    return listItem;
  }
  
  // Function to add whitelist item
  function addWhitelistItem(domain, category) {
    // Add domain to the custom whitelist
    if (!customWhitelist[category]) {
      customWhitelist[category] = [];
    }
    
    // Check if domain already exists
    if (customWhitelist[category].includes(domain)) {
      showStatus(`${domain} is already in the whitelist`, false);
      return;
    }
    
    // Add domain to custom whitelist
    customWhitelist[category].push(domain);
    
    // Re-render whitelist
    renderWhitelist();
    
    showStatus(`Added ${domain} to whitelist`, true);
  }
  
  // Function to add blacklist item
  function addBlacklistItem(domain, category) {
    // Add domain to the custom blacklist
    if (!customBlacklist[category]) {
      customBlacklist[category] = [];
    }
    
    // Check if domain already exists
    if (customBlacklist[category].includes(domain)) {
      showStatus(`${domain} is already in the blacklist`, false);
      return;
    }
    
    // Add domain to custom blacklist
    customBlacklist[category].push(domain);
    
    // Re-render blacklist
    renderBlacklist();
    
    showStatus(`Added ${domain} to blacklist`, true);
  }
  
  // Function to add mixed-use domain
  function addMixedDomainItem(domain) {
    // Add domain to the custom mixed-use domains
    if (!customMixedDomains['MIXED_USE']) {
      customMixedDomains['MIXED_USE'] = [];
    }
    
    // Check if domain already exists
    if (customMixedDomains['MIXED_USE'].includes(domain)) {
      showStatus(`${domain} is already in mixed-use domains`, false);
      return;
    }
    
    // Add domain to custom mixed-use domains
    customMixedDomains['MIXED_USE'].push(domain);
    
    // Re-render mixed-use domains
    renderMixedDomains();
    
    showStatus(`Added ${domain} to mixed-use domains`, true);
  }
  
  // Function to remove an item
  function removeItem(domain, category, type) {
    let list;
    
    // Determine which list to modify
    switch (type) {
      case 'whitelist':
        list = customWhitelist;
        break;
      case 'blacklist':
        list = customBlacklist;
        break;
      case 'mixed':
        list = customMixedDomains;
        break;
    }
    
    // Remove domain from the list
    if (list[category] && list[category].includes(domain)) {
      list[category] = list[category].filter(d => d !== domain);
      
      // Remove empty categories
      if (list[category].length === 0) {
        delete list[category];
      }
      
      // Re-render lists
      renderWhitelist();
      renderBlacklist();
      renderMixedDomains();
      
      showStatus(`Removed ${domain} from ${type}`, true);
    }
  }
  
  // Function to hide default item
  function hideDefaultItem(domain, category, type) {
    // Add to a hidden list in storage
    chrome.storage.local.get(['hiddenDefaultItems'], function(result) {
      const hiddenItems = result.hiddenDefaultItems || {};
      
      if (!hiddenItems[type]) {
        hiddenItems[type] = {};
      }
      
      if (!hiddenItems[type][category]) {
        hiddenItems[type][category] = [];
      }
      
      // Add domain to hidden list if not already there
      if (!hiddenItems[type][category].includes(domain)) {
        hiddenItems[type][category].push(domain);
        
        // Save hidden items
        chrome.storage.local.set({ hiddenDefaultItems: hiddenItems }, function() {
          showStatus(`Hidden ${domain} from ${type}`, true);
          
          // Re-load settings to reflect changes
          loadSettings();
        });
      }
    });
  }
  
  // Function to save settings
  function saveSettings() {
    chrome.storage.local.set({
      customWhitelist: customWhitelist,
      customBlacklist: customBlacklist,
      customMixedDomains: customMixedDomains
    }, function() {
      if (chrome.runtime.lastError) {
        showStatus('Error saving settings: ' + chrome.runtime.lastError.message, false);
      } else {
        showStatus('Settings saved successfully!', true);
        
        // Notify background page to reload settings
        chrome.runtime.sendMessage({ action: 'reloadCustomLists' });
      }
    });
  }
  
  // Function to show status
  function showStatus(message, isSuccess) {
    statusDiv.textContent = message;
    statusDiv.className = isSuccess ? 'status success' : 'status error';
    statusDiv.style.display = 'block';
    
    setTimeout(function() {
      statusDiv.style.display = 'none';
    }, 3000);
  }
  
  // Function to format category name for display
  function formatCategoryName(category) {
    return category
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, l => l.toUpperCase());
  }
}); 