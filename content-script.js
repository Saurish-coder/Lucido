// Content script to gather site information and check relevance

// Maximum content size to extract (reduced from 10K to 5K for better performance)
const MAX_CONTENT_SIZE = 5000;

// Function to extract site information
function getSiteInfo() {
  // Get page title
  const title = document.title || '';
  
  // Get URL
  const url = window.location.href;
  
  // Get site name (try several methods)
  let siteName = '';
  // Try to get from meta tags
  const siteNameMeta = document.querySelector('meta[property="og:site_name"]');
  if (siteNameMeta) {
    siteName = siteNameMeta.getAttribute('content');
  }
  // If not found, try to extract from URL
  if (!siteName) {
    try {
      const urlObj = new URL(window.location.href);
      siteName = urlObj.hostname.replace('www.', '');
    } catch (e) {
      console.error('Error extracting hostname:', e);
    }
  }
  
  // Get page description
  let description = '';
  // Try meta description
  const descMeta = document.querySelector('meta[name="description"]');
  if (descMeta) {
    description = descMeta.getAttribute('content');
  }
  // Try OpenGraph description
  if (!description) {
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) {
      description = ogDesc.getAttribute('content');
    }
  }
  
  // Get main content text (first few paragraphs)
  if (!description) {
    const paragraphs = document.querySelectorAll('p');
    const textContent = Array.from(paragraphs)
      .slice(0, 3)
      .map(p => p.textContent)
      .join(' ')
      .trim();
    
    if (textContent) {
      description = textContent.substring(0, 200) + (textContent.length > 200 ? '...' : '');
    }
  }
  
  // Extract page content for keyword matching - two-phase approach
  // Phase 1: Quick scan of key elements
  const quickScanContent = getQuickScanContent();
  
  // Check if extraction was successful
  const contentSuccess = Boolean(quickScanContent && quickScanContent.length > 100);
  
  return {
    title,
    url,
    siteName, 
    description,
    pageContent: quickScanContent.substring(0, MAX_CONTENT_SIZE),
    contentSuccess
  };
}

// Fast initial content extraction - prioritizes important elements
function getQuickScanContent() {
  let content = '';
  
  // Get the title - very important for relevance
  content += (document.title || '') + ' ';
  
  // Get h1, h2, h3 headings - highly indicative of content
  const headings = document.querySelectorAll('h1, h2, h3');
  if (headings.length > 0) {
    content += Array.from(headings)
      .map(h => h.innerText)
      .join(' ') + ' ';
  }
  
  // Get meta description - often summarizes content
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    content += metaDesc.getAttribute('content') + ' ';
  }
  
  // Try to find a main content container first
  const contentSelectors = [
    'main',
    'article',
    '#content',
    '.content',
    '.main',
    '.article',
    '.post',
    '#main-content',
    '.main-content'
  ];
  
  let contentContainer = null;
  for (const selector of contentSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      contentContainer = element;
        break;
    }
  }
  
  // If a content container is found, extract text from it
  if (contentContainer) {
    content += contentContainer.innerText + ' ';
  } else {
    // Fallback: collect text from paragraphs, headings and list items
    const contentElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');
    content += Array.from(contentElements)
      .map(el => el.innerText)
      .join(' ');
  }
  
  return content.trim();
}

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSiteInfo') {
    const siteInfo = getSiteInfo();
    sendResponse(siteInfo);
  } else if (request.action === 'forceCloseTab') {
    // Don't rely on messaging - execute immediately
    console.log('Content script forcing tab close due to irrelevance');
    
    // Display brief notification before closing
    const notification = document.createElement('div');
    notification.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; padding: 10px; ' +
      'background-color: #f44336; color: white; text-align: center; z-index: 9999; font-size: 16px;';
    notification.textContent = 'This page was detected as irrelevant to your current task. Closing...';
    document.body.appendChild(notification);
    
    // Close tab after a brief delay so user can see notification
    setTimeout(() => window.close(), 500);
    
    // Always respond
    sendResponse({success: true});
  }
  
  // Keep the channel open for async responses
  return true;
});

// Initial execution when script loads
const initialInfo = getSiteInfo();

// Proactively send info to background script for relevance checking
try {
  chrome.runtime.sendMessage({
    action: 'checkPageRelevance',
    siteInfo: initialInfo
  }, function(response) {
    // Handle potential errors
    if (chrome.runtime.lastError) {
      console.error('Error sending initial page info:', chrome.runtime.lastError);
      return;
    }
    
    // Process response if needed
    if (response) {
      console.log('Initial relevance check completed');
    }
  });
} catch (error) {
  console.error('Failed to send message to background script:', error);
} 