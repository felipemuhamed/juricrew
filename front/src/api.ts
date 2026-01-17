// src/api.ts
import { http, setAuthToken, tokenKey } from "./http";

/** ----------------------------- Types ----------------------------- */

export type DocRequest = {
  motion_type: string;
  facts: string;
  process: string;
  court: string;
  parts: string;
};

// DTO we send to Spring Boot /docs endpoints
export type DocRequestDTO = {
  projectId: string;
  conversationId?: string | null;
  motionId?: string | null;
  subfolder?: string | null;
  requestedFileName?: string | null;
  templateId?: string | null;
  selectedAuthorities?: any;
  researchedAuthorities?: any;
  fields: {
    motion_type: string;
    facts: string;
    case_number: string;
    court: string;
    plaintiff?: string;
    defendant?: string[];
    // backend may allow more keys; keep it open-ended at runtime
    [key: string]: any;
  };
};

// Hydrate by case + (optional) project
export type DocRequestDTOHydrate = {
  projectId?: string;
  motionId?: string | null;
  status?: "DRAFT" | "GENERATING" | "READY" | "REJECTED" | null;
  outputPath?: string | null;
  templateId?: string | null;
  selectedAuthorities?: any;
  researchedAuthorities?: any;
  outputMetadata?: any;
  fields: {
    motion_type: string;
    facts: string;
    case_number: string;
    court: string;
    plaintiff?: string;
    defendant?: string[];
    [key: string]: any;
  };
};

// Align with backend: { motionId, status, outputPath }
export type DocProcessResponse = {
  motionId: string;
  status: "DRAFT" | "GENERATING" | "READY" | "REJECTED";
  outputPath: string;
};

export type LatestDocResp = {
  motionId: string | null;
  status: "DRAFT" | "GENERATING" | "READY" | "REJECTED";
  outputPath: string | null;
};

export type ResearchAuthoritiesResponse = {
  procedural_rules?: any[];
  statutes?: any[];
  binding_case_law?: any[];
  persuasive_case_law?: any[];
  [key: string]: any;
};

export type TemplateSummary = {
  id: string;
  name: string;
  description?: string | null;
  updatedAt?: string;
  createdAt?: string;
};

export type TemplateDetail = TemplateSummary & {
  markdown: string;
  builderJson?: any;
};

export type Conv = {
  id: string;
  title: string;
  updatedAt: string;
  projectId: string | null;
  archived: boolean;
};

export type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type User = {
  id: string;
  email: string;
  displayName?: string;
};

export type Project = {
  id: string;
  name: string;
  parentId: string | null;
};

export type Motion = {
  id: string;
  caseNumber: string | null;
  motionType: string | null;
  status: "DRAFT" | "GENERATING" | "READY" | "REJECTED" | null;
  updatedAt: string;
  projectId: string | null;
};

type LoginResp = { token: string; email: string; displayName?: string };

/** ---------- Helpers for legacy->DTO conversion (kept, non-breaking) ---------- */

const DEFAULT_PROJECT_ID =
  (import.meta as any)?.env?.VITE_PROJECT_ID || (window as any)?.__PROJECT_ID__ || "juricrew-demo";

function isLegacyDocRequest(p: any): p is DocRequest {
  return (
    p &&
    typeof p === "object" &&
    typeof p.motion_type === "string" &&
    typeof p.facts === "string" &&
    typeof p.process === "string" &&
    typeof p.court === "string"
  );
}

function parseLegacyParts(parts?: string): { plaintiff?: string; defendant?: string[] } {
  if (!parts) return {};
  const plaintiffMatch = parts.match(/plaintiff\s*:\s*([^;]+?)(?:;|$)/i);
  const defendantMatch = parts.match(/defendants?\s*:\s*\[?([^\]]+)\]?/i);

  const plaintiff = plaintiffMatch?.[1]?.trim();
  const defendant = defendantMatch
    ? defendantMatch[1]
        .split(/[,;]\s*|\n+/g)
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  return { plaintiff, defendant };
}

