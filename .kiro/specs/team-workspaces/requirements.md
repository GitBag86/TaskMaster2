# Requirements Document

## Introduction

TaskMaster2 is currently single-tenant: any user with the `admin` role sees all data, and regular users see only resources they are members/assignees of. This feature introduces **Team Workspaces** so that multiple independent teams (initially Lucyna's marketing team and Agnieszka's separate team) can use the same TaskMaster2 instance with **complete data isolation** between teams.

The feature introduces a three-tier role hierarchy (Super_Admin / Manager / User), a `Team` entity that owns all team-scoped resources, and a system-wide `Authorization_Layer` that scopes every read and write to the caller's team. A one-time data migration creates a "Default" team and assigns all existing users, projects and tasks to it. Health, readiness and version endpoints remain untouched.

This requirements document deliberately stays solution-free (no DB column names, no URL routing decisions, no UI components). Open questions called out by the user are answered with explicit default decisions, marked **[Default Decision]**, so they are easy to override during review.

## Glossary

- **TaskMaster** — The TaskMaster2 application as a whole (Flask backend + React SPA + Socket.IO + scheduler).
- **Team** — A workspace that owns a disjoint set of users, projects, tasks, tags, saved filters, task templates, recurring tasks, comments, subtasks, notifications, activity log entries and statistics. Identified by a unique name.
- **Team_Member** — A User account whose membership ties it to exactly one Team.
- **Super_Admin** — A user account with platform-wide privileges. Not a member of any Team. Can manage Teams, move users between Teams, and view aggregated cross-team data on dedicated administrative endpoints.
- **Manager** — A user account with administrative privileges scoped to a single Team. Equivalent to today's `admin` role but limited to that Team's data.
- **User** — A non-manager Team_Member. Equivalent to today's regular user but scoped to its Team.
- **Team_Scoped_Resource** — Any of: Task, Project, Comment, Subtask, Tag, SavedFilter, TaskTemplate, RecurringTask, Notification, ActivityLog entry, CustomField definition, TaskDependency, weekly Report payload, dashboard statistic, calendar entry derived from team data.
- **Default_Team** — The Team created automatically by the data migration to which all pre-existing users, projects and tasks are assigned.
- **System_Account** — The bootstrap administrator created from `DEFAULT_ADMIN_USERNAME` env var. After migration, this account is promoted to Super_Admin and detached from any Team.
- **Authorization_Layer** — The backend component that, on every authenticated request, derives the caller's effective Team scope from the session and rejects or filters cross-team access.
- **Team_Service** — Backend module responsible for Team CRUD, archival, and Manager assignment.
- **Membership_Service** — Backend module responsible for adding, removing, and moving users between Teams.
- **Quick_Add_Parser** — The existing parser that resolves `#project` and `@assignee` tokens when creating a task from a single text line.
- **Mention_Resolver** — The component that turns `@username` tokens inside comment bodies into user references and triggers mention notifications.
- **Dependency_Validator** — The component that decides whether a TaskDependency edge between two tasks is allowed.
- **Realtime_Service** — The Socket.IO emitter/dispatcher layer.
- **Notification_Service** — The component that produces in-app and e-mail notifications.
- **Report_Service** — The weekly-report generator.
- **Migration_Job** — The Alembic migration plus accompanying data backfill that introduces Teams to an existing database.
- **Activity_Service** — The component that records ActivityLog entries (existing) and team-management audit entries (new).
- **Template_Service** — The component responsible for the global readonly project-template catalogue and the per-team copies derived from it.
- **Public_Endpoint** — `GET /health`, `GET /ready`, `GET /version`. Endpoints intentionally exempt from team scoping.

## Requirements

### Requirement 1: Team Entity

**User Story:** As a Super_Admin, I want a first-class Team entity, so that all team-scoped resources have a single owning workspace.

#### Acceptance Criteria

1. THE Team_Service SHALL persist Team records with at minimum: a unique name, an optional description, an archived flag, a created-at timestamp, and exactly zero or more assigned Managers.
2. THE Team_Service SHALL reject creation of a Team whose name is empty, exceeds 80 characters, or duplicates the name of an existing non-archived Team (case-insensitive comparison).
3. THE Team_Service SHALL allow at most one archived flag value per Team, with default value `false` on creation.
4. WHEN a Team is created, THE Team_Service SHALL record the creating Super_Admin's user identifier as the creator of that Team.
5. THE Team_Service SHALL guarantee that every Team_Scoped_Resource is associated with exactly one Team.

### Requirement 2: Three-Tier Role Hierarchy

