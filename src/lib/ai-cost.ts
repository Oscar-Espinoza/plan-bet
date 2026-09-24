// ponytail: prices as constants rather than configuration. Add a row when the
// model changes; an unknown model logs no estimate rather than a wrong one.
// Micros of a dollar per million tokens, standard short-context rates.
const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-6-luna": { input: 100_000, output: 500_000 },
  "gpt-5.6-luna": { input: 200_000, output: 1_200_000 },
};

export function estimateCostMicros(
  model: string,
  inputTokens = 0,
  outputTokens = 0,
) {
  // The response echoes a dated snapshot id ("gpt-6-luna-2026-09-22").
  const price = Object.entries(PRICES).find(([id]) => model.startsWith(id));
  if (!price) return undefined;
  return Math.round(
    (inputTokens * price[1].input + outputTokens * price[1].output) / 1_000_000,
  );
}
