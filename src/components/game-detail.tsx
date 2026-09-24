"use client";
import { useTranslation } from "@/components/language-provider";

import { useState, type CSSProperties } from "react";
import { BarChart3, Info, Trophy } from "lucide-react";
import { ContextBlocks } from "@/components/matchup/context-blocks";
import { MatchChrome, type MatchTab } from "@/components/matchup/match-chrome";
import { StatusRibbon } from "@/components/matchup/status-ribbon";
import type { MatchView } from "@/lib/game-view";

/**
 * `view` is built on the server (`buildMatchView`), so the snapshot, its
 * sources and the badge catalog never reach the browser — only what renders.
 */
export function GameDetail({
  view,
  accent,
  wageringPanel,
  socialPanel,
}: {
  view: MatchView;
  accent?: CSSProperties;
  wageringPanel?: React.ReactNode;
  socialPanel?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const game = {
    homeTeam: view.identity.homeTeam,
    awayTeam: view.identity.awayTeam,
    result: view.timing.result,
  };
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
    <div className="mp" style={accent}>
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
            {socialPanel}
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
