export const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", ...extra },
  });

export async function readJson<T extends Record<string, unknown>>(req: Request): Promise<Partial<T>> {
  try {
    const body = (await req.json()) as unknown;
    return body && typeof body === "object" ? (body as Partial<T>) : {};
  } catch {
    return {};
  }
}

export const ipOf = (req: Request) => {
  const xff = req.headers.get("x-forwarded-for");
  return (xff ? xff.split(",")[0].trim() : req.headers.get("x-real-ip")?.trim()) || "unknown";
};
