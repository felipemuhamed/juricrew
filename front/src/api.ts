// src/api.ts
import { http, setAuthToken, tokenKey } from "./http";

export type DocRequest = {
  motion_type: string;
  facts: string;
  process: string;
  court: string;
  parts: string;
};

// New DTO type (added, non-breaking)
export type DocRequestDTO = {
  projectId: string;
  subfolder?: string | null;
  requestedFileName?: string | null;
  fields: {
    motion_type: string;
    facts: string;
    case_number: string;
    court: string;
    plaintiff?: string;
    defendant?: string[];
    // backend may allow more keys; keep it open-ended at runtime
  };
};

// ✅ Align with backend: { motionId, status, outputPath }
export type DocProcessResponse = {
  motionId: string; // UUID serialized as string
  status: "DRAFT" | "GENERATING" | "READY" | "REJECTED";
  outputPath: string;
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

export type LatestDocResp = {
  motionId: string | null;
  status: "DRAFT" | "GENERATING" | "READY" | "REJECTED";
  outputPath: string | null; // <- S3 object key / storage key
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

/** ---------- Helpers for legacy->DTO conversion (added, non-breaking) ---------- */

const DEFAULT_PROJECT_ID =
  (import.meta as any)?.env?.VITE_PROJECT_ID ||
  (window as any)?.__PROJECT_ID__ ||
  "juricrew-demo";

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

function parseLegacyParts(
  parts?: string
): { plaintiff?: string; defendant?: string[] } {
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

/** --------------------------------- API --------------------------------- */

export const api = {
  // --- Auth ---
  me: async (): Promise<User> => {
    const r = await http.get("/auth/me");
    return r.data as User;
  },

  register: async (
    email: string,
    password: string,
    displayName: string
  ): Promise<LoginResp> => {
    const r = await http.post<LoginResp>("/auth/register", {
      email,
      password,
      displayName,
    });
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

  createProject: async (
    name: string,
    parentId?: string | null
  ): Promise<Project> => {
    const r = await http.post("/projects", { name, parentId: parentId ?? null });
    return r.data as Project;
  },

  renameProject: async (id: string, name: string): Promise<void> => {
    await http.patch(`/projects/${id}`, { name }); // backend also supports /{id}/rename
  },

  deleteProject: async (id: string): Promise<void> => {
    await http.delete(`/projects/${id}`);
  },

  // --- Conversations ---
  listConversations: async (opts?: {
    projectId?: string | null;
    archived?: boolean;
  }): Promise<Conv[]> => {
    const p = new URLSearchParams();
    if (opts?.projectId) p.set("projectId", opts.projectId);
    if (opts?.archived) p.set("archived", "true");
    const q = p.toString() ? `?${p.toString()}` : "";
    const r = await http.get(`/conversations${q}`);
    return r.data as Conv[];
  },

  createConversation: async (
    title: string,
    projectId?: string | null
  ): Promise<Conv> => {
    const r = await http.post("/conversations", {
      title,
      projectId: projectId ?? null,
    });
    return r.data as Conv;
  },

  renameConversation: async (id: string, title: string): Promise<void> => {
    await http.patch(`/conversations/${id}/rename`, { title });
  },

  moveConversation: async (id: string, projectId: string | null): Promise<void> => {
    await http.patch(`/conversations/${id}/move`, { projectId });
  },

  archiveConversation: async (id: string, archived: boolean): Promise<void> => {
    await http.patch(`/conversations/${id}/archive`, { archived });
  },

  deleteConversation: async (id: string): Promise<void> => {
    await http.delete(`/conversations/${id}`);
  },

  // --- Messages ---
  listMessages: async (id: string): Promise<Msg[]> => {
    const r = await http.get(`/conversations/${id}/messages`);
    return r.data as Msg[];
  },

  postMessage: async (
    id: string,
    role: "user" | "assistant",
    content: string
  ): Promise<Msg> => {
    const r = await http.post(`/conversations/${id}/messages`, { role, content });
    return r.data as Msg;
  },

  // Streaming trigger (if you still use it elsewhere)
  chat: async (conversationId: string): Promise<void> => {
    await http.post(`/chat`, { conversationId });
  },

  /**
   * Calls backend DocController to process and persist a pleading.
   * Backwards compatible:
   *  - Accepts legacy flat DocRequest (original behavior)
   *  - Accepts new DocRequestDTO (projectId + fields)
   * Sends the new DTO to the backend in both cases.
   */
  processDoc: async (
    payload: DocRequest | DocRequestDTO
  ): Promise<DocProcessResponse> => {
    const dto: DocRequestDTO = isLegacyDocRequest(payload)
      ? toDtoFromLegacy(payload)
      : (payload as DocRequestDTO);

    const r = await http.post(`/docs/process`, dto);
    // Normalize to the expected shape { motionId, status, outputPath }
    const data = r.data as any;

    const resp: DocProcessResponse = {
      motionId: String(data.motionId),
      status: data.status as DocProcessResponse["status"],
      outputPath: String(data.outputPath),
    };

    return resp;
  },

  /** Downloads a file by relative path (as returned by processDoc). */
  downloadDoc: async (relativePath: string): Promise<Blob> => {
    const r = await http.get(`/docs/download`, {
      params: { path: relativePath },
      responseType: "blob",
    });
    return r.data as Blob;
  },

  /** 🔎 Get the latest generated document for a case number (for immediate Download). */
  latestDocByCase: async (caseNumber: string): Promise<LatestDocResp> => {
    const r = await http.get(`/docs/latest`, { params: { caseNumber } });
    return r.data as LatestDocResp;
  },

  listMotions: async (projectId?: string | null): Promise<Motion[]> => {
    const params = projectId ? { projectId } : undefined;
    const r = await http.get(`/api/motions`, { params }); // ✅ fixed path
    return r.data as Motion[];
  },

  moveMotion: async (motionId: string, projectId: string | null): Promise<void> => {
    await http.patch(`/api/motions/${motionId}/move`, { projectId }); // ✅ fixed path
  },

  uploadToRag: async (file: File): Promise<void> => {
    const form = new FormData();
    form.append("file", file, file.name);
    await http.post("/docs/rag/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

};
