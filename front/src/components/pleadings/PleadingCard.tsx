// src/components/pleadings/PleadingCard.tsx
import { Box } from "@mui/material";
import { PropsWithChildren } from "react";

export default function PleadingCard({ children }: PropsWithChildren) {
  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: 820,
        boxSizing: "border-box",
        overflow: "hidden",
        borderRadius: 3,
        px: 1.5,
        py: 1.1,
        bgcolor: "background.paper",
        border: (t) =>
          `1px solid ${
            t.palette.mode === "dark"
              ? "rgba(255,255,255,0.10)"
              : "rgba(0,0,0,0.12)"
          }`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
        backgroundClip: "padding-box",
        "& *": { boxSizing: "border-box" },
      }}
    >
      {children}
    </Box>
  );
}
