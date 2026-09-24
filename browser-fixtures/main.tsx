import { GroupActivity, GroupStandings } from "@/components/group-activity";
import { GroupTabs } from "@/components/group-tabs";
import { GroupList } from "@/components/group-list";
import { Card } from "@/components/ui/card";
import {
  LanguageProvider,
  useTranslation,
} from "@/components/language-provider";
import { parseLocale } from "@/lib/locale";
import { ResetBankroll } from "@/components/reset-bankroll";
import { CreateGroupForm } from "@/components/create-group-form";
import { InviteMemberForm } from "@/components/invite-member-form";
import { StrictMode, useSyncExternalStore } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { AppShell } from "@/components/app-shell";
import { GameDetail } from "@/components/game-detail";
import { BetSlip, type WagerPanelData } from "@/components/bet-slip";
import { Slate, type SportFilter } from "@/components/slate";
import { BetsHistory } from "@/components/bets-history";
import { getSnapshot, getTeam } from "@/lib/seed";
import { buildMatchView } from "@/lib/game-view";
import { marketsFor } from "@/lib/markets";
import { CLOSED_COPY, type WagerClosedReason } from "@/lib/wager-copy";
import { board, emptyBoard, history, wager } from "./data";
import { useLocation } from "./navigation";
import Link from "./link";
// The Next app loads these through next/font (src/app/fonts.ts); Vite
// can't, so the fixture app imports the same fontsource faces and maps the
// variables fonts.ts would set.
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/dm-mono/400.css";
import "@fontsource/dm-mono/500.css";
import "./fonts.css";
import "@/app/globals.css";
import "@/app/games/[id]/matchup.css";

