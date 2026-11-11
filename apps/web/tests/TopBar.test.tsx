import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TopBar from "@/components/TopBar";

const push = vi.fn();
const fetchMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("TopBar", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({ ok: true, json: () => [{ status: "awaiting_approval" }, { status: "awaiting_approval" }, { status: "completed" }] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    push.mockReset();
    document.documentElement.removeAttribute("data-theme");
    localStorage.clear();
  });

  it("submits the search query to the decision proofs page", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await screen.findByPlaceholderText("Search decision proofs by ID, request or status...");
    await user.type(screen.getByRole("textbox"), "  USB cable  ");
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/decision-proofs?q=USB%20cable");
  });

  it("counts awaiting-approval proofs for the pending badge", async () => {
    render(<TopBar />);
    expect(await screen.findByText("2")).toBeInTheDocument();
  });

  it("toggles the theme and persists it in localStorage", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await screen.findByRole("button", { name: "Toggle light and dark theme" });
    await user.click(screen.getByRole("button", { name: "Toggle light and dark theme" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("omnibuy-theme")).toBe("light");

    await user.click(screen.getByRole("button", { name: "Toggle light and dark theme" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe(null);
    expect(localStorage.getItem("omnibuy-theme")).toBe("dark");
  });

  it("links to the audit ledger, decision proofs and policy guard", () => {
    render(<TopBar />);
    expect(screen.getByTitle("Security telemetry").getAttribute("href")).toBe("/audit-ledger");
    expect(screen.getByTitle("Emergency override lives in Policy Guard").getAttribute("href")).toBe("/policy-guard");
    expect(screen.getByTitle(/decisions awaiting approval/).getAttribute("href")).toBe("/decision-proofs");
  });
});
