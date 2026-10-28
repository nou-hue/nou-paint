/**
 * "Draft" switch. True on Vercel Preview builds and local dev, false on a
 * Production build (see draftBuild() in vite.config.ts). Safe on client + server.
 */
export const IS_DRAFT_BUILD = import.meta.env.VITE_DRAFT_BUILD === "1";
