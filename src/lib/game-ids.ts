export function isLegacyBaseballGameId(gameId: string) {
  return /^mlb-(nyy|bos)-\d{2}$/.test(gameId);
}
