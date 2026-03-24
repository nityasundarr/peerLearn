"""Unit tests for app/utils/validators.py.

Covers:
  - validate_edu_sg_email  : valid .edu.sg emails pass; everything else fails
  - validate_full_name     : allowed charset + length boundaries
  - validate_password      : min length + each complexity rule independently
  - validate_free_text     : allowed charset + configurable max_len

No database or network calls are made.
"""

import pytest

from app.utils.validators import (
    validate_edu_sg_email,
    validate_free_text,
    validate_full_name,
    validate_password,
)


# ===========================================================================
# validate_edu_sg_email
# ===========================================================================


class TestEduSgEmail:
    # --- passing cases ---

    def test_standard_nus(self):
        assert validate_edu_sg_email("student@nus.edu.sg") == "student@nus.edu.sg"

    def test_standard_ntu(self):
        assert validate_edu_sg_email("e1234567@ntu.edu.sg") == "e1234567@ntu.edu.sg"

    def test_subdomain(self):
        assert validate_edu_sg_email("alice@mail.sp.edu.sg") == "alice@mail.sp.edu.sg"

    def test_dotted_localpart(self):
        assert validate_edu_sg_email("john.doe@school.edu.sg") == "john.doe@school.edu.sg"

    def test_plus_tag(self):
        assert validate_edu_sg_email("user+tag@poly.edu.sg") == "user+tag@poly.edu.sg"

    def test_uppercase_lowercased(self):
        # Validator must normalise to lowercase
        result = validate_edu_sg_email("Student@NTU.EDU.SG")
        assert result == "student@ntu.edu.sg"

    def test_leading_trailing_whitespace_stripped(self):
        assert validate_edu_sg_email("  alice@nus.edu.sg  ") == "alice@nus.edu.sg"

    def test_minimal_valid(self):
        assert validate_edu_sg_email("a@b.edu.sg") == "a@b.edu.sg"

    # --- failing cases ---

    def test_gmail_rejected(self):
        with pytest.raises(ValueError, match=r"\.edu\.sg"):
            validate_edu_sg_email("student@gmail.com")

    def test_edu_com_rejected(self):
        with pytest.raises(ValueError):
            validate_edu_sg_email("student@ntu.edu.com")

    def test_bare_edu_sg_rejected(self):
        # 'student@edu.sg' has no subdomain before edu.sg — should fail
        with pytest.raises(ValueError):
            validate_edu_sg_email("student@edu.sg")

    def test_no_at_sign_rejected(self):
        with pytest.raises(ValueError):
            validate_edu_sg_email("notanemail")

    def test_empty_string_rejected(self):
        with pytest.raises(ValueError):
            validate_edu_sg_email("")

    def test_spaces_in_local_part_rejected(self):
        with pytest.raises(ValueError):
            validate_edu_sg_email("my name@nus.edu.sg")

    def test_sg_only_domain_rejected(self):
        with pytest.raises(ValueError):
            validate_edu_sg_email("user@school.sg")

    def test_double_at_rejected(self):
        with pytest.raises(ValueError):
            validate_edu_sg_email("u@s@ntu.edu.sg")


# ===========================================================================
# validate_full_name
# ===========================================================================


class TestFullName:
    # --- passing cases ---

    def test_plain_name(self):
        assert validate_full_name("John Doe") == "John Doe"

    def test_single_char(self):
        assert validate_full_name("A") == "A"

    def test_hyphen_allowed(self):
        assert validate_full_name("Mary-Ann") == "Mary-Ann"

    def test_apostrophe_allowed(self):
        assert validate_full_name("O'Brien") == "O'Brien"

    def test_mixed_case(self):
        assert validate_full_name("Ahmad bin Abdullah") == "Ahmad bin Abdullah"

    def test_exactly_100_chars(self):
        name = "A" * 100
        assert validate_full_name(name) == name

    def test_leading_trailing_whitespace_stripped(self):
        assert validate_full_name("  Alice  ") == "Alice"

    # --- failing cases ---

    def test_empty_rejected(self):
        with pytest.raises(ValueError):
            validate_full_name("")

    def test_whitespace_only_rejected(self):
        with pytest.raises(ValueError):
            validate_full_name("   ")

    def test_digits_rejected(self):
        with pytest.raises(ValueError):
            validate_full_name("John3")

    def test_at_sign_rejected(self):
        with pytest.raises(ValueError):
            validate_full_name("john@doe")

    def test_101_chars_rejected(self):
        with pytest.raises(ValueError):
            validate_full_name("A" * 101)

    def test_special_chars_rejected(self):
        with pytest.raises(ValueError):
            validate_full_name("John#Doe")


