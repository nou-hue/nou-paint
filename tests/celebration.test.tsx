import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { confettiPieces } from "../src/components/Celebration";

vi.mock("@tanstack/react-router", () => ({ Link: (p: { children: unknown }) => <a href="/">{p.children as never}</a> }));

describe("celebration", () => {
  it("confetti is deterministic and decorative", () => {
    expect(confettiPieces(10)).toEqual(confettiPieces(10));
    expect(confettiPieces(28)).toHaveLength(28);
  });
  it("is a labelled modal dialog with real buttons, and its confetti is hidden from assistive tech", async () => {
    const { Celebration } = await import("../src/components/Celebration");
    const html = renderToStaticMarkup(<Celebration title="Test" onSee={() => {}} onKeepGoing={() => {}} />);
    expect(html).toMatch(/role="dialog"[^>]*aria-modal="true"|aria-modal="true"[^>]*role="dialog"/);
    expect(html).toContain("See your picture");
    expect(html).toContain("Keep editing");
    expect(html).toMatch(/aria-hidden="true"[^>]*data-testid="confetti"|data-testid="confetti"[^>]*aria-hidden="true"/);
  });
});
