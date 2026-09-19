"""
Unit Tests for Spatial Safety Scoring & Normalization
"""

import pytest
import pandas as pd
import numpy as np

from backend.engine.scoring import (
    minmax_normalize,
    calculate_safety_score,
    calculate_safe_cost,
    get_safety_rating,
    DEFAULT_WEIGHTS,
)


def test_minmax_normalize_standard():
    series = pd.Series([10.0, 20.0, 30.0, 40.0, 50.0])
    norm = minmax_normalize(series)
    assert norm.iloc[0] == 0.0
    assert norm.iloc[-1] == 1.0
    assert norm.iloc[2] == 0.5


def test_minmax_normalize_uniform_series():
    # When all values are identical, should safely return 0.5 neutral
    series = pd.Series([5.0, 5.0, 5.0])
    norm = minmax_normalize(series)
    assert (norm == 0.5).all()


def test_safety_score_weights_sum_to_one():
    total_weight = sum(DEFAULT_WEIGHTS.values())
    assert pytest.approx(total_weight, 0.001) == 1.0


def test_calculate_safety_score_bounds():
    # Maximum safety factors
    max_score = calculate_safety_score(1.0, 1.0, 1.0, 1.0, 1.0)
    assert pytest.approx(max_score, 0.001) == 1.0

    # Minimum safety factors
    min_score = calculate_safety_score(0.0, 0.0, 0.0, 0.0, 0.0)
    assert pytest.approx(min_score, 0.001) == 0.0

    # Intermediate calculation
    mid_score = calculate_safety_score(0.5, 0.5, 0.5, 0.5, 0.5)
    assert pytest.approx(mid_score, 0.001) == 0.5


def test_safe_cost_penalization():
    length = 100.0
    safe_score = 0.90
    unsafe_score = 0.10

    cost_safe = calculate_safe_cost(length, safe_score)
    cost_unsafe = calculate_safe_cost(length, unsafe_score)

    # An unsafe road must have a significantly higher routing cost than a safe road
    assert cost_unsafe > cost_safe
    assert pytest.approx(cost_safe, 0.01) == (100.0 / 0.90)
    assert pytest.approx(cost_unsafe, 0.01) == (100.0 / 0.10)


def test_safe_cost_zero_floor_protection():
    # Extreme zero score should not cause ZeroDivisionError (protected by min_score floor)
    cost = calculate_safe_cost(100.0, 0.0, min_score=0.05)
    assert cost == 2000.0


def test_get_safety_rating():
    assert get_safety_rating(0.80) == "Safe"
    assert get_safety_rating(0.50) == "Safe"
    assert get_safety_rating(0.49) == "Moderate"
    assert get_safety_rating(0.30) == "Moderate"
    assert get_safety_rating(0.29) == "Unsafe"
    assert get_safety_rating(0.05) == "Unsafe"
