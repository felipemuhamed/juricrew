import { useEffect, useRef, useState } from "react";
import { Box, IconButton, TextField, Typography } from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CloseIcon from "@mui/icons-material/Close";

type Props = {
  title: string;
  onSave: (newTitle: string) => void | Promise<void>;
  disabled?: boolean;
};

export default function EditableTitle({ title, onSave, disabled }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const startEdit = () => {
    if (disabled) return;
    setDraft(title);
    setEditing(true);
  };

  const submit = async () => {
    const t = draft.trim();
    setEditing(false);
    if (!t || t === title) return;
    await onSave(t);
  };

  const cancel = () => {
    setDraft(title);
    setEditing(false);
  };

  if (editing) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <TextField
          inputRef={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          size="small"
          variant="standard"
          InputProps={{ disableUnderline: false }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") cancel();
          }}
          sx={{
            "& input": { color: "rgba(255,255,255,0.92)" },
            minWidth: 180,
          }}
        />
        <IconButton aria-label="Save title" onClick={submit} sx={{ color: "success.main" }}>
          <CheckCircleOutlineIcon fontSize="small" />
        </IconButton>
        <IconButton aria-label="Cancel edit" onClick={cancel} sx={{ color: "error.main" }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
    );
  }

  // view mode (hover to show pencil)
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        "&:hover .edit-icon": { opacity: disabled ? 0 : 1 },
      }}
    >
      <Typography
        variant="subtitle1"
        sx={{ color: "rgba(255,255,255,0.9)", cursor: disabled ? "default" : "text" }}
        onClick={startEdit}
        title={disabled ? undefined : "Click to rename"}
      >
        {title || "Untitled conversation"}
      </Typography>
      <IconButton
        className="edit-icon"
        size="small"
        onClick={startEdit}
        sx={{ opacity: 0, transition: "opacity 120ms", color: "rgba(255,255,255,0.85)" }}
        aria-label="Rename"
      >
        <EditOutlinedIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}
