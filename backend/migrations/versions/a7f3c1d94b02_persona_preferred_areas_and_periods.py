"""Preferred areas and architectural periods on the persona

Revision ID: a7f3c1d94b02
Revises: edac2b405a87
Create Date: 2026-08-20 15:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a7f3c1d94b02'
down_revision: Union[str, None] = 'edac2b405a87'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Both default to an empty list, and an empty list means "no preference" —
    # which is exactly right for every persona that already exists. Neither
    # column can therefore change anyone's score until they say something.
    #
    # server_default is not cosmetic: existing rows have no value, and a bare
    # NOT NULL add fails on a table that already holds data.
    op.add_column(
        'personas',
        sa.Column('preferred_areas', sa.JSON(), nullable=False,
                  server_default=sa.text("'[]'")),
    )
    op.add_column(
        'personas',
        sa.Column('preferred_periods', sa.JSON(), nullable=False,
                  server_default=sa.text("'[]'")),
    )


def downgrade() -> None:
    op.drop_column('personas', 'preferred_periods')
    op.drop_column('personas', 'preferred_areas')
