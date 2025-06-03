// Store the current task
let currentTask = '';
let taskKeywordsCache = {}; // Cache for task -> keywords mapping
let rawGeminiResponse = ''; // Store raw response from Gemini API
let isInitialized = false; // Track if we've loaded data from storage

// Gemini API configuration
const GEMINI_CONFIG = {
  apiKey: 'AIzaSyCHdWGaEazHUof4rw5NkUd1MrDZASO7vsk', // Updated API key
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemma-3n-e4b-it:generateContent',
  enabled: true,
  keywordsPerTask: 800, // Increased from 500 to 800 keywords for better coverage
  maxRetries: 3
};

// Relevance configuration
const RELEVANCE_CONFIG = {
  // Minimum relevance score threshold to consider a page relevant (0.0-1.0)
  // Increased from 0.15/0.2 to 0.25/0.3 for stricter filtering
  relevanceThreshold: 0.25,
  relevanceThresholdLow: 0.15, // Threshold for showing warning but not closing
  
  // Scoring weights
  titleWeight: 3.0, // Title matches are highly indicative
  urlWeight: 2.0, // URL matches are also strong indicators
  contentWeight: 1.0, // Content matches are useful but less reliable
  
  // Auto-close settings
  autoCloseEnabled: true, // Default to enabled
  autoCloseDelay: 500, // Milliseconds to wait before closing irrelevant tabs
  
  // Debug settings
  debugMode: false, // Set to true for detailed console logging
  showTabDecisions: true // Log each tab's relevance assessment
};

// Website whitelist
const WEBSITE_WHITELIST = [
  'google.com/search', 'bing.com/search', 'search.yahoo.com', 'duckduckgo.com',
  'scholar.google.com', 'wikipedia.org', 'stackoverflow.com', 'github.com',
  'docs.google.com', 'sheets.google.com', 'drive.google.com', 'calendar.google.com',
  'notion.so', 'roamresearch.com', 'obsidian.md', 'mail.google.com', 'outlook.com',
  'youtube.com', 'reddit.com'
];

// Websites that are typically distracting
const WEBSITE_BLACKLIST = {
  // Social media (typically distracting)
  SOCIAL_MEDIA: [
    'facebook.com', 'twitter.com', 'instagram.com', 'tiktok.com', 'snapchat.com',
    'pinterest.com', 'tumblr.com', 'linkedin.com/feed', 'quora.com'
    // reddit.com removed (moved to whitelist)
  ],
  
  // Entertainment sites (typically distracting)
  ENTERTAINMENT: [
    'netflix.com', 'hulu.com', 'disneyplus.com', 'hbomax.com', 'primevideo.com',
    'twitch.tv', 'vimeo.com', 'dailymotion.com', 'imdb.com',
    'rottentomatoes.com', 'metacritic.com', 'crunchyroll.com', 'funimation.com'
    // youtube.com removed (moved to whitelist)
  ],
  
  // Shopping sites (typically distracting)
  SHOPPING: [
    'amazon.com', 'ebay.com', 'walmart.com', 'target.com', 'bestbuy.com',
    'etsy.com', 'wish.com', 'aliexpress.com', 'wayfair.com', 'homedepot.com',
    'newegg.com', 'zappos.com'
  ],
  
  // Gaming sites (typically distracting)
  GAMING: [
    'steam.com', 'epicgames.com', 'ea.com', 'blizzard.com', 'playstation.com',
    'xbox.com', 'nintendo.com', 'roblox.com', 'ign.com', 'gamespot.com',
    'kotaku.com', 'polygon.com'
  ]
};

// Special domains that should be analyzed on a case-by-case basis
const SPECIAL_DOMAINS = {
  // May be educational or distracting depending on content
  MIXED_USE: [
    // YouTube and Reddit moved to whitelist
    'medium.com',  // Could be professional or casual
    'github.com',  // Could be work-related or random projects
    'linkedin.com' // Could be job searching or social media
  ]
};

