// List of article selectors for popular financial news websites
const NEWS_SELECTORS = [
  "article",
  "main",
  ".article-body",
  ".story-body",
  ".caas-body", // Yahoo Finance
  ".article-content",
  ".post-content",
  "#article-body"
];

// List of selectors to ignore (boilerplate, ads, comment sections)
const BOILERPLATE_SELECTORS = [
  "nav",
  "footer",
  "header",
  "aside",
  ".nav",
  ".footer",
  ".header",
  ".sidebar",
  ".comments",
  ".ads",
  ".recommendations",
  ".related-stories"
];

// Helper to extract clean text from the webpage
function extractPageContent() {
  const title = document.querySelector("h1")?.textContent?.trim() || document.title;
  let articleText = "";

  // 1. Try specific high-probability article containers first
  for (const selector of NEWS_SELECTORS) {
    const container = document.querySelector(selector);
    if (container) {
      // Find all paragraphs inside the container
      const paragraphs = Array.from(container.querySelectorAll("p"))
        .map(p => p.textContent.trim())
        .filter(text => text.length > 30); // Filter out short snippets

      if (paragraphs.length > 0) {
        articleText = paragraphs.join("\n\n");
        break;
      }
    }
  }

  // 2. Fallback: Scan the entire document body, excluding boilerplate
  if (!articleText) {
    // Clone body to avoid disturbing the live page DOM
    const bodyClone = document.body.cloneNode(true) as HTMLElement;
    
    // Remove boilerplate elements from clone
    BOILERPLATE_SELECTORS.forEach(selector => {
      bodyClone.querySelectorAll(selector).forEach(el => el.remove());
    });

    const paragraphs = Array.from(bodyClone.querySelectorAll("p"))
      .map(p => p.textContent.trim())
      .filter(text => text.length > 40 && !text.includes("cookies") && !text.includes("rights reserved"));

    articleText = paragraphs.join("\n\n");
  }

  // Trim to avoid hitting excessive model token limits (approx 8000 characters is plenty for news)
  const finalContent = `${title}\n\n${articleText}`.substring(0, 8000).trim();
  
  return {
    success: finalContent.length > 50,
    title,
    newsText: finalContent
  };
}

// Listen for scrape requests from the background service worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractPageContent") {
    try {
      const result = extractPageContent();
      sendResponse(result);
    } catch (error) {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return true; // Keep message channel open for async responses
});
