import { Avatar, Box, Paper } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import Markdown from "./Markdown";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

export default function ChatMessage({ role, content }: ChatMessage) {
  const isUser = role === "user";
  const theme = useTheme();
  const userBg =
    theme.palette.mode === "dark" ? "grey.800" : "grey.200";
  const userColor =
    theme.palette.mode === "dark" ? "grey.50" : "grey.900";

  return (
    <Box
      sx={{
        display: "flex",
        gap: 1.25,
        my: 0.75,
        flexDirection: isUser ? "row-reverse" : "row",
        alignItems: "flex-start",
      }}
    >
      {/* Avatar (assistant on left, user on right) */}
      <Avatar
        sx={{
          bgcolor: isUser ? "primary.main" : "grey.700",
          width: 28,
          height: 28,
          fontSize: 12,
        }}
      >
        {isUser ? "U" : "AI"}
      </Avatar>

      <Paper
        elevation={0}
        sx={{
          // Bubbles widths: user narrower than assistant
          maxWidth: isUser
            ? { xs: "85%", sm: "75%" }
            : { xs: "100%", sm: "92%" },
          px: 2,
          py: 1.25,
          borderRadius: 3,
          bgcolor: isUser ? userBg : "background.paper",
          color: isUser ? userColor : "text.primary",
          border: 1,
          borderColor: "divider",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",

          // Markdown/code readability
          "& pre": {
            m: 0,
            mt: 1,
            overflowX: "auto",
            p: 1.25,
            borderRadius: 2,
          },
          "& code": { fontSize: "0.9rem", wordBreak: "break-word" },
          "& hr": { display: "none" },
          "& table, & th, & td": { border: "none" },
          "& blockquote": { borderLeft: "none" },
        }}
      >
        <Markdown>{content || ""}</Markdown>
      </Paper>
    </Box>
  );
}