**User Story:** As the platform owner, I want three distinct roles (Super_Admin, Manager, User), so that authority is partitioned cleanly across the platform and inside each team.

#### Acceptance Criteria

1. THE TaskMaster SHALL recognize exactly three roles: Super_Admin, Manager, User.
2. THE TaskMaster SHALL allow at most one role per user account at any given time.
3. WHERE a user has the Super_Admin role, THE TaskMaster SHALL NOT associate that user with any Team. *(Negative form is required to express the invariant.)*
4. WHERE a user has the Manager role, THE TaskMaster SHALL associate that user with exactly one Team.
5. WHERE a user has the User role, THE TaskMaster SHALL associate that user with exactly one Team.
6. IF a request attempts to set a user's role to Super_Admin while leaving a Team association in place, THEN THE Membership_Service SHALL reject the request with HTTP 400 and an error describing the conflict.
7. IF a request attempts to assign Manager or User role to a user without specifying a target Team, THEN THE Membership_Service SHALL reject the request with HTTP 400.

### Requirement 3: Bootstrap Super_Admin Migration

**User Story:** As the operator, I want the existing bootstrap admin to become the Super_Admin after migration, so that there is exactly one platform-wide owner from day one.

#### Acceptance Criteria

1. WHEN the Migration_Job runs against a database whose System_Account exists, THE Migration_Job SHALL promote the System_Account to the Super_Admin role.
2. WHEN the Migration_Job promotes the System_Account, THE Migration_Job SHALL detach that account from any Team association (including the Default_Team).
3. WHILE no Super_Admin exists in the database, THE TaskMaster SHALL refuse to start its HTTP server and SHALL log an explicit error message identifying the missing Super_Admin.
4. IF the Migration_Job runs against a database with no users at all, THEN THE TaskMaster SHALL create a Super_Admin from `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD` / `DEFAULT_ADMIN_EMAIL` on first startup, identical to today's behavior except with role Super_Admin and no Team association.
5. THE TaskMaster SHALL allow exactly one Super_Admin account in the MVP scope of this feature.

### Requirement 4: Default Team and Existing Data Migration

**User Story:** As the operator, I want all existing data to land in a single Default Team, so that nothing breaks at upgrade time and the Super_Admin can reorganize later.

#### Acceptance Criteria

1. WHEN the Migration_Job runs against a database that contains any pre-existing User, Project, or Task, THE Migration_Job SHALL create a Team named "Default" with `archived = false` if it does not already exist.
2. WHEN the Migration_Job creates the Default_Team, THE Migration_Job SHALL assign every pre-existing User account (except the System_Account, which becomes Super_Admin per Requirement 3) to the Default_Team.
3. WHEN the Migration_Job assigns existing users to the Default_Team, THE Migration_Job SHALL convert any account currently holding the legacy `admin` role (other than the System_Account) into the Manager role within the Default_Team.
4. WHEN the Migration_Job assigns existing users to the Default_Team, THE Migration_Job SHALL convert any account currently holding the legacy `user` role into the User role within the Default_Team.
5. WHEN the Migration_Job runs, THE Migration_Job SHALL associate every pre-existing Project, Task, Comment, Subtask, Tag, SavedFilter, TaskTemplate, RecurringTask, ActivityLog entry, Notification, CustomField, and TaskDependency with the Default_Team.
6. WHEN the Migration_Job completes, THE Migration_Job SHALL leave the database in a state where no Team_Scoped_Resource has a null Team association.
7. THE Migration_Job SHALL be idempotent: running it twice on the same database SHALL leave the database in the same final state as running it once.
8. IF the Migration_Job encounters any Team_Scoped_Resource that cannot be assigned a Team (for example, an orphaned record), THEN THE Migration_Job SHALL fail the upgrade with a non-zero exit code and SHALL log the offending record's identifier.

### Requirement 5: Team Lifecycle Management

**User Story:** As a Super_Admin, I want to create, rename, archive, and delete Teams, so that I can manage which workspaces exist on the platform.

#### Acceptance Criteria

