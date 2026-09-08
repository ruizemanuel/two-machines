// @vitest-environment jsdom
// test/page.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "../app/page";

describe("page", () => {
  it("leads with the hook as the heading", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1 }).textContent)
      .toContain("un ordenador sin tarjeta gráfica");
  });

  it("offers the mint action", () => {
    render(<Page />);
    expect(screen.getByRole("button", { name: /acuñar/i })).toBeTruthy();
  });

  it("shows both places, with the server idle at rest", () => {
    render(<Page />);
    expect(screen.getByText(/tu navegador, en vivo/)).toBeTruthy();
    expect(screen.getByText(/esperando/)).toBeTruthy();
  });

  it("never claims plain determinism", () => {
    const { container } = render(<Page />);
    const text = container.textContent ?? "";
    if (/bit a bit|idéntico/i.test(text)) {
      expect(text).toMatch(/renderer|CPU fijado/i);
    }
  });
});
