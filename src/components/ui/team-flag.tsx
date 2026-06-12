import { cn } from "@/lib/cn";

const FIFA_TO_ISO2: Record<string, string> = {
  ARG: "AR", AUS: "AU", AUT: "AT", BEL: "BE", BRA: "BR", CAN: "CA",
  CHI: "CL", COL: "CO", CRC: "CR", CRO: "HR", CZE: "CZ", DEN: "DK",
  ECU: "EC", EGY: "EG", ENG: "GB", ESP: "ES", FRA: "FR", GER: "DE",
  GHA: "GH", IRN: "IR", ITA: "IT", JPN: "JP", KOR: "KR", MAR: "MA",
  MEX: "MX", NED: "NL", NGA: "NG", NOR: "NO", PAR: "PY", PER: "PE",
  POL: "PL", POR: "PT", QAT: "QA", SAU: "SA", SEN: "SN", SRB: "RS",
  SUI: "CH", SVK: "SK", SWE: "SE", TUN: "TN", TUR: "TR", UKR: "UA",
  URU: "UY", USA: "US", WAL: "GB", IRL: "IE", SCO: "GB", NZL: "NZ",
  ALG: "DZ", BIH: "BA", CIV: "CI", COD: "CD", CPV: "CV", CUW: "CW",
  HAI: "HT", IRQ: "IQ", JOR: "JO", KSA: "SA", PAN: "PA", RSA: "ZA",
  UZB: "UZ"
};

function isoToFlagEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0)))
    .join("");
}

export function teamInitial(team: { name?: string | null; fifaCode?: string | null } | null | undefined) {
  if (!team) return "?";
  const code = team.fifaCode?.toUpperCase();
  if (code) return code.slice(0, 3);
  return team.name?.slice(0, 3).toUpperCase() ?? "?";
}

export function TeamFlag({
  team,
  size = "md",
  className
}: {
  team: { name?: string | null; fifaCode?: string | null } | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "h-6 w-9 text-[10px]",
    md: "h-8 w-11 text-[11px]",
    lg: "h-10 w-14 text-xs"
  };

  const code = team?.fifaCode?.toUpperCase();
  const iso = code ? FIFA_TO_ISO2[code] : undefined;
  const label = code ?? team?.name?.slice(0, 3).toUpperCase() ?? "TBD";

  return (
    <span
      title={team?.name ?? "TBD"}
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-[--color-border]",
        "bg-[--color-surface-2] font-mono font-semibold tracking-tight text-[--color-text]",
        "shrink-0 overflow-hidden",
        sizes[size],
        className
      )}
    >
      {iso ? (
        <span className="text-base leading-none">{isoToFlagEmoji(iso)}</span>
      ) : (
        <span>{label}</span>
      )}
    </span>
  );
}
