"""user team_id and session_version

Revision ID: 5700fc57959b
Revises: a0a6a0fd5858
Create Date: 2026-05-24 12:49:42.062319

Adds the team workspace fields to the User table:
- `team_id` (nullable for now; super_admin keeps NULL, manager/user must have one
  after data backfill in Task 6)
- `session_version` (bumped on team move/archival to invalidate active sessions, R7.7/R25.3)

Implementation note: SQLite cannot ALTER TABLE to add a foreign key, so we use
Alembic's batch mode which copy-and-moves the table. The two batches below are
intentional: SQLAlchemy's batch sort had a circular-dependency issue when both
columns and the FK constraint are queued together, so we add the columns in
batch #1 and the FK constraint in batch #2.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5700fc57959b'
down_revision = 'a0a6a0fd5858'
branch_labels = None
depends_on = None


def upgrade():
    # Step 1: add the two columns
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('team_id', sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column('session_version', sa.Integer(), server_default='0', nullable=False)
        )

    # Step 2: add FK in a separate batch (avoids circular dep with the new column)
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.create_foreign_key(
            'fk_user_team_id', 'team', ['team_id'], ['id']
        )


def downgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_constraint('fk_user_team_id', type_='foreignkey')

    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('session_version')
        batch_op.drop_column('team_id')
