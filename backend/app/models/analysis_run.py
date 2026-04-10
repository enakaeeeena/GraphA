from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    commit_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # extra fields (useful for background processing / research)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="processing", index=True)
    error: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    project: Mapped["Project"] = relationship(back_populates="analysis_runs")

    files: Mapped[list["FileNode"]] = relationship(
        back_populates="analysis_run",
        cascade="all, delete-orphan",
    )



