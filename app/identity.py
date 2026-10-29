"""Username and phone normalization shared by request and service layers."""

import unicodedata
import uuid


MAX_USERNAME_LENGTH = 40
MAX_PHONE_LENGTH = 40


def normalize_username(value: str) -> tuple[str, str]:
    """Return ``(display_username, uniqueness_key)`` after contract validation."""
    if type(value) is not str:
        raise ValueError("Username must be a string.")
    if any(unicodedata.category(character) == "Cc" for character in value):
        raise ValueError("Username cannot contain control characters.")

    display = value.strip()
    if not 1 <= len(display) <= MAX_USERNAME_LENGTH:
        raise ValueError("Username must contain between 1 and 40 characters.")
    key = unicodedata.normalize("NFKC", display).casefold()
    if not key:
        raise ValueError("Username must have a non-empty normalized form.")
    if any(unicodedata.category(character) == "Cc" for character in key):
        raise ValueError("Normalized username cannot contain control characters.")
    return display, key


def clean_phone(value: str | None) -> str | None:
    """Trim an optional phone value; blank strings become ``None``."""
    if value is None:
        return None
    if type(value) is not str:
        raise ValueError("Phone must be a string or null.")
    phone = value.strip()
    if not phone:
        return None
    if len(phone) > MAX_PHONE_LENGTH:
        raise ValueError("Phone must contain at most 40 characters.")
    return phone


def canonical_uuid(value: object) -> str:
    """Validate a UUID string and return its canonical lowercase spelling."""
    if type(value) is not str:
        raise ValueError("ID must be a UUID string.")
    try:
        return str(uuid.UUID(value))
    except (ValueError, AttributeError, TypeError) as exc:
        raise ValueError("ID must be a valid UUID.") from exc
