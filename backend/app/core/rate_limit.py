import time

# In-memory, per-username - correct and sufficient for a single-process
# personal deployment (this app runs as one uvicorn process, not multiple
# workers behind a load balancer). If that ever changes, this needs to move
# to something shared across processes (Redis, a DB table) instead.
_MAX_ATTEMPTS = 5
_WINDOW_SECONDS = 15 * 60
_LOCKOUT_SECONDS = 15 * 60

# username -> failure timestamps within the current window
_failed_attempts: dict[str, list[float]] = {}
# username -> unix timestamp when the lockout ends
_locked_until: dict[str, float] = {}


def is_locked_out(username: str, now: float | None = None) -> tuple[bool, int]:
    """Returns (locked, seconds_remaining). `now` is injectable for tests -
    real callers never pass it."""
    now = now if now is not None else time.time()
    until = _locked_until.get(username)
    if until is None or now >= until:
        return False, 0
    return True, int(until - now)


def record_failure(username: str, now: float | None = None) -> None:
    now = now if now is not None else time.time()
    attempts = [t for t in _failed_attempts.get(username, []) if now - t < _WINDOW_SECONDS]
    attempts.append(now)
    _failed_attempts[username] = attempts
    if len(attempts) >= _MAX_ATTEMPTS:
        _locked_until[username] = now + _LOCKOUT_SECONDS


def record_success(username: str) -> None:
    _failed_attempts.pop(username, None)
    _locked_until.pop(username, None)
