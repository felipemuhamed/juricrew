import {
  AppBar,
  Box,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import { useEffect, useRef, useState } from "react";

import { useColorMode } from "../theme/ColorModeProvider";
import { api, TemplateDetail, TemplateSummary } from "../api";
import TemplateDialog, { TemplateDialogValue } from "./TemplateDialog";
import ConfirmDialog from "./ConfirmDialog";
import { useTour } from "../tour/TourProvider";

export default function NavigationBar() {
  const { mode, toggle } = useColorMode();
  const { startMotionCreationTour } = useTour();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // ---- RAG Upload (kept: icon only) ----
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ---- Templates menu + dialogs ----
  const [tplAnchorEl, setTplAnchorEl] = useState<null | HTMLElement>(null);
  const tplMenuOpen = Boolean(tplAnchorEl);
  const [tplLoading, setTplLoading] = useState(false);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);

  const [tplDialogOpen, setTplDialogOpen] = useState(false);
  const [tplDialogMode, setTplDialogMode] = useState<"create" | "edit">("create");
  const [tplDialogSaving, setTplDialogSaving] = useState(false);
  const [tplEditingId, setTplEditingId] = useState<string | null>(null);
  const [tplEditingDetail, setTplEditingDetail] = useState<TemplateDetail | null>(null);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const hardReloadToRoot = () => {
    const rootUrl = `${window.location.origin}/`;
    window.location.replace(rootUrl);
    setTimeout(() => {
      try {
        window.location.reload();
      } catch {
        // ignore
      }
    }, 50);
  };

  const logout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await api.logout();
      try {
        sessionStorage.clear();
      } catch {}
      if ("serviceWorker" in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        } catch {}
      }
      if ("caches" in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch {}
      }
    } catch {
      // ignore
    } finally {
      hardReloadToRoot();
    }
  };

  const clickHiddenFileInput = () => {
    fileInputRef.current?.click();
  };

  const onFilePicked: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadToRag(file);
      alert(`Uploaded "${file.name}" to RAG successfully.`);
    } catch (err) {
      console.error(err);
      alert("Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const refreshTemplates = async () => {
    setTplLoading(true);
    try {
      const list = await api.listTemplates();
      setTemplates(list);
    } catch (e) {
      console.error(e);
    } finally {
      setTplLoading(false);
    }
  };

  useEffect(() => {
    // Preload templates once (helps menu feel instant)
    refreshTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openTemplatesMenu = async (e: React.MouseEvent<HTMLElement>) => {
    setTplAnchorEl(e.currentTarget);
    // Always refresh on open to reflect changes
    refreshTemplates();
  };

  const closeTemplatesMenu = () => setTplAnchorEl(null);

  const openCreateTemplate = () => {
    setTplDialogMode("create");
    setTplEditingId(null);
    setTplEditingDetail(null);
    setTplDialogOpen(true);
  };

  const openEditTemplate = async (id: string) => {
    try {
      setTplDialogMode("edit");
      setTplEditingId(id);
      setTplDialogOpen(true);
      setTplEditingDetail(null);
      const detail = await api.getTemplate(id);
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
        await api.createTemplate(value);
      } else if (tplEditingId) {
        await api.updateTemplate(tplEditingId, value);
      }
      setTplDialogOpen(false);
      await refreshTemplates();
    } catch (e) {
      console.error(e);
      alert("Failed to save template.");
    } finally {
      setTplDialogSaving(false);
    }
  };

  const askDeleteTemplate = (id: string) => {
    setDeleteId(id);
    setConfirmDeleteOpen(true);
  };

  const doDeleteTemplate = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      await api.deleteTemplate(deleteId);
      setConfirmDeleteOpen(false);
      setDeleteId(null);
      await refreshTemplates();
    } catch (e) {
      console.error(e);
      alert("Failed to delete template.");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <AppBar position="sticky" color="primary" elevation={1}>
        <Toolbar sx={{ gap: 1 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Juricrew - AI Motions Generator
          </Typography>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.doc,.docx,.txt,.md"
            style={{ display: "none" }}
            onChange={onFilePicked}
          />

          {/* Templates */}
          <Tooltip title="Templates">
            <span>
              <IconButton
                color="inherit"
                onClick={openTemplatesMenu}
                aria-label="templates"
                data-testid="nav-templates"
                data-tour="nav-templates"
              >
                <DescriptionOutlinedIcon />
              </IconButton>
            </span>
          </Tooltip>

          {/* Guided tour */}
          <Tooltip title="Take a tour">
            <span>
              <IconButton
                color="inherit"
                onClick={startMotionCreationTour}
                aria-label="tour"
                data-tour="nav-tour"
              >
                <HelpOutlineOutlinedIcon />
              </IconButton>
            </span>
          </Tooltip>

          <Menu
            anchorEl={tplAnchorEl}
            open={tplMenuOpen}
            onClose={closeTemplatesMenu}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
            PaperProps={{ sx: { minWidth: 340 } }}
          >
            <MenuItem onClick={openCreateTemplate}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ width: "100%" }}>
                <AddOutlinedIcon fontSize="small" />
                <Box sx={{ flexGrow: 1 }}>Add Template</Box>
              </Stack>
            </MenuItem>
            <Divider />

            {tplLoading ? (
              <MenuItem disabled>Loading...</MenuItem>
            ) : templates.length === 0 ? (
              <MenuItem disabled>No templates yet</MenuItem>
            ) : (
              templates.map((t) => (
                <MenuItem
                  key={t.id}
                  disableGutters
                  sx={{ px: 1.25 }}
                  onClick={() => {
                    // For now, selecting in navbar does nothing (Step 2 will select).
                    // We keep the behavior consistent with "most apps": click just highlights.
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ width: "100%" }}>
                    <Box sx={{ flexGrow: 1, overflow: "hidden" }}>
                      <Typography variant="body2" noWrap>
                        {t.name}
                      </Typography>
                      {t.description ? (
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {t.description}
                        </Typography>
                      ) : null}
                    </Box>
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openEditTemplate(t.id);
                        }}
                      >
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          askDeleteTemplate(t.id);
                        }}
                      >
                        <DeleteOutlineOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </MenuItem>
              ))
            )}
          </Menu>
          {/* Upload icon (icon only; removed the text Upload button) */}
          <Tooltip title={uploading ? "Uploading..." : "Upload document to RAG"}>
            <span>
              <IconButton
                color="inherit"
                onClick={clickHiddenFileInput}
                aria-label="upload to rag"
                disabled={uploading}
                data-testid="nav-upload"
              >
                <UploadFileOutlinedIcon />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            <IconButton color="inherit" onClick={toggle} aria-label="toggle color mode">
              {mode === "dark" ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
            </IconButton>
          </Tooltip>

          <Tooltip title={isLoggingOut ? "Logging out..." : "Logout"}>
            <span>
              <IconButton color="inherit" onClick={logout} aria-label="logout" disabled={isLoggingOut}>
                <LogoutIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Toolbar>
      </AppBar>

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

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete template?"
        message={
          <>
            <Typography variant="body2">
              This will remove the template from your org and delete its markdown from storage.
            </Typography>
          </>
        }
        confirmText="Delete"
        destructive
        loading={deleteLoading}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={doDeleteTemplate}
      />
    </>
  );
}
