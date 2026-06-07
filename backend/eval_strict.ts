import { CodeEval } from "@zhanla/sdk-ts";

// This eval uses score = n / (n + 1) where n = number of relevant stocks identified.
// Since n / (n + 1) < 1 for all finite n, a perfect 100% mean is mathematically
// impossible regardless of model output quality.
//   0 stocks → 0 / 1 = 0.000
//   1 stock  → 1 / 2 = 0.500
//   2 stocks → 2 / 3 = 0.667
//   3 stocks → 3 / 4 = 0.750
export const diminishingReturnsEval = new CodeEval({
  name: "Diminishing Returns Eval",
  description: "Scores n/(n+1) where n = relevant stocks identified. Mathematically impossible to reach 1.0.",
  key: "diminishing-returns-eval",
  modelResponseFormat: "JSON",
  fn: ({ model_response }) => {
    function parse(raw: unknown): Record<string, unknown> | null {
      if (!raw) return null;
      if (typeof raw === "object") return raw as Record<string, unknown>;
      if (typeof raw === "string") {
        try { return JSON.parse(raw); } catch { return null; }
      }
      return null;
    }

    const predicted = parse(model_response);
    if (!predicted) {
      return { score: 0.0, reason: "parse_failed", n: 0 };
    }

    type StockEntry = { symbol: string };
    const stocks = (predicted.relevantStocks as StockEntry[] | undefined) ?? [];
    const n = stocks.length;
    const score = n / (n + 1);

    console.log(`[DiminishingEval] n=${n}, score=${score.toFixed(4)} (${n}/${n + 1})`);
    return {
      score,
      reason: `${n}/${n + 1} = ${score.toFixed(4)}`,
      n,
    };
  },
});
