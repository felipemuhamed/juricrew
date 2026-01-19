import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Divider,
  Popover,
  Typography,
  GlobalStyles,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useTour,
  wasMotionCreationTourCompleted,
  wasTemplateBuilderTourCompleted,
} from "./TourProvider";

function getCenterPosition() {
  const w = typeof window !== "undefined" ? window.innerWidth : 800;
  const h = typeof window !== "undefined" ? window.innerHeight : 600;
  return { top: Math.round(h / 2), left: Math.round(w / 2) };
}

/**
 * Lightweight in-app tour (no external libs) built with MUI.
 * - Anchors a Popover to elements identified by [data-tour="..."]
 * - Adds a temporary highlight outline to the targeted element
 * - Gracefully falls back to a centered popover when a target is missing
 */
export default function TourOverlay() {
  const { state, stopTour, nextStep, prevStep } = useTour();

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const lastHighlighted = useRef<HTMLElement | null>(null);

  const step = state.steps[state.stepIndex];

  // Auto-start once (first time user) — currently disabled by design.
  useEffect(() => {
    const t = setTimeout(() => {
      const completed = state.tourName === "templateBuilder" ? wasTemplateBuilderTourCompleted() : wasMotionCreationTourCompleted();
      if (!state.running && !completed) {
        // Intentionally not auto-starting.
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve target element for current step.
  useEffect(() => {
    if (!state.running) {
      if (lastHighlighted.current) {
        lastHighlighted.current.classList.remove("juricrew-tour-highlight");
        lastHighlighted.current = null;
      }
      setAnchorEl(null);
      return;
    }

    let cancelled = false;

    const resolve = () => {
      const el = (step?.target ? (document.querySelector(step.target) as HTMLElement | null) : null) ?? null;
      if (!el) return null;
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        // ignore
      }
      return el;
    };

    const run = async () => {
      // allow the step to reveal its target (e.g., click Skip -> Step 2)
      try {
        await step?.beforeResolveTarget?.();
      } catch {
        // ignore
      }

      let tries = 0;
      const tick = () => {
        if (cancelled) return;
        const el = resolve();
        if (el) {
          if (lastHighlighted.current && lastHighlighted.current !== el) {
            lastHighlighted.current.classList.remove("juricrew-tour-highlight");
          }
          el.classList.add("juricrew-tour-highlight");
          lastHighlighted.current = el;
          setAnchorEl(el);
          return;
        }

        if (step?.optional) {
          nextStep();
          return;
        }

        tries += 1;
        if (tries < 10) {
          setTimeout(tick, 180);
        } else {
          // Fall back to centered popover (still shows the tip)
          if (lastHighlighted.current) {
            lastHighlighted.current.classList.remove("juricrew-tour-highlight");
            lastHighlighted.current = null;
          }
          setAnchorEl(null);
        }
      };

      tick();
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [state.running, state.stepIndex]);

  const open = state.running;

  const progressText = useMemo(() => {
    const total = state.steps.length;
    const idx = Math.min(state.stepIndex + 1, total);
    return `${idx} of ${total}`;
  }, [state.stepIndex, state.steps.length]);

  const onClose = () => stopTour({ resetHome: state.tourName === "motionCreation" });
  const canGoBack = state.stepIndex > 0;

  const nextDisabled = useMemo(() => {
    const sel = step?.blockNextUntilSelector;
    if (!sel) return false;
    try {
      return !document.querySelector(sel);
    } catch {
      return false;
    }
  }, [state.stepIndex, step?.blockNextUntilSelector, anchorEl]);

  const center = useMemo(() => getCenterPosition(), [anchorEl, state.stepIndex]);

  const anchorReference = anchorEl ? "anchorEl" : "anchorPosition";

  return (
    <>
      <GlobalStyles
        styles={{
          ".juricrew-tour-highlight": {
            outline: "3px solid rgba(25, 118, 210, 0.9)",
            outlineOffset: "3px",
            borderRadius: "10px",
            boxShadow: "0 0 0 6px rgba(25, 118, 210, 0.18)",
          },
        }}
      />

      {open ? (
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            bgcolor: "rgba(0,0,0,0.25)",
            zIndex: (t) => t.zIndex.modal - 2,
            pointerEvents: "none",
          }}
        />
      ) : null}

      <Popover
        open={open}
        anchorEl={anchorEl}
        anchorReference={anchorReference as any}
        anchorPosition={anchorEl ? undefined : center}
        onClose={onClose}
        disableRestoreFocus
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        PaperProps={{
          sx: {
            width: 420,
            maxWidth: "calc(100vw - 24px)",
            borderRadius: 3,
            overflow: "hidden",
            zIndex: (t) => t.zIndex.modal + 10,
          },
        }}
      >
        <Card elevation={0}>
          <CardContent sx={{ pb: 1.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
              <Typography
                variant="subtitle1"
                noWrap
                sx={{ fontWeight: 800, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {step?.title ?? "Tour"}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {progressText}
              </Typography>
            </Box>
            <Divider sx={{ my: 1 }} />
            <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
              {step?.content ?? ""}
            </Typography>
          </CardContent>
          <CardActions sx={{ px: 2, pb: 1.5, pt: 0, justifyContent: "space-between" }}>
            <Button onClick={onClose}>End tour</Button>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button onClick={prevStep} disabled={!canGoBack}>
                Back
              </Button>
              <Button variant="contained" onClick={nextStep} disabled={nextDisabled}>
                {state.stepIndex >= state.steps.length - 1 ? "Finish" : "Next"}
              </Button>
            </Box>
          </CardActions>
        </Card>
      </Popover>
    </>
  );
}
