"""Strict request and response models for the public JSON API."""

from datetime import datetime
from typing import Annotated

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    StrictStr,
    field_validator,
    model_validator,
)

from .identity import canonical_uuid, clean_phone, normalize_username
from .money import format_amount, parse_amount


def _validate_amount(value: str) -> str:
    return format_amount(parse_amount(value))


def _validate_signed_money(value: str) -> str:
    if type(value) is not str or not value:
        raise ValueError("Money value must be a decimal string.")
    unsigned = value[1:] if value.startswith("-") else value
    if not unsigned or unsigned.startswith(("+", "-")) or unsigned.count(".") != 1:
        raise ValueError("Money value must use a decimal string with two places.")
    dollars, cents = unsigned.split(".")
    if not dollars.isascii() or not dollars.isdigit() or len(cents) != 2 or not cents.isascii() or not cents.isdigit():
        raise ValueError("Money value must use a decimal string with two places.")
    return value


def _validate_nonnegative_money(value: str) -> str:
    result = _validate_signed_money(value)
    if result.startswith("-"):
        raise ValueError("Money value cannot be negative.")
    return result


def _validate_positive_money(value: str) -> str:
    result = _validate_nonnegative_money(value)
    dollars, cents = result.split(".", 1)
    if int(dollars) * 100 + int(cents) == 0:
        raise ValueError("Money value must be greater than zero.")
    return result


def _utc_z_timestamp(value: object) -> str:
    """Validate a UTC ISO timestamp string ending in Z without changing it."""
    if type(value) is not str or not value.endswith("Z"):
        raise ValueError("Timestamp must be a UTC ISO 8601 string ending in Z.")
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise ValueError("Timestamp must be a valid UTC ISO 8601 string.") from exc
    if parsed.utcoffset() is None or parsed.utcoffset().total_seconds() != 0:
        raise ValueError("Timestamp must be UTC.")
    return value


