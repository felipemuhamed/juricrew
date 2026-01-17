import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import { useMemo, useState, useEffect, useCallback } from "react";
import { api, TemplateDetail, TemplateSummary } from "../api";
import TemplateDialog, { TemplateDialogValue } from "./TemplateDialog";

// Legacy type kept for optional onSubmit callback (no backend use)
export type PleadingPayload = {
  motion_type: string;
  facts: string;
  process: string; // case number (legacy)
  court: string;
  parts: string; // composed from plaintiff + defendants (legacy)
};

// Backend DTO shape we send
type DocRequestDTO = {
  projectId: string;
  conversationId?: string | null;
  motionId?: string | null;
  subfolder?: string;
  requestedFileName?: string;
  templateId?: string | null;
  selectedAuthorities?: any;
  researchedAuthorities?: any;
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

  templateId?: string;
  selectedAuthorities?: any;
  researchedAuthorities?: any;

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

const AUTH_GROUPS: Array<{ key: string; label: string }> = [
  { key: "procedural_rules", label: "Procedural rules" },
  { key: "statutes", label: "Statutes" },
  { key: "binding_case_law", label: "Binding case law" },
  { key: "persuasive_case_law", label: "Persuasive case law" },
];

function authorityLabel(a: any): string {
  return (
    a?.title ||
    a?.case_name ||
    a?.citation ||
    a?.name ||
    (typeof a === "string" ? a : undefined) ||
    "(authority)"
  );
}

function authorityKey(a: any): string {
  if (a == null) return "";
  if (typeof a === "string") return a.trim();
  const parts = [a.citation, a.title, a.case_name, a.name]
    .map((x: any) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
  if (parts.length) return parts.join("|");
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

function computeSelectedIndexFromSelectedAuthorities(
  researched: any,
  selected: any
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  if (!researched || !selected) return out;
  for (const g of AUTH_GROUPS) {
    const rArr = Array.isArray(researched[g.key]) ? researched[g.key] : [];
    const sArr = Array.isArray(selected[g.key]) ? selected[g.key] : [];
    if (!rArr.length || !sArr.length) continue;
    const sKeys = new Set(sArr.map((x: any) => authorityKey(x)).filter(Boolean));
    const picks: number[] = [];
    rArr.forEach((x: any, idx: number) => {
      const k = authorityKey(x);
      if (k && sKeys.has(k)) picks.push(idx);
    });
    if (picks.length) out[g.key] = picks;
  }
  return out;
}

/**
 * Normalize various possible API return shapes into TemplateSummary[].
 * This fixes cases where api.listTemplates() returns:
 * - AxiosResponse
 * - { data: [...] }
 * - { items: [...] }
 * - [...]
 */
function normalizeTemplates(result: any): TemplateSummary[] {
  if (!result) return [];
  if (Array.isArray(result)) return result as TemplateSummary[];

  // common wrapper shapes
  if (Array.isArray(result.data)) return result.data as TemplateSummary[];
  if (Array.isArray(result.items)) return result.items as TemplateSummary[];
  if (Array.isArray(result.templates)) return result.templates as TemplateSummary[];

  // axios response shape: { data: ... }
  if (result.data && Array.isArray(result.data.data)) return result.data.data as TemplateSummary[];
  if (result.data && Array.isArray(result.data.items)) return result.data.items as TemplateSummary[];
  if (result.data && Array.isArray(result.data.templates)) return result.data.templates as TemplateSummary[];
  if (result.data && Array.isArray(result.data)) return result.data as TemplateSummary[];

  return [];
}

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
  /** Current sidebar conversation id (required to persist drafts + hydrate). */
  conversationId,
}: {
  disabled: boolean;
  onSubmit?: (payload: PleadingPayload) => void | Promise<void>;
  onCaseNumberChange?: (value: string) => void;
  initialValues?: Seed;
  draftKey?: string;
  projectId?: string | null;
  conversationId?: string | null;
}) {
  const [motionType, setMotionType] = useState("");
  const [facts, setFacts] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [court, setCourt] = useState("");
  const [plaintiff, setPlaintiff] = useState("");
  const [defendants, setDefendants] = useState("");

  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 output
  const [authorities, setAuthorities] = useState<any | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<Record<string, number[]>>({});
  const [researching, setResearching] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");

  const [tplDialogOpen, setTplDialogOpen] = useState(false);
  const [tplDialogMode, setTplDialogMode] = useState<"create" | "edit">("create");
  const [tplDialogSaving, setTplDialogSaving] = useState(false);
  const [tplEditingDetail, setTplEditingDetail] = useState<TemplateDetail | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [readyDoc, setReadyDoc] = useState<ReadyDoc | null>(null);
  // Persisted motion id (draft/output) so we can update the same record across steps
  const [motionId, setMotionId] = useState<string>("");

  const [errorMsg, setErrorMsg] = useState<string>("");
  const [researchError, setResearchError] = useState<string>("");

  const refreshTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const raw = await api.listTemplates();
      const list = normalizeTemplates(raw);
      setTemplates(list);
    } catch (e) {
      console.error("listTemplates failed", e);
      setTemplates([]); // fail-safe
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshTemplates();
  }, [refreshTemplates]);

  // Refresh templates whenever we enter Step 2 (covers auth/org context becoming ready later)
  useEffect(() => {
    if (step === 2) {
      refreshTemplates();
    }
  }, [step, refreshTemplates]);

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
      setTemplateId("");
      setAuthorities(null);
      setSelectedIndex({});
      setStep(1);
      setReadyDoc(null);
      setMotionId("");
      return;
    }

    setMotionType(initialValues.motionType ?? "");
    setFacts(initialValues.facts ?? "");
    setCaseNumber(initialValues.caseNumber ?? "");
    if (initialValues.caseNumber) onCaseNumberChange?.(initialValues.caseNumber);
    setCourt(initialValues.court ?? "");
    setPlaintiff(initialValues.plaintiff ?? "");
    setDefendants(initialValues.defendants ?? "");

    if (initialValues.templateId) {
      setTemplateId(initialValues.templateId);
      setStep(2);
    }
    // Hydrate step-1 research results + step-2 selections
    const ra = (initialValues.researchedAuthorities ?? null) as any;
    const sel = (initialValues.selectedAuthorities ?? null) as any;
    if (ra) setAuthorities(ra);
    if (ra && sel) {
      setSelectedIndex(computeSelectedIndexFromSelectedAuthorities(ra, sel));
    } else {
      setSelectedIndex({});
    }

    if (initialValues.motionId) setMotionId(String(initialValues.motionId));

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

    // IMPORTANT: backend stores unfiled drafts under DEFAULT_PROJECT_ID
    const effectiveProjectId = (projectId ?? undefined) || DEFAULT_PROJECT_ID;

    api
      .latestDocSnapshotByCase(cn, effectiveProjectId)
      .then((dto) => {
        if (!dto) {
          setReadyDoc(null);
          return;
        }

        const f = dto.fields ?? ({} as any);

        setMotionType(f.motion_type ?? "");
        setFacts(f.facts ?? "");
        setCourt(f.court ?? "");
        setPlaintiff(f.plaintiff ?? "");
        setDefendants(Array.isArray(f.defendant) ? f.defendant.join("; ") : "");

        if (dto.templateId) {
          setTemplateId(dto.templateId);
          setStep(2);
        }
        if (dto.researchedAuthorities) {
          setAuthorities(dto.researchedAuthorities);
        }

        // restore selections into indices
        if (dto.selectedAuthorities && dto.researchedAuthorities) {
          setSelectedIndex(
            computeSelectedIndexFromSelectedAuthorities(dto.researchedAuthorities as any, dto.selectedAuthorities as any)
          );
        } else {
          setSelectedIndex({});
        }

        const status = (dto.status ?? "DRAFT") as ReadyDoc["status"];
        const motionId = dto.motionId ?? "";
        if (motionId) setMotionId(String(motionId));
        const outputPath = dto.outputPath ?? "";

        if (status && status !== "DRAFT" && outputPath) {
          const sugg = `pleading_${cn.replace(/[^a-zA-Z0-9._-]+/g, "_")}.docx`;
          setReadyDoc({ motionId, status, outputPath, suggestedName: sugg });
        } else {
          setReadyDoc(null);
        }
      })
      .catch(() => {
        // Keep whatever we had; just don't crash
      });
  }, [caseNumber, projectId]);

  // ---- Persist draft to backend (conversation-scoped) ----
  const persistDraft = useCallback(
    async (override?: Partial<DocRequestDTO>) => {
      if (!conversationId) return;
      // need at least a case number to make draft useful
      if (!caseNumber.trim()) return;

      const dto = { ...buildDto(), ...override } as DocRequestDTO;
      try {
        const saved = await api.saveConversationDraft(String(conversationId), dto as any);
        if (saved?.motionId) setMotionId(String(saved.motionId));
      } catch (e) {
        // do not block UI on draft persistence
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationId, caseNumber, motionId, motionType, facts, court, plaintiff, defendants, templateId, authorities, selectedIndex, projectId]
  );

  // Debounced auto-save for Step 1 + Step 2 edits
  useEffect(() => {
    if (!conversationId) return;
    if (!caseNumber.trim()) return;
    const t = setTimeout(() => {
      void persistDraft();
    }, 600);
    return () => clearTimeout(t);
  }, [conversationId, caseNumber, motionType, facts, court, plaintiff, defendants, templateId, authorities, selectedIndex, persistDraft]);

  // ---- Persist draft per conversation (optional) ----
  useEffect(() => {
    if (!draftKey) return;
    try {
      const data: Seed = {
        motionType,
        facts,
        caseNumber,
        court,
        plaintiff,
        defendants,
        templateId,
      };
      localStorage.setItem(draftKey, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }, [draftKey, motionType, facts, caseNumber, court, plaintiff, defendants, templateId]);

  const baseValid =
    motionType.trim() &&
    facts.trim() &&
    caseNumber.trim() &&
    court.trim() &&
    plaintiff.trim() &&
    defendants.trim();

  const step2Valid = baseValid && templateId.trim();

  const parseDefendants = (raw: string): string[] =>
    raw
      // split on commas/semicolons and/or newlines
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

  const buildDto = (): DocRequestDTO => {
    const effectiveProjectId = (projectId ?? undefined) || DEFAULT_PROJECT_ID;

    // Build selected authorities object from indices
    const sel: any = {};
    if (authorities) {
      for (const g of AUTH_GROUPS) {
        const arr = Array.isArray(authorities[g.key]) ? authorities[g.key] : [];
        const picks = new Set(selectedIndex[g.key] ?? []);
        if (picks.size) {
          sel[g.key] = arr.filter((_: any, idx: number) => picks.has(idx));
        }
      }
    }

    return {
      projectId: effectiveProjectId,
      conversationId: conversationId ?? null,
      motionId: motionId ? motionId : null,
      requestedFileName,
      templateId: templateId.trim() || null,
      selectedAuthorities: Object.keys(sel).length ? sel : null,
      researchedAuthorities: authorities ? authorities : null,
      fields: {
        motion_type: motionType.trim(),
        facts: facts.trim(),
        case_number: caseNumber.trim(),
        court: court.trim(),
        plaintiff: plaintiff.trim(),
        defendant: parseDefendants(defendants),
      },
    };
  };

  const handleResearch = async () => {
    if (!baseValid || disabled || researching) return;

    try {
      setResearching(true);
      setResearchError("");
      setAuthorities(null);
      setSelectedIndex({});

      // Spring /docs/research expects DocRequestDTO with fields (validated @NotNull)
      const dto = buildDto();

      // Research doesn't need template/authorities
      dto.templateId = null;
      dto.selectedAuthorities = null;

      const res = await api.researchAuthorities(dto as any);

      setAuthorities(res);
      setStep(2);

      // persist step 1 + research results
      await persistDraft({ templateId: null, selectedAuthorities: null, researchedAuthorities: res } as any);
    } catch (e: any) {
      console.error(e);
      const status = e?.response?.status;
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        (typeof e?.response?.data === "string" ? e.response.data : "") ||
        e?.message ||
        "Failed to research authorities.";

      setResearchError(status ? `(${status}) ${detail}` : String(detail));
    } finally {
      setResearching(false);
    }
  };

  const toggleAuthority = (groupKey: string, idx: number) => {
    setSelectedIndex((prev) => {
      const cur = new Set(prev[groupKey] ?? []);
      if (cur.has(idx)) cur.delete(idx);
      else cur.add(idx);
      return { ...prev, [groupKey]: Array.from(cur.values()).sort((a, b) => a - b) };
    });
  };

  const handleSubmit = async () => {
    if (!step2Valid || disabled || submitting) return;

    const docReq = buildDto();

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

      // ✅ clear previous error
      setErrorMsg("");

      const result = (await api.processDoc(docReq as any)) as ProcessDocResponse;
      if (result?.motionId) setMotionId(String(result.motionId));

      const safeCase = docReq.fields.case_number.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const fallbackName = `pleading_${safeCase}.docx`;
      const suggestedName = requestedFileName ? `${requestedFileName}.docx` : fallbackName;

      setReadyDoc({
        motionId: String(result.motionId ?? ""),
        status: result.status,
        outputPath: String(result.outputPath ?? ""),
        suggestedName,
      });

      // ✅ success should clear any error state
      setErrorMsg("");

      if (onSubmit) await onSubmit(legacyPayload);
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to process/download pleading.");
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

  const openCreateTemplate = () => {
    setTplDialogMode("create");
    setTplEditingDetail(null);
    setTplDialogOpen(true);
  };

  const openEditTemplate = async () => {
    if (!templateId) return;
    setTplDialogMode("edit");
    setTplDialogOpen(true);
    try {
      const detail = await api.getTemplate(templateId);
      setTplEditingDetail(detail);
    } catch (e) {
      console.error(e);
      alert("Failed to load template.");
      setTplDialogOpen(false);
    }
  };

  const saveTemplate = async (value: TemplateDialogValue) => {
    setTplDialogSaving(true);
    try {
      if (tplDialogMode === "create") {
        const created = await api.createTemplate(value);

        // Optimistic add: ensures Step 2 dropdown shows it immediately
        setTemplates((prev) => {
          const exists = prev.some((t) => t.id === created.id);
          if (exists) return prev;
          const minimal: TemplateSummary = {
            id: created.id,
            name: created.name,
            description: created.description,
            updatedAt: (created as any).updatedAt,
          } as any;
          return [minimal, ...prev];
        });

        // Also refresh from server (in case server adds/changes fields)
        refreshTemplates();

        setTemplateId(created.id);
      } else {
        await api.updateTemplate(templateId, value);
        await refreshTemplates();
      }
      setTplDialogOpen(false);
    } catch (e) {
      console.error(e);
      alert("Failed to save template.");
    } finally {
      setTplDialogSaving(false);
    }
  };

  return (
    <Box
      sx={{
        display: "grid",
        gap: 1.5,
        p: 1,
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        "& .MuiTextField-root": { width: "100%" },
        "& .MuiFormControl-root": { width: "100%" },
      }}
    >
      {errorMsg ? (
        <Alert severity="error" onClose={() => setErrorMsg("")}>
          {errorMsg}
        </Alert>
      ) : null}
      {/* Ready/Download banner (shows even on selection without regenerating) */}
      {readyDoc && readyDoc.status !== "DRAFT" && (
        <Alert
          severity={statusColor[readyDoc.status]}
          action={
            <Stack direction="row" spacing={1} sx={{ flexShrink: 0, alignItems: "center" }}>
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
                disabled={disabled || submitting || !step2Valid}
              >
                Regenerate
              </Button>
            </Stack>
          }
          sx={{
            mb: 1,
            // This is the key for MUI Alert overflow issues
            "& .MuiAlert-message": { minWidth: 0, flex: 1 },
            "& .MuiAlert-action": { alignItems: "center" },
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ whiteSpace: "nowrap", flexShrink: 0 }}>
              Status: <strong>{readyDoc.status}</strong>
            </Typography>

            {readyDoc.outputPath ? (
              <Chip
                size="small"
                label={readyDoc.suggestedName}
                sx={{
                  minWidth: 0,
                  maxWidth: "100%",
                  "& .MuiChip-label": {
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "100%",
                  },
                }}
              />
            ) : null}
          </Box>
        </Alert>
      )}

      {step === 1 ? (
        <>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Step 1: Motion details
          </Typography>

          <TextField
            label="Motion type"
            value={motionType}
            onChange={(e) => setMotionType(e.target.value)}
            disabled={disabled}
            placeholder="e.g., Motion to Compel Discovery"
            fullWidth
          />

          <TextField
            label="Facts"
            value={facts}
            onChange={(e) => setFacts(e.target.value)}
            disabled={disabled}
            multiline
            minRows={6}
            placeholder="Describe the relevant facts..."
            fullWidth
          />

          <TextField
            label="Case number"
            value={caseNumber}
            onChange={(e) => {
              setCaseNumber(e.target.value);
              onCaseNumberChange?.(e.target.value);
            }}
            disabled={disabled}
            placeholder="e.g., 2025-CA-004389"
            fullWidth
          />

          <TextField
            label="Court"
            value={court}
            onChange={(e) => setCourt(e.target.value)}
            disabled={disabled}
            placeholder="e.g., Circuit Court of ..."
            fullWidth
          />

          <TextField
            label="Plaintiff"
            value={plaintiff}
            onChange={(e) => setPlaintiff(e.target.value)}
            disabled={disabled}
            placeholder="Plaintiff name"
            fullWidth
          />

          <TextField
            label="Defendants"
            value={defendants}
            onChange={(e) => setDefendants(e.target.value)}
            disabled={disabled}
            placeholder="Separate with semicolons (;) or commas (,)..."
            fullWidth
          />

          <Divider sx={{ my: 1 }} />

          {researchError ? (
            <Alert severity="error" onClose={() => setResearchError("")} sx={{ mb: 1 }}>
              {researchError}
            </Alert>
          ) : null}

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="center">
            <Button
              variant="contained"
              onClick={handleResearch}
              disabled={disabled || researching || !baseValid}
              startIcon={researching ? <CircularProgress size={16} /> : undefined}
            >
              Find authorities
            </Button>

            <Button
              variant="outlined"
              onClick={() => {
                setStep(2);
                void persistDraft({ templateId: null, selectedAuthorities: null } as any);
              }}
              disabled={disabled || !baseValid}
            >
              Skip (go to template)
            </Button>

            {!baseValid ? (
              <Typography variant="caption" color="text.secondary">
                Fill out all motion fields to continue.
              </Typography>
            ) : null}
          </Stack>
        </>
      ) : (
        <>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Tooltip title="Back to motion details">
              <IconButton onClick={() => setStep(1)} size="small">
                <ArrowBackOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Step 2: Template + authorities
            </Typography>
          </Stack>

          <Stack spacing={1}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }}>
              <FormControl fullWidth>
                <InputLabel id="tpl-select-label">Template</InputLabel>
                <Select
                  labelId="tpl-select-label"
                  label="Template"
                  value={templateId}
                  onChange={(e) => setTemplateId(String(e.target.value))}
                  disabled={disabled || templatesLoading}
                  onOpen={() => {
                    // Refresh when user opens dropdown (fixes “created in navbar but not here”)
                    if (!templatesLoading) refreshTemplates();
                  }}
                >
                  {templatesLoading ? (
                    <MenuItem value="" disabled>
                      Loading...
                    </MenuItem>
                  ) : templates.length === 0 ? (
                    <MenuItem value="" disabled>
                      No templates yet
                    </MenuItem>
                  ) : (
                    templates.map((t) => (
                      <MenuItem key={t.id} value={t.id}>
                        {t.name}
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>

              <Button variant="outlined" onClick={openCreateTemplate} startIcon={<AddOutlinedIcon />} disabled={disabled}>
                Create
              </Button>

              <Tooltip title={templateId ? "Edit selected template" : "Select a template first"}>
                <span>
                  <Button
                    variant="outlined"
                    onClick={openEditTemplate}
                    startIcon={<EditOutlinedIcon />}
                    disabled={disabled || !templateId}
                  >
                    Edit
                  </Button>
                </span>
              </Tooltip>
            </Stack>

            {!templateId ? <Alert severity="warning">You must select a template before generating.</Alert> : null}

            <Divider sx={{ my: 1 }} />

            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Authorities
            </Typography>

            {!authorities ? (
              <Typography variant="body2" color="text.secondary">
                No authorities loaded yet. Click "Find authorities" in Step 1, or generate without selecting any.
              </Typography>
            ) : (
              <Stack spacing={2}>
                {AUTH_GROUPS.map((g) => {
                  const arr = Array.isArray((authorities as any)[g.key]) ? (authorities as any)[g.key] : [];
                  if (!arr.length) return null;
                  return (
                    <Box key={g.key} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.25 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                        {g.label}
                      </Typography>
                      <Stack spacing={0.5}>
                        {arr.map((a: any, idx: number) => {
                          const checked = (selectedIndex[g.key] ?? []).includes(idx);
                          return (
                            <Button
                              key={`${g.key}-${idx}`}
                              onClick={() => toggleAuthority(g.key, idx)}
                              variant={checked ? "contained" : "outlined"}
                              size="small"
                              fullWidth
                              sx={{
                                justifyContent: "flex-start",
                                textTransform: "none",
                                alignItems: "flex-start",
                                textAlign: "left",
                                whiteSpace: "normal",
                                maxWidth: "100%",
                                minWidth: 0,
                                "& .MuiButton-startIcon": { marginTop: 0.25 },
                              }}
                            >
                              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0, width: "100%" }}>
                                <span>{authorityLabel(a)}</span>
                                {a?.citation ? (
                                  <Typography variant="caption" color="text.secondary" sx={{ textAlign: "left" }}>
                                    {a.citation}
                                  </Typography>
                                ) : null}
                              </Box>
                            </Button>
                          );
                        })}
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            )}

            <Divider sx={{ my: 1 }} />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="center">
              <Button
                variant="contained"
                onClick={handleSubmit}
                disabled={disabled || submitting || !step2Valid}
                startIcon={submitting ? <CircularProgress size={16} /> : undefined}
              >
                Generate motion
              </Button>

              <Button
                variant="outlined"
                onClick={handleResearch}
                disabled={disabled || researching || !baseValid}
                startIcon={researching ? <CircularProgress size={16} /> : undefined}
              >
                Re-run research
              </Button>

              {!step2Valid ? (
                <Typography variant="caption" color="text.secondary">
                  Select a template to enable generation.
                </Typography>
              ) : null}
            </Stack>
          </Stack>
        </>
      )}

      <TemplateDialog
        open={tplDialogOpen}
        title={tplDialogMode === "create" ? "Create template" : "Edit template"}
        initialValue={
          tplDialogMode === "edit"
            ? {
              name: tplEditingDetail?.name ?? "",
              description: tplEditingDetail?.description ?? "",
              markdown: tplEditingDetail?.markdown ?? "",
              builderJson: tplEditingDetail?.builderJson,
            }
            : { name: "", description: "", markdown: "" }
        }
        saving={tplDialogSaving}
        onCancel={() => setTplDialogOpen(false)}
        onSave={saveTemplate}
      />
    </Box>
  );
}