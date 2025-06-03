// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
  // Safely get DOM elements
  const getElement = (id) => document.getElementById(id);
  
  // UI elements
  const elements = {
    taskInput: getElement('task'),
    saveTaskBtn: getElement('save-task-btn'),
    generateKeywordsBtn: getElement('generate-keywords-btn'),
    statusTask: getElement('status-task'),
    keywordStats: getElement('keyword-stats'),
    website: getElement('website'),
    refreshUrlBtn: getElement('refresh-url'),
    checkRelevanceBtn: getElement('check-relevance-btn'),
    resultRelevance: getElement('result-relevance'),
    showKeywordsBtn: getElement('show-keywords-btn'),
    keywordsDisplay: getElement('keywords-display-area'),
    exportResponseBtn: getElement('export-response-btn'),
    autoCloseToggle: getElement('autoCloseToggle'),
    autoCloseStatus: getElement('auto-close-status')
  };

  // Initialize
  loadInitialData();
  setupEventListeners();

  // Load initial data from storage
  function loadInitialData() {
    chrome.runtime.sendMessage({ action: 'getTaskAndApiKey' }, function(response) {
      if (chrome.runtime.lastError) {
        console.error("Error getting initial data:", chrome.runtime.lastError);
        return;
      }
      
      if (response && elements.taskInput) {
        elements.taskInput.value = response.task || '';
        updateKeywordStats(response.task);
      }
    });

    // Get current tab URL
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (chrome.runtime.lastError || !tabs || tabs.length === 0 || !tabs[0].url) {
        console.error("Could not get current tab URL");
        if (elements.website) elements.website.placeholder = "Enter URL manually or refresh";
        return;
      }
      
      if (elements.website) elements.website.value = tabs[0].url;
    });
    
    // Load auto-close setting
    chrome.storage.local.get(['autoCloseEnabled'], function(result) {
      if (elements.autoCloseToggle) {
        if (result.hasOwnProperty('autoCloseEnabled')) {
          elements.autoCloseToggle.checked = result.autoCloseEnabled;
        } else {
          elements.autoCloseToggle.checked = true;
          chrome.storage.local.set({ autoCloseEnabled: true });
        }
        
        updateAutoCloseStatus();
      }
    });
  }

  // Set up event listeners
  function setupEventListeners() {
    // Save task button
    if (elements.saveTaskBtn) {
      elements.saveTaskBtn.addEventListener('click', function() {
        const taskValue = elements.taskInput.value.trim();
        if (!taskValue) {
          showStatus('Please enter a task', false, elements.statusTask);
          return;
        }
        
        chrome.runtime.sendMessage({ 
          action: 'checkRelevance', 
          task: taskValue, 
          url: 'popup.html', 
          siteInfo: { title: 'PopupSaveTask' } 
        }, function(response) {
          if (chrome.runtime.lastError) {
            showStatus('Error saving task: ' + chrome.runtime.lastError.message, false, elements.statusTask);
            return;
          }
          
          showStatus('Task saved: "' + taskValue + '"', true, elements.statusTask);
          updateKeywordStats(taskValue);
        });
      });
    }
    
    // Generate keywords button
    if (elements.generateKeywordsBtn) {
      elements.generateKeywordsBtn.addEventListener('click', function() {
        const taskValue = elements.taskInput.value.trim();
        if (!taskValue) {
          showStatus('Please enter a task first', false, elements.statusTask);
          return;
        }
        
        showStatus('Generating keywords...', true, elements.statusTask);
        elements.generateKeywordsBtn.disabled = true;
        
        chrome.runtime.sendMessage({ 
          action: 'forceGenerateKeywords', 
          task: taskValue 
        }, function(response) {
          elements.generateKeywordsBtn.disabled = false;
          
          if (chrome.runtime.lastError) {
            showStatus('Error: ' + chrome.runtime.lastError.message, false, elements.statusTask);
            return;
          }
          
          if (response && response.success) {
            showStatus('Generated ' + response.keywordCount + ' keywords', true, elements.statusTask);
            updateKeywordStats(taskValue);
            
            if (response.rawResponse && elements.keywordsDisplay) {
              elements.keywordsDisplay.innerHTML = '<pre>' + response.rawResponse + '</pre>';
              elements.keywordsDisplay.style.display = 'block';
              if (elements.showKeywordsBtn) elements.showKeywordsBtn.textContent = 'Hide Keywords';
            }
          } else {
            showStatus('Generation failed: ' + (response?.error || 'Unknown error'), false, elements.statusTask);
          }
        });
      });
    }
    
    // Show/hide keywords button
    if (elements.showKeywordsBtn && elements.keywordsDisplay) {
      elements.showKeywordsBtn.addEventListener('click', function() {
        if (elements.keywordsDisplay.style.display === 'none' || !elements.keywordsDisplay.style.display) {
          elements.keywordsDisplay.style.display = 'block';
          elements.showKeywordsBtn.textContent = 'Hide Keywords';
          
          // Get keywords to display
          chrome.runtime.sendMessage({ action: 'getRawGeminiResponse' }, function(response) {
            if (response && response.rawGeminiResponse) {
              elements.keywordsDisplay.innerHTML = '<pre>' + response.rawGeminiResponse + '</pre>';
            } else {
              elements.keywordsDisplay.textContent = 'No keywords available yet. Try generating some first.';
            }
          });
        } else {
          elements.keywordsDisplay.style.display = 'none';
          elements.showKeywordsBtn.textContent = 'Show Keywords';
        }
      });
    }
    
    // Check relevance button
    if (elements.checkRelevanceBtn) {
      elements.checkRelevanceBtn.addEventListener('click', function() {
        const url = elements.website.value.trim();
        const task = elements.taskInput.value.trim();
        
        if (!url) {
          showStatus('Please enter a website URL', false, elements.resultRelevance);
          return;
        }
        
        if (!task) {
          showStatus('Please set a task first', false, elements.resultRelevance);
          return;
        }
        
        elements.checkRelevanceBtn.textContent = 'Checking...';
        elements.checkRelevanceBtn.disabled = true;
        
        chrome.runtime.sendMessage({ 
          action: 'checkRelevance', 
          url: url, 
          task: task 
        }, function(response) {
          elements.checkRelevanceBtn.textContent = 'Check Relevance';
          elements.checkRelevanceBtn.disabled = false;
          
          if (chrome.runtime.lastError) {
            showStatus('Error: ' + chrome.runtime.lastError.message, false, elements.resultRelevance);
            return;
          }
          
          if (response?.error) {
            showStatus('Error: ' + response.error, false, elements.resultRelevance);
          } else if (response) {
            const message = response.isRelevant 
              ? 'This page is relevant to your task.' 
              : 'This page appears irrelevant to your task.';
              
            showStatus(message, response.isRelevant, elements.resultRelevance);
          }
        });
      });
    }
    
    // Auto-close toggle
    if (elements.autoCloseToggle) {
      elements.autoCloseToggle.addEventListener('change', function() {
        const enabled = this.checked;
        chrome.runtime.sendMessage({ 
          action: 'setAutoCloseEnabled', 
          enabled: enabled 
        });
        updateAutoCloseStatus();
      });
    }
    
    // Export button
    if (elements.exportResponseBtn) {
      elements.exportResponseBtn.addEventListener('click', function() {
        const task = elements.taskInput.value.trim();
        if (!task) {
          showStatus('Please set a task first', false, elements.statusTask);
          return;
        }
        
        chrome.storage.local.get(['taskKeywords'], function(result) {
          const keywords = (result.taskKeywords && result.taskKeywords[task]) || [];
          
          // Create blob and download
          const blob = new Blob([JSON.stringify(keywords, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'keywords-' + task.substring(0, 20).replace(/\W+/g, '-') + '.json';
          document.body.appendChild(a);
          a.click();
          setTimeout(function() {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 100);
        });
      });
    }
  }

  // Helper: Show status message
  function showStatus(message, isSuccess, element, duration = 3000) {
    if (!element) return;
    
    element.textContent = message;
    element.className = 'status ' + (isSuccess ? 'success' : 'error');
    element.style.display = 'block';
    
    if (duration > 0) {
      setTimeout(() => {
        element.style.display = 'none';
      }, duration);
    }
  }

  // Helper: Update keyword stats display
  function updateKeywordStats(task) {
    if (!task || !elements.keywordStats) return;
    
    chrome.storage.local.get(['taskKeywords'], function(result) {
      if (result.taskKeywords && result.taskKeywords[task]) {
        const keywordCount = result.taskKeywords[task].length;
        elements.keywordStats.textContent = `${keywordCount} keywords available`;
        elements.keywordStats.style.display = 'block';
      } else {
        elements.keywordStats.textContent = 'No keywords generated yet';
        elements.keywordStats.style.display = 'block';
      }
    });
  }

  // Helper: Update auto-close status display
  function updateAutoCloseStatus() {
    if (!elements.autoCloseStatus) return;
    
    const isEnabled = elements.autoCloseToggle.checked;
    elements.autoCloseStatus.textContent = isEnabled
      ? 'Auto-close is enabled. Irrelevant tabs will be closed automatically.'
      : 'Auto-close is disabled.';
    elements.autoCloseStatus.className = 'status ' + (isEnabled ? 'success' : '');
    elements.autoCloseStatus.style.display = 'block';
  }
});