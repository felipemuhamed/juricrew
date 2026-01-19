import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { motionCreationTourSteps, templateBuilderTourSteps, TourStep } from "./tourSteps";

type TourName = "motionCreation" | "templateBuilder";

type PendingResume = { tourName: TourName; stepIndex: number } | null;

type TourState = {
  running: boolean;
  tourName: TourName;
  stepIndex: number;
  steps: TourStep[];
  pendingResume: PendingResume;
};

type StartOptions = { startAt?: number };

type TourContextValue = {
  state: TourState;
  startMotionCreationTour: (opts?: StartOptions) => void;
  startTemplateBuilderTour: (opts?: StartOptions) => void;
  /** Used when motion tour launches the template wizard. */
  startTemplateBuilderTourAndResumeMotion: (resumeMotionStepIndex: number) => void;
  stopTour: (opts?: { resetHome?: boolean }) => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (index: number) => void;
};

const STORAGE_KEY_MOTION = "juricrew_tour_motion_creation_completed";
const STORAGE_KEY_TEMPLATE = "juricrew_tour_template_builder_completed";

const TourContext = createContext<TourContextValue | null>(null);

function stepsFor(name: TourName): TourStep[] {
  return name === "templateBuilder" ? templateBuilderTourSteps : motionCreationTourSteps;
}

function storageKeyFor(name: TourName): string {
  return name === "templateBuilder" ? STORAGE_KEY_TEMPLATE : STORAGE_KEY_MOTION;
}

function defaultState(): TourState {
  return {
    running: false,
    tourName: "motionCreation",
    stepIndex: 0,
    steps: motionCreationTourSteps,
    pendingResume: null,
  };
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TourState>(() => defaultState());

  const startMotionCreationTour = useCallback((opts?: StartOptions) => {
    const startAt = Math.max(0, opts?.startAt ?? 0);
    setState((s) => ({
      ...s,
      running: true,
      tourName: "motionCreation",
      steps: motionCreationTourSteps,
      stepIndex: Math.min(startAt, motionCreationTourSteps.length - 1),
      pendingResume: null,
    }));
  }, []);

  const startTemplateBuilderTour = useCallback((opts?: StartOptions) => {
    const startAt = Math.max(0, opts?.startAt ?? 0);
    setState((s) => ({
      ...s,
      running: true,
      tourName: "templateBuilder",
      steps: templateBuilderTourSteps,
      stepIndex: Math.min(startAt, templateBuilderTourSteps.length - 1),
      pendingResume: null,
    }));
  }, []);

  const startTemplateBuilderTourAndResumeMotion = useCallback((resumeMotionStepIndex: number) => {
    const resumeAt = Math.max(0, resumeMotionStepIndex);
    setState((s) => ({
      ...s,
      running: true,
      tourName: "templateBuilder",
      steps: templateBuilderTourSteps,
      stepIndex: 0,
      pendingResume: { tourName: "motionCreation", stepIndex: resumeAt },
    }));
  }, []);

  const resumePending = (s: TourState): TourState => {
    if (!s.pendingResume) return { ...s, running: false, pendingResume: null };
    const nextTour = s.pendingResume.tourName;
    const nextSteps = stepsFor(nextTour);
    const nextIndex = Math.min(Math.max(0, s.pendingResume.stepIndex), nextSteps.length - 1);
    return {
      ...s,
      running: true,
      tourName: nextTour,
      steps: nextSteps,
      stepIndex: nextIndex,
      pendingResume: null,
    };
  };

  const stopTour = useCallback((opts?: { resetHome?: boolean }) => {
    setState((s) => {
      // If we're ending the motion creation tour, return the user to the initial home screen.
      if (s.tourName === "motionCreation" && opts?.resetHome) {
        try {
          window.dispatchEvent(new CustomEvent("juricrew:tour:resetHome"));
        } catch {
          // ignore
        }
      }

      // default behavior: just stop (we no longer auto-resume other tours)
      return { ...s, running: false, pendingResume: null, stepIndex: 0 };
    });
  }, []);

  const goToStep = useCallback((index: number) => {
    setState((s) => {
      const max = Math.max(0, (s.steps?.length ?? 1) - 1);
      const clamped = Math.max(0, Math.min(index, max));
      return { ...s, stepIndex: clamped };
    });
  }, []);

  const completeCurrentTour = (s: TourState): TourState => {
    try {
      localStorage.setItem(storageKeyFor(s.tourName), "true");
    } catch {
      // ignore
    }

    // When the motion creation tour completes, reset the UI back to the "home" state.
    if (s.tourName === "motionCreation") {
      try {
        window.dispatchEvent(new CustomEvent("juricrew:tour:resetHome"));
      } catch {
        // ignore
      }
    }

    return { ...s, running: false, stepIndex: 0, pendingResume: null };
  };

  const nextStep = useCallback(() => {
    setState((s) => {
      const next = s.stepIndex + 1;
      if (!s.steps?.length) return { ...s, running: false, stepIndex: 0 };
      if (next >= s.steps.length) return completeCurrentTour(s);
      return { ...s, stepIndex: next };
    });
  }, []);

  const prevStep = useCallback(() => {
    setState((s) => ({ ...s, stepIndex: Math.max(0, s.stepIndex - 1) }));
  }, []);

  const value = useMemo<TourContextValue>(
    () => ({
      state,
      startMotionCreationTour,
      startTemplateBuilderTour,
      startTemplateBuilderTourAndResumeMotion,
      stopTour,
      nextStep,
      prevStep,
      goToStep,
    }),
    [state, startMotionCreationTour, startTemplateBuilderTour, startTemplateBuilderTourAndResumeMotion, stopTour, nextStep, prevStep, goToStep]
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}

export function wasMotionCreationTourCompleted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_MOTION) === "true";
  } catch {
    return false;
  }
}

export function wasTemplateBuilderTourCompleted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_TEMPLATE) === "true";
  } catch {
    return false;
  }
}