// Custom lists loaded from storage
let customWhitelist = {};
let customBlacklist = {};
let customMixedDomains = { MIXED_USE: [] };
let hiddenDefaultItems = {};

// Initialize on extension installed/updated
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed/updated:', details.reason);
  loadEssentialData();
});

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request.action);
  
  // Call the appropriate function based on the message action
  processMessage(request, sender, sendResponse);
  
  // Return true to indicate we'll send a response asynchronously
  return true;
});

// Log to console and store last error for debugging
function logError(message, error) {
  console.error(message, error);
  chrome.storage.local.set({ lastError: { message, details: error?.toString(), time: new Date().toISOString() }});
}

// Function to save data to storage with robust error handling
function saveToStorage(data) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          console.error('Storage save error:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          console.log('Successfully saved to storage:', Object.keys(data).join(', '));
          resolve();
        }
      });
    } catch (err) {
      console.error('Exception during storage save:', err);
      reject(err);
    }
  });
}

// Function to load data from storage with error handling
function loadFromStorage(keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          console.error('Storage load error:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          console.log('Successfully loaded from storage:', Object.keys(result).join(', '));
          resolve(result);
        }
      });
    } catch (err) {
      console.error('Exception during storage load:', err);
      reject(err);
    }
  });
}

// Function to load essential data
async function loadEssentialData() {
  if (isInitialized) return; // Prevent multiple initializations
  
  try {
    console.log('Loading essential data from storage...');
    const data = await loadFromStorage([
    'lastTask', 
    'taskKeywords',
      'autoCloseEnabled',
    'customWhitelist',
    'customBlacklist',
    'customMixedDomains',
      'hiddenDefaultItems',
      'rawGeminiResponse'
    ]);
    
    // Load task
    if (data.lastTask) {
      currentTask = data.lastTask;
      console.log('Loaded saved task:', currentTask);
    }
    
    // Load keyword cache
    if (data.taskKeywords) {
      taskKeywordsCache = data.taskKeywords || {};
      console.log('Loaded keyword cache for', Object.keys(taskKeywordsCache).length, 'tasks');
    }
    
    // Load raw response
    if (data.rawGeminiResponse) {
      rawGeminiResponse = data.rawGeminiResponse;
      console.log('Loaded raw Gemini response');
    }
    
    // Load auto-close setting
    if (data.hasOwnProperty('autoCloseEnabled')) {
      RELEVANCE_CONFIG.autoCloseEnabled = data.autoCloseEnabled;
    }
    
    // Load custom lists
    customWhitelist = data.customWhitelist || {};
    customBlacklist = data.customBlacklist || {};
    customMixedDomains = data.customMixedDomains || { MIXED_USE: [] };
    hiddenDefaultItems = data.hiddenDefaultItems || {};
    
    isInitialized = true;
    console.log('Essential data loaded. Extension is ready.');
  } catch (error) {
    console.error('Error loading essential data:', error);
    // Set defaults in case of loading error
    isInitialized = true; // Still mark as initialized to prevent loops
  }
}

