from marshmallow import Schema, fields, validate, ValidationError
from datetime import date

class UserSchema(Schema):
    id = fields.Int(dump_only=True)
    username = fields.Str(required=True, validate=validate.Length(min=3, max=100))
    email = fields.Email(required=True) # Now mandatory
    role = fields.Str(dump_only=True)
    created_at = fields.DateTime(dump_only=True)

class TaskSchema(Schema):
    id = fields.Int(dump_only=True)
    title = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    assignees = fields.List(fields.Int(), load_default=[], data_key='assignee_ids') # New: multiple assignees
    priority = fields.Str(load_default='medium', validate=validate.OneOf(['low', 'medium', 'high']))
    project = fields.Str(load_default='Ogólny', validate=validate.Length(max=100))
    due_date = fields.Date(load_default=None)
    notes = fields.Str(load_default='', allow_none=True)
    completed = fields.Bool(load_default=False)
    status = fields.Str(load_default='todo', validate=validate.OneOf(['todo', 'in_progress', 'done']))
    created_at = fields.DateTime(dump_only=True)

class CommentSchema(Schema):
    id = fields.Int(dump_only=True)
    author = fields.Str(dump_only=True)
    text = fields.Str(required=True, validate=validate.Length(min=1))
    created_at = fields.DateTime(dump_only=True)

class SubtaskSchema(Schema):
    id = fields.Int(dump_only=True)
    title = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    completed = fields.Bool(load_default=False)
    created_at = fields.DateTime(dump_only=True)

class LoginSchema(Schema):
    username = fields.Str(required=True, validate=validate.Length(min=1))
    password = fields.Str(required=True, validate=validate.Length(min=1))

class SignupSchema(Schema):
    username = fields.Str(required=True, validate=validate.Length(min=3, max=100))
    password = fields.Str(required=True, validate=validate.Length(min=6))
    email = fields.Email(required=True) # Now mandatory

class TagSchema(Schema):
    id = fields.Int(dump_only=True)
    name = fields.Str(required=True, validate=validate.Length(min=1, max=50))
    color = fields.Str(load_default='#667eea', validate=validate.Regexp(r'^#[0-9a-fA-F]{6}$'))
    created_at = fields.DateTime(dump_only=True)

class FilterSchema(Schema):
    id = fields.Int(dump_only=True)
    name = fields.Str(required=True, validate=validate.Length(min=1, max=100))
    filters = fields.Dict(required=True)
    created_at = fields.DateTime(dump_only=True)

class TemplateSchema(Schema):
    id = fields.Int(dump_only=True)
    name = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    description = fields.Str(load_default='', allow_none=True)
    template_data = fields.Dict(required=True)
    created_at = fields.DateTime(dump_only=True)

class DependencySchema(Schema):
    id = fields.Int(dump_only=True)
    depends_on_task_id = fields.Int(required=True)
    created_at = fields.DateTime(dump_only=True)

class CustomFieldSchema(Schema):
    id = fields.Int(dump_only=True)
    field_name = fields.Str(required=True, validate=validate.Length(min=1, max=100))
    field_value = fields.Str(load_default='', allow_none=True)
    created_at = fields.DateTime(dump_only=True)