function Fixture() {
  const { t } = useTranslation();
  const location = useLocation();
  const [pathname, query] = location.split("?");
  const params = new URLSearchParams(query);
  const routeId = pathname?.split("/")[2] ?? "soc-rma-01";
  const baseSnapshot = getSnapshot(routeId) ?? getSnapshot("soc-rma-01")!;
  const scenario = params.get("state");
  const snapshot = { ...baseSnapshot, game: { ...baseSnapshot.game } };
  if (
    scenario === "live" ||
    scenario === "finished" ||
    scenario === "postponed" ||
    scenario === "cancelled"
  )
    snapshot.game.status = scenario;
  if (scenario === "finished")
    snapshot.game.result = {
      homeScore: 2,
      awayScore: 1,
      source: "demo",
      observedAt: "2026-09-15T12:00:00.000Z",
    };
  const state =
    scenario === "unavailable"
      ? { kind: "unavailable" as const }
      : scenario && scenario in CLOSED_COPY
        ? { kind: "closed" as const, reason: scenario as WagerClosedReason }
        : {
            kind: "open" as const,
            markets: marketsFor(snapshot.game.sport),
            balance: Number(params.get("balance") ?? 1000),
            groups: [{ id: "group-1", name: "Sunday League" }],
            byMarket: [],
          };
  const wagering: WagerPanelData =
    scenario === "signed-out"
      ? { signedIn: false, routeId }
      : {
          signedIn: true,
          routeId,
          state,
          wagers: scenario === "finished" ? [history[0]!] : [],
          groupPicks: [],
          threads: params.has("discussion")
            ? [
                {
                  groupId: "group-1",
                  groupName: "Sunday League",
                  comments: params.has("populated")
                    ? [
                        {
                          id: "11111111-1111-4111-8111-111111111111",
                          groupId: "group-1",
                          userId: "user-1",
                          authorName: "Oscar Espinoza",
                          authorSelectionLabel: "Home",
                          phase: "before",
                          body: "Real Madrid tiene un buen equipo.\nCreo que hoy van a ganar por dos goles.",
                          createdAt: "2026-09-21T15:30:00.000Z",
                          shameVotes: 0,
                          slanderVotes: 2,
                          viewerVoted: [],
                        },
                        {
                          id: "22222222-2222-4222-8222-222222222222",
                          parentCommentId:
                            "11111111-1111-4111-8111-111111111111",
                          groupId: "group-1",
                          userId: "user-2",
                          authorName: "Ana Martínez",
                          authorSelectionLabel: "Away",
                          phase: "after",
                          body: "Buen partido. La segunda mitad cambió todo y el resultado fue merecido.",
                          createdAt: "2026-09-21T20:30:00.000Z",
                          shameVotes: 1,
                          slanderVotes: 0,
                          viewerVoted: [],
                        },
                        {
                          id: "33333333-3333-4333-8333-333333333333",
                          groupId: "group-1",
                          userId: "user-3",
                          authorName: "Diego Fernández de la Cruz",
                          authorSelectionLabel: "Away",
                          phase: "before",
                          body: "Vamos Real Sociedad. Espero un partido muy parejo.",
                          createdAt: "2026-09-21T16:00:00.000Z",
                          shameVotes: 0,
                          slanderVotes: 0,
                          viewerVoted: [],
                        },
                      ]
                    : [],
                  hasCommented: false,
                  postingPhase:
                    scenario === "finished"
                      ? "after"
                      : scenario === "live"
                        ? null
                        : "before",
                  viewerSelectionLabel: "Home",
                  pins: {},
                },
              ]
            : [],
        };
  const sport = (params.get("sport") ?? "all") as SportFilter;
  const data = params.has("empty") ? emptyBoard : board;
  return (
    <AppShell
      accountControl={
        <Link
          className="account-standing"
          href="/you"
          aria-label="Balance 1000 credits, record 14 won 15 lost"
        >
          <span>
            1,000 <small>CR</small>
          </span>
          <small>
            {params.has("long")
              ? "14–15 · 123 open wagers with a very long account description"
              : "14–15"}
          </small>
        </Link>
      }
    >
      {pathname === "/" ? (
        <Slate data={data} sport={sport} tz="America/Argentina/Buenos_Aires" />
      ) : pathname === "/you" ? (
        <>
          <h1>{t("Where you stand")}</h1>
          <ResetBankroll />
          <BetsHistory
            items={history}
            emptyState={{ title: "No wagers", copy: "" }}
          />
        </>
      ) : pathname === "/groups" ? (
        <>
          <header className="page-heading">
            <div>
              <p className="eyebrow">{t("Group wagers")}</p>
              <h1 className="display-title">{t("Groups")}</h1>
            </div>
            <Link className="button button-primary" href="/groups/new">
              {t("New group")}
            </Link>
          </header>
          <GroupList
            groups={[
              { id: "1", slug: "test", name: "Sunday League", role: "owner" },
              {
                id: "2",
                slug: "test",
                name: "Amigos del fútbol y del béisbol de Buenos Aires",
                role: "member",
              },
            ]}
          />
        </>
      ) : pathname === "/groups/new" ? (
        <Card title={t("Create a group")} titleId="new-group-heading">
          <CreateGroupForm />
        </Card>
      ) : pathname === "/groups/test" ? (
        <div className="group-detail">
          <header className="page-heading">
            <div>
              <p className="eyebrow">{t("Group wagers")}</p>
              <h1 className="display-title">Sunday League</h1>
            </div>
          </header>
          <GroupTabs
            overview={
              <div className="group-overview">
                <GroupActivity
                  viewerId="one"
                  members={[
                    { userId: "one", name: "Oscar Espinoza" },
                    { userId: "two", name: "Oscar Espinoza" },
                  ]}
                  matches={
                    params.has("empty")
                      ? []
                      : [
                          {
                            canonicalGameId: "football-data-1",
                            latestActivity: wager.placedAt,
                            game: params.has("missing")
                              ? undefined
                              : {
                                  ...snapshot.game,
                                  homeTeam: "Real Sociedad de Fútbol",
                                  awayTeam: "Real Madrid CF",
                                },
                            bets: [...history, wager].map((bet, i) => ({
                              wager: { ...bet, id: `bet-${i}` },
                              userId: i % 2 ? "two" : "one",
                            })),
                          },
                        ]
                  }
                />
                <GroupStandings
                  viewerId="one"
                  entries={[
                    {
                      userId: "one",
                      name: "Oscar Espinoza",
                      won: 1,
                      lost: 0,
                      voided: 0,
                      wagerCount: 1,
                      netReturn: 280,
                    },
                    {
                      userId: "two",
                      name: "Oscar Espinoza",
                      won: 0,
                      lost: 0,
                      voided: 0,
                      wagerCount: 0,
                      netReturn: 0,
                    },
                  ]}
                />
              </div>
            }
            members={
              <Card title={t("Members")} titleId="members-heading">
                <div className="stat-row">
                  <span>Oscar</span>
                  <span>{t("owner")}</span>
                </div>
                <InviteMemberForm slug="test" />
              </Card>
            }
          />
        </div>
      ) : pathname?.startsWith("/games/") ? (
        <GameDetail
          key={location}
          view={buildMatchView(snapshot, getTeam(snapshot.game.teamSlug)!)}
          wageringPanel={
            wagering && (
              <aside className="mp-action" aria-label={t("Place a bet")}>
                <BetSlip
                  data={wagering}
                  matchFinished={snapshot.game.status === "finished"}
                  matchup={{
                    home: snapshot.game.homeTeam,
                    away: snapshot.game.awayTeam,
                  }}
                />
              </aside>
            )
          }
        />
      ) : (
        <h1>{t("Sign in")}</h1>
      )}
    </AppShell>
  );
}
function FixtureLanguage() {
  const locale = useSyncExternalStore(
    (listener) => {
      window.addEventListener("fixture-refresh", listener);
      return () => window.removeEventListener("fixture-refresh", listener);
    },
    () =>
      parseLocale(
        document.cookie
          .split("; ")
          .find((value) => value.startsWith("locale="))
          ?.split("=")[1],
      ),
    () =>
      parseLocale(
        document.cookie
          .split("; ")
          .find((value) => value.startsWith("locale="))
          ?.split("=")[1],
      ),
  );
  return (
    <LanguageProvider locale={locale}>
      <Fixture />
    </LanguageProvider>
  );
}
const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <FixtureLanguage />
  </StrictMode>
);
if (new URLSearchParams(window.location.search).has("hydrate")) {
  root.innerHTML = renderToString(app);
  hydrateRoot(root, app);
} else createRoot(root).render(app);
