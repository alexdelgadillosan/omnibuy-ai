import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SidebarNav from "@/components/SidebarNav";

const mockPathname = vi.hoisted(() => ({ current: "/" }));
const fetchMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname.current,
}));

describe("SidebarNav", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("renders every navigation route", () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => [] });
    render(<SidebarNav />);
    const hrefs = [...screen.getAllByRole("link")].map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(["/", "/workspace", "/decision-proofs", "/policy-guard", "/checkout", "/audit-ledger"]);
  });

  it("marks the current route as active", () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => [] });
    mockPathname.current = "/workspace";
    render(<SidebarNav />);
    const active = screen.getByText("Agent Workspace").closest("a");
    expect(active?.className).toBe("active");
    const inactive = screen.getByText("Policy Guard").closest("a");
    expect(inactive?.className).toBe("");
    mockPathname.current = "/";
  });

  it("shows the count of persisted proofs from the API", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => [{ status: "approved" }, { status: "blocked" }] });
    render(<SidebarNav />);
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/decision-proofs"));
  });

  it("hides the badge when the API call fails", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    render(<SidebarNav />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });
});
