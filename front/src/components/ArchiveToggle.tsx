// src/components/ArchiveToggle.tsx
import { Box, Switch, Typography } from "@mui/material";

type Props = {
  checked: boolean;                 // true = show archived
  onChange: (checked: boolean) => void;
};

export default function ArchiveToggle({ checked, onChange }: Props) {
  return (
    <Box
      sx={{
        px: 1,
        py: 0.5,
        display: "flex",
        alignItems: "center",
        gap: 1,
        borderRadius: 1,
      }}
    >
      <Typography variant="caption" sx={{ opacity: checked ? 0.6 : 1 }}>
        Active
      </Typography>
      <Switch
        size="small"
        checked={checked}
        onChange={(_, v) => onChange(v)}
        inputProps={{ "aria-label": "Show archived conversations" }}
      />
      <Typography variant="caption" sx={{ opacity: checked ? 1 : 0.6 }}>
        Archived
      </Typography>
    </Box>
  );
}