// Process messages after ensuring data is loaded
function processMessage(request, sender, sendResponse) {
  console.log('Received message:', request.action);
  
  if (request.action === 'getTabId') {
    // Send back the tab ID
    if (sender.tab) {
      sendResponse({ tabId: sender.tab.id });
    } else {
      sendResponse({ tabId: null });
    }
    return true;
  }
  else if (request.action === 'reloadCustomLists') {
    // Reload custom lists from storage
    loadFromStorage([
      'customWhitelist',
      'customBlacklist',
      'customMixedDomains',
      'hiddenDefaultItems'
    ]).then(result => {
      customWhitelist = result.customWhitelist || {};
      customBlacklist = result.customBlacklist || {};
      customMixedDomains = result.customMixedDomains || { MIXED_USE: [] };
      hiddenDefaultItems = result.hiddenDefaultItems || {};
      
      console.log('Reloaded custom whitelist categories:', Object.keys(customWhitelist).length);
      console.log('Reloaded custom blacklist categories:', Object.keys(customBlacklist).length);
      
      sendResponse({ success: true });
    }).catch(error => {
      console.error('Error reloading custom lists:', error);
      sendResponse({ success: false, error: error.toString() });
    });
    return true;
  }
  else if (request.action === 'getTaskAndApiKey') {
    console.log('Returning current task:', currentTask);
    sendResponse({
      task: currentTask,
      apiKey: GEMINI_CONFIG.apiKey ? 'configured' : '',
      rawGeminiResponse: rawGeminiResponse
    });
    return true;
  }
  else if (request.action === 'getFilterLists') {
    // Return the whitelist, blacklist, and mixed-use domains for settings page
    console.log('Returning filter lists for settings page');
    sendResponse({
      success: true,
      defaultWhitelist: WEBSITE_WHITELIST,
      defaultBlacklist: WEBSITE_BLACKLIST,
      defaultMixedDomains: SPECIAL_DOMAINS
    });
    return true;
  }
  else if (request.action === 'getRawGeminiResponse') {
    sendResponse({
      rawGeminiResponse: rawGeminiResponse
    });
    return true;
  }
  else if (request.action === 'testNotification') {
    console.log('Testing notification system');
    
    // Create a test notification - use absolute URL for icon
    const iconUrl = chrome.runtime.getURL('icons/icon48.png');
    console.log('Using icon URL:', iconUrl);
    
    chrome.notifications.create('test_notification', {
      type: 'basic',
      iconUrl: iconUrl,
      title: 'Test Notification',
      message: 'This is a test notification from Focus Filter',
      priority: 2
    }, function(notificationId) {
      if (chrome.runtime.lastError) {
        console.error('Test notification error:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('Test notification created with ID:', notificationId);
        sendResponse({ success: true });
      }
    });
    
    return true; // Keep the message channel open for async response
  }
  else if (request.action === 'forceGenerateKeywords') {
    const task = request.task;
    if (!task) {
      sendResponse({ success: false, error: 'No task provided for keyword generation.' });
      return false;
    }
    
    // Update current task
    currentTask = task;
    saveToStorage({ lastTask: task })
      .then(() => console.log('Task saved to storage'))
      .catch(error => console.error('Error saving task:', error));
    
    if (GEMINI_CONFIG.enabled && GEMINI_CONFIG.apiKey) {
      // Force regeneration by clearing cache for this task first
      if (taskKeywordsCache[task]) {
        delete taskKeywordsCache[task]; 
        console.log('Cleared cached keywords for forced regeneration of:', task);
      }
      
      // Clear raw response in case there's an old one for this task
      rawGeminiResponse = '';
      
      // Generate new keywords
      generateKeywordsForTask(task)
        .then(keywords => {
          console.log(`Force generated ${keywords.length} keywords for task: ${task}`);
          
          // Store in cache
          taskKeywordsCache[task] = keywords;
          
          // Save to storage with error handling
          saveToStorage({ 
            taskKeywords: taskKeywordsCache,
            rawGeminiResponse: rawGeminiResponse,
            lastTask: task // Save task again to ensure consistency
          })
          .then(() => {
            console.log('Saved new keywords to storage');
          sendResponse({ 
            success: true, 
            keywordCount: keywords.length,
            rawResponse: rawGeminiResponse 
          });
        })
        .catch(error => {
            console.error('Error saving keywords to storage:', error);
            sendResponse({ 
              success: true, // Still mark as success but log the storage error
              keywordCount: keywords.length,
              rawResponse: rawGeminiResponse,
              storageError: error.toString() 
            });
          });
        })
        .catch(error => {
          console.error('Error generating keywords:', error);
          sendResponse({ success: false, error: error.toString() });
        });
      
      return true; // Keep the message channel open for async response
    } else {
      sendResponse({ success: false, error: 'API key not configured or generation disabled.' });
      return false;
    }
  }
  else if (request.action === 'checkRelevance') {
    const url = request.url;
    let task = request.task;
    const siteInfo = request.siteInfo || {};
    
    // If no task is specified, use the current task
    if (!task) task = currentTask;
    
    if (!url) {
      sendResponse({ error: 'No URL provided for relevance check.' });
      return false;
    }
    
    if (!task) {
      sendResponse({ error: 'No task set for relevance check.' });
      return false;
    }
    
    // Get keywords for the task
    getKeywords(task)
      .then(keywords => {
        // Check if the URL is in the whitelist
        const isWhitelisted = isUrlWhitelisted(url);
        if (isWhitelisted) {
          const response = {
            isRelevant: true,
            relevanceScore: 1.0,
            matches: ['Whitelisted domain'],
            message: 'This domain is always allowed.',
            source: 'whitelist'
          };
          sendResponse(response);
          return;
        }
        
        // Perform relevance check using keywords
        const relevanceResult = checkRelevance(url, siteInfo, keywords);
        sendResponse(relevanceResult);
        
        // Auto-close if irrelevant and feature is enabled
        if (!relevanceResult.isRelevant && RELEVANCE_CONFIG.autoCloseEnabled) {
          // If this is from the active tab, close it unless popup check
          if (sender.tab && url !== 'popup.html') {
            console.log(`Auto-closing irrelevant tab: ${url}`);
            closeTabIfIrrelevant(sender.tab.id);
          }
        }
      })
      .catch(error => {
        console.error('Error checking relevance:', error);
        sendResponse({ error: error.toString() });
      });
    
    return true; // Keep the message channel open for async response
  }
  else if (request.action === 'checkPageRelevance') {
    // This is called from the content script when a page loads
    if (!currentTask) {
      console.log('No current task set, skipping relevance check');
      sendResponse({ success: false, message: 'No current task set' });
      return true;
    }
    
    const siteInfo = request.siteInfo || {};
    const url = siteInfo.url || (sender.tab ? sender.tab.url : null);
    
    if (!url) {
      console.log('No URL available for relevance check');
      sendResponse({ success: false, message: 'No URL available' });
      return true;
    }
    
    // Check if auto-close is disabled
    if (!RELEVANCE_CONFIG.autoCloseEnabled) {
      console.log('Auto-close disabled, skipping relevance check for:', url);
      sendResponse({ success: true, message: 'Auto-close disabled' });
      return true;
    }
    
    // Get keywords for the current task
    getKeywords(currentTask)
      .then(keywords => {
        // Check if the URL is in the whitelist
        if (isUrlWhitelisted(url)) {
          console.log('Whitelisted domain, allowing:', url);
          sendResponse({ 
            success: true, 
            isRelevant: true, 
            message: 'Whitelisted domain' 
          });
          return;
        }
        
        // Perform relevance check
        const relevanceResult = checkRelevance(url, siteInfo, keywords);
        
        // If irrelevant, close the tab
        if (!relevanceResult.isRelevant && sender.tab) {
          console.log(`Auto-closing irrelevant tab: ${url}`);
          closeTabIfIrrelevant(sender.tab.id);
        }
        
        sendResponse({ 
          success: true, 
          isRelevant: relevanceResult.isRelevant, 
          relevanceScore: relevanceResult.relevanceScore,
          message: relevanceResult.message
        });
      })
      .catch(error => {
        console.error('Error in background relevance check:', error);
        sendResponse({ 
          success: false, 
          error: error.toString() 
        });
      });
    
    return true; // Keep message channel open for async response
  }
  else if (request.action === 'setAutoCloseEnabled') {
    RELEVANCE_CONFIG.autoCloseEnabled = request.enabled;
    saveToStorage({ autoCloseEnabled: request.enabled })
      .then(() => console.log('Auto-close setting saved'))
      .catch(error => console.error('Error saving auto-close setting:', error));
    
    console.log('Auto-close feature is now', request.enabled ? 'enabled' : 'disabled');
    sendResponse({ success: true });
    return false;
  }
  
  return false; // No async response expected
}

// Extracts domain from a URL
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch (e) {
    console.error('Error extracting domain:', e);
    return url;
  }
}

