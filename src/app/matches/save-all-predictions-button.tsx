"use client";

import { useEffect, useRef, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SAVE_ALL_PREDICTIONS_EVENT,
  SAVE_ALL_PREDICTION_RESULT_EVENT,
  type SaveAllPredictionResult
} from "@/app/matches/prediction-form";

type SaveAllState =
  | { kind: "idle" }
  | { kind: "saving"; queued: number; completed: number }
  | { kind: "saved"; count: number }
  | { kind: "error"; failed: number; saved: number }
  | { kind: "empty" };

export function SaveAllPredictionsButton() {
  const requestIdRef = useRef<string | null>(null);
  const queuedRef = useRef(0);
  const savedRef = useRef(0);
  const failedRef = useRef(0);
  const skippedRef = useRef(0);
  const emptyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<SaveAllState>({ kind: "idle" });

  function settleState() {
    const queued = queuedRef.current;
    const completed = savedRef.current + failedRef.current;

    if (queued === 0) {
      setState({ kind: "saving", queued: 0, completed: 0 });
      return;
    }

    if (completed < queued) {
      setState({ kind: "saving", queued, completed });
      return;
    }

    requestIdRef.current = null;
    if (failedRef.current > 0) {
      setState({ kind: "error", failed: failedRef.current, saved: savedRef.current });
    } else {
      setState({ kind: "saved", count: savedRef.current });
    }
  }

  useEffect(() => {
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<SaveAllPredictionResult>).detail;
      if (!detail || detail.requestId !== requestIdRef.current) return;

      if (detail.status === "queued") queuedRef.current += 1;
      if (detail.status === "saved") savedRef.current += 1;
      if (detail.status === "error") failedRef.current += 1;
      if (detail.status === "skipped") skippedRef.current += 1;

      settleState();
    };

    window.addEventListener(SAVE_ALL_PREDICTION_RESULT_EVENT, onResult);
    return () => {
      window.removeEventListener(SAVE_ALL_PREDICTION_RESULT_EVENT, onResult);
      if (emptyTimeoutRef.current) clearTimeout(emptyTimeoutRef.current);
    };
  }, []);

  const saveAll = () => {
    if (emptyTimeoutRef.current) clearTimeout(emptyTimeoutRef.current);

    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;
    queuedRef.current = 0;
    savedRef.current = 0;
    failedRef.current = 0;
    skippedRef.current = 0;
    setState({ kind: "saving", queued: 0, completed: 0 });

    window.dispatchEvent(
      new CustomEvent(SAVE_ALL_PREDICTIONS_EVENT, { detail: { requestId } })
    );

    emptyTimeoutRef.current = setTimeout(() => {
      if (requestIdRef.current !== requestId) return;
      if (queuedRef.current === 0) {
        setState({ kind: "empty" });
        requestIdRef.current = null;
      }
    }, 0);
  };

  const disabled = state.kind === "saving";

  return (
    <Button type="button" variant="secondary" onClick={saveAll} disabled={disabled}>
      <Save size={15} />
      {labelForState(state)}
    </Button>
  );
}

function labelForState(state: SaveAllState) {
  switch (state.kind) {
    case "saving":
      return state.queued > 0
        ? `Saving ${state.completed}/${state.queued}`
        : "Saving";
    case "saved":
      return `Saved ${state.count}`;
    case "error":
      return state.saved > 0
        ? `Saved ${state.saved}, ${state.failed} failed`
        : `${state.failed} failed`;
    case "empty":
      return "No complete bets";
    default:
      return "Save all bets";
  }
}
