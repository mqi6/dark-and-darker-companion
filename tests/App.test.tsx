import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import i18n from "../src/localization/i18n";
import { App } from "../src/ui/App";

describe("application shell", () => {
  afterEach(cleanup);

  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
  });

  it("shows exactly three workflow tabs and keeps settings global", () => {
    render(<App />);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "Stash" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Marketplace Search" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Auto Listing" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open settings" })).toBeInTheDocument();
    expect(screen.getByRole("grid", { name: "12 by 20 logical stash preview" })).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(240);
    expect(screen.getByLabelText("reserved region 1")).toBeInTheDocument();
  });

  it("preserves workflow state while switching tabs", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Auto Listing" }));
    const unitReference = screen.getByLabelText("Per-unit reference");
    fireEvent.change(unitReference, { target: { value: "155" } });

    fireEvent.click(screen.getByRole("tab", { name: "Marketplace Search" }));
    expect(screen.getByRole("heading", { name: "Marketplace Search foundation" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Auto Listing" }));

    expect(screen.getByLabelText("Per-unit reference")).toHaveValue("155");
  });

  it("supports arrow-key navigation across the three workflows", () => {
    render(<App />);
    const stashTab = screen.getByRole("tab", { name: "Stash" });
    stashTab.focus();

    fireEvent.keyDown(stashTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Marketplace Search" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Marketplace Search" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(screen.getByRole("tab", { name: "Marketplace Search" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "Auto Listing" })).toHaveFocus();
  });

  it("opens global settings, switches language, and restores focus when closed", async () => {
    render(<App />);
    const settingsButton = screen.getByRole("button", { name: "Open settings" });
    fireEvent.click(settingsButton);

    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "zh-CN" } });
    expect(await screen.findByRole("tab", { name: "市场搜索" })).toBeInTheDocument();

    const closeButton = screen.getByRole("button", { name: "关闭设置" });
    expect(closeButton).toHaveFocus();
    fireEvent.keyDown(closeButton, { key: "Tab", shiftKey: true });
    expect(screen.getByLabelText("语言")).toHaveFocus();
    fireEvent.keyDown(screen.getByLabelText("语言"), { key: "Tab" });
    expect(closeButton).toHaveFocus();

    fireEvent.click(closeButton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开设置" })).toHaveFocus();
  });

  it("keeps the global activity panel available across workflows", () => {
    render(<App />);
    const toggle = screen.getByRole("button", { name: "Collapse activity" });
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Expand activity" })).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("tab", { name: "Marketplace Search" }));
    expect(screen.getByRole("button", { name: "Expand activity" })).toBeInTheDocument();
  });
});
