import { Box, Fab, TextField, CircularProgress, Alert, Button, Chip, Stack } from "@mui/material";
import { useMemo, useState, useEffect } from "react";
import { api } from "../api"; // uses api.processDoc, api.downloadDoc, api.latestDocByCase, api.latestDocSnapshotByCase

// Legacy type kept for optional onSubmit callback (no backend use)
export type PleadingPayload = {
  motion_type: string;
  facts: string;
  process: string; // case number (legacy)
  court: string;
  parts: string;   // composed from plaintiff + defendants (legacy)
};

// Backend DTO shape we send
type DocRequestDTO = {
  projectId: string;
  subfolder?: string;
  requestedFileName?: string;
  fields: {
    motion_type: string;
    facts: string;
    case_number: string;
    court: string;
    plaintiff: string;
    defendant: string[];
  };
};

// For /docs/process response (and /docs/latest)
type ProcessDocResponse = {
  motionId: string | null;
  status: "DRAFT" | "GENERATING" | "READY" | "REJECTED";
  outputPath: string | null;
};

type ReadyDoc = {
  motionId: string;
  status: "DRAFT" | "GENERATING" | "READY" | "REJECTED";
  outputPath: string;
  suggestedName: string;
};

type Seed = Partial<{
  motionType: string;
  facts: string;
  caseNumber: string;
  court: string;
  plaintiff: string;
  defendants: string;

  // Optional banner info if parent provides it
  motionId?: string;
  status?: ReadyDoc["status"];
  outputPath?: string;
}>;

// Optional environment-driven default project id
const DEFAULT_PROJECT_ID =
  (import.meta as any)?.env?.VITE_PROJECT_ID ||
  (window as any)?.__PROJECT_ID__ ||
  "juricrew-demo";

