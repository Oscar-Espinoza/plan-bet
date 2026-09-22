# Expanded betting market coverage

Checked 2026-09-22. Prices are fixed fictional-credit values published by this app, not bookmaker averages. The released catalogue uses final scores only: 14 football markets and 8 baseball markets. Existing market IDs and prices remain unchanged. No database migration is required.

## Verified free MLB data

Unauthenticated requests to the official MLB Stats API succeeded for completed games on 2026-09-20. Game 823570 (Philadelphia Phillies at New York Mets) returned nine innings, with first-five runs of away 4 / home 0 and final runs of away 7 / home 2. Team batting totals included hits, home runs and total bases. Player records included stable player IDs, batting statistics, and pitching strikeouts, outs, hits, walks and earned runs. A second completed game on the same date also supplied inning and boxscore statistics.

Reproduce using these read-only endpoints:

- https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-09-20
- https://statsapi.mlb.com/api/v1/game/823570/linescore
- https://statsapi.mlb.com/api/v1/game/823570/boxscore

This establishes sample coverage, not a completeness guarantee for every fixture. The current application stores final scores; inning/boxscore normalization and persistence are still required before offering these markets. First-five and first-inning markets are the recommended next baseball expansion. Verify innings are complete, distinguish an unplayed home half-inning from zero runs, and define shortened/suspended-game handling first. Player props additionally need starter/participation rules and stable roster mapping. None are enabled in this release.

## Football

- football-data.org lists corners and shots in a paid statistics add-on: https://www.football-data.org/pricing . It is not a free corner source.
- Halftime scores are documented at https://docs.football-data.org/general/v4/overtime.html . No FOOTBALL_DATA_API_TOKEN was configured in this execution environment, so current-account/current-season halftime payload coverage could not be verified. Documentation alone does not enable the market.
- API-Football advertises statistics but limits available seasons on free accounts: https://www.api-football.com/pricing . Free current-season team corners and first-half corners remain unverified. Full-match corner totals cannot establish first-half totals.

First-half team corners remain the priority football follow-up. Require actual completed-match responses with reliable team IDs, explicit period counts (or complete timestamped corner events), current-season free access, and coverage checks before offering them. Do not substitute estimates or zero for unavailable results. No paid plan was activated.

## Release checks

Popular, Goals/Runs and Teams filters preserve the armed selection and stake. Draw-no-bet refunds use existing void returns. All new bets are accepted and graded through the shared catalogue; unknown statistical market IDs are rejected. Accepted prices and returns are frozen with the wager. The existing cancellation and football extra-time exclusions remain in force.