// Check if a URL is whitelisted
function isUrlWhitelisted(url) {
  return WEBSITE_WHITELIST.some(domain => url.includes(domain));
}

// Close a tab if it's determined to be irrelevant
function closeTabIfIrrelevant(tabId) {
  // First try to send a message to the content script to handle the closure
  chrome.tabs.sendMessage(tabId, { action: 'forceCloseTab' }, function(response) {
    if (chrome.runtime.lastError || !response || !response.success) {
      // If messaging fails, try to close directly
      chrome.tabs.remove(tabId, function() {
        if (chrome.runtime.lastError) {
          console.error('Error closing tab:', chrome.runtime.lastError);
        }
      });
    }
  });
}

// Get keywords for a task (from cache or generate new ones)
async function getKeywords(task) {
  // Ensure data is initialized
  if (!isInitialized) {
    await loadEssentialData();
  }
  
  // Check if we have keywords in cache
  if (taskKeywordsCache[task]) {
    console.log(`Using cached ${taskKeywordsCache[task].length} keywords for task: ${task}`);
    return taskKeywordsCache[task];
  }
  
  // Try to load keywords from storage in case they weren't loaded at startup
  try {
    const data = await loadFromStorage(['taskKeywords']);
    if (data.taskKeywords && data.taskKeywords[task]) {
      // Update cache from storage
      taskKeywordsCache = data.taskKeywords;
      console.log(`Found ${taskKeywordsCache[task].length} keywords in storage for task: ${task}`);
      return taskKeywordsCache[task];
    }
  } catch (error) {
    console.error('Error checking storage for keywords:', error);
  }
  
  // Generate keywords using Gemini
  console.log(`No cached keywords found, generating for task: ${task}`);
  try {
    const keywords = await generateKeywordsForTask(task);
    
    // Cache the keywords
    taskKeywordsCache[task] = keywords;
    
    // Save to storage with error handling
    try {
      await saveToStorage({ 
        taskKeywords: taskKeywordsCache,
        rawGeminiResponse: rawGeminiResponse 
      });
      console.log('Saved new keywords to storage');
    } catch (error) {
      console.error('Error saving keywords to storage:', error);
      // Continue despite storage error - at least we have them in memory
    }
    
    return keywords;
  } catch (error) {
    console.error('Error generating keywords:', error);
    // Return empty array if generation fails
    return [];
  }
}

