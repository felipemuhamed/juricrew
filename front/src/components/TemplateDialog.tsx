import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useEffect, useMemo, useState } from "react";
import Markdown from "./Markdown";

export type TemplateDialogValue = {
  name: string;
  description?: string | null;
  markdown: string;
  builderJson?: any;
};

type Language = "en" | "pt";
type SectionKind = "paragraph" | "numbered" | "bullets";

type BuilderSection = {
  id: string;
  title: string;
  kind: SectionKind;
  sampleCount?: number;
  optional?: boolean;
  enabled?: boolean;
};

type SignatureTextField = {
  enabled: boolean;
  text: string;
};

type SignatureMultiField = {
  enabled: boolean;
  items: string[];
};

type SignatureConfig = {
  attorneyName: SignatureTextField;
  lawFirm: SignatureTextField;
  barNumber: SignatureTextField;
  address: SignatureMultiField;
  phone: SignatureMultiField;
  email: SignatureTextField;
};

type TemplateBuilderState = {
  version: 2;
  language: Language;
  includeCaptionBlock: boolean;
  includeReferences: boolean;
  includeSignature: boolean;
  sections: BuilderSection[];
  signature: SignatureConfig;
};

function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function Tip({
  text,
  size = "small",
}: {
  text: string;
  size?: "small" | "medium";
}) {
  return (
    <Tooltip title={text} placement="top" arrow>
      <IconButton size={size} sx={{ ml: 0.5 }}>
        <InfoOutlinedIcon fontSize={size === "small" ? "small" : "medium"} />
      </IconButton>
    </Tooltip>
  );
}

function defaultSections(language: Language): BuilderSection[] {
  if (language === "pt") {
    return [
      { id: uid(), title: "I. SÍNTESE DA DEMANDA", kind: "paragraph", enabled: true },
      { id: uid(), title: "II. DOS FATOS", kind: "numbered", sampleCount: 2, enabled: true },
      { id: uid(), title: "III. DO DIREITO", kind: "paragraph", enabled: true },
      { id: uid(), title: "IV. DO MÉRITO", kind: "paragraph", enabled: true },
      { id: uid(), title: "V. DOS PEDIDOS", kind: "bullets", sampleCount: 2, enabled: true },
    ];
  }

  return [
    { id: uid(), title: "I. INTRODUCTION", kind: "paragraph", enabled: true },
    { id: uid(), title: "II. STATEMENT OF FACTS", kind: "numbered", sampleCount: 3, enabled: true },
    { id: uid(), title: "III. ARGUMENT", kind: "paragraph", enabled: true },
    { id: uid(), title: "IV. CONCLUSION", kind: "paragraph", enabled: true },
    { id: uid(), title: "V. PRAYER FOR RELIEF", kind: "bullets", sampleCount: 3, enabled: true },
  ];
}

function defaultBuilder(language: Language): TemplateBuilderState {
  return {
    version: 2,
    language,
    includeCaptionBlock: true,
    includeReferences: true,
    includeSignature: true,
    sections: defaultSections(language),
    signature: {
      attorneyName: { enabled: true, text: "" },
      lawFirm: { enabled: true, text: "" },
      barNumber: { enabled: true, text: "" },
      address: { enabled: true, items: [""] },
      phone: { enabled: true, items: [""] },
      email: { enabled: true, text: "" },
    },
  };
}

