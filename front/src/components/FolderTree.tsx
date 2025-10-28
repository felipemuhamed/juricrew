// src/components/FolderTree.tsx
import {
  Box,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import NoteAddOutlinedIcon from "@mui/icons-material/NoteAddOutlined";
import ConversationMenu from "./ConversationMenu";
import FolderMenu from "./FolderMenu";
import { Conv, Project } from "../api";
import { ReactNode } from "react";

export type ProjectNode = Project & { children: ProjectNode[] };

type Props = {
  tree: ProjectNode[];
  currentId?: string;
  expanded: Record<string, boolean>;
  onToggle: (projectId: string) => void;

  /** conversations grouped by projectId */
  convsByProject: Map<string, Conv[]>;

  /** select an existing conversation */
  onSelect: (c: Conv) => void;

  /** create a new conversation in this folder */
  onCreateInFolder: (projectId: string) => void;

  /** conversation actions */
  onArchive: (c: Conv, archived: boolean) => void;
  onMove: (c: Conv) => void;
  onDelete: (c: Conv) => void;
  onRename: (c: Conv) => void;
};

export default function FolderTree({
  tree,
  currentId,
  expanded,
  onToggle,
  convsByProject,
  onSelect,
  onCreateInFolder,
  onArchive,
  onMove,
  onDelete,
  onRename,
}: Props) {
  const renderNode = (node: ProjectNode, depth = 0): ReactNode => {
    const isOpen = !!expanded[node.id];
    const convs = convsByProject.get(node.id) ?? [];

    return (
      <Box key={node.id} sx={{ pl: 1 + depth * 2 }}>
        <ListItem
          disablePadding
          secondaryAction={
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Tooltip title="New conversation in folder">
                <IconButton
                  size="small"
                  onClick={() => onCreateInFolder(node.id)}
                  sx={{ color: "rgba(255,255,255,0.85)" }}
                >
                  <NoteAddOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              {/* Folder actions (kebab) */}
              <FolderMenu
                onNewSubfolder={() => {
                  const ev = new CustomEvent("folder-new-sub", { detail: node });
                  window.dispatchEvent(ev);
                }}
                onRename={() => {
                  const ev = new CustomEvent("folder-rename", { detail: node });
                  window.dispatchEvent(ev);
                }}
                onDelete={() => {
                  const ev = new CustomEvent("folder-delete", { detail: node });
                  window.dispatchEvent(ev);
                }}
              />
            </Box>
          }
        >
          {/* Whole row toggles; chevron also toggles explicitly */}
          <ListItemButton onClick={() => onToggle(node.id)} sx={{ pr: 0.5 }}>
            <ListItemIcon sx={{ minWidth: 28, color: "rgba(255,255,255,0.8)" }}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(node.id);
                }}
                sx={{ color: "rgba(255,255,255,0.8)" }}
                aria-label={isOpen ? "Collapse folder" : "Expand folder"}
              >
                {isOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
              </IconButton>
            </ListItemIcon>
            <ListItemIcon sx={{ minWidth: 28, color: "rgba(255,255,255,0.8)" }}>
              {isOpen ? <FolderOpenOutlinedIcon fontSize="small" /> : <FolderOutlinedIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText primary={node.name} />
          </ListItemButton>
        </ListItem>

        {/* Only render the contents when expanded */}
        {isOpen && (
          <>
            {/* Conversations inside this folder */}
            {convs.map((c) => (
              <Box key={c.id} sx={{ pl: 6 }}>
                <ListItem
                  disablePadding
                  secondaryAction={
                    <ConversationMenu
                      onArchive={(a) => onArchive(c, a)}
                      onMove={() => onMove(c)}
                      onDelete={() => onDelete(c)}
                      onRename={() => onRename(c)}
                    />
                  }
                >
                  <ListItemButton selected={c.id === currentId} onClick={() => onSelect(c)}>
                    <ListItemText primary={c.title} primaryTypographyProps={{ noWrap: true }} />
                  </ListItemButton>
                </ListItem>
              </Box>
            ))}

            {/* Child folders */}
            {node.children.map((ch) => renderNode(ch, depth + 1))}
          </>
        )}
      </Box>
    );
  };

  return <List dense disablePadding>{tree.map((n) => renderNode(n))}</List>;
}