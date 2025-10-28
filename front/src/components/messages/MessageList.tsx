// src/components/messages/MessageList.tsx
import { Box, CircularProgress } from "@mui/material";
import MessagePane from "../MessagePane";
import { Msg } from "../../api";
import { RefObject } from "react";

export default function MessageList({
  minListHeight,
  messages,
  loading,
  endAnchorRef,
}: {
  minListHeight: number;
  messages: Msg[];
  loading: boolean;
  endAnchorRef: RefObject<HTMLDivElement>;
}) {
  return (
    <Box
      sx={{
        minHeight: `${minListHeight}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      <MessagePane messages={messages} />
      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
          <CircularProgress size={20} />
        </Box>
      )}
      <Box ref={endAnchorRef} sx={{ height: 1 }} />
    </Box>
  );
}