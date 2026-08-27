import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "../src/localization/i18n";
import { App } from "../src/ui/App";

describe("application shell", () => {
  it("shows all four product tabs", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "Stash" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auction" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gear Search" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });
});