// Generate keywords for a task using Gemini API
async function generateKeywordsForTask(task) {
  if (!GEMINI_CONFIG.enabled || !GEMINI_CONFIG.apiKey) {
    throw new Error('Gemini API not configured or disabled');
  }
  
  const prompt = `
You are a helpful AI assistant tasked with generating relevant search keywords for a user's task.
For the given task, provide a comprehensive list of keywords and phrases that would be found on web pages relevant to this task.
Include specific terminology, concepts, tools, technologies, and related topics.

TASK: "${task}"

Output ONLY a JSON array containing the keywords, formatted as:
["keyword1", "keyword2", "phrase one", "phrase two"]

Include at least 300 keywords, which are single words recognized by the English Dictionary.
Aside from these 300 keywords, there should be 200 keywords for relating topics, such as if topic is 'Python - The coding language', then keywords such as 'Javascript' should also appear.
So in total there should be 500 keywords.
Ensure all keywords are relevant to the task and sufficiently distinctive to identify related content.
`;

  // Create the request body
  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048 // Increased token limit for more keywords
    }
  };

  // Add API key to URL
  const apiUrl = `${GEMINI_CONFIG.baseUrl}?key=${GEMINI_CONFIG.apiKey}`;

  try {
    console.log('Requesting keywords from GEMMA 3N E4B model...');
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const jsonResponse = await response.json();
    console.log('Received GEMMA model response:', jsonResponse);
    
    // Extract text from response - handle structure differences between Gemini and GEMMA
    rawGeminiResponse = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text || 
                        jsonResponse.candidates?.[0]?.output || 
                        jsonResponse.text || 
                        '';
    
    // Parse keywords from the response
    let keywords = extractKeywordsFromResponse(rawGeminiResponse);
    
    console.log(`Generated ${keywords.length} keywords for task: ${task}`);
    return keywords;
  } catch (error) {
    console.error('Error calling GEMMA API:', error);
    throw error;
  }
}

