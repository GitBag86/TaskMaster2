"""Tests for the application-level error vocabulary (R30, design 13).

Covers:
- TaskMasterError subclasses produce JSON {error, code} with the expected HTTP status.
- The error handler registered in app.py routes the exception correctly.
- Custom messages override the default_message but keep the code.
"""

import pytest

from utils.errors import (
    CrossTeamReferenceError,
    InviteTokenInvalidError,
    SignupDisabledError,
    TaskMasterError,
    TeamArchivedError,
    TeamNotEmptyError,
)


@pytest.fixture
def stub_route(app):
    """Register a route that raises a configurable TaskMasterError."""
    pending: dict = {}

    @app.route("/__test/error")
    def _raise():
        raise pending["exc"]

    def _set(exc: TaskMasterError):
        pending["exc"] = exc

    return _set


@pytest.mark.parametrize(
    "exc_cls,expected_code,expected_status",
    [
        (TeamArchivedError, "team_archived", 403),
        (CrossTeamReferenceError, "cross_team_reference", 400),
        (SignupDisabledError, "signup_disabled", 403),
        (InviteTokenInvalidError, "invite_token_invalid", 410),
        (TeamNotEmptyError, "team_not_empty", 409),
    ],
)
def test_error_handler_maps_exception_to_json_with_code(
    client, stub_route, exc_cls, expected_code, expected_status
):
    stub_route(exc_cls())
    response = client.get("/__test/error")

    assert response.status_code == expected_status
    body = response.get_json()
    assert body["code"] == expected_code
    assert body["error"]  # message is non-empty


def test_error_handler_uses_custom_message_when_provided(client, stub_route):
    stub_route(CrossTeamReferenceError("Project belongs to another team"))
    response = client.get("/__test/error")

    assert response.status_code == 400
    body = response.get_json()
    assert body["code"] == "cross_team_reference"
    assert body["error"] == "Project belongs to another team"


def test_error_handler_uses_default_message_when_none_provided(client, stub_route):
    stub_route(TeamArchivedError())
    response = client.get("/__test/error")

    body = response.get_json()
    assert body["error"] == TeamArchivedError.default_message


def test_taskmaster_error_is_an_exception_subclass():
    # Sanity check — any new error class must remain catchable as a regular Exception.
    err = TeamNotEmptyError()
    assert isinstance(err, Exception)
    assert isinstance(err, TaskMasterError)


def test_config_signup_mode_default_is_invite_only(app):
    assert app.config["SIGNUP_MODE"] == "invite_only"


def test_config_invite_token_ttl_default_is_seven_days(app):
    assert app.config["INVITE_TOKEN_TTL_DAYS"] == 7


def test_config_super_admin_landing_default(app):
    assert app.config["SUPER_ADMIN_LANDING"] == "/admin"
