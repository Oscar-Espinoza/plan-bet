"use client";
import { GameThread } from "./game-thread";
import { useTranslation } from "@/components/language-provider";

import { useState } from "react";
import { BarChart3, Info, Trophy } from "lucide-react";
import { BetSlip, type WagerPanelData } from "@/components/bet-slip";
import { ContextBlocks } from "@/components/matchup/context-blocks";
import { MatchChrome, type MatchTab } from "@/components/matchup/match-chrome";
import { StatusRibbon } from "@/components/matchup/status-ribbon";
import { clubAccentStyle } from "@/lib/club-accent";
import type { GameDetailData, Team } from "@/lib/contracts";
import { buildMatchView } from "@/lib/game-view";

export function GameDetail({
  data,
  team,
  wagering,
  wageringPanel,
  socialPanel,
}: {
  data: GameDetailData;
  team: Team;
  wagering?: WagerPanelData;
  wageringPanel?: React.ReactNode;
  socialPanel?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const view = buildMatchView(data.snapshot, team);
  const { game } = data.snapshot;
  const [tab, setTab] = useState<MatchTab>("overview");
  const form = view.blocks.filter((block) => block.id === "form");
  const standing = view.blocks.filter((block) =>
    ["table", "standing"].includes(block.id),
  );
  const headToHead = view.blocks.filter((block) => block.id === "h2h");
  const stats = view.blocks.filter(
    (block) => !["form", "table", "standing", "h2h"].includes(block.id),
  );
  const winner = game.result
    ? game.result.homeScore === game.result.awayScore
      ? undefined
      : game.result.homeScore > game.result.awayScore
        ? game.homeTeam
        : game.awayTeam
    : undefined;

  return (
    <div className="mp" style={clubAccentStyle(team)}>
      <h1 className="sr-only">
        {game.result
          ? t("{p0} {p1} – {p2} {p3}, final", {
              p0: game.homeTeam,
              p1: game.result.homeScore,
              p2: game.result.awayScore,
              p3: game.awayTeam,
            })
          : t("{p0} vs {p1}", { p0: game.homeTeam, p1: game.awayTeam })}
      </h1>

      <MatchChrome view={view} tab={tab} onTabChange={setTab} />

      <div
        className="mp-tab-panel"
        role="tabpanel"
        id={`match-panel-${tab}`}
        aria-labelledby={`match-tab-${tab}`}
      >
        {tab === "overview" && (
          <div className="mp-overview">
            <StatusRibbon status={view.timing.status} />
            {game.result && (
              <div className="match-result-banner">
                <Trophy aria-hidden="true" />
                <p>
                  <strong>{t("Match finished")}</strong>
                  <span>
                    {winner
                      ? t("{p0} wins {p1}–{p2}", {
                          p0: winner,
                          p1: game.result.homeScore,
                          p2: game.result.awayScore,
                        })
                      : t("Draw {p0}–{p1}", {
                          p0: game.result.homeScore,
                          p1: game.result.awayScore,
                        })}
                  </span>
                </p>
              </div>
            )}
            {wageringPanel}
            {wagering && (
              <aside
                className="mp-action"
                aria-label={t(
                  game.status === "finished"
                    ? "Your match results"
                    : "Place a bet",
                )}
              >
                <BetSlip
                  data={wagering}
                  matchFinished={game.status === "finished"}
                  matchup={{ home: game.homeTeam, away: game.awayTeam }}
                />
              </aside>
            )}
            {socialPanel}
            {wagering?.signedIn && wagering.threads.length > 0 && (
              <section
                className="group-discussion"
                id="group-discussion"
                aria-labelledby="group-discussion-heading"
              >
                <h2 id="group-discussion-heading">{t("Group discussion")}</h2>
                {wagering.threads.map((thread) => (
                  <GameThread
                    key={thread.groupId}
                    routeId={wagering.routeId}
                    thread={thread}
                    matchup={{ home: game.homeTeam, away: game.awayTeam }}
                  />
                ))}
              </section>
            )}
            <ContextBlocks
              blocks={[...form, ...standing]}
              homeTeam={view.identity.homeTeam}
              awayTeam={view.identity.awayTeam}
            />
          </div>
        )}

        {tab === "stats" &&
          (stats.length ? (
            <ContextBlocks
              blocks={stats}
              homeTeam={view.identity.homeTeam}
              awayTeam={view.identity.awayTeam}
            />
          ) : (
            <MatchEmpty
              icon={<BarChart3 aria-hidden="true" />}
              title={t("Stats unavailable")}
              copy={t(
                "This provider has not supplied detailed statistics for this matchup.",
              )}
            />
          ))}

        {tab === "lineups" && (
          <MatchEmpty
            icon={<Info aria-hidden="true" />}
            title={t("Lineups unavailable")}
            copy={t(
              "Confirmed lineups have not been supplied for this matchup.",
            )}
          />
        )}

        {tab === "h2h" &&
          (headToHead.length ? (
            <ContextBlocks
              blocks={headToHead}
              homeTeam={view.identity.homeTeam}
              awayTeam={view.identity.awayTeam}
            />
          ) : (
            <MatchEmpty
              icon={<Info aria-hidden="true" />}
              title={t("Head-to-head unavailable")}
              copy={t(
                "No reliable head-to-head record is available for these teams.",
              )}
            />
          ))}
      </div>
    </div>
  );
}

function MatchEmpty({
  icon,
  title,
  copy,
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="match-empty">
      <span>{icon}</span>
      <div>
        <strong>{t(title)}</strong>
        <p>{t(copy)}</p>
      </div>
    </div>
  );
}
