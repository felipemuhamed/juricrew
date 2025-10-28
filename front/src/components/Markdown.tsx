// src/components/Markdown.tsx
import React, { useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import hljs from "highlight.js/lib/common";
import "highlight.js/styles/github-dark.css";
import { Box, IconButton, Typography } from "@mui/material";

type Props = { children: string };

const CodeBlock: React.FC<{ language?: string; value: string }> = ({
  language,
  value,
}) => {
  const onCopy = useCallback(() => {
    void navigator.clipboard.writeText(value);
  }, [value]);

  let detected:
    | { language?: string; value: string }
    | ReturnType<typeof hljs.highlightAuto>;
  try {
    detected = language
      ? { language, value: hljs.highlight(value, { language }).value }
      : hljs.highlightAuto(value);
  } catch {
    detected = { language: "text", value };
  }

  return (
    <Box
      sx={{
        position: "relative",
        my: 1.5,
        borderRadius: 2,
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 1.5,
          py: 0.5,
          bgcolor: "background.default",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography variant="caption" sx={{ opacity: 0.8 }}>
          {(language || (detected as any).language || "text").toUpperCase()}
        </Typography>
        <IconButton aria-label="Copy" size="small" onClick={onCopy}>
          {/* Avoids @mui/icons-material dependency */}
          <span style={{ fontSize: 12 }}>Copy</span>
        </IconButton>
      </Box>

      <Box component="pre" sx={{ m: 0, p: 2, overflowX: "auto" }}>
        <Box
          component="code"
          className={`hljs language-${
            (detected as any).language ?? language ?? "text"
          }`}
          // highlight.js returns sanitized HTML
          dangerouslySetInnerHTML={{ __html: (detected as any).value }}
        />
      </Box>
    </Box>
  );
};

export default function Markdown({ children }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        // Use `any` here because react-markdown's element props types differ by version.
        h1: ({ node, ...props }: any) => (
          <Typography component="h1" variant="h5" sx={{ mt: 2 }} {...props} />
        ),
        h2: ({ node, ...props }: any) => (
          <Typography component="h2" variant="h6" sx={{ mt: 2 }} {...props} />
        ),
        p: ({ node, ...props }: any) => (
          <Typography component="p" sx={{ my: 1 }} {...props} />
        ),
        code({ inline, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || "");
          const text = String(children ?? "");
          if (inline) {
            return (
              <code
                style={{
                  padding: "0.1rem 0.25rem",
                  borderRadius: 4,
                  background: "var(--mui-palette-action-hover)",
                }}
                {...props}
              >
                {text}
              </code>
            );
          }
          return <CodeBlock language={match?.[1]} value={text} />;
        },
      }}
    >
      {children}
    </ReactMarkdown>
  );
}