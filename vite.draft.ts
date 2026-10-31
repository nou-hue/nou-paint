/**
 * Draft/preview flag, resolved at BUILD time from Vercel's own VERCEL_ENV.
 * "Draft" banners show on Preview and local dev only, never on a Production
 * build. Pages are also `noindex` on every non-production build.
 */
export function draftBuild(
  command: string,
  mode: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const vercelEnv = env.VERCEL_ENV;
  if (vercelEnv) return vercelEnv !== "production";
  return command === "serve" || mode === "development";
}
