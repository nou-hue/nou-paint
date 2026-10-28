/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" on Preview/dev builds (shows the Draft banner, adds noindex), "0" on Production. Set in vite.config.ts. */
  readonly VITE_DRAFT_BUILD: "0" | "1";
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
