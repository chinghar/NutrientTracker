/**
 * Hardcoded US/Canada Dietary Reference Intake (DRI) table for adults,
 * keyed by (sex, age bracket). Values are RDAs/AIs from the NIH Office of
 * Dietary Supplements fact sheets. Only under-18 users are blocked upstream
 * in targets.ts, so no pediatric brackets are needed here.
 *
 * Nutrient keys match the keys used in public/data/foods.json's `nutrients`
 * object, so a food's per-100g values can be looked up against this table
 * with no key translation.
 *
 * Tolerable Upper Intake Levels (UL) are only populated for the nutrients
 * where exceeding them carries a meaningful, well-documented risk: iron,
 * zinc, selenium, vitamin A, vitamin D, niacin, folate, and sodium. Other
 * nutrients have `ul: null` — either no UL is established, or the risk of
 * over-supplementation from food alone is not clinically meaningful.
 *
 * Sodium has no true DRI "UL" — 2300 mg is the 2019 Chronic Disease Risk
 * Reduction (CDRR) intake, used here as the practical "don't exceed" value.
 */

export type Sex = "male" | "female";
export type AgeBracket = "19-30" | "31-50" | "51-70" | "71+";

export function getAgeBracket(age: number): AgeBracket {
  if (age < 31) return "19-30";
  if (age < 51) return "31-50";
  if (age < 71) return "51-70";
  return "71+";
}

export interface NutrientDri {
  /** Recommended Dietary Allowance, or Adequate Intake where no RDA is established. */
  rda: number;
  /** Tolerable Upper Intake Level, or null where none is tracked/established. */
  ul: number | null;
  unit: "mg" | "ug" | "mcgRAE" | "mcgDFE";
}

type BracketTable = Record<AgeBracket, NutrientDri>;
type DriTable = Record<string, Record<Sex, BracketTable>>;

const ALL_BRACKETS: AgeBracket[] = ["19-30", "31-50", "51-70", "71+"];

/** Same RDA/UL across every adult age bracket. */
function uniform(rda: number, ul: number | null, unit: NutrientDri["unit"]): BracketTable {
  return Object.fromEntries(ALL_BRACKETS.map((b) => [b, { rda, ul, unit }])) as BracketTable;
}

export const DRI_TABLE: DriTable = {
  sodiumMg: {
    male: uniform(1500, 2300, "mg"),
    female: uniform(1500, 2300, "mg"),
  },
  potassiumMg: {
    male: uniform(3400, null, "mg"),
    female: uniform(2600, null, "mg"),
  },
  calciumMg: {
    male: {
      "19-30": { rda: 1000, ul: null, unit: "mg" },
      "31-50": { rda: 1000, ul: null, unit: "mg" },
      "51-70": { rda: 1000, ul: null, unit: "mg" },
      "71+": { rda: 1200, ul: null, unit: "mg" },
    },
    female: {
      "19-30": { rda: 1000, ul: null, unit: "mg" },
      "31-50": { rda: 1000, ul: null, unit: "mg" },
      "51-70": { rda: 1200, ul: null, unit: "mg" },
      "71+": { rda: 1200, ul: null, unit: "mg" },
    },
  },
  ironMg: {
    male: uniform(8, 45, "mg"),
    female: {
      "19-30": { rda: 18, ul: 45, unit: "mg" },
      "31-50": { rda: 18, ul: 45, unit: "mg" },
      "51-70": { rda: 8, ul: 45, unit: "mg" },
      "71+": { rda: 8, ul: 45, unit: "mg" },
    },
  },
  magnesiumMg: {
    male: {
      "19-30": { rda: 400, ul: null, unit: "mg" },
      "31-50": { rda: 420, ul: null, unit: "mg" },
      "51-70": { rda: 420, ul: null, unit: "mg" },
      "71+": { rda: 420, ul: null, unit: "mg" },
    },
    female: {
      "19-30": { rda: 310, ul: null, unit: "mg" },
      "31-50": { rda: 320, ul: null, unit: "mg" },
      "51-70": { rda: 320, ul: null, unit: "mg" },
      "71+": { rda: 320, ul: null, unit: "mg" },
    },
  },
  zincMg: {
    male: uniform(11, 40, "mg"),
    female: uniform(8, 40, "mg"),
  },
  seleniumUg: {
    male: uniform(55, 400, "ug"),
    female: uniform(55, 400, "ug"),
  },
  phosphorusMg: {
    male: uniform(700, null, "mg"),
    female: uniform(700, null, "mg"),
  },
  copperMg: {
    male: uniform(0.9, null, "mg"),
    female: uniform(0.9, null, "mg"),
  },
  manganeseMg: {
    male: uniform(2.3, null, "mg"),
    female: uniform(1.8, null, "mg"),
  },
  vitAUg: {
    male: uniform(900, 3000, "mcgRAE"),
    female: uniform(700, 3000, "mcgRAE"),
  },
  vitCMg: {
    male: uniform(90, 2000, "mg"),
    female: uniform(75, 2000, "mg"),
  },
  vitDUg: {
    male: {
      "19-30": { rda: 15, ul: 100, unit: "ug" },
      "31-50": { rda: 15, ul: 100, unit: "ug" },
      "51-70": { rda: 15, ul: 100, unit: "ug" },
      "71+": { rda: 20, ul: 100, unit: "ug" },
    },
    female: {
      "19-30": { rda: 15, ul: 100, unit: "ug" },
      "31-50": { rda: 15, ul: 100, unit: "ug" },
      "51-70": { rda: 15, ul: 100, unit: "ug" },
      "71+": { rda: 20, ul: 100, unit: "ug" },
    },
  },
  vitEMg: {
    male: uniform(15, null, "mg"),
    female: uniform(15, null, "mg"),
  },
  vitKUg: {
    male: uniform(120, null, "ug"),
    female: uniform(90, null, "ug"),
  },
  thiaminMg: {
    male: uniform(1.2, null, "mg"),
    female: uniform(1.1, null, "mg"),
  },
  riboflavinMg: {
    male: uniform(1.3, null, "mg"),
    female: uniform(1.1, null, "mg"),
  },
  niacinMg: {
    male: uniform(16, 35, "mg"),
    female: uniform(14, 35, "mg"),
  },
  vitB6Mg: {
    male: {
      "19-30": { rda: 1.3, ul: null, unit: "mg" },
      "31-50": { rda: 1.3, ul: null, unit: "mg" },
      "51-70": { rda: 1.7, ul: null, unit: "mg" },
      "71+": { rda: 1.7, ul: null, unit: "mg" },
    },
    female: {
      "19-30": { rda: 1.3, ul: null, unit: "mg" },
      "31-50": { rda: 1.3, ul: null, unit: "mg" },
      "51-70": { rda: 1.5, ul: null, unit: "mg" },
      "71+": { rda: 1.5, ul: null, unit: "mg" },
    },
  },
  folateUg: {
    male: uniform(400, 1000, "mcgDFE"),
    female: uniform(400, 1000, "mcgDFE"),
  },
  vitB12Ug: {
    male: uniform(2.4, null, "ug"),
    female: uniform(2.4, null, "ug"),
  },
  cholineMg: {
    male: uniform(550, null, "mg"),
    female: uniform(425, null, "mg"),
  },
};

export function getDri(nutrientKey: string, sex: Sex, age: number): NutrientDri | undefined {
  return DRI_TABLE[nutrientKey]?.[sex]?.[getAgeBracket(age)];
}
