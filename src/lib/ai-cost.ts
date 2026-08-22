// ponytail: prices as constants rather than configuration. Move them to env
// only if the model is switched often enough for the drift to matter.
const INPUT_PRICE_PER_MTOK_MICROS = 1_250_000;
const OUTPUT_PRICE_PER_MTOK_MICROS = 10_000_000;

export function estimateCostMicros(inputTokens = 0, outputTokens = 0) {
  return Math.round(
    (inputTokens * INPUT_PRICE_PER_MTOK_MICROS +
      outputTokens * OUTPUT_PRICE_PER_MTOK_MICROS) /
      1_000_000,
  );
}
