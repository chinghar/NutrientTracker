from __future__ import annotations

import pytest

from backend.nutrition import dri


# --- Age bracket boundaries ---------------------------------------------


@pytest.mark.parametrize(
    "age,expected",
    [
        (18, (18, 30)),
        (30, (18, 30)),
        (31, (31, 50)),
        (50, (31, 50)),
        (51, (51, 70)),
        (70, (51, 70)),
        (71, (71, 200)),
        (95, (71, 200)),
    ],
)
def test_age_bracket_boundaries(age, expected):
    assert dri.get_age_bracket(age) == expected


# --- Bracket-dependent nutrients ----------------------------------------


def test_magnesium_steps_up_at_31_not_51():
    young_male = dri.get_micronutrient_targets("male", 25)
    mid_male = dri.get_micronutrient_targets("male", 40)
    older_male = dri.get_micronutrient_targets("male", 60)
    assert young_male["magnesium_mg"].rda == 400
    assert mid_male["magnesium_mg"].rda == 420
    assert older_male["magnesium_mg"].rda == 420  # no further change at 51


def test_calcium_steps_up_at_51_for_women_only():
    young_female = dri.get_micronutrient_targets("female", 40)
    older_female = dri.get_micronutrient_targets("female", 55)
    young_male = dri.get_micronutrient_targets("male", 40)
    older_male = dri.get_micronutrient_targets("male", 55)
    assert young_female["calcium_mg"].rda == 1000
    assert older_female["calcium_mg"].rda == 1200
    assert young_male["calcium_mg"].rda == 1000
    assert older_male["calcium_mg"].rda == 1000  # men don't step up until 71


def test_calcium_steps_up_for_men_at_71():
    assert dri.get_micronutrient_targets("male", 75)["calcium_mg"].rda == 1200


def test_iron_drops_for_women_at_51_postmenopause():
    younger = dri.get_micronutrient_targets("female", 35)
    older = dri.get_micronutrient_targets("female", 60)
    assert younger["iron_mg"].rda == 18
    assert older["iron_mg"].rda == 8


def test_iron_constant_for_men():
    assert dri.get_micronutrient_targets("male", 25)["iron_mg"].rda == 8
    assert dri.get_micronutrient_targets("male", 75)["iron_mg"].rda == 8


def test_vitamin_d_steps_up_at_71():
    assert dri.get_micronutrient_targets("male", 65)["vitamin_d_ug"].rda == 15
    assert dri.get_micronutrient_targets("male", 71)["vitamin_d_ug"].rda == 20


def test_b6_steps_up_at_51():
    assert dri.get_micronutrient_targets("female", 45)["vitamin_b6_mg"].rda == 1.3
    assert dri.get_micronutrient_targets("female", 55)["vitamin_b6_mg"].rda == 1.5


# --- Constant-across-brackets nutrients ----------------------------------


def test_sodium_and_potassium_not_stratified_by_age():
    young = dri.get_micronutrient_targets("male", 20)
    old = dri.get_micronutrient_targets("male", 80)
    assert young["sodium_mg"].rda == old["sodium_mg"].rda == 1500
    assert young["potassium_mg"].rda == old["potassium_mg"].rda == 3400


def test_potassium_differs_by_sex_but_sodium_does_not():
    male = dri.get_micronutrient_targets("male", 30)
    female = dri.get_micronutrient_targets("female", 30)
    assert male["potassium_mg"].rda == 3400
    assert female["potassium_mg"].rda == 2600
    assert male["sodium_mg"].rda == female["sodium_mg"].rda == 1500


# --- Upper limits ---------------------------------------------------------


def test_upper_limits_present_only_for_the_eight_target_nutrients():
    targets = dri.get_micronutrient_targets("male", 30)
    nutrients_with_ul = {key for key, t in targets.items() if t.ul is not None}
    assert nutrients_with_ul == set(dri.UPPER_LIMITS.keys())
    assert nutrients_with_ul == {
        "iron_mg",
        "zinc_mg",
        "selenium_ug",
        "vitamin_a_rae_ug",
        "vitamin_d_ug",
        "niacin_mg",
        "folate_dfe_ug",
        "sodium_mg",
    }


def test_ul_values():
    targets = dri.get_micronutrient_targets("female", 30)
    assert targets["iron_mg"].ul == 45
    assert targets["zinc_mg"].ul == 40
    assert targets["selenium_ug"].ul == 400
    assert targets["vitamin_a_rae_ug"].ul == 3000
    assert targets["vitamin_d_ug"].ul == 100
    assert targets["niacin_mg"].ul == 35
    assert targets["folate_dfe_ug"].ul == 1000
    assert targets["sodium_mg"].ul == 2300


def test_ul_constant_across_sex_and_bracket():
    a = dri.get_micronutrient_targets("male", 20)["iron_mg"].ul
    b = dri.get_micronutrient_targets("female", 80)["iron_mg"].ul
    assert a == b == 45


# --- Coverage --------------------------------------------------------------


def test_covers_all_22_target_micronutrients():
    targets = dri.get_micronutrient_targets("male", 30)
    expected_keys = {
        "sodium_mg", "potassium_mg", "calcium_mg", "iron_mg", "magnesium_mg",
        "zinc_mg", "selenium_ug", "vitamin_a_rae_ug", "vitamin_c_mg",
        "vitamin_d_ug", "vitamin_e_mg", "vitamin_k_ug", "thiamin_mg",
        "riboflavin_mg", "niacin_mg", "vitamin_b6_mg", "folate_dfe_ug",
        "vitamin_b12_ug", "choline_mg", "phosphorus_mg", "copper_mg",
        "manganese_mg",
    }
    assert set(targets.keys()) == expected_keys


def test_copper_converted_to_mg():
    assert dri.get_micronutrient_targets("male", 30)["copper_mg"].rda == 0.9
