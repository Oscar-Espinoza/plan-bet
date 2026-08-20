"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  Circle,
  ClipboardList,
  ExternalLink,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { DemoStamp } from "@/components/demo-stamp";
import { TeamMark } from "@/components/team-mark";
import { Button } from "@/components/ui/button";
import { StatusTag } from "@/components/ui/status-tag";
import { filterWatchlist } from "@/lib/storage";
import { isLegacyBaseballGameId } from "@/lib/game-ids";
import { getTeam, teams } from "@/lib/seed";
import { useMatchdayStore } from "@/lib/store";
import type { Sport, TeamSlug } from "@/lib/contracts";

export function WatchlistPage() {
  const selectedSport = useMatchdayStore((state) => state.selectedSport);
  const selectedTeamSlug = useMatchdayStore((state) => state.selectedTeamSlug);
  const items = useMatchdayStore((state) => state.watchlistItems);
  const addItem = useMatchdayStore((state) => state.addWatchlistItem);
  const updateItem = useMatchdayStore((state) => state.updateWatchlistItem);
  const toggleItem = useMatchdayStore((state) => state.toggleWatchlistItem);
  const deleteItem = useMatchdayStore((state) => state.deleteWatchlistItem);
  const [text, setText] = useState("");
  const [sport, setSport] = useState<Sport | "all">("all");
  const [teamSlug, setTeamSlug] = useState<TeamSlug | "all">("all");
  const [status, setStatus] = useState<"open" | "completed" | "all">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [message, setMessage] = useState("");
  const currentTeam = getTeam(selectedTeamSlug)!;
  const filtered = useMemo(
    () => filterWatchlist(items, { sport, teamSlug, status }),
    [items, sport, teamSlug, status],
  );
  const filtersActive =
    sport !== "all" || teamSlug !== "all" || status !== "all";

  // Edit/delete buttons stay mounted across the inline edit UI, so restoring
  // focus after save or cancel just means re-focusing the button that opened
  // it. Delete removes the whole row, so focus instead moves to a surviving
  // neighbor (or the list heading once the list is empty), decided before
  // the item is removed and applied once the row is actually gone.
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const deleteButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pendingDeleteFocus = useRef<
    { kind: "item"; id: string } | { kind: "heading" } | null
  >(null);

  useEffect(() => {
    const pending = pendingDeleteFocus.current;
    if (!pending) return;
    pendingDeleteFocus.current = null;
    if (pending.kind === "heading") {
      headingRef.current?.focus();
      return;
    }
    (
      deleteButtonRefs.current.get(pending.id) ??
      editButtonRefs.current.get(pending.id)
    )?.focus();
  }, [filtered]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const id = addItem({
      sport: selectedSport,
      teamSlug: selectedTeamSlug,
      text,
    });
    if (!id) return;
    setText("");
    setMessage("Watchlist item added.");
  };

  const startEdit = (id: string, value: string) => {
    setEditingId(id);
    setEditText(value);
  };

  const saveEdit = (id: string) => {
    if (updateItem(id, editText)) setMessage("Watchlist item updated.");
    setEditingId(null);
    editButtonRefs.current.get(id)?.focus();
  };

  const cancelEdit = (id: string) => {
    setEditingId(null);
    editButtonRefs.current.get(id)?.focus();
  };

  const handleDelete = (id: string) => {
    const index = filtered.findIndex((item) => item.id === id);
    const neighborId = filtered[index + 1]?.id ?? filtered[index - 1]?.id;
    pendingDeleteFocus.current = neighborId
      ? { kind: "item", id: neighborId }
      : { kind: "heading" };
    deleteItem(id);
    setMessage("Watchlist item deleted.");
  };

  const clearFilters = () => {
    setSport("all");
    setTeamSlug("all");
    setStatus("all");
  };

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Personal prep queue</p>
          <h1 className="display-title">Watchlist</h1>
          <p className="page-description">
            Keep the checks you want to make before kickoff or first pitch.
            Everything here stays in this browser.
          </p>
        </div>
        <DemoStamp />
      </header>

      <section className="watch-create panel" aria-labelledby="create-heading">
        <div className="watch-create-team">
          <TeamMark team={currentTeam} />
          <div>
            <span className="fine-print">Adding for</span>
            <strong>{currentTeam.name}</strong>
          </div>
        </div>
        <form onSubmit={submit}>
          <div className="watch-input-wrap">
            <label className="sr-only" htmlFor="new-watch-item">
              New watchlist item
            </label>
            <input
              id="new-watch-item"
              className="field"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={500}
              placeholder="Add a preparation check…"
              required
            />
          </div>
          <Button type="submit">
            <Plus aria-hidden="true" size={16} /> Add item
          </Button>
        </form>
        <h2 className="sr-only" id="create-heading">
          Create a watchlist item
        </h2>
      </section>

      <section
        className="panel watchlist-section"
        aria-labelledby="watchlist-heading"
      >
        <div className="panel-header watchlist-header">
          <div>
            <p className="eyebrow">
              {filtered.length} shown · {items.length} total
            </p>
            <h2
              className="panel-title"
              id="watchlist-heading"
              ref={headingRef}
              tabIndex={-1}
            >
              Preparation items
            </h2>
          </div>
          <StatusTag
            tone={
              items.some((item) => item.status === "open")
                ? "warning"
                : "positive"
            }
          >
            {items.filter((item) => item.status === "open").length} open
          </StatusTag>
        </div>
        <div className="filter-bar">
          <label>
            <span>Sport</span>
            <select
              value={sport}
              onChange={(event) =>
                setSport(event.target.value as Sport | "all")
              }
            >
              <option value="all">All sports</option>
              <option value="soccer">Soccer</option>
              <option value="baseball">Baseball</option>
            </select>
          </label>
          <label>
            <span>Team</span>
            <select
              value={teamSlug}
              onChange={(event) =>
                setTeamSlug(event.target.value as TeamSlug | "all")
              }
            >
              <option value="all">All teams</option>
              {teams
                .filter((team) => sport === "all" || team.sport === sport)
                .map((team) => (
                  <option value={team.slug} key={team.slug}>
                    {team.shortName}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as "open" | "completed" | "all")
              }
            >
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X aria-hidden="true" size={14} /> Clear filters
            </Button>
          )}
        </div>
        {filtered.length ? (
          <div className="watchlist-items">
            {filtered.map((item) => {
              const team = getTeam(item.teamSlug)!;
              const editing = editingId === item.id;
              return (
                <article className="watch-item" key={item.id}>
                  <button
                    className="watch-toggle"
                    onClick={() => {
                      toggleItem(item.id);
                      setMessage(
                        item.status === "open"
                          ? "Watchlist item completed."
                          : "Watchlist item reopened.",
                      );
                    }}
                    aria-label={
                      item.status === "open"
                        ? `Complete ${item.text}`
                        : `Reopen ${item.text}`
                    }
                  >
                    {item.status === "completed" ? (
                      <Check aria-hidden="true" size={16} />
                    ) : (
                      <Circle aria-hidden="true" size={16} />
                    )}
                  </button>
                  <div className="watch-item-body">
                    <div className="watch-item-meta">
                      <TeamMark team={team} size="sm" />
                      <span>{team.shortName}</span>
                      <span>·</span>
                      <span>{item.sport}</span>
                      {item.gameLabel && (
                        <>
                          <span>·</span>
                          <span>{item.gameLabel}</span>
                        </>
                      )}
                    </div>
                    {editing ? (
                      <div className="watch-edit">
                        <label className="sr-only" htmlFor={`edit-${item.id}`}>
                          Edit watchlist item
                        </label>
                        <input
                          id={`edit-${item.id}`}
                          className="field"
                          value={editText}
                          onChange={(event) => setEditText(event.target.value)}
                          maxLength={500}
                          autoFocus
                        />
                        <Button size="sm" onClick={() => saveEdit(item.id)}>
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => cancelEdit(item.id)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <p
                        className={
                          item.status === "completed"
                            ? "watch-completed"
                            : undefined
                        }
                      >
                        {item.text}
                      </p>
                    )}
                    {item.gameId && (
                      <Link
                        className="watch-game-link"
                        href={`/games/${item.gameId}`}
                      >
                        {isLegacyBaseballGameId(item.gameId)
                          ? "Open archived demo"
                          : "Open matchup"}{" "}
                        <ExternalLink aria-hidden="true" size={12} />
                      </Link>
                    )}
                  </div>
                  <div className="watch-actions">
                    <Button
                      ref={(el) => {
                        if (el) editButtonRefs.current.set(item.id, el);
                        else editButtonRefs.current.delete(item.id);
                      }}
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${item.text}`}
                      onClick={() => startEdit(item.id, item.text)}
                    >
                      <Pencil aria-hidden="true" size={15} />
                    </Button>
                    <Button
                      ref={(el) => {
                        if (el) deleteButtonRefs.current.set(item.id, el);
                        else deleteButtonRefs.current.delete(item.id);
                      }}
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${item.text}`}
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 aria-hidden="true" size={15} />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <div>
              <span className="empty-icon">
                <ClipboardList aria-hidden="true" />
              </span>
              <h3 className="empty-title">
                {items.length
                  ? "No matching items"
                  : "Build your first prep list"}
              </h3>
              <p className="empty-copy">
                {items.length
                  ? "Adjust or clear the filters to see the rest of your watchlist."
                  : "Add a check above, or open a game to attach an item to a specific matchup."}
              </p>
              {filtersActive && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                  onClick={clearFilters}
                >
                  <RotateCcw aria-hidden="true" size={14} /> Show everything
                </Button>
              )}
            </div>
          </div>
        )}
      </section>
      <p className="sr-only" aria-live="polite">
        {message}
      </p>
    </>
  );
}