// Extract keywords from GEMMA API response
function extractKeywordsFromResponse(responseText) {
  try {
    // Log the raw response for debugging
    console.log('Extracting keywords from response:', responseText?.substring(0, 200) + '...');
    
    // Try to find a JSON array in the response - looking for patterns like [...] or {"keywords": [...]}
    const jsonArrayMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonArrayMatch) {
      const jsonStr = jsonArrayMatch[0];
      try {
        const keywords = JSON.parse(jsonStr);
        
        // Validate and filter
        if (Array.isArray(keywords)) {
          const validKeywords = keywords
            .filter(k => typeof k === 'string' && k.trim().length > 0)
            .map(k => k.trim().toLowerCase());
            
          console.log(`Successfully parsed ${validKeywords.length} keywords from JSON array`);
          return validKeywords;
        }
      } catch (parseError) {
        console.error('Error parsing JSON array:', parseError);
      }
    }
    
    // Try to parse as a JSON object with a keywords field
    try {
      const jsonObj = JSON.parse(responseText);
      if (jsonObj && Array.isArray(jsonObj.keywords || jsonObj.result)) {
        const keywordArray = jsonObj.keywords || jsonObj.result;
        const validKeywords = keywordArray
          .filter(k => typeof k === 'string' && k.trim().length > 0)
          .map(k => k.trim().toLowerCase());
          
        console.log(`Successfully parsed ${validKeywords.length} keywords from JSON object`);
        return validKeywords;
      }
    } catch (parseObjError) {
      // Not a valid JSON object, continue to next method
    }
    
    // Fallback: split by commas, newlines, or quotes
    console.log('Using fallback keyword extraction method');
    const fallbackKeywords = responseText
      .replace(/["\[\]{}]/g, '')
      .split(/[,\n]+/)
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 0);
    
    return fallbackKeywords;
  } catch (error) {
    console.error('Error extracting keywords from response:', error);
    
    // Last resort fallback
    return responseText
      .split(/[\s,\n"]+/)
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 2);
  }
}

// Check relevance of a URL based on keywords
function checkRelevance(url, siteInfo, keywords) {
  const domain = extractDomain(url);
  const title = siteInfo.title || '';
  const content = siteInfo.pageContent || '';
  
  // If no keywords, can't determine relevance
  if (!keywords || keywords.length === 0) {
    return {
      isRelevant: true, // Default to relevant if no keywords
      relevanceScore: 0.5,
      matches: ['No keywords available'],
      message: 'No keywords available for relevance check. Please generate keywords.',
      source: 'default'
    };
  }
  
  // Initialize matches array and score
  const matches = [];
  let score = 0;
  const maxScore = keywords.length;
  
  // Convert text to lowercase for case-insensitive matching
  const lowerTitle = title.toLowerCase();
  const lowerUrl = url.toLowerCase();
  const lowerContent = content.toLowerCase();
  
  // Check each keyword
  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase();
    let matchFound = false;
    
    // Check title (highest weight)
    if (lowerTitle.includes(lowerKeyword)) {
      matches.push(`Title: ${keyword}`);
      score += RELEVANCE_CONFIG.titleWeight;
      matchFound = true;
    }
    
    // Check URL (medium weight)
    if (lowerUrl.includes(lowerKeyword)) {
      matches.push(`URL: ${keyword}`);
      score += RELEVANCE_CONFIG.urlWeight;
      matchFound = true;
    }
    
    // Check content (lowest weight)
    if (!matchFound && lowerContent.includes(lowerKeyword)) {
      matches.push(`Content: ${keyword}`);
      score += RELEVANCE_CONFIG.contentWeight;
    }
  }
  
  // Calculate normalized relevance score (0.0-1.0)
  const normalizedScore = Math.min(score / maxScore, 1.0);
  
  // Determine if the page is relevant based on the score
  const isRelevant = normalizedScore >= RELEVANCE_CONFIG.relevanceThreshold;
  const isLowRelevance = normalizedScore < RELEVANCE_CONFIG.relevanceThreshold && 
                         normalizedScore >= RELEVANCE_CONFIG.relevanceThresholdLow;
  
  // Create message based on relevance
  let message = '';
  if (isRelevant) {
    message = `This page is relevant to your task (${Math.round(normalizedScore * 100)}% match).`;
  } else if (isLowRelevance) {
    message = `This page has low relevance to your task (${Math.round(normalizedScore * 100)}% match).`;
  } else {
    message = `This page appears irrelevant to your task (${Math.round(normalizedScore * 100)}% match).`;
  }
  
  if (RELEVANCE_CONFIG.showTabDecisions) {
    console.log(`[${isRelevant ? 'RELEVANT' : 'IRRELEVANT'}] ${url} - Score: ${normalizedScore.toFixed(2)}, Matches: ${matches.length}`);
  }
  
  // Return the relevance results
  return {
    isRelevant,
    isLowRelevance,
    relevanceScore: normalizedScore,
    matches: matches.slice(0, 10), // Return only top 10 matches to avoid overly large responses
    matchCount: matches.length,
    message,
    source: 'keyword-match'
  };
}