1. WHERE the caller has the Super_Admin role, THE Team_Service SHALL allow creation of a new Team via the team-management endpoint.
2. WHERE the caller has the Super_Admin role, THE Team_Service SHALL allow renaming a Team subject to the uniqueness rule in Requirement 1.
3. WHERE the caller has the Super_Admin role, THE Team_Service SHALL allow archiving a Team (setting its archived flag to `true`).
4. WHILE a Team has its archived flag set to `true`, THE Authorization_Layer SHALL reject all read and write requests targeting that Team's resources from Manager and User callers with HTTP 403.
5. WHILE a Team has its archived flag set to `true`, THE TaskMaster SHALL prevent login of all Manager and User accounts whose Team association is the archived Team, returning HTTP 403 with an explicit "team archived" error code.
6. WHERE the caller has the Super_Admin role, THE Team_Service SHALL allow permanent deletion of a Team only when that Team has zero non-archived members and zero non-deleted Team_Scoped_Resources.
7. IF a Super_Admin attempts to delete a Team that still contains members or resources, THEN THE Team_Service SHALL reject the request with HTTP 409 and a message listing the blocking resource categories.
8. IF a non-Super_Admin caller attempts any team-lifecycle operation (create, rename, archive, delete), THEN THE Authorization_Layer SHALL reject the request with HTTP 403.

### Requirement 6: Manager Assignment

**User Story:** As a Super_Admin, I want to assign and revoke Manager status on a per-team basis, so that each team has accountable leadership.

#### Acceptance Criteria

1. WHERE the caller has the Super_Admin role, THE Team_Service SHALL allow promoting an existing Team_Member of a Team to the Manager role within that same Team.
2. WHERE the caller has the Super_Admin role, THE Team_Service SHALL allow demoting a Manager back to the User role within the same Team.
3. THE Team_Service SHALL allow a Team to have zero, one, or many Managers simultaneously.
4. IF a non-Super_Admin caller attempts to promote or demote any user, THEN THE Authorization_Layer SHALL reject the request with HTTP 403.
5. IF a request attempts to promote a user to Manager of a Team to which the user does not belong, THEN THE Team_Service SHALL reject the request with HTTP 400.

### Requirement 7: Team-Scoped Membership Management

**User Story:** As a Manager, I want to add and remove members of my own team without seeing other teams, so that I can run my team independently.

#### Acceptance Criteria

1. WHERE the caller has the Manager role, THE Membership_Service SHALL allow inviting, adding, deactivating, and removing User accounts only within the caller's own Team.
2. WHERE the caller has the Manager role, THE Membership_Service SHALL list only User and Manager accounts of the caller's own Team in any user-listing response.
3. IF a Manager attempts to read, modify, or delete a user account belonging to a different Team, THEN THE Authorization_Layer SHALL reject the request with HTTP 403 and SHALL NOT reveal whether the target user exists.
4. IF a User-role caller attempts any membership-management operation, THEN THE Authorization_Layer SHALL reject the request with HTTP 403.
5. WHERE the caller has the Super_Admin role, THE Membership_Service SHALL allow moving a User or Manager account from one Team to another Team in a single operation.
6. WHEN a Super_Admin moves a user between Teams, THE Membership_Service SHALL atomically reassign that user's owned non-shared resources (their authored Comments, their authored ActivityLog entries, their personal SavedFilters, their personal Notifications) to the destination Team, and SHALL leave Tasks, Projects and other shared resources owned by the source Team unchanged. *(Tasks the user was merely assigned to remain in the source Team; the moved user is removed from those assignments.)*
7. WHEN a Super_Admin moves a user between Teams, THE Membership_Service SHALL invalidate that user's active sessions to force a fresh login under the new Team scope.

### Requirement 8: Self-Signup Behavior **[Default Decision]**

**User Story:** As the operator, I want to control whether anonymous self-signup is possible, so that strangers cannot accidentally land in a real team.

#### Acceptance Criteria

1. THE TaskMaster SHALL provide a global configuration flag `SIGNUP_MODE` accepting values `disabled`, `invite_only`, or `default_team`.
2. THE TaskMaster SHALL default `SIGNUP_MODE` to `invite_only`.
3. WHILE `SIGNUP_MODE` is `disabled`, THE TaskMaster SHALL respond to any anonymous POST against the signup endpoint with HTTP 403 and a "signup disabled" error code.
4. WHILE `SIGNUP_MODE` is `invite_only`, THE TaskMaster SHALL accept anonymous signup requests only when accompanied by a single-use invite token issued by a Manager or Super_Admin, and SHALL associate the new account with the Team that owned the token.
5. WHILE `SIGNUP_MODE` is `default_team`, THE TaskMaster SHALL place every newly self-signed-up account into the Default_Team with the User role.
6. WHEN a Manager generates an invite token, THE Membership_Service SHALL bind that token to the Manager's own Team and SHALL set its expiry to no more than 7 days from issuance.
7. IF a signup request supplies an invite token belonging to an archived Team, THEN THE TaskMaster SHALL reject the signup with HTTP 403.
8. IF an invite token has already been consumed or has expired, THEN THE TaskMaster SHALL reject the signup with HTTP 410 (Gone) and an explicit "invite token invalid" error code.

