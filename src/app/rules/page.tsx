import Link from "next/link";
import { AlertCircle, CalendarClock, CircleHelp, ListChecks, Lock, Trophy } from "lucide-react";
import { MATCH_LOCK_MINUTES, MATCH_POINTS } from "@/lib/config";
import { requireUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/section";
import { PointSystemTabs } from "@/app/rules/point-system-tabs";

export const dynamic = "force-dynamic";

function RuleCard({
  icon: Icon,
  title,
  children
}: {
  icon: typeof ListChecks;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="items-start">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[--color-surface-2] text-[--color-accent]">
            <Icon size={16} />
          </span>
          <CardTitle>{title}</CardTitle>
        </div>
      </CardHeader>
      <CardBody className="text-sm leading-6 text-[--color-muted]">{children}</CardBody>
    </Card>
  );
}

export default async function RulesPage() {
  await requireUser({ nextPath: "/rules" });

  const maxMatchPoints =
    MATCH_POINTS.outcome +
    MATCH_POINTS.homeGoals +
    MATCH_POINTS.awayGoals +
    MATCH_POINTS.exactScore;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <PageHeader
        eyebrow="Game rules"
        title="Rules and scoring"
        description="How predictions work, when they lock, and how points are awarded."
        action={<Badge tone="accent">Max {maxMatchPoints} pts per match</Badge>}
      />

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        <RuleCard icon={ListChecks} title="Placing match bets">
          <p>
            Go to{" "}
            <Link href="/matches" className="font-medium text-[--color-text] underline-offset-4 hover:underline">
              Matches
            </Link>{" "}
            and enter the 90-minute score you expect for each team. The 1X2 outcome is
            calculated from that score, so a 1-1 prediction is a draw, a 2-1 prediction is
            a home win, and so on.
          </p>
          <p className="mt-3">
            Dynamic leagues use your latest eligible prediction. Classic leagues freeze
            group-stage predictions before the first kickoff. Predictions from other
            players are hidden until that match is locked.
          </p>
        </RuleCard>

        <RuleCard icon={Lock} title="Changing and locking bets">
          <p>
            Dynamic leagues let you change each match prediction until{" "}
            {MATCH_LOCK_MINUTES} minutes before kickoff. Classic leagues lock the whole
            group stage {MATCH_LOCK_MINUTES} minutes before the first kickoff.
          </p>
          <p className="mt-3">
            Tournament winner and top scorer picks lock {MATCH_LOCK_MINUTES} minutes
            before the first tournament kickoff.
          </p>
        </RuleCard>

        <RuleCard icon={Trophy} title="Point system">
          <PointSystemTabs maxMatchPoints={maxMatchPoints} />
        </RuleCard>

        <RuleCard icon={CalendarClock} title="Knockout round bets">
          <p>
            Knockout fixtures open for predictions once the teams are known and the match
            is updated in the app. You can then place or change the prediction until{" "}
            {MATCH_LOCK_MINUTES} minutes before that match kicks off.
          </p>
          <p className="mt-3">
            Knockout predictions are still based on the score after 90 minutes. Extra
            time and penalties do not change the score prediction, so draws are allowed.
          </p>
        </RuleCard>

        <RuleCard icon={CircleHelp} title="Leagues and leaderboards">
          <p>
            League tables use your total points from match predictions and tournament
            picks. If two players have the same score, they share the same rank, and the
            next rank skips ahead. Players with equal points are sorted alphabetically.
          </p>
        </RuleCard>

        <RuleCard icon={AlertCircle} title="Incorrect data">
          <p>
            If a kickoff time, team, result, player, or score looks wrong, reach out to
            the site owner. Admins can correct data manually when the automatic result
            feed is delayed or incorrect.
          </p>
        </RuleCard>
      </div>
    </main>
  );
}
