import { describe, it, expect } from "vitest";
import { getAgeBracket, getDri, DRI_TABLE } from "./dri";

describe("getAgeBracket", () => {
  it.each([
    [19, "19-30"],
    [30, "19-30"],
    [31, "31-50"],
    [50, "31-50"],
    [51, "51-70"],
    [70, "51-70"],
    [71, "71+"],
    [90, "71+"],
  ] as const)("maps age %i to bracket %s", (age, bracket) => {
    expect(getAgeBracket(age)).toBe(bracket);
  });
});

describe("getDri", () => {
  it("returns sex-specific RDAs for vitamin A", () => {
    expect(getDri("vitAUg", "male", 25)?.rda).toBe(900);
    expect(getDri("vitAUg", "female", 25)?.rda).toBe(700);
  });

  it("returns age-bracket-specific RDA for iron (drops for women after menopause bracket)", () => {
    expect(getDri("ironMg", "female", 25)?.rda).toBe(18);
    expect(getDri("ironMg", "female", 60)?.rda).toBe(8);
  });

  it("returns age-bracket-specific RDA for calcium", () => {
    expect(getDri("calciumMg", "female", 40)?.rda).toBe(1000);
    expect(getDri("calciumMg", "female", 60)?.rda).toBe(1200);
  });

  it("returns age-bracket-specific RDA for vitamin D", () => {
    expect(getDri("vitDUg", "male", 40)?.rda).toBe(15);
    expect(getDri("vitDUg", "male", 75)?.rda).toBe(20);
  });

  it("populates ULs for the nutrients the spec requires them for", () => {
    for (const key of ["ironMg", "zincMg", "seleniumUg", "vitAUg", "vitDUg", "niacinMg", "folateUg", "sodiumMg"]) {
      expect(getDri(key, "male", 30)?.ul).not.toBeNull();
      expect(getDri(key, "female", 30)?.ul).not.toBeNull();
    }
  });

  it("leaves ULs null for nutrients not called out in the spec", () => {
    for (const key of [
      "potassiumMg",
      "calciumMg",
      "magnesiumMg",
      "phosphorusMg",
      "copperMg",
      "manganeseMg",
      "vitEMg",
      "vitKUg",
      "thiaminMg",
      "riboflavinMg",
      "vitB6Mg",
      "vitB12Ug",
      "cholineMg",
    ]) {
      expect(getDri(key, "male", 30)?.ul).toBeNull();
    }
  });

  it("uses the CDRR value of 2300mg as the sodium UL", () => {
    expect(getDri("sodiumMg", "male", 30)?.ul).toBe(2300);
  });

  it("covers every nutrient for both sexes and all four age brackets", () => {
    const brackets = ["19-30", "31-50", "51-70", "71+"];
    for (const key of Object.keys(DRI_TABLE)) {
      for (const sex of ["male", "female"] as const) {
        for (const bracket of brackets) {
          expect(DRI_TABLE[key][sex][bracket as keyof (typeof DRI_TABLE)[string]["male"]]).toBeDefined();
        }
      }
    }
  });
});