### Requirement 9: Authorization Layer (Cross-Cutting Isolation Invariant)

**User Story:** As a Manager or User, I want cast-iron certainty that I cannot see or affect data from another team, so that two independent teams can share one TaskMaster install.

#### Acceptance Criteria

1. THE Authorization_Layer SHALL derive the caller's effective Team scope from the authenticated session on every request, without trusting any team identifier supplied in URLs, query strings, request bodies, headers, or cookies.
2. WHILE the caller has the Manager or User role, THE Authorization_Layer SHALL filter every list-style response to include only Team_Scoped_Resources whose owning Team equals the caller's Team.
3. WHILE the caller has the Manager or User role, THE Authorization_Layer SHALL reject any request that reads, writes, or deletes a Team_Scoped_Resource whose owning Team differs from the caller's Team.
4. IF a Manager or User issues a request that targets a Team_Scoped_Resource of another Team by identifier, THEN THE Authorization_Layer SHALL respond with HTTP 404 and SHALL NOT distinguish between "resource does not exist" and "resource belongs to another team" in the response body. *(Prevents enumeration leaks across teams.)*
5. WHERE the caller has the Super_Admin role and the request targets a dedicated cross-team administrative endpoint that explicitly identifies a Team, THE Authorization_Layer SHALL grant access to that Team's resources.
6. WHILE the caller has the Super_Admin role and the request targets a standard team-scoped endpoint, THE Authorization_Layer SHALL return an empty list for list-style endpoints and HTTP 404 for single-resource endpoints, as if the Super_Admin had no Team scope.
7. THE Authorization_Layer SHALL apply uniformly to every existing route under `/api/*`, including: tasks, projects, comments, subtasks, tags, saved filters, statistics, dashboard, activity, notifications, calendar entries, blocked-tasks panel, dependency board, weekly report, custom fields, and task templates.
8. THE TaskMaster SHALL exempt Public_Endpoints (`GET /health`, `GET /ready`, `GET /version`) from the Authorization_Layer.
9. WHEN a new authenticated route is introduced, THE Authorization_Layer SHALL apply to the new route by default; any explicit opt-out SHALL be a deliberate, code-reviewed exception.

### Requirement 10: Task Visibility and Mutation Scoping

**User Story:** As a User, I want to see and modify only tasks that belong to my team, so that other teams' work is invisible to me.

#### Acceptance Criteria

1. WHEN a Manager or User lists tasks, THE Authorization_Layer SHALL include only Tasks whose owning Team equals the caller's Team, regardless of any project, assignee, status, or label filters supplied in the request.
2. WHEN a User reads a single Task by identifier and the Task belongs to a different Team, THE Authorization_Layer SHALL respond with HTTP 404.
3. WHEN a Manager or User creates a Task, THE Authorization_Layer SHALL stamp the new Task's owning Team with the caller's Team irrespective of any team identifier present in the request body.
4. IF a request to create or update a Task references a Project, assignee, tag, or template that does not belong to the caller's Team, THEN THE Authorization_Layer SHALL reject the request with HTTP 400 and an error code identifying the cross-team reference.
5. WHEN a Task is deleted, THE Authorization_Layer SHALL apply the same Team scoping as for read and write operations.

### Requirement 11: Project Visibility and Mutation Scoping

**User Story:** As a User, I want my project list to contain only my team's projects, so that the project picker is uncluttered and confidential.

#### Acceptance Criteria

1. WHEN a Manager or User lists Projects, THE Authorization_Layer SHALL include only Projects whose owning Team equals the caller's Team.
2. WHEN a Manager creates a Project, THE Authorization_Layer SHALL set the Project's owning Team to the Manager's Team.
3. IF a Manager attempts to add as Project member a user who is not a member of the Manager's Team, THEN THE Authorization_Layer SHALL reject the request with HTTP 400.
4. WHEN a Manager or User reads a Project's member list, THE Authorization_Layer SHALL include only members of the same Team.

### Requirement 12: Comment, Subtask, Custom Field, and Tag Visibility

**User Story:** As a User, I want comments, subtasks, custom fields, and tags scoped to my team, so that the platform is fully isolated below the task level too.

#### Acceptance Criteria

