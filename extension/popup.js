// Default stock watchlist if none is set
const DEFAULT_WATCHLIST = ["AAPL", "TSLA", "NVDA"];

// DOM elements
const watchlistInput = document.getElementById("watchlist-input");
const addBtn = document.getElementById("add-btn");
const chipsContainer = document.getElementById("watchlist-chips");
const emptyState = document.getElementById("empty-state");
const loadingState = document.getElementById("loading-state");
const resultsContent = document.getElementById("results-content");
const marketSentiment = document.getElementById("market-sentiment");
const newsSummary = document.getElementById("news-summary");
const stockImpactList = document.getElementById("stock-impact-list");
const analyzePageBtn = document.getElementById("analyze-page-btn");

let watchlist = [];

// Initialize popup
document.addEventListener("DOMContentLoaded", () => {
  // Load watchlist from chrome.storage.local
  chrome.storage.local.get(["watchlist"], (result) => {
    if (result.watchlist && Array.isArray(result.watchlist)) {
      watchlist = result.watchlist;
    } else {
      watchlist = [...DEFAULT_WATCHLIST];
      chrome.storage.local.set({ watchlist });
    }
    renderChips();
    triggerAnalysis();
  });

  // Add stock event listeners
  addBtn.addEventListener("click", addStock);
  watchlistInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addStock();
  });

  // Force re-analyze button
  analyzePageBtn.addEventListener("click", () => {
    triggerAnalysis(true);
  });
});

// Render stock watchlist chips
function renderChips() {
  chipsContainer.innerHTML = "";
  watchlist.forEach((symbol) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `
      <span>${symbol}</span>
      <span class="chip-remove" data-symbol="${symbol}">&times;</span>
    `;

    // Remove chip handler
    chip.querySelector(".chip-remove").addEventListener("click", (e) => {
      const symToRemove = e.target.getAttribute("data-symbol");
      removeStock(symToRemove);
    });

    chipsContainer.appendChild(chip);
  });
}

// Add stock symbol to watchlist
function addStock() {
  const rawSymbol = watchlistInput.value.trim().toUpperCase();
  if (!rawSymbol) return;

  // Ticker symbol validation (1-6 alphanumeric characters)
  if (!/^[A-Z0-9]{1,6}$/.test(rawSymbol)) {
    alert("Please enter a valid stock symbol (1-6 alphanumeric characters).");
    return;
  }

  if (watchlist.includes(rawSymbol)) {
    watchlistInput.value = "";
    return;
  }

  watchlist.push(rawSymbol);
  chrome.storage.local.set({ watchlist }, () => {
    watchlistInput.value = "";
    renderChips();
    triggerAnalysis(true); // Trigger re-analysis with the new watchlist
  });
}

// Remove stock symbol from watchlist
function removeStock(symbol) {
  watchlist = watchlist.filter((s) => s !== symbol);
  chrome.storage.local.set({ watchlist }, () => {
    renderChips();
    triggerAnalysis(true); // Trigger re-analysis with the updated watchlist
  });
}

// Trigger LLM stock impact analysis via background worker
function triggerAnalysis(forceRefresh = false) {
  if (watchlist.length === 0) {
    showEmptyState("Your stock watchlist is currently empty. Add a symbol (e.g. AAPL) to start analyzing news!");
    return;
  }

  showLoadingState();

  // Send message to the background service worker
  chrome.runtime.sendMessage(
    { action: "analyzeCurrentTab", forceRefresh },
    (response) => {
      // Handle response errors
      if (chrome.runtime.lastError) {
        showEmptyState("Could not connect to service worker. Please refresh the page and try again.");
        console.error(chrome.runtime.lastError);
        return;
      }

      if (!response || !response.success) {
        const errorMsg = response?.error || "Ensure your local Express backend is running on port 3000.";
        showEmptyState(`Could not analyze page. <br><small style="opacity: 0.8">${errorMsg}</small>`);
        return;
      }

      renderAnalysisResult(response.data);
    }
  );
}

// Show empty state
function showEmptyState(message) {
  emptyState.style.display = "flex";
  if (message) {
    emptyState.querySelector(".empty-text").innerHTML = message;
  }
  loadingState.style.display = "none";
  resultsContent.style.display = "none";
}

// Show loading spinner
function showLoadingState() {
  emptyState.style.display = "none";
  loadingState.style.display = "flex";
  resultsContent.style.display = "none";
}

// Render dynamic results from the backend
function renderAnalysisResult(analysis) {
  emptyState.style.display = "none";
  loadingState.style.display = "none";
  resultsContent.style.display = "block";

  // 1. Overall sentiment badge
  const sentiment = analysis.overallMarketSentiment || "Neutral";
  marketSentiment.textContent = sentiment;
  
  // Reset classes
  marketSentiment.className = "sentiment-badge";
  if (sentiment === "Bullish") {
    marketSentiment.classList.add("badge-positive");
  } else if (sentiment === "Bearish") {
    marketSentiment.classList.add("badge-negative");
  } else {
    marketSentiment.classList.add("badge-neutral");
  }

  // 2. News summary
  newsSummary.textContent = analysis.newsSummary || "No summary provided by agent.";

  // 3. Relevant Stocks Accordions
  stockImpactList.innerHTML = "";
  const stocks = analysis.relevantStocks || [];

  if (stocks.length === 0) {
    const noImpactMsg = document.createElement("div");
    noImpactMsg.style.textAlign = "center";
    noImpactMsg.style.fontSize = "12px";
    noImpactMsg.style.color = "var(--text-secondary)";
    noImpactMsg.style.padding = "10px";
    noImpactMsg.textContent = "None of your watchlisted stocks are affected by this news article.";
    stockImpactList.appendChild(noImpactMsg);
    return;
  }

  stocks.forEach((stock) => {
    const card = document.createElement("div");
    card.className = "stock-card";

    let badgeClass = "badge-neutral";
    if (stock.impact === "Positive") badgeClass = "badge-positive";
    if (stock.impact === "Negative") badgeClass = "badge-negative";

    card.innerHTML = `
      <div class="stock-card-header">
        <div class="stock-symbol-container">
          <span class="stock-symbol">${stock.symbol}</span>
          <span class="stock-confidence">(${(stock.confidence * 100).toFixed(0)}% confidence)</span>
        </div>
        <span class="sentiment-badge ${badgeClass}" style="font-size: 10px; padding: 2px 6px;">${stock.impact}</span>
      </div>
      <div class="analysis-block">
        <div class="analysis-label">Short-Term Impact (1-5 Days)</div>
        <div class="analysis-desc">${stock.shortTermAnalysis}</div>
        <div class="analysis-label">Long-Term Outlook (1-6 Months)</div>
        <div class="analysis-desc">${stock.longTermAnalysis}</div>
      </div>
    `;

    stockImpactList.appendChild(card);
  });
}
