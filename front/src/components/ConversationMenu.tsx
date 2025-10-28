import { useState, type MouseEvent } from "react";
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";

type Props = {
  /** whether this conversation is currently archived (controls label/icon) */
  archived?: boolean;
  onArchive: (archived: boolean) => void | Promise<void>;
  onMove: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onRename?: () => void | Promise<void>;
};

export default function ConversationMenu({
  archived = false,
  onArchive,
  onMove,
  onDelete,
  onRename,
}: Props) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleOpen = (e: MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
  };
  const handleClose = () => setAnchorEl(null);

  const handleArchiveToggle = async () => {
    await onArchive(!archived);
    handleClose();
  };

  return (
    <>
      <IconButton size="small" onClick={handleOpen}>
        <MoreVertIcon fontSize="small" />
      </IconButton>

      <Menu
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        onClick={(e) => e.stopPropagation()} // prevent row selection
      >
        <MenuItem
          onClick={() => {
            onMove();
            handleClose();
          }}
        >
          <ListItemIcon>
            <DriveFileMoveOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Move to folder</ListItemText>
        </MenuItem>

        <MenuItem onClick={handleArchiveToggle}>
          <ListItemIcon>
            {archived ? (
              <UnarchiveOutlinedIcon fontSize="small" />
            ) : (
              <ArchiveOutlinedIcon fontSize="small" />
            )}
          </ListItemIcon>
          <ListItemText>{archived ? "Unarchive" : "Archive"}</ListItemText>
        </MenuItem>

        <MenuItem
          onClick={() => {
            onRename?.();
            handleClose();
          }}
        >
          <ListItemText>Rename</ListItemText>
        </MenuItem>

        <MenuItem
          onClick={() => {
            onDelete();
            handleClose();
          }}
        >
          <ListItemIcon>
            <DeleteOutlineOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText sx={{ color: "error.main" }}>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}