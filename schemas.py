from marshmallow import Schema, fields, validate, ValidationError
from datetime import datetime

class UserSchema(Schema):
    id = fields.Int()
    username = fields.Str(required=True, validate=validate.Length(min=3, max=100))
    email = fields.Email(required=False)
    role = fields.Str(required=False)

class TaskSchema(Schema):
    id = fields.Int()
    title = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    assigned_to = fields.Str(required=False, validate=validate.Length(max=100))
    priority = fields.Str(required=False, validate=validate.OneOf(['low', 'medium', 'high']))
    project = fields.Str(required=False, validate=validate.Length(max=100))
    due_date = fields.Date(format='iso8601', required=False)
    notes = fields.Str(required=False)
    completed = fields.Bool(required=False)
    status = fields.Str(required=False, validate=validate.OneOf(['todo', 'in_progress', 'done']))
    created_at = fields.DateTime(dump_only=True)

class CommentSchema(Schema):
    id = fields.Int()
    author = fields.Str(required=False, load_default='Anonimowy')
    text = fields.Str(required=True)
    created_at = fields.DateTime(dump_only=True)

class SubtaskSchema(Schema):
    id = fields.Int()
    title = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    completed = fields.Bool(required=False)
    created_at = fields.DateTime(dump_only=True)

class LoginSchema(Schema):
    username = fields.Str(required=True)
    password = fields.Str(required=True)

class SignupSchema(Schema):
    username = fields.Str(required=True, validate=validate.Length(min=3, max=100))
    password = fields.Str(required=True)
    email = fields.Email(required=False)