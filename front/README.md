# ⚖️ Juricrew Frontend

This is the **frontend interface** for the Juricrew AI document automation platform.  
It provides a modern UI built with **React + TypeScript + Vite + Material UI**, allowing users to:

- Create and organize projects/folders.
- Submit form inputs for document generation (e.g., legal pleadings).
- Manage input/output files locally or from a backend API.
- Integrate with the AI pipeline running on `localhost:9999` by default.

---

## 🧠 Tech Stack

| Layer | Technology |
|-------|-------------|
| Framework | [React 18](https://react.dev) |
| Language | [TypeScript](https://www.typescriptlang.org/) |
| Build Tool | [Vite](https://vitejs.dev) |
| UI Library | [Material UI (MUI)](https://mui.com) |
| State / HTTP | Axios, React hooks |
| Layout | Responsive grid & dark theme |
| Lint / Typecheck | ESLint + TypeScript |

---

## 🧩 Project Structure

```
src/
 ├─ api.ts                    # Axios setup and backend integration
 ├─ http.ts                   # HTTP instance (reads VITE_API_BASE_URL)
 ├─ components/
 │   ├─ layout/               # Sidebar, title bar, etc.
 │   ├─ messages/             # Chat message and message list
 │   ├─ pleadings/            # Pleading composer and card
 │   └─ shared dialogs        # Folder, rename, confirm, etc.
 ├─ pages/
 │   ├─ ChatPage.tsx          # Main document interface (replaces chat box)
 │   ├─ LoginPage.tsx         # Auth entry point
 ├─ theme/                    # MUI theme setup
 └─ main.tsx, App.tsx         # App bootstrap and routing
```

---

## ⚙️ Environment Variables

Before running, you need to define the backend API base URL.

Create a file named **`.env.local`** in the project root with:

### VSCode
```bash
VITE_API_BASE_URL=http://localhost:9999 npm run dev
```

```bash
VITE_API_BASE_URL=http://localhost:9999
```

You can also inject it at runtime using your shell:

### Windows (PowerShell)
```powershell
$env:VITE_API_BASE_URL="http://localhost:9999"
npm run dev
```

### macOS/Linux
```bash
VITE_API_BASE_URL=http://localhost:9999 npm run dev
```

---

## 🚀 Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Set environment variable
Ensure `VITE_API_BASE_URL` is configured (see above).

### 3. Start development server
```bash
npm run dev
```

The app will start on [http://localhost:5173](http://localhost:5173) by default.

---

## 🧱 Build for Production

```bash
npm run build
```

The optimized static assets will be in the `dist/` directory.

To preview the production build locally:

```bash
npm run preview
```

---

## 🧱 Start Docker

```bash
docker run -d --name juricrew -p 5000:5000 juricrew:latest
```

## 🧩 Key Components

| Component | Path | Description |
|------------|------|--------------|
| `ChatPage.tsx` | `src/pages/ChatPage.tsx` | Main UI page showing folder tree + pleading form |
| `SidebarPanel.tsx` | `src/components/layout/SidebarPanel.tsx` | Folder navigation and conversation list |
| `TitleBar.tsx` | `src/components/layout/TitleBar.tsx` | Conversation title editor |
| `PleadingComposer.tsx` | `src/components/PleadingComposer.tsx` | Input form for legal pleading fields |
| `PleadingCard.tsx` | `src/components/pleadings/PleadingCard.tsx` | UI container for form presentation |

---

## 🔗 Backend Integration

The frontend calls your backend endpoint defined by:

```
POST {VITE_API_BASE_URL}/docs/process
GET  {VITE_API_BASE_URL}/docs/download
```

These are handled in your Spring Boot app by `DocController.java` and `DocPipelineService.java`.

---

## 🧰 Scripts Summary

| Script | Description |
|--------|--------------|
| `npm run dev` | Start the local Vite dev server |
| `npm run build` | Build production-ready assets |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | (optional) Run ESLint for code quality |

---

## 🧑‍💻 Developer Notes

- The form fields (`motion_type`, `facts`, `process`, `court`, `parts`) correspond to JSON sent to `/docs/process`.
- Generated `.docx` files are automatically downloaded after processing.
- The left sidebar persists user folders, projects, and prior documents.
- Code is modularized for maintainability:
  - `layout` handles the UI shell
  - `messages` manages threaded messages (legacy chat)
  - `pleadings` handles structured input/output flow

---

## 📄 License

This project is proprietary and distributed for demonstration and internal development purposes only.  
All rights reserved © Juricrew Technologies.