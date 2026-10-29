"""Exact conversion helpers for decimal-string USD amounts."""

from decimal import Decimal, InvalidOperation
import re


MAX_AMOUNT_CENTS = 99_999_999_999
MAX_AMOUNT = Decimal("999999999.99")
_AMOUNT_RE = re.compile(r"[0-9]+(?:\.[0-9]{1,2})?\Z")


def parse_amount(value: str) -> int:
    """Convert a positive decimal-string dollar amount to exact integer cents.

    The wire format deliberately accepts strings only, with no signs,
    surrounding whitespace, exponent notation, or implicit rounding.
    """
    if type(value) is not str:
        raise ValueError("Amount must be a decimal string.")
    if not _AMOUNT_RE.fullmatch(value):
        raise ValueError("Amount must have at most two decimal places.")

    try:
        amount = Decimal(value)
    except InvalidOperation as exc:  # defensive; the regular expression is stricter
        raise ValueError("Amount is malformed.") from exc

    if amount <= 0:
        raise ValueError("Amount must be greater than zero.")
    if amount > MAX_AMOUNT:
        raise ValueError("Amount exceeds the maximum allowed value.")

    cents = amount * 100
    # The grammar and maximum ensure this is integral and within the record cap.
    return int(cents)


def format_amount(cents: int) -> str:
    """Format integer cents as a decimal string, preserving negative balances."""
    if type(cents) is not int:
        raise TypeError("Cents must be an integer.")
    sign = "-" if cents < 0 else ""
    dollars, remainder = divmod(abs(cents), 100)
    return f"{sign}{dollars}.{remainder:02d}"