1. THE Authorization_Layer SHALL apply the same scoping rules from Requirement 9 to Comments, Subtasks, Custom Field definitions, and Tags as it applies to Tasks.
2. WHEN a Tag list is requested, THE Authorization_Layer SHALL return only Tags whose owning Team equals the caller's Team, even when two Teams have Tags with identical names.
3. WHEN a Custom Field definition list is requested, THE Authorization_Layer SHALL return only definitions whose owning Team equals the caller's Team.
4. IF a request to create a Comment, Subtask, or Custom Field value references a parent Task in another Team, THEN THE Authorization_Layer SHALL respond with HTTP 404 (per Requirement 9.4).

### Requirement 13: Saved Filters, Notifications, Activity Log, Recurring Tasks

**User Story:** As a User, I want my personal artefacts (filters, notifications, activity feed) to never reveal another team's data, so that trust in the isolation boundary is unconditional.

#### Acceptance Criteria

1. THE Authorization_Layer SHALL scope SavedFilter records by owning Team identical to Requirement 9.
2. WHEN the Authorization_Layer evaluates a SavedFilter at query time, THE Authorization_Layer SHALL re-apply Team scoping to the filter's underlying result set, even if the persisted filter definition would otherwise return cross-team rows.
3. THE Authorization_Layer SHALL scope Notifications such that a Manager or User SHALL see only Notifications whose owning Team equals the caller's Team.
4. THE Authorization_Layer SHALL scope ActivityLog entries such that a Manager or User SHALL see only entries whose owning Team equals the caller's Team.
5. THE Authorization_Layer SHALL scope RecurringTask templates such that a Manager or User SHALL see only RecurringTasks whose owning Team equals the caller's Team.
6. WHEN a RecurringTask fires and creates a child Task, THE Authorization_Layer SHALL stamp the child Task with the same owning Team as the RecurringTask.

### Requirement 14: Quick-Add Task Parser Scoping

**User Story:** As a User, I want `#project` and `@assignee` shortcuts in the quick-add box to resolve only inside my team, so that I cannot accidentally reference somebody else's data.

#### Acceptance Criteria

1. WHEN the Quick_Add_Parser resolves a `#project` token, THE Quick_Add_Parser SHALL match only Projects whose owning Team equals the caller's Team.
2. WHEN the Quick_Add_Parser resolves a `@assignee` token, THE Quick_Add_Parser SHALL match only User accounts whose Team equals the caller's Team.
3. IF the Quick_Add_Parser cannot resolve a token within the caller's Team, THEN THE Quick_Add_Parser SHALL leave the token as literal text in the task title and SHALL NOT silently fall back to a cross-team match.
4. THE Quick_Add_Parser SHALL stamp the created Task with the caller's Team identifier from session state.

### Requirement 15: Mention Resolver Scoping

**User Story:** As a User, I want `@username` mentions inside comments to be resolvable only within my team, so that mentions cannot notify outsiders.

#### Acceptance Criteria

1. WHEN the Mention_Resolver processes a comment body, THE Mention_Resolver SHALL match `@username` tokens only against User accounts whose Team equals the comment author's Team.
2. IF the Mention_Resolver fails to resolve a `@username` token within the caller's Team, THEN THE Mention_Resolver SHALL render the token as literal text and SHALL NOT generate any cross-team notification.
3. WHEN the Mention_Resolver successfully resolves a `@username` token, THE Notification_Service SHALL deliver the resulting mention notification only to the resolved Team_Member's Team-scoped notification feed.

### Requirement 16: Task Dependencies — No Cross-Team Edges

**User Story:** As a Manager, I want it to be impossible for a task in my team to depend on a task in another team, so that the isolation invariant is preserved through the dependency graph.

#### Acceptance Criteria

1. WHEN the Dependency_Validator evaluates a candidate dependency edge between two Tasks, THE Dependency_Validator SHALL require both Tasks to share the same owning Team.
2. IF a request attempts to create or update a TaskDependency whose two Tasks belong to different Teams, THEN THE Dependency_Validator SHALL reject the request with HTTP 400 and an error code identifying the cross-team violation.
3. THE Dependency_Validator SHALL apply the cross-team check before the existing cycle-prevention check, so that cross-team rejections are not masked by cycle errors.
4. WHEN a Task is moved between Teams by a Super_Admin (see Requirement 7.5), THE Dependency_Validator SHALL ensure the move drops any TaskDependency edges that would otherwise span Teams, and the Activity_Service SHALL log each dropped edge.

### Requirement 17: Project Templates **[Default Decision: per-team copies seeded from a global readonly catalogue]**

