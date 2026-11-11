import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadTextFile, toCsv, usd } from "@/lib/format";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalClick = HTMLAnchorElement.prototype.click;

describe("downloadTextFile", () => {
  let clicks: Array<{ filename: string; href: string }>;

  beforeEach(() => {
    clicks = [];
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:mock-url"),
      revokeObjectURL: vi.fn(),
    });
    HTMLAnchorElement.prototype.click = function click() {
      clicks.push({ filename: this.download, href: this.href });
    };
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    HTMLAnchorElement.prototype.click = originalClick;
    vi.unstubAllGlobals();
  });

  it("downloads the ledger CSV under the expected filename", () => {
    const csv = toCsv(["decision_id"], [["DEC-1"]]);
    downloadTextFile("omnibuy-audit-ledger.csv", csv);

    expect(clicks).toHaveLength(1);
    expect(clicks[0].filename).toBe("omnibuy-audit-ledger.csv");
    expect(clicks[0].href).toBe("blob:mock-url");
    expect(vi.mocked(URL.createObjectURL)).toHaveBeenCalledTimes(1);
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(blob.type).toBe("text/csv;charset=utf-8");
    expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledWith("blob:mock-url");
  });
});
