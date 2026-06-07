import { GoogleGenAI } from "@google/genai";
import {
  Agent,
  LLMProcessor,
  Orchestration,
  Runner,
  Step,
  Tool,
  wrap,
} from "@zhanla/sdk-ts";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Ensure environment variables are loaded for both CLI execution and server execution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const googleApiKey =
  process.env.GOOGLE_API_KEY ||
  process.env.GEMINI_API_KEY ||
  "missing-google-api-key";

// Wrap the Google Gen AI client with Zhanla for observational trace logging
const google = wrap(new GoogleGenAI({ apiKey: googleApiKey }));

// Initialize the Zhanla runner using the wrapped client
export const runner = new Runner({ client: google });

// Define the model to use - Gemini 2.5 Flash is fast and excellent at structured JSON outputs
const MODEL_NAME = "gemini-2.5-flash";

// ---------------------------------------------------------------------------
// 1. Zhanla Tool: Stock Lookup Tool
// Combines watchlist symbols and extracted news symbols to fetch mock quote context.
// ---------------------------------------------------------------------------
export const stockLookupTool = new Tool({
  name: "stock_lookup",
  description: "Get real-time market metrics and business description for one or more stock tickers.",
  key: "stock-lookup",
  inputSchema: {
    type: "object",
    properties: {
      watchlist: {
        type: "array",
        items: { type: "string" }
      },
      extractedTickers: {
        type: "array",
        items: { type: "string" }
      }
    }
  },
  fn: (kwargs: unknown) => {
    const { watchlist, extractedTickers } = kwargs as { watchlist?: string[]; extractedTickers?: string[] };
    
    // Combine watchlist and extracted symbols to fetch quotes for all relevant tickers
    const allSymbols = new Set<string>();
    if (watchlist && Array.isArray(watchlist)) {
      watchlist.forEach(s => allSymbols.add(s.toUpperCase().trim()));
    }
    if (extractedTickers && Array.isArray(extractedTickers)) {
      extractedTickers.forEach(s => allSymbols.add(s.toUpperCase().trim()));
    }

    const symbols = Array.from(allSymbols);
    if (symbols.length === 0) {
      return { stocks: [] };
    }

    const mockData: Record<string, { name: string; price: number; changePercent: number; sector: string; description: string }> = {
      AAPL: {
        name: "Apple Inc.",
        price: 175.50,
        changePercent: 1.25,
        sector: "Technology",
        description: "Apple designs, manufactures and markets smartphones, personal computers, tablets, wearables and accessories."
      },
      TSLA: {
        name: "Tesla Inc.",
        price: 180.20,
        changePercent: -2.40,
        sector: "Automotive",
        description: "Tesla designs, develops, manufactures, sells and leases fully electric vehicles, energy generation and storage systems."
      },
      NVDA: {
        name: "NVIDIA Corp.",
        price: 875.12,
        changePercent: 4.82,
        sector: "Technology",
        description: "NVIDIA is a pioneer of GPU-accelerated computing. It focuses on products and platforms for gaming, professional visualization, data centers, and automotive markets."
      },
      MSFT: {
        name: "Microsoft Corp.",
        price: 420.55,
        changePercent: 0.85,
        sector: "Technology",
        description: "Microsoft is a technology company that develops, licenses, and supports software, services, devices, and solutions worldwide."
      },
      GOOGL: {
        name: "Alphabet Inc.",
        price: 150.10,
        changePercent: -0.50,
        sector: "Technology",
        description: "Alphabet is the parent company of Google, building products and services including Search, Maps, YouTube, and Cloud."
      },
      AMZN: {
        name: "Amazon.com Inc.",
        price: 178.45,
        changePercent: 1.10,
        sector: "Consumer Cyclical",
        description: "Amazon focuses on e-commerce, cloud computing, online advertising, digital streaming, and artificial intelligence."
      }
    };

    const results = symbols.map(symbol => {
      const sym = symbol.toUpperCase().trim();
      if (mockData[sym]) {
        return { symbol: sym, ...mockData[sym] };
      }
      // Generate deterministic but realistic-looking mock data for any other symbol
      const hash = sym.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const price = parseFloat((50 + (hash % 450) + Math.random()).toFixed(2));
      const changePercent = parseFloat(((hash % 10) - 5 + Math.random()).toFixed(2));
      return {
        symbol: sym,
        name: `${sym} Corp.`,
        price,
        changePercent,
        sector: "General Industry",
        description: `A publicly traded corporation active in the financial markets under the ticker symbol ${sym}.`
      };
    });

    return { stocks: results };
  },
  outputSchema: {
    type: "object",
    properties: {
      stocks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            name: { type: "string" },
            price: { type: "number" },
            changePercent: { type: "number" },
            sector: { type: "string" },
            description: { type: "string" }
          },
          required: ["symbol", "name", "price", "changePercent", "sector", "description"]
        }
      }
    },
    required: ["stocks"]
  }
});