function coerceBuilderJson(b: any, fallbackLanguage: Language = "pt"): TemplateBuilderState {
  // Handles older saved templates (version 1) and ensures all required fields exist.
  if (b && typeof b === "object") {
    if (b.version === 2) {
      const base = defaultBuilder((b.language as Language) ?? fallbackLanguage);
      return {
        ...base,
        ...b,
        sections: Array.isArray(b.sections) ? b.sections : base.sections,
        signature: {
          ...base.signature,
          ...(b.signature ?? {}),
          address: {
            ...base.signature.address,
            ...(b.signature?.address ?? {}),
            items:
              Array.isArray(b.signature?.address?.items) && b.signature.address.items.length
                ? b.signature.address.items
                : base.signature.address.items,
          },
          phone: {
            ...base.signature.phone,
            ...(b.signature?.phone ?? {}),
            items:
              Array.isArray(b.signature?.phone?.items) && b.signature.phone.items.length
                ? b.signature.phone.items
                : base.signature.phone.items,
          },
        },
      } as TemplateBuilderState;
    }

    if (b.version === 1) {
      const lang = (b.language as Language) ?? fallbackLanguage;
      const base = defaultBuilder(lang);
      const sf = b.signatureFields ?? {};

      return {
        ...base,
        language: lang,
        includeCaptionBlock: b.includeCaptionBlock ?? base.includeCaptionBlock,
        includeReferences: b.includeReferences ?? base.includeReferences,
        includeSignature: b.includeSignature ?? base.includeSignature,
        sections: Array.isArray(b.sections) ? b.sections : base.sections,
        signature: {
          attorneyName: { enabled: !!sf.attorneyName, text: "" },
          lawFirm: { enabled: !!sf.lawFirm, text: "" },
          barNumber: { enabled: !!sf.barNumber, text: "" },
          address: { enabled: !!sf.address, items: !!sf.address ? [""] : [] },
          phone: { enabled: !!sf.phone, items: !!sf.phone ? [""] : [] },
          email: { enabled: !!sf.email, text: "" },
        },
      };
    }
  }

  return defaultBuilder(fallbackLanguage);
}

function buildMarkdown(builder: TemplateBuilderState): string {
  const lines: string[] = [];

  if (builder.includeCaptionBlock) {
    lines.push(`# [[COURT NAME]]`, ``);
    lines.push(`[[CASE NUMBER]]`, ``);
    lines.push(`[[PLAINTIFF NAME]],`, ``);
    lines.push(`vs.`, ``);
    lines.push(`[[DEFENDANT NAME]].`, ``);
  }

  lines.push(`## [[MOTION TYPE]]`, ``);

  const enabledSections = (builder.sections ?? []).filter((s) => s.enabled !== false);

  for (const s of enabledSections) {
    lines.push(`### ${s.title}`, ``);

    if (s.kind === "numbered") {
      const n = Math.max(1, s.sampleCount ?? 2);
      for (let i = 1; i <= n; i++) lines.push(`${i}. [Item ${i}]`);
      lines.push(``);
    } else if (s.kind === "bullets") {
      const n = Math.max(1, s.sampleCount ?? 2);
      for (let i = 1; i <= n; i++) lines.push(`* [Item ${i}]`);
      lines.push(``);
    } else {
      lines.push(`[Insert paragraph text here.]`, ``);
    }
  }

  if (builder.includeReferences) {
    lines.push(`### ${builder.language === "pt" ? "REFERÊNCIAS" : "REFERENCES"}`, ``);
    lines.push(`[List cited authorities here.]`, ``);
  }

  if (builder.includeSignature) {
    lines.push(`### ${builder.language === "pt" ? "ASSINATURA" : "SIGNATURE"}`, ``);

    const sigLines: string[] = [];

    const pushText = (enabled: boolean, text: string, placeholder: string) => {
      if (!enabled) return;
      const t = (text ?? "").trim();
      sigLines.push(t.length ? t : placeholder);
    };

    const pushMulti = (enabled: boolean, items: string[], placeholder: string) => {
      if (!enabled) return;
      const vals = (items ?? []).map((v) => (v ?? "").trim()).filter(Boolean);
      if (!vals.length) {
        sigLines.push(placeholder);
        return;
      }
      sigLines.push(...vals);
    };

    pushText(builder.signature.attorneyName.enabled, builder.signature.attorneyName.text, "[[ATTORNEY NAME]]");
    pushText(builder.signature.lawFirm.enabled, builder.signature.lawFirm.text, "[[LAW FIRM]]");
    pushText(builder.signature.barNumber.enabled, builder.signature.barNumber.text, "[[BAR NUMBER]]");
    pushMulti(builder.signature.address.enabled, builder.signature.address.items, "[[ADDRESS]]");
    pushMulti(builder.signature.phone.enabled, builder.signature.phone.items, "[[PHONE]]");
    pushText(builder.signature.email.enabled, builder.signature.email.text, "[[EMAIL]]");

    for (let i = 0; i < sigLines.length; i++) {
      const line = sigLines[i];
      // Use markdown hard line-breaks (two spaces) for all but the last line.
      lines.push(i === sigLines.length - 1 ? line : `${line}  `);
    }

    lines.push(``);
  }

  return lines.join("\n").trim() + "\n";
}

