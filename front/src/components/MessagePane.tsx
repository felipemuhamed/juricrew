import { Box } from "@mui/material";
import ChatMessage, { ChatMessage as T } from "./ChatMessage";

export default function MessagePane({ messages }: { messages: T[] }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <Box
        sx={{
          width: "100%",
          maxWidth: 960,
          display: "flex",
          flexDirection: "column",
          gap: 1.25,
        }}
      >
        {messages.map((m) => (
          <ChatMessage key={m.id} {...m} />
        ))}
      </Box>
    </Box>
  );
}