**User Story:** As a Manager, I want my team to start with the standard project templates (Wdrożenie klienta, Release, Kampania) but be able to customize them, so that the existing user benefit is preserved without leaking template edits between teams.

#### Acceptance Criteria

1. THE TaskMaster SHALL maintain a global, readonly catalogue containing the three seed project templates: "Wdrożenie klienta", "Release", "Kampania".
2. THE TaskMaster SHALL make the global catalogue invisible to Manager and User callers as a directly-listable resource; only Super_Admins SHALL list and edit catalogue entries.
3. WHEN a Team is created, THE Template_Service SHALL copy each catalogue entry into the new Team as an editable, Team_Scoped_Resource.
4. WHEN the Migration_Job runs, THE Template_Service SHALL create the per-team copies for the Default_Team using the existing global templates as the source.
5. WHEN a Manager edits or deletes one of the per-team template copies, THE Template_Service SHALL leave the global catalogue and other Teams' copies unchanged.
6. THE Template_Service SHALL allow a Manager to create additional Team-scoped templates beyond the seeded three.
7. THE Authorization_Layer SHALL scope per-team template reads and writes identically to Requirement 9.

### Requirement 18: Calendar View Scoping

**User Story:** As a User, I want the calendar to show only my team's deadlines (plus the universal Polish name-days and holidays), so that the calendar is not polluted by other teams.

#### Acceptance Criteria

1. WHEN the calendar endpoint is queried, THE Authorization_Layer SHALL include in the response only deadline-bearing Tasks and RecurringTasks whose owning Team equals the caller's Team.
2. THE TaskMaster SHALL continue to overlay Polish name-days and public-holidays data on every team's calendar, since this data is universal and not Team-owned.
3. IF a Super_Admin queries the calendar via a cross-team administrative endpoint, THEN THE TaskMaster SHALL return events from every Team, each tagged with its owning Team identifier.

### Requirement 19: Dashboard, Statistics, Blocked-Tasks Panel, Dependency Board

**User Story:** As a User, I want every dashboard widget to reflect only my team's data, so that team-level KPIs stay separate.

#### Acceptance Criteria

1. WHEN a Manager or User loads the dashboard endpoint, THE Authorization_Layer SHALL aggregate statistics only over Team_Scoped_Resources whose owning Team equals the caller's Team.
2. WHEN a Manager or User loads the blocked-tasks panel, THE Authorization_Layer SHALL include only Tasks of the caller's Team.
3. WHEN a Manager or User loads the dependency board, THE Authorization_Layer SHALL include only TaskDependency edges between Tasks of the caller's Team.
4. WHERE the caller has the Super_Admin role and uses a cross-team administrative endpoint, THE TaskMaster SHALL return per-team breakdowns and an aggregated "all teams" view, both clearly distinguishable in the response payload.

### Requirement 20: Weekly Report Scoping

**User Story:** As a Manager, I want the weekly report e-mail to summarize only my team, so that report content stays inside the team boundary.

#### Acceptance Criteria

1. WHEN the Report_Service generates a weekly report for a Manager or User, THE Report_Service SHALL include only Tasks, completion stats, and assignee summaries whose owning Team equals the recipient's Team.
2. WHEN the Report_Service generates a weekly report for a Super_Admin, THE Report_Service SHALL produce one report per existing non-archived Team, each labeled with the Team's name in subject and body.
3. THE Report_Service SHALL skip archived Teams when scheduling weekly reports.

### Requirement 21: E-mail Notifications — No Cross-Team Leakage

**User Story:** As a Manager, I want every e-mail TaskMaster sends to a member of my team to contain only data from my team, so that confidentiality holds even outside the application.

#### Acceptance Criteria

1. THE Notification_Service SHALL include in any outbound e-mail only data from Team_Scoped_Resources whose owning Team equals the recipient's Team.
2. THE Notification_Service SHALL build deep links in e-mail bodies that resolve only to resources of the recipient's Team; opening such a link as a Manager or User of a different Team SHALL respond with HTTP 404 per Requirement 9.4.
3. THE Notification_Service SHALL NOT include the names, identifiers, or any metadata of other Teams in the subject line, body, headers, or footer of an e-mail addressed to a Manager or User.
4. WHERE the e-mail is addressed to the Super_Admin, THE Notification_Service MAY include cross-team data, and the e-mail SHALL be sent to the Super_Admin's verified e-mail address only.

### Requirement 22: Real-Time (Socket.IO) Scoping

**User Story:** As a User, I want real-time updates to be delivered only for my team, so that I don't see other teams' activity flicker on my screen and so that my client doesn't even receive their payloads.

