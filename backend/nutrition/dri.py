"""Dietary Reference Intake (DRI) table -- RDA/AI and UL by sex and age
bracket, for the micronutrients tracked by the USDA ingest pipeline.

Values are the current NASEM/National Academies and NIH Office of Dietary
Supplements Dietary Reference Intakes for adults, extended down to age 18
since that's this app's minimum onboarding age. Not applicable to pregnancy
or lactation, which use different DRI tables entirely.

Sources: NIH NCBI Bookshelf DRI reference reports (NBK208874, NBK114316,
NBK545442) and the National Academies' 2019 Sodium and Potassium report.
"""

from __future__ import annotations

from dataclasses import dataclass

from backend.nutrition.targets import Sex

AgeBracket = tuple[int, int]

# Boundaries line up with every documented DRI step-change for our nutrient
# set: magnesium steps up at 31, calcium/iron/B6 step at 51, vitamin D steps
# at 71.
AGE_BRACKETS: list[AgeBracket] = [(18, 30), (31, 50), (51, 70), (71, 200)]


def get_age_bracket(age_years: float) -> AgeBracket:
    for lo, hi in AGE_BRACKETS:
        if lo <= age_years <= hi:
            return (lo, hi)
    return AGE_BRACKETS[-1] if age_years > AGE_BRACKETS[-1][1] else AGE_BRACKETS[0]


@dataclass(frozen=True)
class NutrientTarget:
    rda: float
    unit: str
    ul: float | None = None  # Tolerable Upper Intake Level, where one exists


# Nutrients whose RDA/AI does not change across adult age brackets.
# Sodium and potassium AI are deliberately NOT stratified by adult age
# bracket -- the 2019 DRI revision explicitly declined to do so citing
# insufficient evidence, and sodium doesn't even split by sex.
_CONSTANT_RDA: dict[Sex, dict[str, tuple[float, str]]] = {
    "male": {
        "sodium_mg": (1500, "mg"),
        "potassium_mg": (3400, "mg"),
        "zinc_mg": (11, "mg"),
        "selenium_ug": (55, "ug"),
        "vitamin_a_rae_ug": (900, "ug"),
        "vitamin_c_mg": (90, "mg"),
        "vitamin_e_mg": (15, "mg"),
        "vitamin_k_ug": (120, "ug"),
        "thiamin_mg": (1.2, "mg"),
        "riboflavin_mg": (1.3, "mg"),
        "niacin_mg": (16, "mg"),
        "folate_dfe_ug": (400, "ug"),
        "vitamin_b12_ug": (2.4, "ug"),
        "choline_mg": (550, "mg"),
        "phosphorus_mg": (700, "mg"),
        "copper_mg": (0.9, "mg"),
        "manganese_mg": (2.3, "mg"),
    },
    "female": {
        "sodium_mg": (1500, "mg"),
        "potassium_mg": (2600, "mg"),
        "zinc_mg": (8, "mg"),
        "selenium_ug": (55, "ug"),
        "vitamin_a_rae_ug": (700, "ug"),
        "vitamin_c_mg": (75, "mg"),
        "vitamin_e_mg": (15, "mg"),
        "vitamin_k_ug": (90, "ug"),
        "thiamin_mg": (1.1, "mg"),
        "riboflavin_mg": (1.1, "mg"),
        "niacin_mg": (14, "mg"),
        "folate_dfe_ug": (400, "ug"),
        "vitamin_b12_ug": (2.4, "ug"),
        "choline_mg": (425, "mg"),
        "phosphorus_mg": (700, "mg"),
        "copper_mg": (0.9, "mg"),
        "manganese_mg": (1.8, "mg"),
    },
}

# Nutrients whose RDA changes by age bracket: calcium and iron step at 51
# (women only for both), magnesium steps at 31 (both sexes), vitamin D steps
# at 71 (both sexes), B6 steps at 51 (both sexes).
_BRACKET_RDA: dict[tuple[Sex, AgeBracket], dict[str, tuple[float, str]]] = {
    ("male", (18, 30)): {
        "calcium_mg": (1000, "mg"),
        "iron_mg": (8, "mg"),
        "magnesium_mg": (400, "mg"),
        "vitamin_d_ug": (15, "ug"),
        "vitamin_b6_mg": (1.3, "mg"),
    },
    ("male", (31, 50)): {
        "calcium_mg": (1000, "mg"),
        "iron_mg": (8, "mg"),
        "magnesium_mg": (420, "mg"),
        "vitamin_d_ug": (15, "ug"),
        "vitamin_b6_mg": (1.3, "mg"),
    },
    ("male", (51, 70)): {
        "calcium_mg": (1000, "mg"),
        "iron_mg": (8, "mg"),
        "magnesium_mg": (420, "mg"),
        "vitamin_d_ug": (15, "ug"),
        "vitamin_b6_mg": (1.7, "mg"),
    },
    ("male", (71, 200)): {
        "calcium_mg": (1200, "mg"),
        "iron_mg": (8, "mg"),
        "magnesium_mg": (420, "mg"),
        "vitamin_d_ug": (20, "ug"),
        "vitamin_b6_mg": (1.7, "mg"),
    },
    ("female", (18, 30)): {
        "calcium_mg": (1000, "mg"),
        "iron_mg": (18, "mg"),
        "magnesium_mg": (310, "mg"),
        "vitamin_d_ug": (15, "ug"),
        "vitamin_b6_mg": (1.3, "mg"),
    },
    ("female", (31, 50)): {
        "calcium_mg": (1000, "mg"),
        "iron_mg": (18, "mg"),
        "magnesium_mg": (320, "mg"),
        "vitamin_d_ug": (15, "ug"),
        "vitamin_b6_mg": (1.3, "mg"),
    },
    ("female", (51, 70)): {
        "calcium_mg": (1200, "mg"),
        "iron_mg": (8, "mg"),
        "magnesium_mg": (320, "mg"),
        "vitamin_d_ug": (15, "ug"),
        "vitamin_b6_mg": (1.5, "mg"),
    },
    ("female", (71, 200)): {
        "calcium_mg": (1200, "mg"),
        "iron_mg": (8, "mg"),
        "magnesium_mg": (320, "mg"),
        "vitamin_d_ug": (20, "ug"),
        "vitamin_b6_mg": (1.5, "mg"),
    },
}

# Tolerable Upper Intake Levels. Constant across sex and adult age bracket
# for these eight nutrients per the NASEM DRI reports. Niacin and folate ULs
# apply only to synthetic/fortified intake (supplements, fortified food),
# not naturally occurring dietary niacin or food folate -- the UI warning
# for those two should be read with that caveat, not applied to total
# whole-food intake as strictly as the other six. Sodium has no formal UL;
# the 2019 Chronic Disease Risk Reduction (CDRR) value is used here as the
# upper-bound warning threshold instead.
UPPER_LIMITS: dict[str, float] = {
    "iron_mg": 45,
    "zinc_mg": 40,
    "selenium_ug": 400,
    "vitamin_a_rae_ug": 3000,
    "vitamin_d_ug": 100,
    "niacin_mg": 35,
    "folate_dfe_ug": 1000,
    "sodium_mg": 2300,
}


def get_micronutrient_targets(sex: Sex, age_years: float) -> dict[str, NutrientTarget]:
    bracket = get_age_bracket(age_years)
    combined: dict[str, tuple[float, str]] = {
        **_CONSTANT_RDA[sex],
        **_BRACKET_RDA[(sex, bracket)],
    }
    return {
        key: NutrientTarget(rda=value, unit=unit, ul=UPPER_LIMITS.get(key))
        for key, (value, unit) in combined.items()
    }
