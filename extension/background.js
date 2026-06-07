// Local in-memory cache to prevent duplicate LLM calls on popup reopen
// Format: url -> { watchlistString, analysisData }
const analysisCache = new Map();

// Listening to messages from the popup script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzeCurrentTab") {
    handleAnalyzeRequest(request.forceRefresh, sendResponse);
    return true; // Keep response channel open for asynchronous replies
  }
});

// Primary routine to orchestrate extraction and local API call
async function handleAnalyzeRequest(forceRefresh, sendResponse) {
  try {
    // 1. Get active tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.id || !activeTab.url) {
      sendResponse({ success: false, error: "No active browser tab detected." });
      return;
    }

    // Restrict extension on special chrome:// pages
    if (activeTab.url.startsWith("chrome://") || activeTab.url.startsWith("chrome-extension://")) {
      sendResponse({ success: false, error: "Cannot analyze internal browser pages. Please open a public financial news article." });
      return;
    }

    // 2. Fetch the user's watchlist from chrome.storage.local
    const storage = await chrome.storage.local.get(["watchlist"]);
    const watchlist = storage.watchlist || [];
    if (watchlist.length === 0) {
      sendResponse({ success: false, error: "Your watchlist is empty. Add ticker symbols in the popup first!" });
      return;
    }

    // 3. Check memory cache first
    const watchlistKey = JSON.stringify([...watchlist].sort());
    const cached = analysisCache.get(activeTab.url);
    if (!forceRefresh && cached && cached.watchlistString === watchlistKey) {
      console.log(`Cache hit for URL: ${activeTab.url}`);
      sendResponse({ success: true, data: cached.analysisData });
      return;
    }

    // 4. Request the content script (content.js) to extract article body
    chrome.tabs.sendMessage(
      activeTab.id,
      { action: "extractPageContent" },
      async (scrapeResult) => {
        // Handle case where content script is not injected yet or fails
        if (chrome.runtime.lastError || !scrapeResult || !scrapeResult.success) {
          console.warn("Content script scraping failed:", chrome.runtime.lastError);
          sendResponse({
            success: false,
            error: "Failed to read article content from this webpage. Please refresh the page and try again."
          });
          return;
        }

        const { newsText } = scrapeResult;

        // 5. Connect to local Express API server
        const backendUrl = "http://localhost:3000/api/analyze";
        console.log(`Sending news text to Express server at: ${backendUrl}`);

        try {
          const apiResponse = await fetch(backendUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              newsText,
              watchlist
            })
          });

          if (!apiResponse.ok) {
            const errBody = await apiResponse.json().catch(() => ({}));
            sendResponse({
              success: false,
              error: errBody.details || `Server responded with status: ${apiResponse.status}`
            });
            return;
          }

          const result = await apiResponse.json();
          if (result && result.success && result.data) {
            // Cache the successful analysis results against this URL and watchlist
            analysisCache.set(activeTab.url, {
              watchlistString: watchlistKey,
              analysisData: result.data
            });

            sendResponse({ success: true, data: result.data });
          } else {
            sendResponse({
              success: false,
              error: result.error || "Received invalid response from Express server."
            });
          }
        } catch (fetchError) {
          console.error("Failed to connect to local Express server:", fetchError);
          sendResponse({
            success: false,
            error: "Could not connect to the local analysis server. Please make sure your Express backend is running by executing: npm run dev"
          });
        }
      }
    );
  } catch (err) {
    console.error("General error in background service worker:", err);
    sendResponse({
      success: false,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
