"use client";

import { LeagueType } from "@prisma/client";
import { Search, Users } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/section";

type AdminLeague = {
  id: string;
  name: string;
  type: LeagueType;
  inviteCode: string;
  creatorUsername: string | null;
  createdAt: string;
  memberCount: number;
};

export function AdminLeagueList({
  leagues
}: {
  leagues: AdminLeague[];
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredLeagues = normalizedQuery
    ? leagues.filter((league) =>
        `${league.name} ${league.type} ${league.inviteCode} ${league.creatorUsername ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery)
      )
    : leagues;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users size={15} className="text-[--color-muted]" />
          <CardTitle>Leagues</CardTitle>
        </div>
        <Badge tone="muted">{leagues.length}</Badge>
      </CardHeader>
      <CardBody className="!px-0 !pb-0">
        <div className="border-t border-[--color-border] px-5 py-3">
          <label className="relative block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[--color-faint]"
              size={14}
            />
            <Input
              aria-label="Search leagues"
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search leagues"
              value={query}
            />
          </label>
        </div>
        {filteredLeagues.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState>
              {normalizedQuery
                ? "No leagues match that search."
                : "No leagues created yet."}
            </EmptyState>
          </div>
        ) : (
          <div
            aria-label="League results"
            className="max-h-80 overflow-y-auto border-t border-[--color-border]"
            role="region"
            tabIndex={0}
          >
            <div className="divide-y divide-[--color-border]">
              {filteredLeagues.map((league) => (
                <div
                  key={league.id}
                  className="grid gap-3 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{league.name}</p>
                      <Badge tone={league.type === LeagueType.CLASSIC ? "gold" : "blue"}>
                        {league.type === LeagueType.CLASSIC ? "Classic" : "Dynamic"}
                      </Badge>
                      <span className="inline-flex items-center rounded-full border border-[--color-border] px-2.5 py-0.5 font-mono text-[11px] text-[--color-muted]">
                        {league.inviteCode}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-[--color-muted]">
                      {league.creatorUsername
                        ? `@${league.creatorUsername}`
                        : "Unknown creator"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[--color-faint] sm:justify-end">
                    <span>
                      {league.memberCount}{" "}
                      {league.memberCount === 1 ? "member" : "members"}
                    </span>
                    <span>{league.createdAt}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
