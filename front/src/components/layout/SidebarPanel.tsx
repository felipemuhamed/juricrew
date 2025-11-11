// src/components/layout/SidebarPanel.tsx
import { Box } from "@mui/material";
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import ArchiveToggle from "../../components/ArchiveToggle";
import FolderTree, { ProjectNode } from "../../components/FolderTree";
import UnfiledSection from "../../components/UnfiledSection";
import ProjectPickerDialog from "../../components/ProjectPickerDialog";
import CreateFolderDialog from "../../components/CreateFolderDialog";
import RenameFolderDialog from "../../components/RenameFolderDialog";
import ConfirmDialog from "../../components/ConfirmDialog";
import { Conv, Project, api } from "../../api";
import { useState } from "react";

type Dialogs = {
  pickerOpen: boolean;
  setPickerOpen: (v: boolean) => void;
  newFolderOpen: boolean;
  setNewFolderOpen: (v: boolean) => void;
  renameOpen: boolean;
  setRenameOpen: (v: boolean) => void;
  renameInitial: string;
  setRenameInitial: (v: string) => void;
  newFolderParent: string | null;
  setNewFolderParent: (v: string | null) => void;
  renameTargetId: string | null;
  setRenameTargetId: (v: string | null) => void;
  deleteTarget: Project | null;
  setDeleteTarget: (v: Project | null) => void;
  deleting: boolean;
  setDeleting: (v: boolean) => void;
  refreshProjects: () => void;
};

export default function SidebarPanel({
  archivedView,
  setArchivedView,
  onRefreshConvs,
  onNewFolder,
  projectTree,
  expanded,
  setExpanded,
  convsByProject,
  currentId,
  onSelectConv,
  onCreateInFolder,
  onArchive,
  // onMove is no longer used internally, but we keep the prop optional for compatibility
  onMove,
  onDelete,
  onRename,
  unfiledConvs,
  dialogs,
}: {
  archivedView: boolean;
  setArchivedView: (v: boolean) => void;
  onRefreshConvs: () => void;
  onNewFolder: () => void;
  projectTree: ProjectNode[];
  expanded: Record<string, boolean>;
  setExpanded: (v: Record<string, boolean>) => void;
  convsByProject: Map<string, Conv[]>;
  currentId: string | null;
  onSelectConv: (c: Conv) => void;
  onCreateInFolder: (pid: string) => void;
  onArchive: (c: Conv, v: boolean) => Promise<void> | void;
  onMove?: (c: Conv) => void; // optional, unused here; children expect (c: Conv) => void
  onDelete: (c: Conv) => Promise<void> | void;
  onRename: (c: Conv) => Promise<void> | void;
  unfiledConvs: Conv[];
  dialogs: Dialogs;
}) {
  const {
    pickerOpen,
    setPickerOpen,
    newFolderOpen,
    setNewFolderOpen,
    renameOpen,
    setRenameOpen,
    renameInitial,
    setRenameInitial,
    newFolderParent,
    setNewFolderParent,
    renameTargetId,
    setRenameTargetId,
    deleteTarget,
    setDeleteTarget,
    deleting,
    setDeleting,
    refreshProjects,
  } = dialogs;

  // This is actually the conversation we are moving
  const [movingConv, setMovingConv] = useState<Conv | null>(null);

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, py: 1 }}>
        <Box component="span" sx={{ fontSize: 12, opacity: 0.8 }}>
          Conversations
        </Box>
        <Box sx={{ flex: 1 }} />
      </Box>

      <Box sx={{ px: 1, pb: 0.5 }}>
        <ArchiveToggle
          checked={archivedView}
          onChange={(checked) => {
            setArchivedView(checked);
            onRefreshConvs();
          }}
        />
        <Box
          sx={{
            mt: 1,
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 0.5,
            cursor: "pointer",
            userSelect: "none",
            "&:hover": { opacity: 0.9 },
          }}
          onClick={onNewFolder}
        >
          <CreateNewFolderOutlinedIcon fontSize="small" />
          <Box component="span" sx={{ fontSize: 14 }}>
            New folder
          </Box>
        </Box>
      </Box>

      {/* Sidebar scroll area */}
      <Box sx={{ flex: 1, overflowY: "auto", pr: 0.5 }}>
        <Box sx={{ minHeight: "60%", flexShrink: 0 }}>
          <FolderTree
            tree={projectTree}
            currentId={currentId ?? undefined}
            expanded={expanded}
            onToggle={(id) => setExpanded({ ...expanded, [id]: !expanded[id] })}
            convsByProject={convsByProject}
            onSelect={(c) => onSelectConv(c)}
            onCreateInFolder={(pid) => onCreateInFolder(pid)}
            onArchive={(c, v) => onArchive(c, v)}
            onMove={(c) => {
              // open folder picker for this conversation
              setMovingConv(c);
              setPickerOpen(true);
            }}
            onDelete={(c) => onDelete(c)}
            onRename={(c) => onRename(c)}
            /** ✅ Folder actions wired to dialogs/state */
            onFolderNewSub={(parent) => {
              setNewFolderParent(parent.id);
              setNewFolderOpen(true);
            }}
            onFolderRename={(folder) => {
              setRenameTargetId(folder.id);
              setRenameInitial(folder.name);
              setRenameOpen(true);
            }}
            onFolderDelete={(folder) => {
              setDeleteTarget({
                id: folder.id,
                name: folder.name,
                parentId: folder.parentId,
              } as Project);
            }}
          />
        </Box>

        <Box sx={{ mt: 1, flexShrink: 0 }}>
          <UnfiledSection
            conversations={unfiledConvs}
            currentId={currentId ?? undefined}
            onSelect={(c) => onSelectConv(c)}
            onCreate={() => onCreateInFolder(null as any)}
            onArchive={(c, v) => onArchive(c, v)}
            onMove={(c) => {
              // open folder picker for this conversation
              setMovingConv(c);
              setPickerOpen(true);
            }}
            onDelete={(c) => onDelete(c)}
            onRename={(c) => onRename(c)}
          />
        </Box>
      </Box>

      {/* Dialogs */}
      <ProjectPickerDialog
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setMovingConv(null);
        }}
        onPick={async (projectId) => {
          if (!movingConv) return;
          try {
            // ✅ Move the conversation (not the motion)
            await api.moveConversation(movingConv.id, projectId);

            setPickerOpen(false);
            setMovingConv(null);

            // refresh tree then conversations so the item appears in its new folder
            await dialogs.refreshProjects();
            onRefreshConvs();
          } catch (err) {
            console.error(err);
            alert("Failed to move item");
          }
        }}
      />

      <CreateFolderDialog
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        onCreated={async () => {
          await refreshProjects();
        }}
        parentId={newFolderParent ?? null}
        lockParent={newFolderParent !== null}
      />

      <RenameFolderDialog
        open={renameOpen}
        initialName={renameInitial}
        onClose={() => setRenameOpen(false)}
        onSubmit={async (name) => {
          if (!renameTargetId) return;
          await api.renameProject(renameTargetId, name);
          setRenameOpen(false);
          await refreshProjects();
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete folder?"
        message={
          <>
            Delete folder <strong>{deleteTarget?.name}</strong>?<br />
            Conversations inside will not be deleted, but will appear under{" "}
            <em>“Conversations”</em>.
          </>
        }
        confirmText="Delete"
        cancelText="Cancel"
        destructive
        loading={deleting}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            setDeleting(true);
            await api.deleteProject(deleteTarget.id);
            await refreshProjects();
            onRefreshConvs();
          } finally {
            setDeleting(false);
            setDeleteTarget(null);
          }
        }}
      />
    </>
  );
}
