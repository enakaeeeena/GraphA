from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class DependencyEdge(Base):
    __tablename__ = "dependency_edges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Spec fields
    source_file_id: Mapped[int] = mapped_column(
        ForeignKey("file_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_file_id: Mapped[int] = mapped_column(
        ForeignKey("file_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dependency_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)

    # Useful extra data
    import_path: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    source_file: Mapped["FileNode"] = relationship(
        back_populates="outgoing_edges",
        foreign_keys=[source_file_id],
    )
    target_file: Mapped["FileNode"] = relationship(
        back_populates="incoming_edges",
        foreign_keys=[target_file_id],
    )



