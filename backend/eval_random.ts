import { CodeEval } from "@zhanla/sdk-ts";

export const randomEval = new CodeEval({
  name: "Random Eval",
  description: "Generates a random score between 0.0 and 1.0.",
  key: "random-eval",
  modelResponseFormat: "JSON",
  fn: () => {
    const score = Math.random();
    console.log(`[RandomEval] score=${score.toFixed(4)}`);
    return {
      score,
      reason: `Randomly generated score: ${score.toFixed(4)}`,
    };
  },
});