// ---------------------------------------------------------------------------
// 2. Zhanla LLMProcessor: Stock Keywords Extractor
// Scans the news text and pulls out relevant stock ticker symbols.
// ---------------------------------------------------------------------------
export const stockKeywordsExtractor = new LLMProcessor({
  name: "Stock Keywords Extractor",
  description: "Extracts stock ticker symbols and company names mentioned in a news article.",
  key: "stock-keywords-extractor",
  instructions: [
    "Analyze the provided news article text and extract all stock ticker symbols (e.g., AAPL, TSLA, NVDA) or major company names mentioned.",
    "Convert all extracted companies into their corresponding standard US stock ticker symbols.",
    "Return exactly one JSON object with the key 'extractedTickers' which is an array of uppercase stock symbols.",
    "Do not include any other commentary, HTML, or markdown fences."
  ].join("\n\n"),
  model: MODEL_NAME,
  runner,
  outputSchema: {
    type: "object",
    properties: {
      extractedTickers: {
        type: "array",
        items: { type: "string" }
      }
    },
    required: ["extractedTickers"]
  }
});

// ---------------------------------------------------------------------------
// 3. Zhanla Agent: Stock Impact Agent
// Pure financial reasoner. Reads article text and stock quotes passed as input,
// and maps out specific impacts on watchlisted stocks.
// ---------------------------------------------------------------------------
export const stockImpactAgent = new Agent({
  name: "Stock Impact Agent",
  description: "Analyzes news articles and reasons about their potential impact on a watchlist of stocks.",
  key: "stock-impact-agent",
  instructions: [
    "You are a Senior Financial Analyst Agent.",
    "Your task is to analyze the provided news article and explain its potential financial impact on the user's watchlisted stocks.",
    "",
    "You are provided with the following inputs in the JSON payload:",
    "- `newsText`: The full text of the news article.",
    "- `watchlist`: An array of stock symbols the user is watching.",
    "- `stocks`: An array of real-time quotes, names, sectors, and descriptions for all relevant stock symbols.",
    "",
    "Follow these steps in your analysis:",
    "1. Review the `stocks` details provided to get full business context and market metrics for both watchlisted and news-relevant stocks.",
    "2. Determine if the news article has a direct or indirect relationship to any of the watchlisted stocks.",
    "3. For each relevant watchlisted stock, analyze:",
    "   a) Impact direction: Positive, Negative, or Neutral.",
    "   b) Confidence score: between 0.0 (no confidence) and 1.0 (high confidence).",
    "   c) Short-term analysis: How this news will affect the stock over the next 1-5 days.",
    "   d) Long-term analysis: How this news will affect the stock over the next 1-6 months.",
    "4. Assess the overall market sentiment described or caused by this news (Bullish, Bearish, or Neutral).",
    "5. Provide a clear, concise 2-sentence summary of the news article.",
    "",
    "Provide your response as a structured JSON object matching the output schema. Do not write any markdown fences or explanatory text outside the JSON.",
  ].join("\n\n"),
  model: MODEL_NAME,
  runner,
  outputSchema: {
    type: "object",
    properties: {
      relevantStocks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            impact: { type: "string", enum: ["Positive", "Negative", "Neutral"] },
            confidence: { type: "number" },
            shortTermAnalysis: { type: "string" },
            longTermAnalysis: { type: "string" }
          },
          required: ["symbol", "impact", "confidence", "shortTermAnalysis", "longTermAnalysis"]
        }
      },
      overallMarketSentiment: { type: "string", enum: ["Bullish", "Bearish", "Neutral"] },
      newsSummary: { type: "string" }
    },
    required: ["relevantStocks", "overallMarketSentiment", "newsSummary"]
  }
});

// ---------------------------------------------------------------------------
// 4. Zhanla Orchestration: News Impact Pipeline
// Connects extractTickers, lookupStocks, and analyzeImpact in a structured DAG.
// ---------------------------------------------------------------------------
export const newsImpactPipeline = new Orchestration({
  name: "News Impact Pipeline",
  description: "Stock news extraction and impact assessment workflow. Extracts tickers, fetches market data, and runs financial reasoning.",
  key: "news-impact-pipeline",
  steps: [
    new Step({
      name: "extractTickers",
      component: stockKeywordsExtractor,
      next: ["lookupStocks"]
    }),
    new Step({
      name: "lookupStocks",
      component: stockLookupTool,
      next: ["analyzeImpact"]
    }),
    new Step({
      name: "analyzeImpact",
      component: stockImpactAgent,
      next: []
    })
  ]
});
