"use client";

import { useState } from "react";
import {
  GROUP_PLACEMENT_POINTS,
  MATCH_POINTS,
  TOURNAMENT_PICK_POINTS
} from "@/lib/config";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";

const scoringRows = [
  {
    label: "Correct outcome",
    detail: "Home win, draw, or away win",
    points: MATCH_POINTS.outcome
  },
  {
    label: "Correct home score",
    detail: "Home team's 90-minute goals exactly right",
    points: MATCH_POINTS.homeGoals
  },
  {
    label: "Correct away score",
    detail: "Away team's 90-minute goals exactly right",
    points: MATCH_POINTS.awayGoals
  },
  {
    label: "Exact score bonus",
    detail: "Both team scores exactly right",
    points: MATCH_POINTS.exactScore
  }
];

const tabs = [
  { id: "dynamic", label: "Dynamic" },
  { id: "classic", label: "Classic" }
] as const;

type TabId = (typeof tabs)[number]["id"];

export function PointSystemTabs({ maxMatchPoints }: { maxMatchPoints: number }) {
  const [activeTab, setActiveTab] = useState<TabId>("dynamic");

  return (
    <div>
      <div
        role="tablist"
        aria-label="League type point system"
        className="mb-4 grid grid-cols-2 rounded-md border border-[--color-border] bg-[--color-surface-2] p-1"
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "h-8 rounded-[6px] border text-sm font-medium transition-colors",
                active
                  ? "border-[--color-accent]/60 bg-[--color-accent-soft] text-[--color-accent] shadow-[0_0_0_1px_rgba(198,242,78,0.24)]"
                  : "border-transparent text-[--color-muted] hover:border-[--color-border-strong] hover:text-[--color-text]"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-lg border border-[--color-border]">
        {scoringRows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[1fr_auto] gap-4 border-b border-[--color-border] px-4 py-3 last:border-b-0"
          >
            <div>
              <p className="font-medium text-[--color-text]">{row.label}</p>
              <p className="text-xs text-[--color-faint]">{row.detail}</p>
            </div>
            <Badge tone="muted">{row.points} pts</Badge>
          </div>
        ))}
      </div>

      {activeTab === "dynamic" ? (
        <div className="mt-3 space-y-3">
          <p>
            Dynamic leagues score each match from your latest saved prediction before
            that match locks.
          </p>
          <p>
            Exact score gives {maxMatchPoints} total points: outcome, both team scores,
            and the exact-score bonus.
          </p>
          <p>
            Correct tournament winner gives {TOURNAMENT_PICK_POINTS} points. Correct top
            scorer gives {TOURNAMENT_PICK_POINTS} points, and all tied top scorers count.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p>
            Classic leagues use frozen group-stage predictions, locked before the first
            tournament kickoff. Knockout matches still score match by match.
          </p>
          <p>
            Exact score gives {maxMatchPoints} total points: outcome, both team scores,
            and the exact-score bonus.
          </p>
          <p>
            Classic leagues also give {GROUP_PLACEMENT_POINTS} point per team placed in
            the correct final group position by your frozen group-stage predictions.
          </p>
          <p>
            Correct tournament winner gives {TOURNAMENT_PICK_POINTS} points. Correct top
            scorer gives {TOURNAMENT_PICK_POINTS} points, and all tied top scorers count.
          </p>
        </div>
      )}
    </div>
  );
}
