import { EmptyState } from "@/components/ui/section";

type Player = {
  id: string;
  username: string;
};

type ProgressEvent = {
  id: string;
  label: string;
  scores: Record<string, number>;
};

type ScoreProgressChartProps = {
  events: ProgressEvent[];
  players: Player[];
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
  if (players.length === 0 || events.length <= 1) {
    return <EmptyState>No finished matches to chart yet.</EmptyState>;
  }

  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const maxScore = Math.max(
    1,
    ...events.flatMap((event) => players.map((player) => event.scores[player.id] ?? 0))
  );
  const showAllMarkers = players.length * events.length <= 360;
  const markerEvents = showAllMarkers ? events : [events[events.length - 1]];
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

  return (
    <div className="space-y-4">
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
            return markerEvents.map((event) => {
              const eventIndex = events.findIndex((item) => item.id === event.id);
              return (
                <circle
                  key={`${player.id}-${event.id}`}
                  cx={xFor(eventIndex)}
                  cy={yFor(event.scores[player.id] ?? 0)}
                  fill={color}
                  r="3"
                >
                  <title>
                    @{player.username}: {event.scores[player.id] ?? 0} points after{" "}
                    {event.label}
                  </title>
                </circle>
              );
            });
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
    </div>
  );
}
