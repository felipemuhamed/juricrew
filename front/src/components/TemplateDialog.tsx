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

type SignatureFields = {
  attorneyName: boolean;
  lawFirm: boolean;
  barNumber: boolean;
  address: boolean;
  phone: boolean;
  email: boolean;
};

type TemplateBuilderState = {
  version: 1;
  language: Language;
  includeCaptionBlock: boolean;
  includeReferences: boolean;
  includeSignature: boolean;
  sections: BuilderSection[];
  signatureFields: SignatureFields;
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
    version: 1,
    language,
    includeCaptionBlock: true,
    includeReferences: true,
    includeSignature: true,
    sections: defaultSections(language),
    signatureFields: {
      attorneyName: true,
      lawFirm: true,
      barNumber: true,
      address: true,
      phone: true,
      email: true,
    },
  };
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

    const sig: string[] = [];
    if (builder.signatureFields.attorneyName) sig.push(`[[ATTORNEY NAME]]  `);
    if (builder.signatureFields.lawFirm) sig.push(`[[LAW FIRM]]  `);
    if (builder.signatureFields.barNumber) sig.push(`[[BAR NUMBER]]  `);
    if (builder.signatureFields.address) sig.push(`[[ADDRESS]]  `);
    if (builder.signatureFields.phone) sig.push(`[[PHONE]]  `);
    if (builder.signatureFields.email) sig.push(`[[EMAIL]]`);

    lines.push(...sig, ``);
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
    const b = initial.builderJson;
    if (b && typeof b === "object" && (b as any).version === 1) return b as TemplateBuilderState;
    return defaultBuilder("pt");
  });

  useEffect(() => {
    if (!open) return;

    setName(initial.name);
    setDescription(initial.description ?? "");
    setMarkdown(initial.markdown);

    const b = initial.builderJson;
    if (b && typeof b === "object" && (b as any).version === 1) {
      setBuilder(b as TemplateBuilderState);
    } else {
      setBuilder(defaultBuilder("pt"));
    }

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
      next.signatureFields = prev.signatureFields ?? next.signatureFields;
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
                            {(
                              [
                                ["attorneyName", "Attorney name", "The signing attorney’s name."],
                                ["lawFirm", "Law firm", "The firm name on the signature block."],
                                ["barNumber", "Bar number", "Attorney bar number if required."],
                                ["address", "Address", "Mailing address for the firm/attorney."],
                                ["phone", "Phone", "Office phone number."],
                                ["email", "Email", "Attorney email address."],
                              ] as Array<[keyof SignatureFields, string, string]>
                            ).map(([k, label, tip]) => (
                              <Grid item xs={12} sm={6} key={k}>
                                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                  <FormControlLabel
                                    control={
                                      <Switch
                                        checked={!!builder.signatureFields?.[k]}
                                        onChange={(e) =>
                                          setBuilder((p) => ({
                                            ...p,
                                            signatureFields: { ...p.signatureFields, [k]: e.target.checked },
                                          }))
                                        }
                                      />
                                    }
                                    label={label}
                                  />
                                  <Tip text={tip} />
                                </Box>
                              </Grid>
                            ))}
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