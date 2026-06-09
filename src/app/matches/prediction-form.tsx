"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreInput } from "@/components/ui/input";

export const SAVE_ALL_PREDICTIONS_EVENT = "tubets:predictions:save-all";
export const SAVE_ALL_PREDICTION_RESULT_EVENT = "tubets:predictions:save-all-result";

export type SaveAllPredictionResult = {
  requestId: string;
  status: "queued" | "saved" | "error" | "skipped";
};

type Draft = {
  awayGoals: string;
  homeGoals: string;
  updatedAt: number;
};

type SaveStatus = "idle" | "saved" | "error";

export function PredictionForm({
  action,
  awayScore90,
  disabled,
  draftKey,
  finished,
  hasPrediction,
  homeScore90,
  initialAwayGoals,
  initialHomeGoals,
  points,
  serverUpdatedAt,
  testId
}: {
  action: (formData: FormData) => Promise<void>;
  awayScore90: number | null;
  disabled: boolean;
  draftKey: string;
  finished: boolean;
  hasPrediction: boolean;
  homeScore90: number | null;
  initialAwayGoals: number | null;
  initialHomeGoals: number | null;
  points: number | null;
  serverUpdatedAt: number;
  testId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const homeInputRef = useRef<HTMLInputElement>(null);
  const awayInputRef = useRef<HTMLInputElement>(null);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [optimisticHasPrediction, setOptimisticHasPrediction] = useState(hasPrediction);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [, startTransition] = useTransition();

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const saveAll = (event: Event) => {
      const requestId = (event as CustomEvent<{ requestId?: string }>).detail?.requestId;
      if (!requestId) return;

      if (!isCompleteAndValid()) {
        emitSaveAllResult(requestId, "skipped");
        return;
      }

      emitSaveAllResult(requestId, "queued");
      saveCurrent({ requestId, reportInvalid: false });
    };

    window.addEventListener(SAVE_ALL_PREDICTIONS_EVENT, saveAll);
    return () => window.removeEventListener(SAVE_ALL_PREDICTIONS_EVENT, saveAll);
  });

  useEffect(() => {
    if (disabled) return;

    const draft = readDraft(draftKey);
    if (draft && draft.updatedAt > serverUpdatedAt) {
      if (homeInputRef.current) homeInputRef.current.value = draft.homeGoals;
      if (awayInputRef.current) awayInputRef.current.value = draft.awayGoals;
    } else if (draft) {
      localStorage.removeItem(draftKey);
    }
  }, [disabled, draftKey, serverUpdatedAt]);

  function saveDraft() {
    if (disabled) return;
    writeDraft(
      draftKey,
      homeInputRef.current?.value ?? "",
      awayInputRef.current?.value ?? ""
    );
  }

  function showSavedStatus() {
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);

    setStatus("saved");
    savedTimeoutRef.current = setTimeout(() => {
      setStatus((current) => (current === "saved" ? "idle" : current));
      savedTimeoutRef.current = null;
    }, 800);
  }

  function isCompleteAndValid() {
    if (disabled) return false;
    const form = formRef.current;
    if (!form) return false;
    if (!homeInputRef.current?.value || !awayInputRef.current?.value) return false;
    return form.checkValidity();
  }

  function saveCurrent({
    reportInvalid,
    requestId
  }: {
    reportInvalid: boolean;
    requestId?: string;
  }) {
    const form = formRef.current;
    if (!form || disabled) return;
    if (!form.checkValidity()) {
      if (reportInvalid) form.reportValidity();
      if (requestId) emitSaveAllResult(requestId, "skipped");
      return;
    }

    const formData = new FormData(form);
    saveDraft();
    setOptimisticHasPrediction(true);
    showSavedStatus();

    startTransition(() => {
      Promise.resolve(action(formData))
        .then(() => {
          if (requestId) emitSaveAllResult(requestId, "saved");
        })
        .catch(() => {
          setStatus("error");
          if (requestId) emitSaveAllResult(requestId, "error");
        });
    });
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveCurrent({ reportInvalid: true });
  };

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      data-testid={testId}
      className="flex items-center justify-end gap-2"
    >
      {finished ? (
        <div className="mr-2 text-right">
          <p className="text-[10px] uppercase tracking-wider text-[--color-faint]">
            Full time
          </p>
          <p className="font-mono text-base font-semibold text-[--color-text]">
            {homeScore90}-{awayScore90}
          </p>
        </div>
      ) : null}
      <ScoreInput
        ref={homeInputRef}
        aria-label="Home goals"
        defaultValue={valueFromScore(initialHomeGoals)}
        disabled={disabled}
        min={0}
        max={30}
        name="homeGoals"
        onBlur={saveDraft}
        onChange={() => {
          setStatus("idle");
        }}
        required
      />
      <span className="text-[--color-faint]">-</span>
      <ScoreInput
        ref={awayInputRef}
        aria-label="Away goals"
        defaultValue={valueFromScore(initialAwayGoals)}
        disabled={disabled}
        min={0}
        max={30}
        name="awayGoals"
        onBlur={saveDraft}
        onChange={() => {
          setStatus("idle");
        }}
        required
      />
      <Button type="submit" variant="secondary" size="sm" disabled={disabled}>
        {status === "error"
          ? "Retry"
          : status === "saved"
          ? "Saved"
          : optimisticHasPrediction
          ? "Update"
          : "Save"}
      </Button>
      {hasPrediction && finished ? (
        <Badge tone={points && points > 0 ? "accent" : "muted"}>
          {points && points > 0 ? `+${points}` : "0"} pts
        </Badge>
      ) : null}
    </form>
  );
}

function emitSaveAllResult(
  requestId: string,
  status: SaveAllPredictionResult["status"]
) {
  window.dispatchEvent(
    new CustomEvent<SaveAllPredictionResult>(SAVE_ALL_PREDICTION_RESULT_EVENT, {
      detail: { requestId, status }
    })
  );
}

function valueFromScore(score: number | null) {
  return score === null ? "" : String(score);
}

function readDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const draft = JSON.parse(raw);
    if (
      typeof draft?.awayGoals !== "string" ||
      typeof draft?.homeGoals !== "string" ||
      typeof draft?.updatedAt !== "number"
    ) {
      localStorage.removeItem(key);
      return null;
    }

    return draft;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function writeDraft(key: string, homeGoals: string, awayGoals: string) {
  try {
    if (homeGoals === "" && awayGoals === "") {
      localStorage.removeItem(key);
      return;
    }

    localStorage.setItem(
      key,
      JSON.stringify({
        awayGoals,
        homeGoals,
        updatedAt: Date.now()
      } satisfies Draft)
    );
  } catch {
    // localStorage may be unavailable; saving to the server still works.
  }
}
