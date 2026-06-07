import { CodeEval } from "@zhanla/sdk-ts";

type RelevantStock = {
  symbol: string;
  impact: "Positive" | "Negative" | "Neutral";
};

type ExpectedStructure = {
  relevantStocks: RelevantStock[];
  overallMarketSentiment: "Bullish" | "Bearish" | "Neutral";
};

function parsePayload(raw: unknown): ExpectedStructure | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as ExpectedStructure;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as ExpectedStructure;
    } catch {
      return null;
    }
  }
  return null;
}

export const stockImpactEval = new CodeEval({
  name: "Stock Impact Pipeline Eval",
  description: "Measures pipeline accuracy across stock symbol extraction, sentiment impact matching, and overall market sentiment categorization.",
  key: "stock-impact-eval",
  modelResponseFormat: "JSON",
  fn: ({ model_response, expected_output }: { model_response?: unknown; expected_output?: unknown }) => {
    const predicted = parsePayload(model_response);
    const expected = parsePayload(expected_output);

    if (!predicted || !expected) {
      console.log("Evaluation failed: Invalid predicted or expected response format.");
      return { score: 0.0, reason: "Invalid payload format" };
    }

    const predStocks = predicted.relevantStocks || [];
    const expStocks = expected.relevantStocks || [];

    const predSymbols = new Set(predStocks.map(s => s.symbol.toUpperCase()));
    const expSymbols = new Set(expStocks.map(s => s.symbol.toUpperCase()));

    // 1. Stock Relevance Score (40% weight)
    // Measures how accurately the relevant stock symbols were identified (Intersection / Union)
    let relevanceScore = 1.0;
    if (predSymbols.size > 0 || expSymbols.size > 0) {
      const intersection = new Set([...predSymbols].filter(x => expSymbols.has(x)));
      const union = new Set([...predSymbols, ...expSymbols]);
      relevanceScore = intersection.size / union.size;
    }

    // 2. Sentiment Direction Score (40% weight)
    // Measures if the correct sentiment impact (Positive/Negative/Neutral) was mapped for correctly identified stocks
    let sentimentScore = 1.0;
    const commonSymbols = [...predSymbols].filter(x => expSymbols.has(x));
    if (commonSymbols.length > 0) {
      let matchingSentiments = 0;
      for (const symbol of commonSymbols) {
        const predImpact = predStocks.find(s => s.symbol.toUpperCase() === symbol)?.impact;
        const expImpact = expStocks.find(s => s.symbol.toUpperCase() === symbol)?.impact;
        if (predImpact === expImpact) {
          matchingSentiments++;
        }
      }
      sentimentScore = matchingSentiments / commonSymbols.length;
    } else if (expStocks.length > 0) {
      // If we failed to extract any correct stock symbols, sentiment score is 0
      sentimentScore = 0.0;
    }

    // 3. Overall Market Sentiment Score (20% weight)
    // Measures if the broader market mood was captured correctly (Bullish/Bearish/Neutral)
    const predMarket = predicted.overallMarketSentiment;
    const expMarket = expected.overallMarketSentiment;
    const marketScore = predMarket === expMarket ? 1.0 : 0.0;

    // Calculate final weighted score
    const finalScore = (relevanceScore * 0.4) + (sentimentScore * 0.4) + (marketScore * 0.2);

    console.log(`[Eval] Relevance: ${relevanceScore.toFixed(2)}, Sentiment: ${sentimentScore.toFixed(2)}, Market: ${marketScore.toFixed(2)} | Final: ${finalScore.toFixed(2)}`);

    return {
      score: finalScore,
      details: {
        relevanceScore,
        sentimentScore,
        marketScore,
        matchedSymbols: commonSymbols,
        extractedSymbols: Array.from(predSymbols),
        expectedSymbols: Array.from(expSymbols)
      }
    };
  }
});
