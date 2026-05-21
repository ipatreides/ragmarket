import { describe, expect, it } from "vitest";
import { stripSlotSuffix } from "./itemName";

describe("stripSlotSuffix", () => {
  it("strips a single-digit slot suffix", () => {
    expect(stripSlotSuffix("Espada [3]")).toBe("Espada");
  });

  it("strips a multi-digit slot suffix", () => {
    expect(stripSlotSuffix("Bigode de Aspargo [10]")).toBe(
      "Bigode de Aspargo",
    );
  });

  it("strips when the suffix has trailing whitespace", () => {
    expect(stripSlotSuffix("Espada [3]   ")).toBe("Espada");
  });

  it("leaves names without a slot suffix untouched", () => {
    expect(stripSlotSuffix("Poção Vermelha")).toBe("Poção Vermelha");
  });

  it("only strips the final suffix, not bracketed names mid-string", () => {
    expect(stripSlotSuffix("Card [Some Note] [2]")).toBe("Card [Some Note]");
    expect(stripSlotSuffix("Card [Some Note]")).toBe("Card [Some Note]");
  });

  it("handles empty strings", () => {
    expect(stripSlotSuffix("")).toBe("");
  });
});