// Make sure we reload our data if a suspend operation is canceled
chrome.runtime.onSuspendCancel.addListener(() => {
  console.log('Suspension canceled - reloading data...');
  isInitialized = false; // Reset initialization flag
  loadEssentialData(); // Reload all data
});

// Add this function to verify keyword storage integrity
function verifyKeywordStorage() {
  if (!currentTask) return;
  
  console.log('Verifying keyword storage for current task:', currentTask);
  
  // Check if we have keywords in memory but need to verify they're in storage
  if (taskKeywordsCache[currentTask]) {
    const keywordCount = taskKeywordsCache[currentTask].length;
    console.log(`Found ${keywordCount} keywords in memory for current task`);
    
    // Verify storage has the same data
    loadFromStorage(['taskKeywords']).then(data => {
      if (data.taskKeywords && 
          data.taskKeywords[currentTask] && 
          data.taskKeywords[currentTask].length === keywordCount) {
        console.log('Storage verification successful - keywords match');
      } else {
        console.warn('Storage verification failed - updating storage with memory cache');
        // Update storage with our in-memory cache
        saveToStorage({ taskKeywords: taskKeywordsCache })
          .then(() => console.log('Storage updated with memory cache'))
          .catch(err => console.error('Failed to update storage:', err));
      }
    }).catch(err => {
      console.error('Error verifying keyword storage:', err);
    });
  } else {
    console.log('No keywords in memory for current task, checking storage');
    // Try to load from storage
    loadFromStorage(['taskKeywords']).then(data => {
      if (data.taskKeywords && data.taskKeywords[currentTask]) {
        console.log(`Found ${data.taskKeywords[currentTask].length} keywords in storage for current task`);
        // Update memory cache
        taskKeywordsCache = data.taskKeywords;
      } else {
        console.log('No keywords found in storage for current task');
      }
    }).catch(err => {
      console.error('Error checking storage for keywords:', err);
    });
  }
}

// Run storage verification periodically to ensure data integrity
setInterval(verifyKeywordStorage, 30000); // Check every 30 seconds


