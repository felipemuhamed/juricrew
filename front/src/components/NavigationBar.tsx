// src/components/navigation/NavigationBar.tsx
import {
  AppBar,
  IconButton,
  Toolbar,
  Typography,
  Tooltip,
  Button,
} from "@mui/material";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
// More widely available icons:
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
// import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import { useRef, useState } from "react";

import { useColorMode } from "../theme/ColorModeProvider";
import { api } from "../api";

export default function NavigationBar() {
  const { mode, toggle } = useColorMode();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const hardReloadToRoot = () => {
    const rootUrl = `${window.location.origin}/`;
    window.location.replace(rootUrl);
    setTimeout(() => {
      try { window.location.reload(); } catch {}
    }, 50);
  };

  const logout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await api.logout();
      try { sessionStorage.clear(); } catch {}
      if ("serviceWorker" in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        } catch {}
      }
      if ("caches" in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch {}
      }
    } catch {
      // ignore
    } finally {
      hardReloadToRoot();
    }
  };

  const clickHiddenFileInput = () => {
    console.log("Upload button clicked"); // <-- confirms this component is live
    fileInputRef.current?.click();
  };

  const onFilePicked: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadToRag(file);
      alert(`Uploaded "${file.name}" to RAG successfully.`);
    } catch (err) {
      console.error(err);
      alert("Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <AppBar position="sticky" color="primary" elevation={1}>
      <Toolbar sx={{ gap: 1 }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          AI Copilot (On-Prem) • with Upload    {/* change helps verify */}
        </Typography>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.doc,.docx,.txt,.md"
          style={{ display: "none" }}
          onChange={onFilePicked}
        />

        {/* Upload icon button */}
        <Tooltip title={uploading ? "Uploading..." : "Upload document to RAG"}>
          <span>
            <IconButton
              color="inherit"
              onClick={clickHiddenFileInput}
              aria-label="upload to rag"
              disabled={uploading}
              data-testid="nav-upload"
            >
              <UploadFileOutlinedIcon />
              {/* If icon ever fails to load, this tiny text ensures visibility */}
              <span style={{ fontSize: 0, marginLeft: 4 }}>Upload</span>
            </IconButton>
          </span>
        </Tooltip>

        {/* Optional: also show a visible text button while debugging */}
        <Button
          onClick={clickHiddenFileInput}
          disabled={uploading}
          sx={{ display: { xs: "none", md: "inline-flex" } }}
          variant="outlined"
          size="small"
        >
          Upload
        </Button>

        <Tooltip title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
          <IconButton color="inherit" onClick={toggle} aria-label="toggle color mode">
            {mode === "dark" ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
          </IconButton>
        </Tooltip>

        <Tooltip title={isLoggingOut ? "Logging out..." : "Logout"}>
          <span>
            <IconButton
              color="inherit"
              onClick={logout}
              aria-label="logout"
              disabled={isLoggingOut}
            >
              <LogoutIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}