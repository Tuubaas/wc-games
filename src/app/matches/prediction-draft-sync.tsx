"use client";

import { useEffect } from "react";

type Draft = {
  awayGoals: string;
  homeGoals: string;
  updatedAt: number;
};

export function PredictionDraftSync({ signature }: { signature: string }) {
  useEffect(() => {
    const forms = Array.from(
      document.querySelectorAll<HTMLFormElement>("form[data-prediction-draft-key]")
    );
    const cleanups: Array<() => void> = [];

    for (const form of forms) {
      const key = form.dataset.predictionDraftKey;
      if (!key) continue;

      const homeInput = form.elements.namedItem("homeGoals");
      const awayInput = form.elements.namedItem("awayGoals");
      if (!(homeInput instanceof HTMLInputElement)) continue;
      if (!(awayInput instanceof HTMLInputElement)) continue;

      const disabled = form.dataset.predictionDraftDisabled === "true";
      const serverUpdatedAt = Number(form.dataset.predictionServerUpdatedAt ?? 0);

      if (!disabled) {
        const draft = readDraft(key);
        if (draft && draft.updatedAt > serverUpdatedAt) {
          homeInput.value = draft.homeGoals;
          awayInput.value = draft.awayGoals;
        } else if (draft) {
          localStorage.removeItem(key);
        }
      }

      const saveDraft = () => {
        if (homeInput.disabled || awayInput.disabled) return;
        if (homeInput.value === "" && awayInput.value === "") {
          localStorage.removeItem(key);
          return;
        }

        localStorage.setItem(
          key,
          JSON.stringify({
            awayGoals: awayInput.value,
            homeGoals: homeInput.value,
            updatedAt: Date.now()
          } satisfies Draft)
        );
      };

      homeInput.addEventListener("blur", saveDraft);
      awayInput.addEventListener("blur", saveDraft);
      form.addEventListener("submit", saveDraft);
      cleanups.push(() => {
        homeInput.removeEventListener("blur", saveDraft);
        awayInput.removeEventListener("blur", saveDraft);
        form.removeEventListener("submit", saveDraft);
      });
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [signature]);

  return null;
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
