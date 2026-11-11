import { describe, expect, it } from "vitest";
import { toCsv, usd } from "@/lib/format";

describe("usd", () => {
  it("formats numbers as US dollars with two decimals", () => {
    expect(usd(19.99)).toBe("$19.99");
    expect(usd(1234.5)).toBe("$1,234.50");
    expect(usd("8.49")).toBe("$8.49");
  });

  it("treats empty and zero values as $0.00", () => {
    expect(usd(0)).toBe("$0.00");
    expect(usd("")).toBe("$0.00");
    expect(usd(null as unknown as string)).toBe("$0.00");
    expect(usd(undefined as unknown as string)).toBe("$0.00");
  });
});

describe("toCsv", () => {
  it("joins a header and rows with commas and newlines", () => {
    const csv = toCsv(["a", "b"], [["1", "2"], ["3", "4"]]);
    expect(csv).toBe('"a","b"\n"1","2"\n"3","4"');
  });

  it("escapes embedded quotes per RFC 4180", () => {
    const csv = toCsv(["value"], [['said "hi"']]);
    expect(csv).toBe('"value"\n"said ""hi"""');
  });

  it("renders null and undefined as empty fields", () => {
    const csv = toCsv(["a", "b"], [[null, undefined]]);
    expect(csv).toBe('"a","b"\n"",""');
  });

  it("keeps commas inside quoted fields", () => {
    const csv = toCsv(["request"], [["cable, usb"]]);
    expect(csv).toBe('"request"\n"cable, usb"');
  });
});
