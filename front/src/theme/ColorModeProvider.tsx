// src/theme/ColorModeProvider.tsx
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CssBaseline, PaletteMode } from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";

type Ctx = { mode: PaletteMode; toggle: () => void; set: (m: PaletteMode) => void };
const ColorModeCtx = createContext<Ctx | null>(null);

export function useColorMode() {
  const ctx = useContext(ColorModeCtx);
  if (!ctx) throw new Error("useColorMode must be used within ColorModeProvider");
  return ctx;
}

const STORAGE_KEY = "mui-color-mode";

// Dark palette tones
const LEAD_BG = "#1b1f24";     // message pane (graphite/lead)
const PAPER_BG = "#23272e";    // cards/composer
const CODE_BG = "#0f1115";     // code blocks

export function ColorModeProvider({ children }: PropsWithChildren) {
  const systemPrefersDark =
    typeof window !== "undefined"
      ? window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false
      : false;

  const [mode, setMode] = useState<PaletteMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as PaletteMode | null;
      if (saved === "light" || saved === "dark") return saved;
    } catch {}
    return systemPrefersDark ? "dark" : "light";
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {}
  }, [mode]);

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          ...(mode === "dark"
            ? {
                background: {
                  default: LEAD_BG, // <- message area base
                  paper: PAPER_BG,  // <- bubbles/composer/panels
                },
              }
            : {}),
        },
        shape: { borderRadius: 12 },
        typography: {
          fontSize: 16,
          h1: { fontSize: "clamp(1.6rem, 2vw + 1rem, 2.4rem)" },
          h2: { fontSize: "clamp(1.4rem, 1.6vw + 0.9rem, 2rem)" },
          body1: { fontSize: "clamp(0.95rem, 0.5vw + 0.8rem, 1.05rem)" },
          body2: { fontSize: "clamp(0.9rem, 0.35vw + 0.78rem, 1rem)" },
        },
        breakpoints: { values: { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 } },
        components: {
          MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
          MuiCssBaseline: {
            styleOverrides: (t) => {
              const thumb =
                t.palette.mode === "dark"
                  ? "rgba(255,255,255,0.35)"
                  : "rgba(0,0,0,0.35)";
              const thumbHover =
                t.palette.mode === "dark"
                  ? "rgba(255,255,255,0.55)"
                  : "rgba(0,0,0,0.55)";

              const mono =
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

              return {
                ":root": { colorScheme: t.palette.mode },
                body: {
                  scrollbarWidth: "thin",
                  scrollbarColor: `${thumb} transparent`,
                  backgroundColor: t.palette.background.default,
                },

                // WebKit scrollbars
                "*::-webkit-scrollbar": { width: "6px", height: "6px" },
                "*::-webkit-scrollbar-track": { background: "transparent" },
                "*::-webkit-scrollbar-thumb": {
                  backgroundColor: thumb,
                  borderRadius: "3px",
                },
                "*::-webkit-scrollbar-thumb:hover": { backgroundColor: thumbHover },

                // Media defaults
                "img, video": { maxWidth: "100%", height: "auto" },

                // Code blocks
                "code, pre, kbd, samp": { fontFamily: mono },
                pre: {
                  overflowX: "auto",
                  margin: 0,
                  padding: "0.75rem",
                  borderRadius: 8,
                  background: CODE_BG,
                },

                // Reduced motion
                "@media (prefers-reduced-motion: reduce)": {
                  "*": {
                    animationDuration: "0.01ms !important",
                    animationIterationCount: "1 !important",
                    transitionDuration: "0.01ms !important",
                    scrollBehavior: "auto !important",
                  },
                },
              };
            },
          },
        },
      }),
    [mode]
  );

  const value = useMemo<Ctx>(
    () => ({
      mode,
      toggle: () => setMode((m) => (m === "light" ? "dark" : "light")),
      set: setMode,
    }),
    [mode]
  );

  return (
    <ColorModeCtx.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeCtx.Provider>
  );
}