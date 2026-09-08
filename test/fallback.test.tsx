// @vitest-environment jsdom
// test/fallback.test.tsx
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import StaticFallback from "../components/StaticFallback";

describe("degradation", () => {
  it("shows the server-rendered image when WebGPU is missing", () => {
    render(<StaticFallback reason="no-webgpu" />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toContain("/api/mint");
  });

  // The visitor most likely to reach a dead endpoint is the one already without
  // WebGPU, and the browser's broken-image glyph is the one picture this page
  // must never show.
  it("drops the image rather than showing it broken, and keeps the note", () => {
    render(<StaticFallback reason="no-webgpu" />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/mismo shader/)).toBeTruthy();
  });

  it("never prints the word Error", () => {
    const { container } = render(<StaticFallback reason="device-lost" />);
    expect(container.textContent).not.toMatch(/error/i);
  });
});