function toDtoFromLegacy(legacy: DocRequest): DocRequestDTO {
  const { plaintiff, defendant } = parseLegacyParts(legacy.parts);
  return {
    projectId: DEFAULT_PROJECT_ID,
    subfolder: null,
    requestedFileName: null,
    templateId: null,
    selectedAuthorities: null,
    fields: {
      motion_type: legacy.motion_type,
      facts: legacy.facts,
      case_number: legacy.process,
      court: legacy.court,
      ...(plaintiff ? { plaintiff } : {}),
      ...(defendant && defendant.length ? { defendant } : {}),
    },
  };
}

/** ------------------------------- API ------------------------------- */

export const api = {
  // --- Auth ---
  me: async (): Promise<User> => {
    const r = await http.get("/auth/me");
    return r.data as User;
  },

  register: async (email: string, password: string, displayName: string): Promise<LoginResp> => {
    const r = await http.post<LoginResp>("/auth/register", { email, password, displayName });
    setAuthToken(r.data.token);
    return r.data;
  },

  login: async (email: string, password: string): Promise<LoginResp> => {
    const r = await http.post<LoginResp>("/auth/login", { email, password });
    setAuthToken(r.data.token);
    return r.data;
  },

  logout: async (): Promise<void> => {
    try {
      await http.post("/auth/logout");
    } finally {
      setAuthToken(null);
      localStorage.removeItem("token");
      localStorage.removeItem(tokenKey);
    }
  },

  // --- Projects (folders) ---
  listProjects: async (): Promise<Project[]> => {
    const r = await http.get("/projects");
    return r.data as Project[];
  },

  createProject: async (name: string, parentId?: string | null): Promise<Project> => {
    const r = await http.post("/projects", { name, parentId: parentId ?? null });
    return r.data as Project;
  },

  renameProject: async (id: string, name: string): Promise<void> => {
    await http.patch(`/projects/${id}`, { name });
  },

  deleteProject: async (id: string): Promise<void> => {
    await http.delete(`/projects/${id}`);
  },

  // --- Conversations ---
  listConversations: async (opts?: { projectId?: string | null; archived?: boolean }): Promise<Conv[]> => {
    const p = new URLSearchParams();
    if (opts?.projectId) p.set("projectId", opts.projectId);
    if (opts?.archived) p.set("archived", "true");
    const q = p.toString() ? `?${p.toString()}` : "";
    const r = await http.get(`/conversations${q}`);
    return r.data as Conv[];
  },

  createConversation: async (title: string, projectId?: string | null): Promise<Conv> => {
    const r = await http.post("/conversations", { title, projectId: projectId ?? null });
    return r.data as Conv;
  },

  renameConversation: async (id: string, title: string): Promise<void> => {
    // backend route: PATCH /conversations/{id}/rename
    await http.patch(`/conversations/${id}/rename`, { title });
  },

  archiveConversation: async (id: string, archived: boolean): Promise<void> => {
    // backend route: PATCH /conversations/{id}/archive
    await http.patch(`/conversations/${id}/archive`, { archived });
  },

  deleteConversation: async (id: string): Promise<void> => {
    await http.delete(`/conversations/${id}`);
  },

  moveConversation: async (id: string, projectId: string | null): Promise<void> => {
    await http.patch(`/conversations/${id}/move`, { projectId });
  },

  // --- Messages ---
  listMessages: async (conversationId: string): Promise<Msg[]> => {
    const r = await http.get(`/conversations/${conversationId}/messages`);
    return r.data as Msg[];
  },

  postMessage: async (conversationId: string, role: "user" | "assistant", content: string): Promise<Msg> => {
    const r = await http.post(`/conversations/${conversationId}/messages`, { role, content });
    return r.data as Msg;
  },

  // --- Motions / Docs ---
  /** Step 1: Research relevant authorities (statutes/rules/case law). */
  researchAuthorities: async (dto: DocRequestDTO): Promise<ResearchAuthoritiesResponse> => {
    const r = await http.post(`/docs/research`, dto);
    const data: any = r.data;
    return (data?.result ?? data) as ResearchAuthoritiesResponse;
  },

  /** Step 2/3: Generate motion */
  processDoc: async (payload: DocRequestDTO | DocRequest): Promise<DocProcessResponse> => {
    const dto = isLegacyDocRequest(payload) ? toDtoFromLegacy(payload) : (payload as DocRequestDTO);
    const r = await http.post<DocProcessResponse>("/docs/process", dto);
    return r.data;
  },

  /** Downloads a file by relative path (as returned by processDoc). */
  downloadDoc: async (path: string): Promise<Blob> => {
    const r = await http.get(`/docs/download`, { params: { path }, responseType: "blob" });
    return r.data as Blob;
  },

  latestDocForConversation: async (conversationId: string): Promise<LatestDocResp> => {
    const r = await http.get(`/docs/conversations/${conversationId}/latest`, {
      validateStatus: (s) => (s >= 200 && s < 300) || s === 304 || s === 204 || s === 404,
    });
    if (r.status === 204 || r.status === 404) {
      return { motionId: null, status: "DRAFT", outputPath: null };
    }
    // backend returns a hydrate payload; we only need these three fields here
    const data = r.data as any;
    return {
      motionId: data?.motionId ?? null,
      status: (data?.status ?? "DRAFT") as LatestDocResp["status"],
      outputPath: data?.outputPath ?? null,
    };
  },

  latestDocSnapshotForConversation: async (conversationId: string): Promise<DocRequestDTOHydrate | null> => {
    const r = await http.get(`/docs/conversations/${conversationId}/latest`, {
      validateStatus: (s) => (s >= 200 && s < 300) || s === 304 || s === 204 || s === 404,
    });
    return r.status === 204 || r.status === 404 || r.data == null ? null : (r.data as DocRequestDTOHydrate);
  },

  saveConversationDraft: async (
    conversationId: string,
    dto: DocRequestDTO
  ): Promise<DocRequestDTOHydrate> => {
    const r = await http.post(`/docs/conversations/${conversationId}/draft`, dto);
    return r.data as DocRequestDTOHydrate;
  },

  // --- Templates (Org-wide) ---
  listTemplates: async (): Promise<TemplateSummary[]> => {
    const r = await http.get(`/templates`);
    return r.data as TemplateSummary[];
  },

  getTemplate: async (id: string): Promise<TemplateDetail> => {
    const r = await http.get(`/templates/${id}`);
    return r.data as TemplateDetail;
  },

  createTemplate: async (payload: {
    name: string;
    description?: string | null;
    markdown: string;
    builderJson?: any;
  }): Promise<TemplateSummary> => {
    const r = await http.post(`/templates`, payload);
    return r.data as TemplateSummary;
  },

  updateTemplate: async (
    id: string,
    payload: { name: string; description?: string | null; markdown: string; builderJson?: any }
  ): Promise<TemplateSummary> => {
    const r = await http.put(`/templates/${id}`, payload);
    return r.data as TemplateSummary;
  },

  deleteTemplate: async (id: string): Promise<void> => {
    await http.delete(`/templates/${id}`);
  },

  // --- Motions (catalog/listing) ---
  listMotions: async (projectId?: string | null): Promise<Motion[]> => {
    const params = projectId ? { projectId } : undefined;
    const r = await http.get(`/api/motions`, { params });
    return r.data as Motion[];
  },

  moveMotion: async (motionId: string, projectId: string | null): Promise<void> => {
    await http.patch(`/api/motions/${motionId}/move`, { projectId });
  },

  uploadToRag: async (file: File): Promise<void> => {
    const form = new FormData();
    form.append("file", file, file.name);
    await http.post("/docs/rag/upload", form, { headers: { "Content-Type": "multipart/form-data" } });
  },

  latestDocSnapshotByCase: async (caseNumber: string, projectId?: string | null): Promise<DocRequestDTOHydrate | null> => {
    const r = await http.get("/docs/latest-snapshot", {
      params: { caseNumber, projectId: projectId ?? undefined },
      validateStatus: (s) => (s >= 200 && s < 300) || s === 304 || s === 204,
    });
    if (r.status === 204) return null;
    return r.data as DocRequestDTOHydrate;
  },
};