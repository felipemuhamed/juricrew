// src/layout/AppShell.tsx
import { useState } from "react";
import { Box, IconButton, Divider } from "@mui/material";
import { ChevronLeft, ChevronRight } from "@mui/icons-material";

type Props = { children: React.ReactNode; sidebar: React.ReactNode };

export default function AppShell({ children, sidebar }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const SIDEBAR_W = collapsed ? 72 : 280; // stays on the far left
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: `${SIDEBAR_W}px 1fr`,
        minHeight: "100vh",
        backgroundColor: "background.default",
      }}
    >
      {/* Left sidebar (fixed column) */}
      <Box
        sx={{
          position: "sticky",
          top: 0,
          height: "100vh",
          overflow: "hidden",
          bgcolor: "grey.900",
          borderRight: 1,
          borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", p: 1 }}>
          <IconButton
            size="small"
            onClick={() => setCollapsed((v) => !v)}
            sx={{ color: "grey.300", ml: "auto" }}
            aria-label="Toggle sidebar"
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </IconButton>
        </Box>
        <Divider sx={{ borderColor: "grey.800" }} />
        <Box sx={{ p: 1 }}>{sidebar}</Box>
      </Box>

      {/* Main area — only the conversation column is centered */}
      <Box
        component="main"
        sx={{
          display: "flex",
          justifyContent: "center", // centers the inner column only
          px: { xs: 1.5, sm: 3 },
          py: 3,
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 960 }}>{children}</Box>
      </Box>
    </Box>
  );
}