# ===========================================================================
# validate_password
# ===========================================================================


class TestPassword:
    # --- passing cases ---

    def test_valid_with_digit(self):
        assert validate_password("Password1") == "Password1"

    def test_valid_with_special(self):
        assert validate_password("Secure@99") == "Secure@99"

    def test_exactly_8_chars(self):
        assert validate_password("Abcdef1!") == "Abcdef1!"

    def test_all_special_types(self):
        assert validate_password("P@ssw0rd") == "P@ssw0rd"

    def test_long_password(self):
        pw = "Aa1!" + "x" * 60
        assert validate_password(pw) == pw

    # --- failing cases: length ---

    def test_too_short_7_chars(self):
        with pytest.raises(ValueError, match="at least 8"):
            validate_password("Abc1!xy")

    def test_empty_rejected(self):
        with pytest.raises(ValueError, match="at least 8"):
            validate_password("")

    # --- failing cases: missing uppercase ---

    def test_no_uppercase_rejected(self):
        with pytest.raises(ValueError, match="uppercase"):
            validate_password("password1!")

    # --- failing cases: missing lowercase ---

    def test_no_lowercase_rejected(self):
        with pytest.raises(ValueError, match="lowercase"):
            validate_password("PASSWORD1!")

    # --- failing cases: missing number or special ---

    def test_no_number_or_special_rejected(self):
        with pytest.raises(ValueError, match="number or special"):
            validate_password("Password")

    def test_letters_only_rejected(self):
        with pytest.raises(ValueError, match="number or special"):
            validate_password("Abcdefgh")

    # --- boundary: number alone satisfies rule ---

    def test_digit_satisfies_rule(self):
        assert validate_password("Abcdefg1") == "Abcdefg1"

    # --- boundary: special char alone satisfies rule ---

    def test_special_satisfies_rule(self):
        assert validate_password("Abcdefg!") == "Abcdefg!"


# ===========================================================================
# validate_free_text
# ===========================================================================


class TestFreeText:
    # --- passing cases ---

    def test_simple_word(self):
        assert validate_free_text("Calculus") == "Calculus"

    def test_with_space(self):
        assert validate_free_text("Linear Algebra") == "Linear Algebra"

    def test_with_hyphen(self):
        assert validate_free_text("Jurong East-West") == "Jurong East-West"

    def test_digits_allowed(self):
        assert validate_free_text("Year 10") == "Year 10"

    def test_exactly_max_len(self):
        text = "A" * 100
        assert validate_free_text(text) == text

    def test_custom_max_len(self):
        text = "B" * 256
        assert validate_free_text(text, max_len=256) == text

    def test_single_char(self):
        assert validate_free_text("X") == "X"

    # --- failing cases ---

    def test_empty_rejected(self):
        with pytest.raises(ValueError):
            validate_free_text("")

    def test_whitespace_only_rejected(self):
        with pytest.raises(ValueError):
            validate_free_text("   ")

    def test_exceeds_max_len_rejected(self):
        with pytest.raises(ValueError):
            validate_free_text("A" * 101)

    def test_at_sign_rejected(self):
        with pytest.raises(ValueError):
            validate_free_text("hello@world")

    def test_hash_rejected(self):
        with pytest.raises(ValueError):
            validate_free_text("C# Programming")


# ===========================================================================
# GET /health smoke test (uses the shared `client` fixture from conftest.py)
# ===========================================================================


def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