export default function PleadingComposer({
  disabled,
  onSubmit,
  onCaseNumberChange,
  /** Seed from the selected conversation (or undefined when nothing selected) */
  initialValues,
  /** Optional: persist per-conversation edits */
  draftKey,
  /** The folder/project ID to save motions under (conversation’s projectId). */
  projectId,
}: {
  disabled: boolean;
  onSubmit?: (payload: PleadingPayload) => void | Promise<void>;
  onCaseNumberChange?: (value: string) => void;
  initialValues?: Seed;
  draftKey?: string;
  projectId?: string | null;
}) {
  const [motionType, setMotionType] = useState("");
  const [facts, setFacts] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [court, setCourt] = useState("");
  const [plaintiff, setPlaintiff] = useState("");
  const [defendants, setDefendants] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [readyDoc, setReadyDoc] = useState<ReadyDoc | null>(null);

  // ---- (Re)initialize from initialValues ----
  useEffect(() => {
    if (!initialValues) {
      // No seed (nothing selected): empty form and no banner
      setMotionType("");
      setFacts("");
      setCaseNumber("");
      setCourt("");
      setPlaintiff("");
      setDefendants("");
      setReadyDoc(null);
      return;
    }

    setMotionType(initialValues.motionType ?? "");
    setFacts(initialValues.facts ?? "");
    setCaseNumber(initialValues.caseNumber ?? "");
    if (initialValues.caseNumber) onCaseNumberChange?.(initialValues.caseNumber);
    setCourt(initialValues.court ?? "");
    setPlaintiff(initialValues.plaintiff ?? "");
    setDefendants(initialValues.defendants ?? "");

    // If parent already passed banner info, show it immediately
    if (initialValues.caseNumber && initialValues.status && initialValues.status !== "DRAFT") {
      const sugg = `pleading_${initialValues.caseNumber.replace(/[^a-zA-Z0-9._-]+/g, "_")}.docx`;
      setReadyDoc({
        motionId: initialValues.motionId ?? "",
        status: initialValues.status,
        outputPath: initialValues.outputPath ?? "",
        suggestedName: sugg,
      });
    } else {
      setReadyDoc(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues?.caseNumber, initialValues?.status, projectId]);

  // ---- Self-hydrate from backend on caseNumber change (populate form + banner) ----
  useEffect(() => {
    const cn = (caseNumber || "").trim();
    if (!cn) return;

    const effectiveProjectId = projectId ?? null;

    api
      .latestDocSnapshotByCase(cn, effectiveProjectId)
      .then((dto) => {
        if (!dto) {
          // No saved doc for this case/project: clear banner but keep whatever is in the form
          setReadyDoc(null);
          return;
        }

        const f = dto.fields ?? ({} as any);

        // Hydrate the FORM
        setMotionType(f.motion_type ?? "");
        setFacts(f.facts ?? "");
        setCourt(f.court ?? "");
        setPlaintiff(f.plaintiff ?? "");
        setDefendants(
          Array.isArray(f.defendant) ? f.defendant.join("; ") : ""
        );

        // Hydrate the BANNER from the same response
        const status = (dto.status ?? "DRAFT") as ReadyDoc["status"];
        const motionId = dto.motionId ?? "";
        const outputPath = dto.outputPath ?? "";

        if (status && status !== "DRAFT" && outputPath) {
          const sugg = `pleading_${cn.replace(/[^a-zA-Z0-9._-]+/g, "_")}.docx`;
          setReadyDoc({
            motionId,
            status,
            outputPath,
            suggestedName: sugg,
          });
        } else {
          setReadyDoc(null);
        }
      })
      .catch(() => {
        // Keep whatever we had; just don't crash
      });
  }, [caseNumber, projectId]);

  // ---- Persist draft per conversation (optional) ----
  useEffect(() => {
    if (!draftKey) return;
    try {
      const data: Seed = { motionType, facts, caseNumber, court, plaintiff, defendants };
      localStorage.setItem(draftKey, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }, [draftKey, motionType, facts, caseNumber, court, plaintiff, defendants]);

  const valid =
    motionType.trim() &&
    facts.trim() &&
    caseNumber.trim() &&
    court.trim() &&
    plaintiff.trim() &&
    defendants.trim();

  const parseDefendants = (raw: string): string[] =>
    raw
      .split(/[,;]\s*|\n+/g)
      .map((s) => s.trim())
      .filter(Boolean);

  // "motion_to_compel_discovery_2025-CA-004389"
  const requestedFileName = useMemo(() => {
    const mt = motionType.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const cn = caseNumber.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
    if (!mt && !cn) return undefined;
    if (mt && cn) return `${mt}_${cn}`;
    return mt || cn || undefined;
  }, [motionType, caseNumber]);

  const handleSubmit = async () => {
    if (!valid || disabled || submitting) return;

    const effectiveProjectId = (projectId ?? undefined) || DEFAULT_PROJECT_ID;

    const docReq: DocRequestDTO = {
      projectId: effectiveProjectId,
      requestedFileName,
      fields: {
        motion_type: motionType.trim(),
        facts: facts.trim(),
        case_number: caseNumber.trim(),
        court: court.trim(),
        plaintiff: plaintiff.trim(),
        defendant: parseDefendants(defendants),
      },
    };

    const legacyPayload: PleadingPayload = {
      motion_type: docReq.fields.motion_type,
      facts: docReq.fields.facts,
      process: docReq.fields.case_number,
      court: docReq.fields.court,
      parts: `plaintiff: ${docReq.fields.plaintiff}; defendants: [${docReq.fields.defendant.join(", ")}]`,
    };

    try {
      setSubmitting(true);
      setReadyDoc(null);

      // Call backend to process the document
      const result = (await api.processDoc(docReq)) as ProcessDocResponse;

      // Build a filename we’ll propose to the user
      const safeCase = docReq.fields.case_number.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const fallbackName = `pleading_${safeCase}.docx`;
      const suggestedName = requestedFileName ? `${requestedFileName}.docx` : fallbackName;

      setReadyDoc({
        motionId: String(result.motionId ?? ""),
        status: result.status,
        outputPath: String(result.outputPath ?? ""),
        suggestedName,
      });

      if (onSubmit) await onSubmit(legacyPayload);
    } catch (err) {
      console.error(err);
      alert("Failed to process your pleading.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async () => {
    if (!readyDoc || readyDoc.status !== "READY" || !readyDoc.outputPath) return;
    try {
      const blob = await api.downloadDoc(readyDoc.outputPath);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = readyDoc.suggestedName || "document.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Failed to download the generated document.");
    }
  };

  const statusColor: Record<ReadyDoc["status"], "success" | "warning" | "info" | "error"> = {
    READY: "success",
    GENERATING: "info",
    DRAFT: "warning",
    REJECTED: "error",
  };

  return (
    <Box sx={{ display: "grid", gap: 1.5, p: 1 }}>
      {/* Ready/Download banner (shows even on selection without regenerating) */}
      {readyDoc && readyDoc.status !== "DRAFT" && (
        <Alert
          severity={statusColor[readyDoc.status]}
          action={
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                size="small"
                onClick={handleDownload}
                disabled={readyDoc.status !== "READY" || !readyDoc.outputPath}
              >
                Download
              </Button>
              <Button
                variant="contained"
                size="small"
                color="primary"
                onClick={handleSubmit}
                disabled={disabled || submitting || !valid}
              >
                Regenerate
              </Button>
            </Stack>
          }
          sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1 }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <span>
              {readyDoc.status === "READY"
                ? "Your document is ready:"
                : readyDoc.status === "GENERATING"
                ? "Your document is being prepared:"
                : readyDoc.status === "REJECTED"
                ? "Document generation failed:"
                : "Status:"}
            </span>
            <strong>{readyDoc.suggestedName}</strong>
            <Chip
              size="small"
              label={readyDoc.status}
              color={statusColor[readyDoc.status]}
              variant="outlined"
            />
          </Box>
        </Alert>
      )}

      <TextField
        label="Motion Type"
        placeholder="e.g., Motion to Compel Discovery"
        value={motionType}
        onChange={(e) => setMotionType(e.target.value)}
        disabled={disabled || submitting}
        fullWidth
      />

      <TextField
        label="Facts"
        placeholder="Describe the relevant facts of the case"
        value={facts}
        onChange={(e) => setFacts(e.target.value)}
        disabled={disabled || submitting}
        fullWidth
        multiline
        minRows={4}
      />

      <TextField
        label="Case Number"
        placeholder="e.g., 2025-CA-004389"
        value={caseNumber}
        onChange={(e) => {
          const v = e.target.value;
          setCaseNumber(v);
          onCaseNumberChange?.(v); // keep page title synced
        }}
        disabled={disabled || submitting}
        fullWidth
      />

      <TextField
        label="Court"
        placeholder="e.g., In the Circuit Court of the Fifteenth Judicial Circuit"
        value={court}
        onChange={(e) => setCourt(e.target.value)}
        disabled={disabled || submitting}
        fullWidth
      />

      {/* Parties */}
      <TextField
        label="Plaintiff"
        placeholder="e.g., John Doe"
        value={plaintiff}
        onChange={(e) => setPlaintiff(e.target.value)}
        disabled={disabled || submitting}
        fullWidth
      />
      <TextField
        label="Defendant(s)"
        placeholder="Enter one or more names, separated by commas or semicolons"
        helperText="Example: Jane Doe; Acme Corp."
        value={defendants}
        onChange={(e) => setDefendants(e.target.value)}
        disabled={disabled || submitting}
        fullWidth
        multiline
        minRows={2}
      />

      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Fab
          size="medium"
          color="primary"
          onClick={handleSubmit}
          disabled={disabled || submitting || !valid}
          aria-label="Generate"
        >
          {submitting ? <CircularProgress size={22} /> : <span style={{ fontWeight: 700 }}>Go</span>}
        </Fab>
      </Box>
    </Box>
  );
}