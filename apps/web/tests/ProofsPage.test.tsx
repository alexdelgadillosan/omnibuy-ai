import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProofsPage from "@/app/decision-proofs/page";

const searchParams = vi.hoisted(() => ({ current: new URLSearchParams() }));
const fetchMock = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams.current,
}));

const proofs = [
  {
    decision_id: "DEC-COMPLETED-1",
    status: "completed",
    created_at: "2026-11-10T12:00:00Z",
    requirements: { request: "Find a USB-C cable under $30" },
    optimization: { total: "19.99" },
    evaluated_candidates: 20,
    selected_products: [{ id: "p1" }],
    integrity_verified: true,
  },
  {
    decision_id: "DEC-AWAITING-2",
    status: "awaiting_approval",
    created_at: "2026-11-10T13:00:00Z",
    requirements: { request: "Buy a webcam under $200" },
    optimization: { total: "57.65" },
    evaluated_candidates: 18,
    selected_products: [{ id: "p2" }],
    integrity_verified: false,
  },
];

describe("Decision Proofs page", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({ ok: true, json: () => proofs });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    searchParams.current = new URLSearchParams();
  });

  it("renders the persisted proofs with metrics and integrity badges", async () => {
    render(<ProofsPage />);
    expect(await screen.findByText(/DEC-COMPLETED-1/)).toBeInTheDocument();
    expect(screen.getByText(/DEC-AWAITING-2/)).toBeInTheDocument();
    expect(screen.getByText("$19.99")).toBeInTheDocument();
    expect(screen.getByText("$57.65")).toBeInTheDocument();
    expect(screen.getAllByText("✓ SHA-256")).toHaveLength(1);
    expect(screen.getAllByText("LEGACY")).toHaveLength(1);
    // Metrics: 2 total, 1 awaiting, 1 completed/paid, $77.64 proposed value.
    expect(screen.getByText("$77.64")).toBeInTheDocument();
    expect(screen.getByText("● Persisted · 2 records")).toBeInTheDocument();
  });

  it("reads the ?q= param as the initial filter (Cmd+K handoff)", async () => {
    searchParams.current = new URLSearchParams("q=DEC-AWAITING-2");
    render(<ProofsPage />);
    expect(await screen.findByText(/DEC-AWAITING-2/)).toBeInTheDocument();
    expect(screen.queryByText(/DEC-COMPLETED-1/)).not.toBeInTheDocument();
  });

  it("filters by request text and status as the user types", async () => {
    const user = userEvent.setup();
    render(<ProofsPage />);
    await screen.findByText(/DEC-COMPLETED-1/);
    await user.type(screen.getByPlaceholderText("Filter by decision ID, request or status…"), "webcam");
    expect(screen.queryByText(/DEC-COMPLETED-1/)).not.toBeInTheDocument();
    expect(screen.getByText(/DEC-AWAITING-2/)).toBeInTheDocument();
    expect(screen.getByText("● Persisted · 1 records")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", async () => {
    const user = userEvent.setup();
    render(<ProofsPage />);
    await screen.findByText(/DEC-COMPLETED-1/);
    await user.type(screen.getByPlaceholderText("Filter by decision ID, request or status…"), "nonexistent");
    expect(await screen.findByText("No Decision Proofs match")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open workspace →" })).toBeInTheDocument();
  });

  it("links every proof to its detail page", async () => {
    render(<ProofsPage />);
    await screen.findByText(/DEC-COMPLETED-1/);
    const links = screen.getAllByRole("link", { name: "Open →" }).map((link) => link.getAttribute("href"));
    expect(links).toEqual(["/decision-proofs/DEC-COMPLETED-1", "/decision-proofs/DEC-AWAITING-2"]);
  });

  it("reports API failures instead of faking data", async () => {
    fetchMock.mockRejectedValue(new Error("Could not load Decision Proofs"));
    render(<ProofsPage />);
    expect(await screen.findByText("Ledger unavailable")).toBeInTheDocument();
  });
});