#### Acceptance Criteria

1. WHEN a client connects to the Realtime_Service, THE Realtime_Service SHALL place that client into a server-side room derived from the authenticated user's Team association before any application-level event is delivered.
2. WHEN a Team_Scoped_Resource is created, updated, or deleted, THE Realtime_Service SHALL emit the corresponding `task_action` (or equivalent) event only to the room of the resource's owning Team.
3. THE Realtime_Service SHALL NOT include any data from other Teams in any payload delivered to a Manager or User client.
4. WHEN a Super_Admin client connects, THE Realtime_Service SHALL place that client into a dedicated cross-team room that receives a sanitized cross-team feed; standard team rooms SHALL NOT relay events to the Super_Admin room without explicit Team labelling in the payload.
5. WHEN a Super_Admin moves a user between Teams (Requirement 7.5), THE Realtime_Service SHALL evict that user's existing socket connections from the old Team's room before the user's session is invalidated.

### Requirement 23: Existing Endpoint Coverage Mapping

**User Story:** As a developer, I want it spelled out that every authenticated endpoint becomes Team-scoped, so that nothing is silently left global.

#### Acceptance Criteria

1. THE Authorization_Layer SHALL apply Team scoping to every authenticated route in `routes/auth.py`, `routes/tasks.py`, `routes/filters.py`, `routes/stats.py`, `routes/users.py`, and `routes/notifications.py`, including any nested resource routes (comments, subtasks, dependencies, custom fields, tags, recurring tasks, templates, activity, calendar, blocked tasks, dependency board, weekly report).
2. THE TaskMaster SHALL leave Public_Endpoints (`GET /health`, `GET /ready`, `GET /version`) free of Team scoping.
3. THE TaskMaster SHALL document, in the OpenAPI/Swagger output (if generated) or in inline route docstrings, which endpoints are Team-scoped, which are Super_Admin-only, and which are Public_Endpoints.

### Requirement 24: API Surface — Session-Derived Scope Only

**User Story:** As a developer, I don't want a `team_id` to appear in URLs or bodies for ordinary operations, so that the scope is always derived from the session and cannot be spoofed.

#### Acceptance Criteria

1. THE TaskMaster SHALL derive a Manager's or User's Team scope solely from the authenticated session and SHALL ignore any `team_id` field in request URL paths, query strings, or bodies on team-scoped endpoints.
2. WHERE the caller has the Super_Admin role, THE TaskMaster SHALL accept an explicit Team identifier as a path or body parameter on dedicated cross-team administrative endpoints only, and SHALL reject the same parameter on standard team-scoped endpoints.
3. IF a Manager or User request includes a `team_id` field that disagrees with the session-derived Team, THEN THE TaskMaster SHALL log a warning at WARNING level and proceed using the session-derived Team without surfacing an error to the client. *(Defense-in-depth; the field is ignored, never trusted.)*

### Requirement 25: Login, Logout and Session Behavior

**User Story:** As a user with a single team membership, I want login and logout to behave just like today but anchored to my team, so that the auth UX is unchanged.

#### Acceptance Criteria