UUIDString = Annotated[StrictStr, BeforeValidator(canonical_uuid)]
RecordAmount = Annotated[StrictStr, AfterValidator(_validate_amount)]
BalanceAmount = Annotated[StrictStr, AfterValidator(_validate_signed_money)]
NonnegativeAmount = Annotated[StrictStr, AfterValidator(_validate_nonnegative_money)]
PositiveAmount = Annotated[StrictStr, AfterValidator(_validate_positive_money)]
Username = Annotated[StrictStr, AfterValidator(lambda value: normalize_username(value)[0])]
Phone = Annotated[StrictStr | None, AfterValidator(clean_phone)]
UtcTimestamp = Annotated[StrictStr, BeforeValidator(_utc_z_timestamp)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginRequest(StrictModel):
    username: Username


class UserCreate(StrictModel):
    username: Username
    phone: Phone = None


class UserPatch(StrictModel):
    username: Username | None = None
    phone: Phone = None

    @model_validator(mode="after")
    def require_present_patch_fields(self) -> "UserPatch":
        if not self.model_fields_set:
            raise ValueError("PATCH must include at least one field.")
        if "username" in self.model_fields_set and self.username is None:
            raise ValueError("Username cannot be null.")
        return self


def _normalize_target_ids(value: list[str] | None) -> list[str] | None:
    if value is None:
        return None
    return sorted(set(value)) or None


class ExpenseCreate(StrictModel):
    payer_id: UUIDString
    target_user_ids: list[UUIDString] | None = None
    amount: RecordAmount

    @field_validator("target_user_ids")
    @classmethod
    def canonicalize_targets(cls, value: list[str] | None) -> list[str] | None:
        return _normalize_target_ids(value)


class ExpensePatch(StrictModel):
    payer_id: UUIDString | None = None
    target_user_ids: list[UUIDString] | None = None
    amount: RecordAmount | None = None

    @field_validator("target_user_ids")
    @classmethod
    def canonicalize_targets(cls, value: list[str] | None) -> list[str] | None:
        return _normalize_target_ids(value)

    @model_validator(mode="after")
    def require_valid_patch_fields(self) -> "ExpensePatch":
        if not self.model_fields_set:
            raise ValueError("PATCH must include at least one field.")
        for field in ("payer_id", "amount"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null.")
        return self


class SettlementCreate(StrictModel):
    payer_id: UUIDString
    target_user_id: UUIDString
    amount: RecordAmount

    @model_validator(mode="after")
    def require_different_participants(self) -> "SettlementCreate":
        if self.payer_id == self.target_user_id:
            raise ValueError("Payer and recipient must be different users.")
        return self


class SettlementPatch(StrictModel):
    payer_id: UUIDString | None = None
    target_user_id: UUIDString | None = None
    amount: RecordAmount | None = None

    @model_validator(mode="after")
    def require_valid_patch_fields(self) -> "SettlementPatch":
        if not self.model_fields_set:
            raise ValueError("PATCH must include at least one field.")
        for field in ("payer_id", "target_user_id", "amount"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null.")
        if (
            "payer_id" in self.model_fields_set
            and "target_user_id" in self.model_fields_set
            and self.payer_id == self.target_user_id
        ):
            raise ValueError("Payer and recipient must be different users.")
        return self


def validate_settlement_participants(payer_id: str, target_user_id: str) -> None:
    """Validate the final pair after a patch has been merged with stored data."""
    if canonical_uuid(payer_id) == canonical_uuid(target_user_id):
        raise ValueError("Payer and recipient must be different users.")


class UserResponse(StrictModel):
    id: UUIDString
    username: Username
    phone: Phone


class TimestampedResponse(StrictModel):
    """Shared timestamp base for entity response models."""

    created_at: UtcTimestamp
    modified_at: UtcTimestamp


class ExpenseResponse(TimestampedResponse):
    id: UUIDString
    payer_id: UUIDString
    payer_username: Username
    target_user_ids: list[UUIDString] | None
    target_usernames: list[Username] | None
    amount: RecordAmount

    @model_validator(mode="after")
    def validate_parallel_targets(self) -> "ExpenseResponse":
        ids, names = self.target_user_ids, self.target_usernames
        if (ids is None) != (names is None):
            raise ValueError("Target IDs and usernames must both be null or both be arrays.")
        if ids is not None and (len(ids) != len(names or []) or ids != sorted(ids)):
            raise ValueError("Target arrays must be parallel and ordered by UUID.")
        return self


class SettlementResponse(TimestampedResponse):
    id: UUIDString
    payer_id: UUIDString
    payer_username: Username
    target_user_id: UUIDString
    target_username: Username
    amount: RecordAmount

    @model_validator(mode="after")
    def require_different_participants(self) -> "SettlementResponse":
        if self.payer_id == self.target_user_id:
            raise ValueError("Payer and recipient must be different users.")
        return self


class HealthResponse(StrictModel):
    status: StrictStr


class ValidationIssue(StrictModel):
    loc: list[str | int]
    msg: StrictStr
    type: StrictStr


class ErrorDetail(StrictModel):
    code: StrictStr
    message: StrictStr
    fields: list[ValidationIssue] | None = None


class ErrorEnvelope(StrictModel):
    error: ErrorDetail


class BalanceUserResponse(StrictModel):
    user_id: UUIDString
    username: Username
    expense_paid: NonnegativeAmount
    expense_share: NonnegativeAmount
    settlement_sent: NonnegativeAmount
    settlement_received: NonnegativeAmount
    net: BalanceAmount


class SuggestedPaymentResponse(StrictModel):
    from_user_id: UUIDString
    from_username: Username
    to_user_id: UUIDString
    to_username: Username
    amount: PositiveAmount

    @model_validator(mode="after")
    def require_different_participants(self) -> "SuggestedPaymentResponse":
        if self.from_user_id == self.to_user_id:
            raise ValueError("Payment participants must be different users.")
        return self


class BalanceTotals(StrictModel):
    expenses: NonnegativeAmount
    settlements: NonnegativeAmount


class BalancesResponse(StrictModel):
    users: list[BalanceUserResponse]
    totals: BalanceTotals
    suggested_payments: list[SuggestedPaymentResponse]
