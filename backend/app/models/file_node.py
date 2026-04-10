from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class FileNode(Base):
    __tablename__ = "file_nodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)

    # Extension to support snapshots (not in the minimal spec, but required for evolution tracking)
    analysis_run_id: Mapped[int] = mapped_column(
        ForeignKey("analysis_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    file_path: Mapped[str] = mapped_column(String(2048), nullable=False, index=True)
    file_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    lines_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    analysis_run: Mapped["AnalysisRun"] = relationship(back_populates="files")

    outgoing_edges: Mapped[list["DependencyEdge"]] = relationship(
        back_populates="source_file",
        cascade="all, delete-orphan",
        foreign_keys="DependencyEdge.source_file_id",
    )
    incoming_edges: Mapped[list["DependencyEdge"]] = relationship(
        back_populates="target_file",
        cascade="all, delete-orphan",
        foreign_keys="DependencyEdge.target_file_id",
    )

    metrics: Mapped["FileMetrics | None"] = relationship(
        back_populates="file",
        cascade="all, delete-orphan",
        uselist=False,
    )



