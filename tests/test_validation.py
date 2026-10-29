import uuid

import pytest
from pydantic import ValidationError

from app.identity import canonical_uuid, clean_phone, normalize_username
from app.schemas import (
    BalancesResponse,
    ErrorEnvelope,
    ExpenseCreate,
    ExpensePatch,
    ExpenseResponse,
    HealthResponse,
    LoginRequest,
    SettlementCreate,
    SettlementPatch,
    UserCreate,
    UserPatch,
    validate_settlement_participants,
)


def test_username_trimming_casefold_and_nfkc_are_shared() -> None:
    assert normalize_username(" Alice ") == ("Alice", "alice")
    assert normalize_username("ALICE") == ("ALICE", "alice")
    assert normalize_username("Straße") == ("Straße", "strasse")
    assert normalize_username("Ａｌｉｃｅ") == ("Ａｌｉｃｅ", "alice")


@pytest.mark.parametrize("value", ["", "   ", "\nAlice", "Alice\x00", "x" * 41])
def test_username_rejects_empty_control_or_overlong_values(value: str) -> None:
    with pytest.raises(ValueError):
        normalize_username(value)


@pytest.mark.parametrize("value", ["  ", "", None])
def test_phone_blank_values_become_null(value: str | None) -> None:
    assert clean_phone(value) is None


def test_phone_is_trimmed_and_bounded() -> None:
    assert clean_phone("  +1 555 0100 ") == "+1 555 0100"
    with pytest.raises(ValueError):
        clean_phone("x" * 41)
    with pytest.raises(ValueError):
        clean_phone(42)  # type: ignore[arg-type]


def test_uuid_strings_are_validated_and_canonicalized() -> None:
    canonical = "12345678-1234-5678-1234-567812345678"
    assert canonical_uuid("12345678123456781234567812345678") == canonical
    assert ExpenseCreate(
        payer_id="12345678123456781234567812345678",
        amount="1",
    ).payer_id == canonical
    with pytest.raises(ValidationError):
        ExpenseCreate(payer_id="not-a-uuid", amount="1.00")
    with pytest.raises(ValidationError):
        ExpenseCreate(payer_id=uuid.uuid4(), amount="1.00")


def test_expense_targets_are_canonical_deduplicated_and_sorted() -> None:
    payer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    lower = "11111111-1111-4111-8111-111111111111"
    upper = "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB"
    result = ExpenseCreate(
        payer_id=payer,
        target_user_ids=[upper, lower, lower],
        amount="12.3",
    )
    assert result.target_user_ids == [lower, upper.lower()]
    assert result.amount == "12.30"

    assert ExpenseCreate(payer_id=payer, target_user_ids=[], amount="1").target_user_ids is None
    assert ExpenseCreate(payer_id=payer, target_user_ids=None, amount="1").target_user_ids is None


def test_expense_patch_presence_distinguishes_omitted_and_null_targets() -> None:
    omitted = ExpensePatch(amount="3.40")
    reset = ExpensePatch(target_user_ids=None)
    empty = ExpensePatch(target_user_ids=[])

    assert "target_user_ids" not in omitted.model_fields_set
    assert omitted.model_dump(exclude_unset=True) == {"amount": "3.40"}
    assert "target_user_ids" in reset.model_fields_set
    assert reset.model_dump(exclude_unset=True) == {"target_user_ids": None}
    assert empty.model_dump(exclude_unset=True) == {"target_user_ids": None}


def test_patches_reject_empty_null_required_and_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        UserPatch()
    with pytest.raises(ValidationError):
        UserPatch(username=None)
    with pytest.raises(ValidationError):
        ExpensePatch()
    with pytest.raises(ValidationError):
        ExpensePatch(payer_id=None)
    with pytest.raises(ValidationError):
        ExpensePatch(amount=None)
    with pytest.raises(ValidationError):
        SettlementPatch(amount=None)
    with pytest.raises(ValidationError):
        UserCreate(username="Alice", username_key="alice")


def test_user_and_login_schemas_clean_fields() -> None:
    assert LoginRequest(username=" Alice ").username == "Alice"
    assert UserCreate(username=" ALICE ", phone="   ").model_dump() == {
        "username": "ALICE",
        "phone": None,
    }
    assert UserPatch(phone=None).model_dump(exclude_unset=True) == {"phone": None}
    with pytest.raises(ValidationError):
        UserCreate(username="Alice", phone=123)
    with pytest.raises(ValidationError):
        LoginRequest(username="\x7f")


def test_amount_fields_require_decimal_strings_and_canonicalize_them() -> None:
    assert ExpenseCreate(
        payer_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", amount="1.2"
    ).amount == "1.20"
    for invalid in (12.5, 12, True, "1e2", "0", "1.001"):
        with pytest.raises(ValidationError):
            ExpenseCreate(payer_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", amount=invalid)


def test_settlement_rejects_self_payment_after_uuid_canonicalization() -> None:
    compact = "12345678123456781234567812345678"
    canonical = "12345678-1234-5678-1234-567812345678"
    with pytest.raises(ValidationError):
        SettlementCreate(payer_id=compact, target_user_id=canonical, amount="1.00")

    # A one-sided patch must be merged with the stored row by the service.
    patch = SettlementPatch(payer_id=canonical)
    assert patch.model_dump(exclude_unset=True) == {"payer_id": canonical}
    with pytest.raises(ValueError):
        validate_settlement_participants(canonical, compact)


def test_settlement_patch_rejects_equal_explicit_pair() -> None:
    user_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    with pytest.raises(ValidationError):
        SettlementPatch(payer_id=user_id, target_user_id=user_id)


def test_response_models_keep_public_amounts_as_strings_and_validate_contract() -> None:
    user_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    record = ExpenseResponse(
        id=user_id,
        payer_id=user_id,
        payer_username="Alice",
        target_user_ids=None,
        target_usernames=None,
        amount="1",
        created_at="2026-10-29T12:00:00Z",
        modified_at="2026-10-29T12:00:00Z",
    )
    assert record.amount == "1.00"
    assert record.model_dump()["amount"] == "1.00"
    with pytest.raises(ValidationError):
        ExpenseResponse(
            id=user_id,
            payer_id=user_id,
            payer_username="Alice",
            target_user_ids=[user_id],
            target_usernames=None,
            amount=100,
            created_at="2026-10-29T12:00:00Z",
            modified_at="2026-10-29T12:00:00Z",
        )


def test_response_schemas_include_large_aggregate_values_and_error_envelope() -> None:
    user_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    response = BalancesResponse(
        users=[
            {
                "user_id": user_id,
                "username": "Alice",
                "expense_paid": "1000000000.00",
                "expense_share": "0.00",
                "settlement_sent": "0.00",
                "settlement_received": "0.00",
                "net": "1000000000.00",
            }
        ],
        totals={"expenses": "1000000000.00", "settlements": "0.00"},
        suggested_payments=[
            {
                "from_user_id": user_id,
                "from_username": "Alice",
                "to_user_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                "to_username": "Bob",
                "amount": "1000000000.00",
            }
        ],
    )
    assert response.suggested_payments[0].amount == "1000000000.00"
    assert HealthResponse(status="ok").status == "ok"
    assert ErrorEnvelope(error={"code": "validation_error", "message": "Invalid request."}).error.code == "validation_error"
