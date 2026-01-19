// src/pages/ChatPage.tsx
import {
  Box,
  CircularProgress,
  Drawer,
  IconButton,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  Fab,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import {
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
} from "react";
import { api, Conv, Msg, Project } from "../api";
import { http } from "../http";
import { useTheme } from "@mui/material/styles";

// Local components (new)
import SidebarPanel from "../components/layout/SidebarPanel";
import TitleBar from "../components/layout/TitleBar";
import MessageList from "../components/messages/MessageList";
import PleadingCard from "../components/pleadings/PleadingCard";
import PleadingComposer, { PleadingPayload } from "../components/PleadingComposer";
import { DocRequestDTOHydrate } from "../api";

const pleadingDraftKeyFor = (convId: string) => `pleading_draft_${convId}`;

// Optional environment-driven default project id (MUST match PleadingComposer)
const DEFAULT_PROJECT_ID =
  (import.meta as any)?.env?.VITE_PROJECT_ID ||
  (window as any)?.__PROJECT_ID__ ||
  "juricrew-demo";

function parsePleadingSummary(text: string): null | {
  motionType: string; facts: string; caseNumber: string; court: string;
  plaintiff: string; defendants: string;
} {
  if (!text) return null;
  const norm = text.replace(/\r\n/g, "\n");

  const take = (label: string) => {
    const re = new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, "im");
    const m = norm.match(re);
    return (m?.[1] ?? "").trim();
  };

  const motionType = take("Motion type");
  const facts = take("Facts");
  const caseNumber = take("Case number");
  const court = take("Court");
  const plaintiff = take("Plaintiff");
  const defRaw = take("Defendant\\(s\\)");

  if (!motionType && !caseNumber && !facts && !court && !plaintiff && !defRaw) return null;

  const defendants = defRaw
    .split(/[,;]\s*|\n+/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .join("; ");

  return { motionType, facts, caseNumber, court, plaintiff, defendants };
}

// Utilities / constants
const SIDEBAR_WIDTH = 280;
const MAX_COLUMN = 960;
const SIDEBAR_BG = "#000000";
const SIDEBAR_BORDER = "1px solid rgba(255,255,255,0.08)";

const genId = (): string => {
  // @ts-ignore
  const c: Crypto | undefined = typeof crypto !== "undefined" ? crypto : undefined;
  // @ts-ignore
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // @ts-ignore
  if (c && typeof c.getRandomValues === "function") {
    return ([1e7] as any + -1e3 + -4e3 + -8e3 + -1e11).replace(
      /[018]/g,
      (x: any) =>
        (x ^ ((c.getRandomValues(new Uint8Array(1))[0] & 15) >> (x / 4))).toString(16)
    );
  }
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
};

function normalizeForSig(s: string) {
  return (s ?? "").replace(/\r\n/g, "\n").trimEnd();
}
function dedupeAdjacentByRoleAndContent(msgs: Msg[]): Msg[] {
  const out: Msg[] = [];
  let lastSig = "";
  for (const m of msgs) {
    const sig = `${m.role}|${normalizeForSig(m.content)}`;
    if (sig === lastSig) continue;
    out.push(m);
    lastSig = sig;
  }
  return out;
}

export default function ChatPage({ onLoggedOut }: { onLoggedOut?: () => void } = {}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // conversations + messages
  const [convs, setConvs] = useState<Conv[]>([]);
  const [current, setCurrent] = useState<Conv | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);

  // input (kept for minimal diffs; not used when PleadingComposer is active)
  const [input, setInput] = useState("");

  // folders + archived
  const [projects, setProjects] = useState<Project[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [archivedView, setArchivedView] = useState(false);

  // dialogs (handled inside SidebarPanel)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameInitial, setRenameInitial] = useState("");
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  // title edit
  const [titleEditing, setTitleEditing] = useState(false);
  const [pendingTitle, setPendingTitle] = useState("");
  const [draftTitle, setDraftTitle] = useState("");

  // layout + UX
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const mainColumnRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const [minListHeight, setMinListHeight] = useState(0);
  const endAnchorRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // streaming refs (keep original behavior)
  const streamAbortRef = useRef<AbortController | null>(null);
  const assistantIdRef = useRef<string | null>(null);

  const [pleadingSeed, setPleadingSeed] = useState<{
    motionType?: string; facts?: string; caseNumber?: string; court?: string;
    plaintiff?: string; defendants?: string;
    templateId?: string;
    selectedAuthorities?: any;
    researchedAuthorities?: any;
    motionId?: string;
    status?: any;
    outputPath?: string;
  } | undefined>(undefined);

  const [pleadingKey, setPleadingKey] = useState<string | undefined>(undefined);

  // Guided Tour: when the motion creation tour ends, reset the UI to the initial home screen.
  useEffect(() => {
    const onResetHome = () => {
      // Stop any streaming
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      assistantIdRef.current = null;

      // Reset selection + messages
      setCurrent(null);
      setMessages([]);
      setPleadingSeed(undefined);
      setPleadingKey(undefined);
      setTitleEditing(false);
      setPendingTitle("Untitled conversation");
      setDraftTitle("");

      // Close sidebar on mobile to show the home screen
      setSidebarOpen(false);
    };

    window.addEventListener("juricrew:tour:resetHome", onResetHome as any);
    return () => window.removeEventListener("juricrew:tour:resetHome", onResetHome as any);
  }, []);

  // ===== Derived structures for sidebar =====
  const projectTree = useMemo(() => {
    const map = new Map<string, Project & { children: any[] }>();
    projects.forEach((p) => map.set(p.id, { ...p, children: [] }));
    const roots: any[] = [];
    projects.forEach((p) => {
      const n = map.get(p.id)!;
      if (p.parentId && map.has(p.parentId)) map.get(p.parentId)!.children.push(n);
      else roots.push(n);
    });
    const sortRec = (xs: any[]) => {
      xs.sort((a, b) => a.name.localeCompare(b.name));
      xs.forEach((c) => sortRec(c.children));
    };
    sortRec(roots);
    return roots as any[];
  }, [projects]);

  const convsByProject = useMemo(() => {
    const m = new Map<string, Conv[]>();
    for (const c of convs) {
      if (c.archived) continue;
      if (!c.projectId) continue;
      if (!m.has(c.projectId)) m.set(c.projectId, []);
      m.get(c.projectId)!.push(c);
    }
    for (const [, arr] of m) arr.sort((a, b) => a.title.localeCompare(b.title));
    return m;
  }, [convs]);

  const unfiledConvs = useMemo(() => {
    if (archivedView) {
      const all = convs.filter((c) => c.archived).slice();
      all.sort((a, b) => a.title.localeCompare(b.title));
      return all;
    }
    const a = convs.filter((c) => !c.archived && !c.projectId).slice();
    a.sort((x, y) => x.title.localeCompare(y.title));
    return a;
  }, [convs, archivedView]);

  // ===== Effects =====
  useEffect(() => { void refreshProjects(); }, []);
  useEffect(() => { void refreshConvs(); }, [archivedView]);

  // auto-scroll toggle via IO
  useEffect(() => {
    if (!endAnchorRef.current) return;
    const target = endAnchorRef.current;
    const io = new IntersectionObserver(
      (entries) => setAutoScroll(entries[0].isIntersecting),
      { root: null, threshold: 0.01 }
    );
    io.observe(target);
    return () => io.disconnect();
  }, []);

  // measure available list height
  useLayoutEffect(() => {
    const measure = () => {
      const top = mainColumnRef.current?.getBoundingClientRect().top ?? 0;
      const titleH = titleRef.current?.offsetHeight ?? 0;
      const compH = composerRef.current?.offsetHeight ?? 0;
      const h = Math.max(0, Math.floor(window.innerHeight - top - titleH - compH - 1));
      setMinListHeight(h);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    let ro: any = null;
    const RO = (window as any).ResizeObserver;
    if (RO && composerRef.current) {
      ro = new RO(() => measure());
      ro.observe(composerRef.current);
    }
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      if (ro) ro.disconnect?.();
    };
  }, []);

  // keep auto-scroll
  useEffect(() => {
    if (autoScroll) endAnchorRef.current?.scrollIntoView({ block: "end" });
  }, [messages, loading, autoScroll]);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      assistantIdRef.current = null;
    };
  }, []);

  // ===== Data ops =====
  const refreshProjects = async () => setProjects(await api.listProjects());

  const refreshConvs = async () => {
    const list = await api.listConversations({ archived: archivedView ? true : undefined } as any);
    setConvs(list);

    if (current && list.find((c) => c.id === current.id)) {
      await loadMessages(current.id);
      return;
    }

    // no current or it disappeared -> start unselected/empty
    setCurrent(null);
    setMessages([]);
    setPleadingSeed(undefined);
    setPleadingKey(undefined);
    setPendingTitle(draftTitle || "Untitled conversation");
  };

  const loadMessages = async (convId: string) => {
    const msgs = await api.listMessages(convId);
    setMessages(dedupeAdjacentByRoleAndContent(msgs));
    if (autoScroll) requestAnimationFrame(() => endAnchorRef.current?.scrollIntoView({ block: "end" }));
  };

  // ---- FIX #1: Hydration must work for NEW conversations (unfiled) ----
  // The backend saves docs under an "effective projectId" used during generation.
  // PleadingComposer uses DEFAULT_PROJECT_ID when projectId is null/undefined.
  // So when a conversation is unfiled (projectId null), we MUST pass DEFAULT_PROJECT_ID
  // when doing "latest snapshot by case" lookups, or hydration will fail.
  const effectiveProjectIdForConv = (c: Conv): string | undefined => {
    return (c.projectId ?? undefined) || DEFAULT_PROJECT_ID;
  };

  // ---- FIX #2: tolerate multiple hydrate response shapes (LatestDocResp vs DocRequestDTOHydrate) ----
  const extractFields = (dto: any) => {
    if (!dto) return null;
    return dto.fields ?? dto.docRequestDTO?.fields ?? dto.snapshot?.fields ?? null;
  };

  const toSeed = (dto: any) => {
    const f = extractFields(dto);
    if (!f) return undefined;
    return {
      motionType: f.motion_type ?? "",
      facts: f.facts ?? "",
      caseNumber: f.case_number ?? "",
      court: f.court ?? "",
      plaintiff: f.plaintiff ?? "",
      defendants: Array.isArray(f.defendant) ? f.defendant.join("; ") : "",
      templateId: dto?.templateId ?? undefined,
      selectedAuthorities: dto?.selectedAuthorities ?? undefined,
      researchedAuthorities: dto?.researchedAuthorities ?? undefined,
      motionId: dto?.motionId ?? undefined,
      status: dto?.status ?? undefined,
      outputPath: dto?.outputPath ?? undefined,
    };
  };

  const handleSelectConv = async (c: Conv) => {
    // stop any streams
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    assistantIdRef.current = null;

    setCurrent(c);
    setTitleEditing(false);
    setPendingTitle(c.title);
    setDraftTitle("");

    // reset the form immediately
    setPleadingSeed(undefined);

    // stop any local drafts
    setPleadingKey(undefined);

    // optionally still load messages (history can be hidden later)
    await loadMessages(c.id);

    try {
      // 1) Try conversation-scoped hydrate first (tolerates 204/404)
      const hydrate = await api.latestDocSnapshotForConversation(c.id);
      let seed = toSeed(hydrate);

      const hydrateFields = extractFields(hydrate);
      if (hydrateFields?.case_number) {
        setPendingTitle(hydrateFields.case_number);
      }

      // 2) Fallback by case number (conversation titles are usually case numbers)
      if (!seed) {
        const caseNo = (c.title || "").trim();
        if (caseNo) {
          const byCase = await api.latestDocSnapshotByCase(caseNo, effectiveProjectIdForConv(c));
          seed = toSeed(byCase);

          const byCaseFields = extractFields(byCase);
          if (byCaseFields?.case_number) {
            setPendingTitle(byCaseFields.case_number);
          }
        }
      }

      setPleadingSeed(seed);
    } catch (e) {
      console.error("hydrate failed", e);
      setPleadingSeed(undefined);
    }

    // hide chat bubbles for the pleadings view
    setMessages([]);
    if (isMobile) setSidebarOpen(false);
  };

  const handleCaseNumberChange = async (value: string) => {
    const t = value.trim();
    setDraftTitle(t);
    if (!t) return;
    if (current) {
      try {
        await api.renameConversation(current.id, t);
        setConvs((arr) => arr.map((c) => (c.id === current.id ? { ...c, title: t } : c)));
        setCurrent((c) => (c ? { ...c, title: t } : c));
      } catch {
        // ignore
      }
    }
  };

  const displayTitle = (current?.title?.trim() || draftTitle || "Untitled conversation");

  const defaultTitle = () => `Chat ${new Date().toLocaleString()}`;
  const createConv = async (projectId: string | null): Promise<Conv> => {
    const c = await api.createConversation(defaultTitle(), projectId);
    await refreshConvs();
    await handleSelectConv(c);
    return c;
  };

  const buildFetchHeadersFromAxios = (): Record<string, string> => {
    const out: Record<string, string> = {};
    const common = (http.defaults.headers?.common ?? {}) as Record<string, any>;
    const post = (http.defaults.headers?.post ?? {}) as Record<string, any>;
    const merged = { ...common, ...post };
    for (const [k, v] of Object.entries(merged)) {
      if (v == null) continue;
      const key = k.trim();
      if (!key) continue;
      const lower = key.toLowerCase();
      if (lower === "content-type" || lower === "accept") continue;
      const sv = typeof v === "string" ? v : String(v);
      if (!sv || sv === "undefined" || sv === "null") continue;
      out[key] = sv;
    }
    out["Content-Type"] = "application/json";
    out["Accept"] = "text/plain, */*";
    if (!("Authorization" in out)) {
      const token =
        (http.defaults.headers.common?.["Authorization"] as string | undefined) ||
        localStorage.getItem("jwt") ||
        localStorage.getItem("token");
      if (token) out["Authorization"] = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    }
    return out;
  };

  const streamFromBackend = async (
    conversationId: string,
    onChunk: (t: string) => void,
    onDone: () => void
  ) => {
    const controller = new AbortController();
    streamAbortRef.current = controller;

    const base = (http.defaults.baseURL || "").replace(/\/$/, "");
    const url = `${base}/chat/stream`;
    const headers = buildFetchHeadersFromAxios();

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ conversationId }),
      signal: controller.signal,
      credentials: http.defaults.withCredentials ? "include" : "same-origin",
      cache: "no-store",
      redirect: "follow",
      keepalive: false,
    });

    if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}: ${await resp.text().catch(() => "")}`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let emittedUpTo = 0;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        let sentIdx = buffer.indexOf("\n[DONE]");
        if (sentIdx === -1) sentIdx = buffer.indexOf("\r\n[DONE]");
        const end = sentIdx === -1 ? buffer.length : sentIdx;
        if (end > emittedUpTo) {
          const slice = buffer.slice(emittedUpTo, end);
          onChunk(slice);
          emittedUpTo = end;
        }
        if (sentIdx !== -1) break;
      }
    } finally {
      if (streamAbortRef.current === controller) streamAbortRef.current = null;
      onDone();
    }
  };

  const maybeRetitleFrom = async (conv: Conv, text: string) => {
    const looksDefault = !conv.title || conv.title.startsWith("Chat ");
    if (!looksDefault) return;
    const first4 = text.split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
    if (!first4) return;
    try {
      await api.renameConversation(conv.id, first4);
      setConvs((arr) => arr.map((c) => (c.id === conv.id ? { ...c, title: first4 } : c)));
      setCurrent((c) => (c && c.id === conv.id ? ({ ...c, title: first4 } as Conv) : c));
    } catch {/* ignore */ }
  };

  // (legacy) manual text send — left intact
  const send = async () => {
    const text = input.trim();
    if (!text) return;
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;

    setLoading(true);
    setInput("");

    let target = current;
    if (!target) target = await createConv(null);

    const userId = genId();
    const assistantId = genId();
    assistantIdRef.current = assistantId;
    const nowISO = new Date().toISOString();

    setMessages((m) => [
      ...m,
      { id: userId, role: "user", content: text, createdAt: nowISO },
      { id: assistantId, role: "assistant", content: "", createdAt: nowISO },
    ]);

    try {
      await api.postMessage(target!.id, "user", text);
      await maybeRetitleFrom(target!, text);

      await streamFromBackend(
        target!.id,
        (chunk) => {
          const targetId = assistantIdRef.current;
          if (!targetId) return;
          setMessages((m) => {
            const idx = m.findIndex((mm) => mm.id === targetId);
            if (idx === -1) return m;
            const updated = [...m];
            updated[idx] = { ...updated[idx], content: updated[idx].content + chunk };
            return updated;
          });
        },
        async () => {
          const placeholderId = assistantIdRef.current;
          assistantIdRef.current = null;
          if (placeholderId) setMessages((m) => m.filter((mm) => mm.id !== placeholderId));
          await loadMessages(target!.id);
          await refreshConvs();
          setLoading(false);
        }
      );
    } catch (e) {
      const targetId = assistantIdRef.current;
      if (targetId) {
        setMessages((m) => {
          const idx = m.findIndex((mm) => mm.id === targetId);
          if (idx === -1) return m;
          const updated = [...m];
          updated[idx] = {
            ...updated[idx],
            content: updated[idx].content + `\n[error] ${(e as Error).message}`,
          };
          return updated;
        });
      }
      setLoading(false);
      setInput(text);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  // Title handlers
  const saveTitle = async () => {
    if (!current) return;
    const t = pendingTitle.trim();
    if (!t || t === current.title) { setTitleEditing(false); return; }
    await api.renameConversation(current.id, t);
    setConvs((arr) => arr.map((c) => (c.id === current.id ? { ...c, title: t } : c)));
    setCurrent({ ...current, title: t });
    setTitleEditing(false);
  };
  const cancelTitle = () => { setPendingTitle(current?.title || ""); setTitleEditing(false); };

  // ---- NEW: Pleading submit hook should create/refresh sidebar convs, not re-process doc ----
  const handlePleadingSubmit = async (payload: PleadingPayload) => {
    try {
      // This runs AFTER PleadingComposer already generated the doc.
      const caseNo = (payload.process || "").trim();

      let target = current;

      // If no conversation selected, create an UNFILED one (projectId=null)
      if (!target) {
        const title = caseNo || defaultTitle();
        target = await api.createConversation(title, null);
        setCurrent(target);
      }

      // If we have a case number, use it as the conversation title
      if (caseNo && target.title !== caseNo) {
        await api.renameConversation(target.id, caseNo);
        setConvs((arr) => arr.map((c) => (c.id === target!.id ? { ...c, title: caseNo } : c)));
        setCurrent((c) => (c && c.id === target!.id ? ({ ...c, title: caseNo } as Conv) : c));
        setPendingTitle(caseNo);
        setDraftTitle(caseNo);
      }

      // Refresh sidebar list so it appears (unfiled) and selection stays consistent
      await refreshConvs();

      // Select it so hydration/banner works on click later
      await handleSelectConv(target);
    } catch (err) {
      console.error(err);
      // Don't block user download; this is sidebar bookkeeping
    }
  };

  // ===== Render =====
  return (
    <Box
      sx={{
        minHeight: "100svh",
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: `${SIDEBAR_WIDTH}px 1fr` },
        gridTemplateAreas: { xs: `"main"`, sm: `"sidebar main"` },
        bgcolor: "background.default",
      }}
    >
      {/* Sidebar */}
      <Box
        sx={{
          gridArea: "sidebar",
          position: { sm: "sticky" },
          top: { sm: 0 },
          alignSelf: { sm: "start" },
          height: { sm: "100svh" },
          display: { xs: "none", sm: "flex" },
        }}
      >
        <Drawer
          variant="persistent"
          open
          PaperProps={{
            sx: {
              width: SIDEBAR_WIDTH,
              height: "100%",
              borderRight: SIDEBAR_BORDER,
              bgcolor: SIDEBAR_BG,
              color: "text.primary",
              display: "flex",
              flexDirection: "column",
            },
          }}
        >
          <SidebarPanel
            archivedView={archivedView}
            setArchivedView={setArchivedView}
            onRefreshConvs={() => void refreshConvs()}
            onNewFolder={() => { setNewFolderParent(null); setNewFolderOpen(true); }}
            projectTree={projectTree}
            expanded={expanded}
            setExpanded={setExpanded}
            convsByProject={convsByProject}
            currentId={current?.id ?? null}
            onSelectConv={(c) => void handleSelectConv(c)}
            onCreateInFolder={(pid) => void createConv(pid)}
            onArchive={async (c, v) => { await api.archiveConversation(c.id, v); await refreshConvs(); }}
            onMove={() => setPickerOpen(true)}
            onDelete={async (c) => {
              await api.deleteConversation(c.id);
              if (current?.id === c.id) {
                setCurrent(null);
                setMessages([]);
              }
              await refreshConvs();
            }}
            onRename={async (c) => {
              await handleSelectConv(c);
              setPendingTitle(c.title);
              setTitleEditing(true);
            }}
            unfiledConvs={unfiledConvs}
            dialogs={{
              pickerOpen, setPickerOpen,
              newFolderOpen, setNewFolderOpen,
              renameOpen, setRenameOpen,
              renameInitial, setRenameInitial,
              newFolderParent, setNewFolderParent,
              renameTargetId, setRenameTargetId,
              deleteTarget, setDeleteTarget,
              deleting, setDeleting,
              refreshProjects: () => void refreshProjects(),
            }}
          />
        </Drawer>
      </Box>

      {/* MAIN */}
      <Box
        sx={{
          gridArea: "main",
          minWidth: 0,
          display: "flex",
          justifyContent: "center",
          px: { xs: 1.5, sm: 2, md: 3 },
          bgcolor: "background.default",
        }}
      >
        <Box
          ref={mainColumnRef}
          sx={{
            width: "100%",
            maxWidth: MAX_COLUMN,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Title */}
          <TitleBar
            ref={titleRef}
            isMobile={isMobile}
            onOpenSidebar={() => setSidebarOpen(true)}
            currentTitle={displayTitle}
            titleEditing={titleEditing}
            pendingTitle={pendingTitle}
            setPendingTitle={setPendingTitle}
            onStartEdit={() => setTitleEditing(true)}
            onSave={() => void saveTitle()}
            onCancel={cancelTitle}
          />

          {/* Centered form when empty, message list + sticky composer otherwise */}
          {messages.length === 0 ? (
            <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", px: { xs: 1.5, sm: 2 }, pb: 4 }}>
              <PleadingCard>
                <PleadingComposer
                  key={current?.id ?? "none"}        // ⬅️ force remount on conv change
                  disabled={loading}
                  onSubmit={handlePleadingSubmit}
                  onCaseNumberChange={handleCaseNumberChange}
                  initialValues={pleadingSeed}
                  projectId={current?.projectId ?? null}
                  conversationId={current?.id ?? null}
                />
              </PleadingCard>
            </Box>
          ) : (
            <>
              <MessageList
                minListHeight={minListHeight}
                messages={messages}
                loading={loading}
                endAnchorRef={endAnchorRef}
              />
              {/* Sticky composer with the same form */}
              <Box
                ref={composerRef}
                sx={{
                  position: "sticky",
                  bottom: 0,
                  pt: 0.75,
                  pb: 0.75,
                  bgcolor: "background.default",
                }}
              >
                <PleadingCard>
                  <PleadingComposer
                    key={`sticky-${current?.id ?? "none"}`}  // ⬅️ different key to avoid sharing state
                    disabled={loading}
                    onSubmit={handlePleadingSubmit}
                    initialValues={pleadingSeed}             // keep it consistent
                    projectId={current?.projectId ?? null}
                    conversationId={current?.id ?? null}
                  />
                </PleadingCard>
              </Box>
            </>
          )}
        </Box>

        {/* Jump to latest button */}
        {!autoScroll && (
          <Fab
            size="small"
            color="primary"
            aria-label="Jump to latest"
            onClick={() => endAnchorRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })}
            sx={{ position: "fixed", right: 16, bottom: 96, zIndex: (t) => t.zIndex.appBar + 1 }}
          >
            <KeyboardArrowDownIcon />
          </Fab>
        )}
      </Box>
    </Box>
  );
}