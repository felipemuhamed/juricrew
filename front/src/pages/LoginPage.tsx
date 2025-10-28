import { Box, Button, Paper, Tab, Tabs, TextField, Typography, CircularProgress } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

type Mode = "login" | "register";

export default function LoginPage({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [checking, setChecking] = useState(true);

  // Check session cookie on mount; forward if valid
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api.me();              // 200 if cookie/session valid
        if (!cancelled) onAuthed();  // go straight to chat
      } catch {
        // not authed — show login/register
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [onAuthed]);

  const content = useMemo(
    () => (mode === "login" ? <LoginForm onSuccess={onAuthed} /> : <RegisterForm onSuccess={onAuthed} />),
    [mode, onAuthed]
  );

  if (checking) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <CircularProgress size={20} />
          <Typography variant="body2">Checking your session…</Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box display="grid" gap={2} maxWidth={480} mx="auto">
      <Typography variant="h5">Welcome</Typography>

      <Paper sx={{ p: 2, display: "grid", gap: 2 }}>
        <Tabs value={mode} onChange={(_, v: Mode) => setMode(v)} variant="fullWidth">
          <Tab label="Login" value="login" />
          <Tab label="Register" value="register" />
        </Tabs>
        {content}
      </Paper>
    </Box>
  );
}

/** --------------------- Login --------------------- */
function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      setErr("");
      setBusy(true);
      await api.login(email.trim(), password); // cookie set by server
      onSuccess();
    } catch (e: any) {
      const data = e?.response?.data;
      const msg = typeof data === "string" ? data : data?.message || e?.message || "Login failed.";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box display="grid" gap={2}>
      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        autoComplete="email"
        fullWidth
      />
      <TextField
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        autoComplete="current-password"
        fullWidth
      />
      {err && <Typography color="error">{err}</Typography>}
      <Box display="flex" gap={1}>
        <Button variant="contained" onClick={submit} disabled={!canSubmit}>
          Login
        </Button>
      </Box>
    </Box>
  );
}

/** ------------------- Register -------------------- */
function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit =
    emailValid && password.length >= 6 && (displayName.trim().length > 0 || emailValid) && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      setErr("");
      setBusy(true);
      const safeDisplay = displayName.trim() || email.trim().split("@")[0];
      await api.register(email.trim(), password, safeDisplay); // cookie set by server
      onSuccess();
    } catch (e: any) {
      const data = e?.response?.data;
      const status = e?.response?.status;
      let msg = (typeof data === "string" ? data : data?.message) || e?.message || "Registration failed.";
      if (status === 409 && !msg) msg = "Email is already registered.";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box display="grid" gap={2}>
      <TextField
        label="Display name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        fullWidth
      />
      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        autoComplete="email"
        error={!!email && !emailValid}
        helperText={!!email && !emailValid ? "Enter a valid email" : " "}
        fullWidth
      />
      <TextField
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        autoComplete="new-password"
        helperText="At least 6 characters"
        fullWidth
      />
      {err && <Typography color="error">{err}</Typography>}
      <Box display="flex" gap={1}>
        <Button variant="contained" onClick={submit} disabled={!canSubmit}>
          Create account
        </Button>
      </Box>
    </Box>
  );
}