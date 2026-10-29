import pytest

from app.money import MAX_AMOUNT_CENTS, format_amount, parse_amount


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("1", 100),
        ("1.2", 120),
        ("0.01", 1),
        ("999999999.99", MAX_AMOUNT_CENTS),
    ],
)
def test_parse_amount_uses_exact_cents(value: str, expected: int) -> None:
    assert parse_amount(value) == expected


@pytest.mark.parametrize(
    "value",
    [
        "0",
        "0.00",
        "-1",
        "+1",
        "1e2",
        "NaN",
        "Infinity",
        "1.001",
        "1000000000.00",
        " 1",
        "1 ",
        ".5",
        "1.",
        "01.000",
        "",
    ],
)
def test_parse_amount_rejects_invalid_strings(value: str) -> None:
    with pytest.raises(ValueError):
        parse_amount(value)


@pytest.mark.parametrize("value", [1, 1.0, True, False, None, object()])
def test_parse_amount_rejects_non_string_values(value: object) -> None:
    with pytest.raises(ValueError):
        parse_amount(value)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("cents", "expected"),
    [
        (0, "0.00"),
        (1, "0.01"),
        (120, "1.20"),
        (-1, "-0.01"),
        (-120, "-1.20"),
        (10**20 + 7, "1000000000000000000.07"),
        (-(10**20 + 7), "-1000000000000000000.07"),
    ],
)
def test_format_amount_handles_signed_and_large_balances(cents: int, expected: str) -> None:
    assert format_amount(cents) == expected


@pytest.mark.parametrize("cents", [100, 120, MAX_AMOUNT_CENTS])
def test_valid_record_amounts_round_trip_through_formatting(cents: int) -> None:
    assert parse_amount(format_amount(cents)) == cents


@pytest.mark.parametrize("cents", [True, 1.0, "100", None])
def test_format_amount_requires_integer_cents(cents: object) -> None:
    with pytest.raises(TypeError):
        format_amount(cents)  # type: ignore[arg-type]
