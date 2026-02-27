"""create organizations and org_memberships tables

Revision ID: 001_org_tables
Revises: 
Create Date: 2026-02-27 00:00:00.000000

This migration creates the organizations and org_memberships tables.
The tables may already exist if init_db() was previously called -- all
operations use checkfirst=True / IF NOT EXISTS for idempotency.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001_org_tables"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Define enum types with create_type=False so create_table does not
# attempt to re-create them (we handle creation manually with checkfirst).
orgrole = sa.Enum("owner", "admin", "member", name="orgrole", create_type=False)
orgmemberstatus = sa.Enum("invited", "active", "suspended", name="orgmemberstatus", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()

    # Create PostgreSQL enum types only if they do not exist yet.
    sa.Enum("owner", "admin", "member", name="orgrole").create(bind, checkfirst=True)
    sa.Enum("invited", "active", "suspended", name="orgmemberstatus").create(bind, checkfirst=True)

    # Create organizations table (noop if already exists).
    op.create_table(
        "organizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(200), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("claude_auth_mode", sa.String(20), nullable=False),
        sa.Column("claude_subscription_type", sa.String(50), nullable=True),
        sa.Column("anthropic_api_key_encrypted", sa.Text(), nullable=True),
        sa.Column("auto_add_to_projects", sa.Boolean(), nullable=False),
        sa.Column("default_persona", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )
    op.create_index(
        "ix_organizations_slug", "organizations", ["slug"], unique=True, if_not_exists=True
    )

    # Create org_memberships table (noop if already exists).
    op.create_table(
        "org_memberships",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("role", orgrole, nullable=False),
        sa.Column("default_persona", sa.String(20), nullable=False),
        sa.Column("status", orgmemberstatus, nullable=False),
        sa.Column("invite_email", sa.String(255), nullable=True),
        sa.Column("invite_token", sa.String(200), nullable=True),
        sa.Column("invited_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["invited_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )
    op.create_index(
        "ix_org_memberships_org_id", "org_memberships", ["org_id"], unique=False, if_not_exists=True
    )
    op.create_index(
        "ix_org_memberships_invite_token", "org_memberships", ["invite_token"], unique=True, if_not_exists=True
    )


def downgrade() -> None:
    bind = op.get_bind()
    op.drop_index("ix_org_memberships_invite_token", table_name="org_memberships", if_exists=True)
    op.drop_index("ix_org_memberships_org_id", table_name="org_memberships", if_exists=True)
    op.drop_table("org_memberships", if_exists=True)
    op.drop_index("ix_organizations_slug", table_name="organizations", if_exists=True)
    op.drop_table("organizations", if_exists=True)
    sa.Enum(name="orgrole").drop(bind, checkfirst=True)
    sa.Enum(name="orgmemberstatus").drop(bind, checkfirst=True)
