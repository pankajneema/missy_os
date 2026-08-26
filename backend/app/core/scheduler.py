import asyncio

from app.core.logging import get_logger
from app.db.session import SessionLocal
from app.services import scheduled_task_service

logger = get_logger(__name__)

_POLL_INTERVAL_SECONDS = 60


async def run_scheduler_loop() -> None:
    """Background loop started in main.py's lifespan - checks for due
    scheduled tasks once a minute. A single tick failing (bad credential,
    provider error, one broken task) is already handled inside
    run_due_tasks/_run_one_task and never raises past them; the try/except
    here is a second layer so a truly unexpected error still can't kill the
    loop for good - only cancellation (app shutdown) should ever end it."""
    while True:
        try:
            ran = await scheduled_task_service.run_due_tasks(SessionLocal)
            if ran:
                logger.info("Scheduler ran %d due task(s)", ran)
        except Exception:  # noqa: BLE001 - the loop itself must never die
            logger.exception("Scheduler tick failed")
        await asyncio.sleep(_POLL_INTERVAL_SECONDS)
