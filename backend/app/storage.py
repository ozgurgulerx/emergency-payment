"""
SQLite persistence layer for the Emergency Payment Runbook.
Stores workflow runs, events, and decision packets.
"""

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Generator, Optional

from .schemas import (
    DecisionPacket,
    EventType,
    FinalDecision,
    RunDetail,
    RunHistoryItem,
    RunStatus,
    SSEEvent,
    WorkflowStep,
)
from .logging_config import get_logger

logger = get_logger("storage")


class RunbookStorage:
    """SQLite storage for runbook workflow data."""

    def __init__(self, database_url: str = "sqlite:///./runbook.db"):
        """Initialize storage with database connection.

        Args:
            database_url: SQLite database URL (sqlite:///path/to/db.db)
        """
        # Extract path from URL
        self.db_path = database_url.replace("sqlite:///", "")
        self._init_database()

    def _init_database(self) -> None:
        """Initialize database schema."""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            # Runs table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS runs (
                    run_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL DEFAULT 'pending',
                    request_payload TEXT NOT NULL,
                    decision TEXT,
                    decision_packet TEXT,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    completed_at TEXT
                )
            """)

            # Events table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL,
                    seq INTEGER NOT NULL,
                    type TEXT NOT NULL,
                    step TEXT NOT NULL,
                    agent TEXT NOT NULL,
                    ts TEXT NOT NULL,
                    elapsed_ms INTEGER NOT NULL DEFAULT 0,
                    payload TEXT NOT NULL,
                    FOREIGN KEY (run_id) REFERENCES runs(run_id)
                )
            """)

            # Create indexes for performance
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at DESC)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status)
            """)

            conn.commit()
            logger.info(f"Database initialized at {self.db_path}")

    @contextmanager
    def _get_connection(self) -> Generator[sqlite3.Connection, None, None]:
        """Get database connection context manager."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    # =========================================================================
    # Run Operations
    # =========================================================================

    def create_run(self, run_id: str, request_payload: dict[str, Any]) -> None:
        """Create a new workflow run record.

        Args:
            run_id: Unique run identifier
            request_payload: Original request data
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO runs (run_id, status, request_payload, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (
                    run_id,
                    RunStatus.PENDING.value,
                    json.dumps(request_payload),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
            conn.commit()
            logger.debug(f"Created run record: {run_id}")

    def update_run_status(
        self,
        run_id: str,
        status: RunStatus,
        error: Optional[str] = None,
    ) -> None:
        """Update run status.

        Args:
            run_id: Run identifier
            status: New status
            error: Optional error message
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()

            if status in (RunStatus.COMPLETED, RunStatus.FAILED):
                cursor.execute(
                    """
                    UPDATE runs
                    SET status = ?, error = ?, completed_at = ?
                    WHERE run_id = ?
                    """,
                    (
                        status.value,
                        error,
                        datetime.now(timezone.utc).isoformat(),
                        run_id,
                    ),
                )
            else:
                cursor.execute(
                    """
                    UPDATE runs
                    SET status = ?, error = ?
                    WHERE run_id = ?
                    """,
                    (status.value, error, run_id),
                )

            conn.commit()
            logger.debug(f"Updated run status: {run_id} -> {status.value}")

    def save_decision(self, run_id: str, decision_packet: DecisionPacket) -> None:
        """Save final decision packet.

        Args:
            run_id: Run identifier
            decision_packet: Final decision data
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE runs
                SET decision = ?, decision_packet = ?, status = ?, completed_at = ?
                WHERE run_id = ?
                """,
                (
                    decision_packet.decision.value,
                    json.dumps(decision_packet.model_dump()),
                    RunStatus.COMPLETED.value,
                    datetime.now(timezone.utc).isoformat(),
                    run_id,
                ),
            )
            conn.commit()
            logger.info(f"Saved decision for run {run_id}: {decision_packet.decision.value}")

    def get_run(self, run_id: str) -> Optional[RunDetail]:
        """Get run details by ID.

        Args:
            run_id: Run identifier

        Returns:
            RunDetail if found, None otherwise
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()

            # Get run data
            cursor.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,))
            row = cursor.fetchone()

            if not row:
                return None

            # Get events
            cursor.execute(
                "SELECT * FROM events WHERE run_id = ? ORDER BY seq",
                (run_id,),
            )
            event_rows = cursor.fetchall()

            events = [
                SSEEvent(
                    run_id=e["run_id"],
                    seq=e["seq"],
                    type=EventType(e["type"]),
                    step=WorkflowStep(e["step"]),
                    agent=e["agent"],
                    ts=e["ts"],
                    elapsed_ms=e["elapsed_ms"],
                    payload=json.loads(e["payload"]),
                )
                for e in event_rows
            ]

            # Parse decision packet if exists
            decision_packet = None
            if row["decision_packet"]:
                try:
                    dp_data = json.loads(row["decision_packet"])
                    decision_packet = DecisionPacket(**dp_data)
                except Exception as e:
                    logger.warning(f"Failed to parse decision packet: {e}")

            return RunDetail(
                run_id=row["run_id"],
                status=RunStatus(row["status"]),
                request_payload=json.loads(row["request_payload"]),
                decision_packet=decision_packet,
                events=events,
                created_at=row["created_at"],
                completed_at=row["completed_at"],
                error=row["error"],
            )

    def get_decision(self, run_id: str) -> Optional[DecisionPacket]:
        """Get decision packet for a run.

        Args:
            run_id: Run identifier

        Returns:
            DecisionPacket if found, None otherwise
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT decision_packet FROM runs WHERE run_id = ?",
                (run_id,),
            )
            row = cursor.fetchone()

            if not row or not row["decision_packet"]:
                return None

            try:
                dp_data = json.loads(row["decision_packet"])
                return DecisionPacket(**dp_data)
            except Exception as e:
                logger.warning(f"Failed to parse decision packet: {e}")
                return None

    def list_runs(
        self,
        limit: int = 50,
        offset: int = 0,
        status: Optional[RunStatus] = None,
    ) -> list[RunHistoryItem]:
        """List workflow runs.

        Args:
            limit: Maximum number of runs to return
            offset: Number of runs to skip
            status: Optional status filter

        Returns:
            List of run history items
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()

            if status:
                cursor.execute(
                    """
                    SELECT run_id, status, decision, request_payload, created_at, completed_at
                    FROM runs
                    WHERE status = ?
                    ORDER BY created_at DESC
                    LIMIT ? OFFSET ?
                    """,
                    (status.value, limit, offset),
                )
            else:
                cursor.execute(
                    """
                    SELECT run_id, status, decision, request_payload, created_at, completed_at
                    FROM runs
                    ORDER BY created_at DESC
                    LIMIT ? OFFSET ?
                    """,
                    (limit, offset),
                )

            rows = cursor.fetchall()

            items = []
            for row in rows:
                request_data = json.loads(row["request_payload"])
                payment = request_data.get("payment", {})

                items.append(
                    RunHistoryItem(
                        run_id=row["run_id"],
                        status=RunStatus(row["status"]),
                        decision=FinalDecision(row["decision"]) if row["decision"] else None,
                        beneficiary=payment.get("beneficiary_name"),
                        amount=payment.get("amount"),
                        currency=payment.get("currency"),
                        created_at=row["created_at"],
                        completed_at=row["completed_at"],
                    )
                )

            return items

    # =========================================================================
    # Event Operations
    # =========================================================================

    def save_event(self, event: SSEEvent) -> None:
        """Save an SSE event to the database.

        Args:
            event: Event to save
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO events (run_id, seq, type, step, agent, ts, elapsed_ms, payload)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event.run_id,
                    event.seq,
                    event.type.value,
                    event.step.value,
                    event.agent,
                    event.ts,
                    event.elapsed_ms,
                    json.dumps(event.payload),
                ),
            )
            conn.commit()

    def get_events(self, run_id: str) -> list[SSEEvent]:
        """Get all events for a run.

        Args:
            run_id: Run identifier

        Returns:
            List of events ordered by sequence
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM events WHERE run_id = ? ORDER BY seq",
                (run_id,),
            )
            rows = cursor.fetchall()

            return [
                SSEEvent(
                    run_id=row["run_id"],
                    seq=row["seq"],
                    type=EventType(row["type"]),
                    step=WorkflowStep(row["step"]),
                    agent=row["agent"],
                    ts=row["ts"],
                    elapsed_ms=row["elapsed_ms"],
                    payload=json.loads(row["payload"]),
                )
                for row in rows
            ]

    def get_next_seq(self, run_id: str) -> int:
        """Get next sequence number for a run.

        Args:
            run_id: Run identifier

        Returns:
            Next sequence number
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT MAX(seq) as max_seq FROM events WHERE run_id = ?",
                (run_id,),
            )
            row = cursor.fetchone()
            return (row["max_seq"] or 0) + 1


# Singleton storage instance
_storage_instance: Optional[RunbookStorage] = None


def get_storage() -> RunbookStorage:
    """Get the storage singleton instance."""
    global _storage_instance
    if _storage_instance is None:
        from .config import get_settings
        _storage_instance = RunbookStorage(get_settings().database_url)
    return _storage_instance
