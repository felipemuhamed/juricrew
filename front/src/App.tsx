// src/App.tsx
import { Box } from "@mui/material";
import { useState } from "react";
import LoginPage from "./pages/LoginPage";
import ChatPage from "./pages/ChatPage";
import { clearToken, getToken } from "./auth";
import NavigationBar from "../src/components/NavigationBar"; // <-- use the new navbar

export default function App() {
  // keep your simple token-based gate
  const [authed, setAuthed] = useState(!!getToken());

  // optional: if you still want a logout here, wire it in pages and call this
  const handleLoggedOut = () => {
    clearToken();
    setAuthed(false);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw" }}>
      {/* Top nav with Upload button */}
      <NavigationBar />

      {/* Main content area fills the rest */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {!authed ? (
          <LoginPage onAuthed={() => setAuthed(true)} />
        ) : (
          <ChatPage onLoggedOut={handleLoggedOut as any} />
        )}
      </Box>
    </Box>
  );
}