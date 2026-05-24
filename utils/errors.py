"""Application-level error vocabulary for TaskMaster2.

All errors that should produce a structured JSON response with a stable
`code` field and a specific HTTP status inherit from `TaskMasterError`.

The error handler registered in `app.py` converts these to:
    {"error": "<message>", "code": "<code>"}

Codes are part of the public API contract — consumers (the SPA frontend)
match against them to render specific UX. See R30 in requirements.md.
"""

from __future__ import annotations


class TaskMasterError(Exception):
    """Base class for application-level errors with a stable code + HTTP status."""

    code: str = "unknown"
    http_status: int = 500
    default_message: str = "Unknown error"

    def __init__(self, message: str | None = None) -> None:
        self.message = message or self.default_message
        super().__init__(self.message)


class TeamArchivedError(TaskMasterError):
    """Operation rejected because the target team is archived (R5.4, R5.5, R30.1)."""

    code = "team_archived"
    http_status = 403
    default_message = "Zespół jest zarchiwizowany"


class CrossTeamReferenceError(TaskMasterError):
    """Request body referenced a resource belonging to a different team (R30.2).

    Used for: assignee from another team, project_id from another team,
    cross-team task dependency, etc. (R10.4, R11.3, R16.2).
    """

    code = "cross_team_reference"
    http_status = 400
    default_message = "Zasób należy do innego zespołu"


class SignupDisabledError(TaskMasterError):
    """Anonymous signup attempted while SIGNUP_MODE=disabled (R8.3, R30.3)."""

    code = "signup_disabled"
    http_status = 403
    default_message = "Rejestracja jest wyłączona"


class InviteTokenInvalidError(TaskMasterError):
    """Invite token missing, expired, already consumed, or for an archived team (R30.4)."""

    code = "invite_token_invalid"
    http_status = 410
    default_message = "Token zaproszenia jest nieprawidłowy lub wygasł"


class TeamNotEmptyError(TaskMasterError):
    """Team-deletion request rejected because the team still has members or resources (R5.7, R30.5)."""

    code = "team_not_empty"
    http_status = 409
    default_message = "Zespół zawiera członków lub zasoby — najpierw je usuń lub przenieś"
