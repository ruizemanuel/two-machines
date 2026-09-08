// @vitest-environment jsdom
// test/fallback.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import StaticFallback from "../components/StaticFallback";

describe("degradation", () => {
  it("shows the server-rendered image when WebGPU is missing", () => {
    render(<StaticFallback reason="no-webgpu" />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toContain("/api/mint");
  });

  it("never prints the word Error", () => {
    const { container } = render(<StaticFallback reason="device-lost" />);
    expect(container.textContent).not.toMatch(/error/i);
  });
});
