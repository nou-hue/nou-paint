/**
 * Premium page images. They live in /private/pages (NOT /public), are bundled
 * into the SERVER build only, and are handed out by /api/page/$pageId after an
 * entitlement check. Nothing here may be imported from client code: the
 * `.server.` suffix makes the build fail if it is.
 */
const modules = import.meta.glob("/private/pages/*.jpg", {
  query: "?inline",
  import: "default",
}) as Record<string, () => Promise<string>>;

export type PremiumKind = "paint" | "line";

/** Ids that may be requested: strictly lowercase letters; never builds a path from user input. */
const ID_RE = /^[a-z]{2,32}$/;

export async function loadPremiumImage(pageId: string, kind: PremiumKind = "paint"): Promise<Buffer | null> {
  if (!ID_RE.test(pageId)) return null;
  const key = `/private/pages/${pageId}-${kind}.jpg`;
  const loader = modules[key];
  if (!loader) return null;
  const uri = await loader();
  const comma = uri.indexOf(",");
  if (!uri.startsWith("data:") || comma < 0) return null;
  return Buffer.from(uri.slice(comma + 1), "base64");
}

/**
 * Premium region pages are SVG files in /private/pages/<id>.svg, bundled as text
 * into the SERVER build only, exactly like the JPEGs. (None ship yet: the
 * only region SVG in the repo is a test fixture and is not content.)
 */
const svgModules = import.meta.glob("/private/pages/*.svg", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

export async function loadPremiumSvg(pageId: string): Promise<string | null> {
  if (!ID_RE.test(pageId)) return null;
  const loader = svgModules[`/private/pages/${pageId}.svg`];
  return loader ? await loader() : null;
}
