// @vitest-environment jsdom
// test/page.test.tsx
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "../app/page";

// jsdom has no navigator.gpu, so CoinCanvas degrades to StaticFallback and tells
// the page about it. That is exactly the state the last test pins — but every
// other test here is about the page a visitor with WebGPU sees, so those stub
// the property first. The stub is enough: init() fails on it right after, which
// only lands the same degraded state these tests have already asserted against.
function withWebGpu() {
  Object.defineProperty(navigator, "gpu", { value: {}, configurable: true });
}

afterEach(() => {
  delete (navigator as { gpu?: unknown }).gpu;
});

describe("page", () => {
  it("leads with the hook as the heading", () => {
    withWebGpu();
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1 }).textContent)
      .toContain("un ordenador sin tarjeta gráfica");
  });

  it("offers the mint action", () => {
    withWebGpu();
    render(<Page />);
    expect(screen.getByRole("button", { name: /acuñar/i })).toBeTruthy();
  });

  it("shows both places, with the server idle at rest", () => {
    withWebGpu();
    render(<Page />);
    expect(screen.getByText(/tu navegador, en vivo/)).toBeTruthy();
    expect(screen.getByText(/esperando/)).toBeTruthy();
  });

  it("never claims plain determinism", () => {
    withWebGpu();
    const { container } = render(<Page />);
    const text = container.textContent ?? "";
    if (/bit a bit|idéntico/i.test(text)) {
      expect(text).toMatch(/renderer|CPU fijado/i);
    }
  });

  // Without WebGPU the coin cannot be struck at all: a live "Acuñar" over the
  // server's PNG does nothing, and the server indicator would read "esperando"
  // forever. The headline stays — the piece still makes its argument.
  it("drops the controls, not the argument, when the live render is off", () => {
    render(<Page />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/servidor · esperando/)).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent)
      .toContain("un ordenador sin tarjeta gráfica");
  });
});