1. WHEN a Manager or User logs in successfully, THE TaskMaster SHALL store the user's Team identifier in the session alongside the user identifier.
2. WHEN a Super_Admin logs in successfully, THE TaskMaster SHALL store the Super_Admin role marker in the session and SHALL NOT store any Team identifier.
3. WHILE a session contains a stale Team identifier (because the user was moved between Teams or because the user's Team was archived), THE TaskMaster SHALL reject the next request with HTTP 401 and SHALL clear the session.
4. WHEN a user logs out, THE TaskMaster SHALL clear the Team identifier and the user identifier from the session atomically.

### Requirement 26: Audit Logging of Team Operations

**User Story:** As a Super_Admin, I want every team-management action to be auditable, so that I can investigate incidents.

#### Acceptance Criteria

1. WHEN a Super_Admin creates, renames, archives, or deletes a Team, THE Activity_Service SHALL persist an audit entry containing the actor's user identifier, the operation type, the target Team identifier, and a timestamp.
2. WHEN a Super_Admin promotes, demotes, or moves a user between Teams, THE Activity_Service SHALL persist an audit entry containing the actor identifier, the operation type, the target user identifier, the source Team identifier, and the destination Team identifier (if applicable).
3. THE Activity_Service SHALL store team-management audit entries in a feed that is visible only to the Super_Admin and SHALL NOT include them in any Team-scoped activity log.

### Requirement 27: Backward Compatibility and Frontend Integration

**User Story:** As the operator, I want the existing SPA frontend to keep working with minimal change, so that this migration does not double the work.

#### Acceptance Criteria

1. THE TaskMaster SHALL preserve the URL paths and the existing JSON field names and types of every authenticated endpoint.
2. THE TaskMaster MAY add new optional fields (such as a `team` label on Super_Admin cross-team responses) without removing or modifying existing fields.
3. THE TaskMaster SHALL implement the team-scoping changes without introducing new API versioning headers or path prefixes, since the SPA frontend is the only API consumer.
4. WHEN the frontend receives an HTTP 403 with error code `team_archived` or `signup_disabled`, THE frontend SHALL display a corresponding user-visible message and SHALL halt automatic retry of the failing request.

### Requirement 28: Performance and Load Considerations

**User Story:** As the operator, I want team-scoped queries to remain fast, so that adding the scope does not regress dashboard responsiveness.

#### Acceptance Criteria

1. WHEN any list-style team-scoped endpoint is queried under nominal load (≤ 50 concurrent users across all teams, the project's stated MVP envelope), THE TaskMaster SHALL respond with the first page within 500 ms p95.
2. THE TaskMaster SHALL ensure that adding the Team scope does not increase the response time of any existing list endpoint by more than 50 ms p95 versus the pre-migration baseline measured on identical seed data.
3. THE TaskMaster SHALL index Team_Scoped_Resources by their owning Team identifier such that point lookups by Team scale O(log n) or better. *(Solution-free statement of intent; specific index choices belong to design.)*

### Requirement 29: Operational Safety of the Migration

**User Story:** As the operator, I want the migration to be safe to run on the production Railway database, so that I don't lose data when introducing teams.

#### Acceptance Criteria

1. THE Migration_Job SHALL be expressible as a single Alembic revision plus a deterministic data-backfill script.
2. THE Migration_Job SHALL be runnable in a single transaction on Postgres and SHALL produce equivalent results when run on SQLite (the local dev DB).
3. WHEN the Migration_Job is rolled back via `flask db downgrade`, THE Migration_Job SHALL leave the database in the pre-migration state for schema, with a clearly logged warning that any newly-created post-migration data may be irrecoverable.
4. THE Migration_Job SHALL produce a structured log line summarizing how many users, projects, tasks, comments, subtasks, tags, saved filters, templates, recurring tasks, custom fields, notifications, activity entries, and dependencies were assigned to the Default_Team.

### Requirement 30: Error Code Vocabulary

**User Story:** As a developer integrating the SPA, I want a small, stable set of new error codes for team-related conditions, so that I can render correct UX messages.

#### Acceptance Criteria

1. THE TaskMaster SHALL emit the error code `team_archived` (HTTP 403) when an operation targets an archived Team.
2. THE TaskMaster SHALL emit the error code `cross_team_reference` (HTTP 400) when a request body references a resource of a different Team.
3. THE TaskMaster SHALL emit the error code `signup_disabled` (HTTP 403) when self-signup is disabled.
4. THE TaskMaster SHALL emit the error code `invite_token_invalid` (HTTP 410) when an invite token is missing, expired, or already consumed.
5. THE TaskMaster SHALL emit the error code `team_not_empty` (HTTP 409) when a Team-deletion request is rejected because the Team still has members or resources.

### Requirement 31: Test Surface (Definition-Of-Done Markers)

**User Story:** As an engineer, I want the requirements to nail down the testable invariants, so that I can write deterministic acceptance tests against them.

#### Acceptance Criteria

1. FOR ALL pairs of Teams (T1, T2) and FOR ALL Team_Scoped_Resource categories, an authenticated Manager or User of T1 SHALL receive an HTTP 404 when reading any resource of that category whose owning Team is T2.
2. FOR ALL Manager or User accounts, the count of items returned by every list-style team-scoped endpoint SHALL equal the count of items whose owning Team matches the caller's Team in the underlying database.
3. FOR ALL signup attempts, the resulting user account's Team association SHALL be exactly the Team derivable from `SIGNUP_MODE` and the supplied invite token, never any other Team.
4. FOR ALL Socket.IO events emitted in response to a mutation on a Team_Scoped_Resource, the set of recipient sockets SHALL equal the set of currently-connected sockets whose authenticated user's Team matches the resource's owning Team (plus the Super_Admin's cross-team room if connected).
5. THE Migration_Job SHALL be covered by a round-trip test: starting from a snapshot of the pre-migration schema with seed data, applying the migration and then comparing every resource's owning Team to the Default_Team SHALL produce zero discrepancies.
