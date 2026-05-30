def user_room(user_id):
    return f"user:{user_id}"


def task_recipient_ids(task, actor=None):
    recipient_ids = {assignee.id for assignee in task.assignees}
    if actor is not None:
        recipient_ids.add(actor.id)
    return recipient_ids


def project_recipient_ids(project, actor=None):
    recipient_ids = set()
    if actor is not None:
        recipient_ids.add(actor.id)
    if project is None:
        return recipient_ids

    recipient_ids.update(member.id for member in project.members)
    for task in project.tasks:
        recipient_ids.update(assignee.id for assignee in task.assignees)
    return recipient_ids