export default function TemplateDialog({
  open,
  title,
  initialValue,
  saving,
  onCancel,
  onSave,
}: {
  open: boolean;
  title: string;
  initialValue?: Partial<TemplateDialogValue> | null;
  saving?: boolean;
  onCancel: () => void;
  onSave: (value: TemplateDialogValue) => void;
}) {
  const initial = useMemo<TemplateDialogValue>(
    () => ({
      name: initialValue?.name ?? "",
      description: initialValue?.description ?? "",
      markdown: initialValue?.markdown ?? "",
      builderJson: initialValue?.builderJson,
    }),
    [initialValue]
  );

  const [tab, setTab] = useState<"builder" | "markdown">("builder");

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [markdown, setMarkdown] = useState(initial.markdown);

  const [builder, setBuilder] = useState<TemplateBuilderState>(() => {
    return coerceBuilderJson(initial.builderJson, "pt");
  });

  useEffect(() => {
    if (!open) return;

    setName(initial.name);
    setDescription(initial.description ?? "");
    setMarkdown(initial.markdown);

    const b = initial.builderJson;
    setBuilder(coerceBuilderJson(b, "pt"));

    setTab("builder");
  }, [open, initial]);

  const isSaving = !!saving;
  const canSave = name.trim().length > 0 && markdown.trim().length > 0;

  const previewMarkdown = useMemo(() => {
    return markdown.trim().length ? markdown : buildMarkdown(builder);
  }, [markdown, builder]);

  const handleGenerateMarkdown = () => {
    const md = buildMarkdown(builder);
    setMarkdown(md);
    setTab("markdown");
  };

  const handleSave = () => {
    if (!canSave || isSaving) return;
    onSave({
      name: name.trim(),
      description: description?.trim() ? description.trim() : null,
      markdown,
      builderJson: builder,
    });
  };

  const updateSection = (id: string, patch: Partial<BuilderSection>) => {
    setBuilder((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  };

  const deleteSection = (id: string) => {
    setBuilder((prev) => ({ ...prev, sections: prev.sections.filter((s) => s.id !== id) }));
  };

  const moveSection = (id: string, dir: -1 | 1) => {
    setBuilder((prev) => {
      const idx = prev.sections.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.sections.length) return prev;
      const copy = [...prev.sections];
      const tmp = copy[idx];
      copy[idx] = copy[nextIdx];
      copy[nextIdx] = tmp;
      return { ...prev, sections: copy };
    });
  };

  const setLanguage = (lang: Language) => {
    setBuilder((prev) => {
      const next = defaultBuilder(lang);
      next.signature = prev.signature ?? next.signature;
      next.includeCaptionBlock = prev.includeCaptionBlock;
      next.includeReferences = prev.includeReferences;
      next.includeSignature = prev.includeSignature;
      return next;
    });
  };

  return (
    <Dialog open={open} onClose={isSaving ? undefined : onCancel} maxWidth="lg" fullWidth>
      <DialogTitle>{title}</DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Box>
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <Typography variant="body2" sx={{ fontWeight: 700, mr: 0.5 }}>
                Template name *
              </Typography>
              <Tip text="A short name your team will recognize (e.g., 'Motion to Compel – FL')." />
            </Box>
            <TextField
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              required
              placeholder="e.g., Motion to Compel – Florida"
            />
          </Box>

          <Box>
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <Typography variant="body2" sx={{ fontWeight: 700, mr: 0.5 }}>
                Description (optional)
              </Typography>
              <Tip text="Explain when to use this template (jurisdiction, court, motion type)." />
            </Box>
            <TextField
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              placeholder="e.g., Use in FL Circuit Court for discovery disputes."
            />
          </Box>

          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
            <Tab value="builder" label="Guided builder" />
            <Tab value="markdown" label="Markdown (advanced)" />
          </Tabs>

          {tab === "builder" ? (
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Stack spacing={2}>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Stack spacing={2}>
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                        <Box sx={{ display: "flex", alignItems: "center" }}>
                          <Typography variant="subtitle1">Builder settings</Typography>
                          <Tip text="Choose how your motion template is structured. We'll generate the final template automatically." size="medium" />
                        </Box>

                        <Button variant="contained" onClick={handleGenerateMarkdown} disabled={isSaving}>
                          Generate Markdown
                        </Button>
                      </Box>

                      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <Box sx={{ display: "flex", alignItems: "center", minWidth: 110 }}>
                          <Typography variant="body2" sx={{ opacity: 0.85, mr: 0.5 }}>
                            Language
                          </Typography>
                          <Tip text="Pick the language your team uses. This sets default section titles." />
                        </Box>

                        <FormControl size="small" sx={{ minWidth: 180 }}>
                          <Select value={builder.language} onChange={(e) => setLanguage(e.target.value as Language)}>
                            <MenuItem value="pt">Português</MenuItem>
                            <MenuItem value="en">English</MenuItem>
                          </Select>
                        </FormControl>
                      </Box>

                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={builder.includeCaptionBlock}
                              onChange={(e) => setBuilder((p) => ({ ...p, includeCaptionBlock: e.target.checked }))}
                            />
                          }
                          label="Include caption block"
                        />
                        <Tip text="Adds Court name, Case number, and party caption at the top." />
                      </Box>

                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={builder.includeReferences}
                              onChange={(e) => setBuilder((p) => ({ ...p, includeReferences: e.target.checked }))}
                            />
                          }
                          label="Include References section"
                        />
                        <Tip text="Adds a References section where selected authorities can be listed or cited." />
                      </Box>

                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={builder.includeSignature}
                              onChange={(e) => setBuilder((p) => ({ ...p, includeSignature: e.target.checked }))}
                            />
                          }
                          label="Include Signature block"
                        />
                        <Tip text="Adds an attorney signature block at the end. You can choose which fields to include." />
                      </Box>

                      {builder.includeSignature ? (
                        <Box sx={{ pl: 1 }}>
                          <Box sx={{ display: "flex", alignItems: "center" }}>
                            <Typography variant="body2" sx={{ opacity: 0.85, mb: 1, mr: 0.5 }}>
                              Signature fields
                            </Typography>
                            <Tip text="Turn on fields your firm typically includes. These are placeholders and get filled later." />
                          </Box>

                          <Grid container spacing={1}>
                            <Grid item xs={12} sm={6}>
                              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <FormControlLabel
                                  control={
                                    <Switch
                                      checked={!!builder.signature.attorneyName.enabled}
                                      onChange={(e) =>
                                        setBuilder((p) => ({
                                          ...p,
                                          signature: {
                                            ...p.signature,
                                            attorneyName: { ...p.signature.attorneyName, enabled: e.target.checked, text: p.signature.attorneyName.text ?? "" },
                                          },
                                        }))
                                      }
                                    />
                                  }
                                  label="Attorney name"
                                />
                                <Tip text="The signing attorney’s name." />
                              </Box>
                              {builder.signature.attorneyName.enabled ? (
                                <Box sx={{ pl: 4, pr: 1, pb: 1 }}>
                                  <TextField
                                    size="small"
                                    fullWidth
                                    placeholder="e.g., Jane Q. Attorney"
                                    value={builder.signature.attorneyName.text}
                                    onChange={(e) =>
                                      setBuilder((p) => ({
                                        ...p,
                                        signature: {
                                          ...p.signature,
                                          attorneyName: { ...p.signature.attorneyName, text: e.target.value },
                                        },
                                      }))
                                    }
                                  />
                                </Box>
                              ) : null}
                            </Grid>

                            <Grid item xs={12} sm={6}>
                              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <FormControlLabel
                                  control={
                                    <Switch
                                      checked={!!builder.signature.lawFirm.enabled}
                                      onChange={(e) =>
                                        setBuilder((p) => ({
                                          ...p,
                                          signature: {
                                            ...p.signature,
                                            lawFirm: { ...p.signature.lawFirm, enabled: e.target.checked, text: p.signature.lawFirm.text ?? "" },
                                          },
                                        }))
                                      }
                                    />
                                  }
                                  label="Law firm"
                                />
                                <Tip text="The firm name on the signature block." />
                              </Box>
                              {builder.signature.lawFirm.enabled ? (
                                <Box sx={{ pl: 4, pr: 1, pb: 1 }}>
                                  <TextField
                                    size="small"
                                    fullWidth
                                    placeholder="e.g., Smith & Partners, PLLC"
                                    value={builder.signature.lawFirm.text}
                                    onChange={(e) =>
                                      setBuilder((p) => ({
                                        ...p,
                                        signature: {
                                          ...p.signature,
                                          lawFirm: { ...p.signature.lawFirm, text: e.target.value },
                                        },
                                      }))
                                    }
                                  />
                                </Box>
                              ) : null}
                            </Grid>

                            <Grid item xs={12} sm={6}>
                              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <FormControlLabel
                                  control={
                                    <Switch
                                      checked={!!builder.signature.barNumber.enabled}
                                      onChange={(e) =>
                                        setBuilder((p) => ({
                                          ...p,
                                          signature: {
                                            ...p.signature,
                                            barNumber: { ...p.signature.barNumber, enabled: e.target.checked, text: p.signature.barNumber.text ?? "" },
                                          },
                                        }))
                                      }
                                    />
                                  }
                                  label="Bar number"
                                />
                                <Tip text="Attorney bar number if required." />
                              </Box>
                              {builder.signature.barNumber.enabled ? (
                                <Box sx={{ pl: 4, pr: 1, pb: 1 }}>
                                  <TextField
                                    size="small"
                                    fullWidth
                                    placeholder="e.g., FL Bar No. 123456"
                                    value={builder.signature.barNumber.text}
                                    onChange={(e) =>
                                      setBuilder((p) => ({
                                        ...p,
                                        signature: {
                                          ...p.signature,
                                          barNumber: { ...p.signature.barNumber, text: e.target.value },
                                        },
                                      }))
                                    }
                                  />
                                </Box>
                              ) : null}
                            </Grid>

                            <Grid item xs={12} sm={6}>
                              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <FormControlLabel
                                  control={
                                    <Switch
                                      checked={!!builder.signature.email.enabled}
                                      onChange={(e) =>
                                        setBuilder((p) => ({
                                          ...p,
                                          signature: {
                                            ...p.signature,
                                            email: { ...p.signature.email, enabled: e.target.checked, text: p.signature.email.text ?? "" },
                                          },
                                        }))
                                      }
                                    />
                                  }
                                  label="Email"
                                />
                                <Tip text="Attorney email address." />
                              </Box>
                              {builder.signature.email.enabled ? (
                                <Box sx={{ pl: 4, pr: 1, pb: 1 }}>
                                  <TextField
                                    size="small"
                                    fullWidth
                                    placeholder="e.g., attorney@lawfirm.com"
                                    value={builder.signature.email.text}
                                    onChange={(e) =>
                                      setBuilder((p) => ({
                                        ...p,
                                        signature: {
                                          ...p.signature,
                                          email: { ...p.signature.email, text: e.target.value },
                                        },
                                      }))
                                    }
                                  />
                                </Box>
                              ) : null}
                            </Grid>

                            <Grid item xs={12}>
                              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <FormControlLabel
                                  control={
                                    <Switch
                                      checked={!!builder.signature.address.enabled}
                                      onChange={(e) =>
                                        setBuilder((p) => ({
                                          ...p,
                                          signature: {
                                            ...p.signature,
                                            address: {
                                              ...p.signature.address,
                                              enabled: e.target.checked,
                                              items:
                                                e.target.checked && (!p.signature.address.items || p.signature.address.items.length === 0)
                                                  ? [""]
                                                  : p.signature.address.items ?? [],
                                            },
                                          },
                                        }))
                                      }
                                    />
                                  }
                                  label="Address"
                                />
                                <Tip text="Mailing address for the firm/attorney (multiple lines allowed)." />
                              </Box>
                              {builder.signature.address.enabled ? (
                                <Box sx={{ pl: 4, pr: 1, pb: 1 }}>
                                  <Stack spacing={1}>
                                    {(builder.signature.address.items ?? [""]).map((val, idx) => (
                                      <Box key={`addr-${idx}`} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                        <TextField
                                          size="small"
                                          fullWidth
                                          placeholder={idx === 0 ? "Address line 1" : `Address line ${idx + 1}`}
                                          value={val}
                                          onChange={(e) =>
                                            setBuilder((p) => {
                                              const items = [...(p.signature.address.items ?? [""])];
                                              items[idx] = e.target.value;
                                              return { ...p, signature: { ...p.signature, address: { ...p.signature.address, items } } };
                                            })
                                          }
                                        />
                                        <Button
                                          size="small"
                                          color="error"
                                          disabled={(builder.signature.address.items?.length ?? 1) <= 1}
                                          onClick={() =>
                                            setBuilder((p) => {
                                              const items = [...(p.signature.address.items ?? [""])];
                                              if (items.length <= 1) return p;
                                              items.splice(idx, 1);
                                              return { ...p, signature: { ...p.signature, address: { ...p.signature.address, items } } };
                                            })
                                          }
                                        >
                                          Remove
                                        </Button>
                                      </Box>
                                    ))}

                                    <Box>
                                      <Button
                                        size="small"
                                        onClick={() =>
                                          setBuilder((p) => {
                                            const items = [...(p.signature.address.items ?? [""])];
                                            items.push("");
                                            return { ...p, signature: { ...p.signature, address: { ...p.signature.address, items } } };
                                          })
                                        }
                                      >
                                        Add address line
                                      </Button>
                                    </Box>
                                  </Stack>
                                </Box>
                              ) : null}
                            </Grid>

                            <Grid item xs={12}>
                              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <FormControlLabel
                                  control={
                                    <Switch
                                      checked={!!builder.signature.phone.enabled}
                                      onChange={(e) =>
                                        setBuilder((p) => ({
                                          ...p,
                                          signature: {
                                            ...p.signature,
                                            phone: {
                                              ...p.signature.phone,
                                              enabled: e.target.checked,
                                              items:
                                                e.target.checked && (!p.signature.phone.items || p.signature.phone.items.length === 0)
                                                  ? [""]
                                                  : p.signature.phone.items ?? [],
                                            },
                                          },
                                        }))
                                      }
                                    />
                                  }
                                  label="Phone"
                                />
                                <Tip text="Office phone number(s) (multiple numbers allowed)." />
                              </Box>
                              {builder.signature.phone.enabled ? (
                                <Box sx={{ pl: 4, pr: 1, pb: 1 }}>
                                  <Stack spacing={1}>
                                    {(builder.signature.phone.items ?? [""]).map((val, idx) => (
                                      <Box key={`phone-${idx}`} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                        <TextField
                                          size="small"
                                          fullWidth
                                          placeholder={idx === 0 ? "Phone number 1" : `Phone number ${idx + 1}`}
                                          value={val}
                                          onChange={(e) =>
                                            setBuilder((p) => {
                                              const items = [...(p.signature.phone.items ?? [""])];
                                              items[idx] = e.target.value;
                                              return { ...p, signature: { ...p.signature, phone: { ...p.signature.phone, items } } };
                                            })
                                          }
                                        />
                                        <Button
                                          size="small"
                                          color="error"
                                          disabled={(builder.signature.phone.items?.length ?? 1) <= 1}
                                          onClick={() =>
                                            setBuilder((p) => {
                                              const items = [...(p.signature.phone.items ?? [""])];
                                              if (items.length <= 1) return p;
                                              items.splice(idx, 1);
                                              return { ...p, signature: { ...p.signature, phone: { ...p.signature.phone, items } } };
                                            })
                                          }
                                        >
                                          Remove
                                        </Button>
                                      </Box>
                                    ))}

                                    <Box>
                                      <Button
                                        size="small"
                                        onClick={() =>
                                          setBuilder((p) => {
                                            const items = [...(p.signature.phone.items ?? [""])];
                                            items.push("");
                                            return { ...p, signature: { ...p.signature, phone: { ...p.signature.phone, items } } };
                                          })
                                        }
                                      >
                                        Add phone number
                                      </Button>
                                    </Box>
                                  </Stack>
                                </Box>
                              ) : null}
                            </Grid>
                          </Grid>
                        </Box>
                      ) : null}
                    </Stack>
                  </Paper>

                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Stack spacing={1.5}>
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                        <Box sx={{ display: "flex", alignItems: "center" }}>
                          <Typography variant="subtitle1">Sections</Typography>
                          <Tip text="Add, reorder, or disable sections. These become headings in the generated template." size="medium" />
                        </Box>

                        <Button
                          variant="outlined"
                          onClick={() =>
                            setBuilder((p) => ({
                              ...p,
                              sections: [...p.sections, { id: uid(), title: "NEW SECTION", kind: "paragraph", enabled: true }],
                            }))
                          }
                          disabled={isSaving}
                        >
                          Add section
                        </Button>
                      </Box>

                      <Divider />

                      {builder.sections.map((s, idx) => (
                        <Paper key={s.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                          <Stack spacing={1}>
                            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                Section {idx + 1}
                              </Typography>
                              <Box sx={{ display: "flex", gap: 1 }}>
                                <Button size="small" onClick={() => moveSection(s.id, -1)} disabled={idx === 0 || isSaving}>
                                  Up
                                </Button>
                                <Button
                                  size="small"
                                  onClick={() => moveSection(s.id, 1)}
                                  disabled={idx === builder.sections.length - 1 || isSaving}
                                >
                                  Down
                                </Button>
                                <Button size="small" color="error" onClick={() => deleteSection(s.id)} disabled={isSaving}>
                                  Delete
                                </Button>
                              </Box>
                            </Box>

                            <Box>
                              <Box sx={{ display: "flex", alignItems: "center" }}>
                                <Typography variant="body2" sx={{ fontWeight: 700, mr: 0.5 }}>
                                  Title
                                </Typography>
                                <Tip text="This becomes the section heading in the template (e.g., 'STATEMENT OF FACTS')." />
                              </Box>
                              <TextField
                                value={s.title}
                                onChange={(e) => updateSection(s.id, { title: e.target.value })}
                                fullWidth
                                size="small"
                              />
                            </Box>

                            <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Typography variant="body2" sx={{ opacity: 0.85, minWidth: 60 }}>
                                  Type
                                </Typography>
                                <Tip text="Choose how the section content is structured: paragraph, numbered list, or bullets." />
                                <FormControl size="small" sx={{ minWidth: 180 }}>
                                  <Select
                                    value={s.kind}
                                    onChange={(e) => updateSection(s.id, { kind: e.target.value as SectionKind })}
                                  >
                                    <MenuItem value="paragraph">Paragraph</MenuItem>
                                    <MenuItem value="numbered">Numbered list</MenuItem>
                                    <MenuItem value="bullets">Bullets</MenuItem>
                                  </Select>
                                </FormControl>
                              </Box>

                              {(s.kind === "numbered" || s.kind === "bullets") ? (
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                  <TextField
                                    label="Sample items"
                                    type="number"
                                    size="small"
                                    value={s.sampleCount ?? 2}
                                    onChange={(e) => updateSection(s.id, { sampleCount: Number(e.target.value || 2) })}
                                    inputProps={{ min: 1, max: 10 }}
                                    sx={{ width: 140 }}
                                  />
                                  <Tip text="We add placeholder lines so users know what to fill in later." />
                                </Box>
                              ) : null}

                              <Box sx={{ display: "flex", alignItems: "center" }}>
                                <FormControlLabel
                                  control={
                                    <Switch
                                      checked={s.enabled !== false}
                                      onChange={(e) => updateSection(s.id, { enabled: e.target.checked })}
                                    />
                                  }
                                  label="Enabled"
                                />
                                <Tip text="Disabled sections will not appear in the final generated template." />
                              </Box>
                            </Box>
                          </Stack>
                        </Paper>
                      ))}
                    </Stack>
                  </Paper>
                </Stack>
              </Grid>

              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: "100%" }}>
                  <Box sx={{ display: "flex", alignItems: "center" }}>
                    <Typography variant="subtitle1" sx={{ mb: 1 }}>
                      Preview
                    </Typography>
                    <Tip text="This is what the generated template will look like. The placeholders will be filled when generating a motion." />
                  </Box>
                  <Divider sx={{ mb: 2 }} />
                  <Box sx={{ maxHeight: 520, overflow: "auto", pr: 1 }}>
                    <Markdown>{previewMarkdown}</Markdown>
                  </Box>
                </Paper>
              </Grid>
            </Grid>
          ) : (
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, mr: 0.5 }}>
                    Template (Markdown)
                  </Typography>
                  <Tip text="Advanced mode: edit the markdown directly. Most users shouldn’t need this." />
                </Box>
                <TextField
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  fullWidth
                  required
                  minRows={18}
                  multiline
                  placeholder="You can edit the generated markdown here, or paste your own..."
                />
                <Typography variant="caption" sx={{ opacity: 0.75, display: "block", mt: 1 }}>
                  Tip: placeholders like [[COURT NAME]] / [[CASE NUMBER]] / [[PLAINTIFF NAME]] get filled later.
                </Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: "100%" }}>
                  <Typography variant="subtitle1" sx={{ mb: 1 }}>
                    Preview
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  <Box sx={{ maxHeight: 520, overflow: "auto", pr: 1 }}>
                    <Markdown>{previewMarkdown}</Markdown>
                  </Box>
                </Paper>
              </Grid>
            </Grid>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave || isSaving}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}