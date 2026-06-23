"use client";

import { useRef, useState, type PointerEvent } from "react";
import { EmptyState } from "@/components/ui/section";

type Player = {
  id: string;
  username: string;
};

type ProgressEvent = {
  details: Array<{
    label: string;
    points: Record<string, number>;
  }>;
  id: string;
  label: string;
  scores: Record<string, number>;
};

type ScoreProgressChartProps = {
  events: ProgressEvent[];
  players: Player[];
};

type TooltipState = {
  event: ProgressEvent;
  player: Player;
  x: number;
  y: number;
};

const COLORS = [
  "#c6f24e",
  "#60a5fa",
  "#f5c451",
  "#f472b6",
  "#34d399",
  "#fb7185",
  "#a78bfa",
  "#22d3ee",
  "#f97316",
  "#e5e7eb"
];

const WIDTH = 920;
const HEIGHT = 300;
const PADDING = { bottom: 34, left: 42, right: 18, top: 18 };

export function ScoreProgressChart({ events, players }: ScoreProgressChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  if (players.length === 0 || events.length <= 1) {
    return <EmptyState>No finished matches to chart yet.</EmptyState>;
  }

  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const maxScore = Math.max(
    1,
    ...events.flatMap((event) => players.map((player) => event.scores[player.id] ?? 0))
  );
  const yStep = Math.max(1, Math.ceil(maxScore / 4));
  const yMax = Math.max(yStep * 4, maxScore);
  const yTicks = Array.from({ length: 5 }, (_, index) => index * yStep);

  function xFor(index: number) {
    if (events.length === 1) return PADDING.left;
    return PADDING.left + (index / (events.length - 1)) * chartWidth;
  }

  function yFor(score: number) {
    return PADDING.top + (1 - score / yMax) * chartHeight;
  }

  function showTooltip(
    pointerEvent: PointerEvent<SVGCircleElement>,
    player: Player,
    event: ProgressEvent
  ) {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setTooltip({
      event,
      player,
      x: pointerEvent.clientX - bounds.left + 12,
      y: pointerEvent.clientY - bounds.top + 12
    });
  }

  return (
    <div ref={containerRef} className="relative space-y-4">
      <div className="overflow-x-auto">
        <svg
          aria-label="League score progress"
          className="min-w-[760px]"
          role="img"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        >
          <rect
            x={PADDING.left}
            y={PADDING.top}
            width={chartWidth}
            height={chartHeight}
            fill="transparent"
          />
          {yTicks.map((tick) => {
            const y = yFor(tick);
            return (
              <g key={tick}>
                <line
                  x1={PADDING.left}
                  x2={WIDTH - PADDING.right}
                  y1={y}
                  y2={y}
                  stroke="var(--color-border)"
                  strokeWidth="1"
                />
                <text
                  x={PADDING.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-[--color-faint] text-[10px]"
                >
                  {tick}
                </text>
              </g>
            );
          })}
          {players.map((player, playerIndex) => {
            const points = events
              .map((event, eventIndex) => {
                const x = xFor(eventIndex);
                const y = yFor(event.scores[player.id] ?? 0);
                return `${x.toFixed(2)},${y.toFixed(2)}`;
              })
              .join(" ");
            const color = COLORS[playerIndex % COLORS.length];

            return (
              <polyline
                key={player.id}
                fill="none"
                points={points}
                stroke={color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {players.map((player, playerIndex) => {
            const color = COLORS[playerIndex % COLORS.length];
            return events.map((event, eventIndex) => (
              <circle
                key={`${player.id}-${event.id}`}
                cx={xFor(eventIndex)}
                cy={yFor(event.scores[player.id] ?? 0)}
                fill={color}
                r="3"
                onPointerEnter={(pointerEvent) =>
                  showTooltip(pointerEvent, player, event)
                }
                onPointerMove={(pointerEvent) =>
                  showTooltip(pointerEvent, player, event)
                }
                onPointerLeave={() => setTooltip(null)}
              >
                <title>{tooltipText(player, event)}</title>
              </circle>
            ));
          })}
          {events.map((event, index) => {
            if (events.length > 10 && index % Math.ceil(events.length / 8) !== 0) {
              return null;
            }
            return (
              <text
                key={event.id}
                x={xFor(index)}
                y={HEIGHT - 10}
                textAnchor="middle"
                className="fill-[--color-faint] text-[10px]"
              >
                {event.label}
              </text>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {players.map((player, index) => (
          <div key={player.id} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span className="text-[--color-muted]">@{player.username}</span>
          </div>
        ))}
      </div>

      {tooltip ? (
        <div
          className="pointer-events-none absolute z-20 max-w-[280px] rounded-md border border-[--color-border] bg-[--color-surface-3] px-3 py-2 text-xs shadow-xl"
          style={{
            left: tooltip.x,
            top: tooltip.y
          }}
        >
          <p className="font-medium text-[--color-text]">
            @{tooltip.player.username} · {tooltip.event.scores[tooltip.player.id] ?? 0}{" "}
            total
          </p>
          <div className="mt-1 space-y-1 text-[--color-muted]">
            {tooltip.event.details.length > 0 ? (
              tooltip.event.details.map((detail) => {
                const points = detail.points[tooltip.player.id] ?? 0;
                return (
                  <p key={detail.label} className="flex justify-between gap-3">
                    <span>{detail.label}</span>
                    <span className="font-mono text-[--color-text]">
                      {points > 0 ? `+${points}` : points}
                    </span>
                  </p>
                );
              })
            ) : (
              <p>{tooltip.event.label}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function tooltipText(player: Player, event: ProgressEvent) {
  const total = event.scores[player.id] ?? 0;
  const lines = [`@${player.username}: ${total} total after ${event.label}`];

  for (const detail of event.details) {
    const points = detail.points[player.id] ?? 0;
    lines.push(`${detail.label}: ${points > 0 ? `+${points}` : points} pts`);
  }

  return lines.join("\n");
}
