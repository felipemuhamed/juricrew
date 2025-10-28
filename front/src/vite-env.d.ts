/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  // Add more VITE_ variables here if you need them later
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}