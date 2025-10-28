// src/components/layout/TitleBar.tsx
import { forwardRef } from "react";
import { Box, IconButton, TextField, Tooltip, Typography } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";

type Props = {
  isMobile: boolean;
  onOpenSidebar: () => void;
  currentTitle: string;
  titleEditing: boolean;
  pendingTitle: string;
  setPendingTitle: (v: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
};

const TitleBar = forwardRef<HTMLDivElement, Props>(function TitleBar(
  {
    isMobile,
    onOpenSidebar,
    currentTitle,
    titleEditing,
    pendingTitle,
    setPendingTitle,
    onStartEdit,
    onSave,
    onCancel,
  },
  ref
) {
  return (
    <Box ref={ref} sx={{ display: "flex", alignItems: "center", gap: 1, pt: 1, pb: 1 }}>
      {isMobile && (
        <Tooltip title="Conversations">
          <IconButton onClick={onOpenSidebar} size="small">
            <MenuIcon />
          </IconButton>
        </Tooltip>
      )}
      <Typography variant="h6" sx={{ flex: 1 }} noWrap>
        {currentTitle}
      </Typography>

      {!titleEditing ? (
        <Tooltip title="Rename">
          <IconButton size="small" onClick={onStartEdit}>
            <span style={{ fontSize: 13, lineHeight: 1, marginTop: -1 }}>✎</span>
          </IconButton>
        </Tooltip>
      ) : (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <TextField
            value={pendingTitle}
            onChange={(e) => setPendingTitle(e.target.value)}
            size="small"
            autoFocus
            sx={{ minWidth: { xs: 200, sm: 320 }, "& .MuiInputBase-input": { py: 0.5 } }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); onSave(); }
              if (e.key === "Escape") { e.preventDefault(); onCancel(); }
            }}
          />
          <Tooltip title="Save">
            <IconButton size="small" onClick={onSave} sx={{ color: "success.main" }}>
              ✓
            </IconButton>
          </Tooltip>
          <Tooltip title="Cancel">
            <IconButton size="small" onClick={onCancel} sx={{ color: "error.main" }}>
              ✕
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
});

export default TitleBar;