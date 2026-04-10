from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class FileMetrics(Base):
    __tablename__ = "file_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Spec fields
    file_id: Mapped[int] = mapped_column(
        ForeignKey("file_nodes.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    degree: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    centrality: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    fan_in: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fan_out: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    file: Mapped["FileNode"] = relationship(back_populates="metrics")



