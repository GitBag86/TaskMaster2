def user_can_access_task(user, task):
    return user is not None and (user.role == 'admin' or user in task.assignees)


def visible_task_summary(task, user):
    return task.summary_dict() if user_can_access_task(user, task) else None


def serialize_task_for_user(task, user):
    data = task.to_dict()
    if user is None or user.role == 'admin':
        return data

    visible_dependency_tasks = [
        dependency.depends_on_task
        for dependency in task.dependencies
        if dependency.depends_on_task and user_can_access_task(user, dependency.depends_on_task)
    ]
    visible_open_dependencies = [
        dependency_task.summary_dict()
        for dependency_task in task.open_dependency_tasks()
        if user_can_access_task(user, dependency_task)
    ]
    visible_open_dependents = [
        dependent_task.summary_dict()
        for dependent_task in task.open_dependent_tasks()
        if user_can_access_task(user, dependent_task)
    ]

    data['dependencies'] = [
        dependency.to_dict()
        for dependency in task.dependencies
        if dependency.depends_on_task in visible_dependency_tasks
    ]
    data['blocked_by'] = visible_open_dependencies
    data['blocking'] = visible_open_dependents
    data['is_blocked'] = len(task.open_dependency_tasks()) > 0
    if data.get('project_info'):
        data['project_info'] = {
            key: value
            for key, value in data['project_info'].items()
            if key != 'members'
        }
        data['project_info']['members'] = []
    return data


def serialize_activity_for_user(activity_log, user):
    data = activity_log.to_dict()
    if user is None or user.role == 'admin':
        return data

    if data.get('action') in ('dependency_added', 'dependency_removed'):
        details = dict(data.get('details') or {})
        details.pop('title', None)
        details.pop('depends_on_task_id', None)
        data['details'] = details
    return data
