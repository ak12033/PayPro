import time
from collections import defaultdict, deque

from app.errors import ApiError


class RateLimiter:
    """
    Per-key sliding window.

    Replaces the `aiLimiter` the Node backend applied to these routes. Like that
    one it keeps counters in process memory, so it caps a single instance rather
    than the fleet — the same known limitation, not a new one (see context.md
    §7). Every call here costs real money on the Gemini key, so an imperfect
    ceiling is still worth having.
    """

    def __init__(self, limit: int, window_s: float):
        self.limit = limit
        self.window_s = window_s
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        cutoff = now - self.window_s

        hits = self._hits[key]
        while hits and hits[0] <= cutoff:
            hits.popleft()

        if len(hits) >= self.limit:
            raise ApiError(
                429,
                "You are sending messages too quickly. Please slow down.",
                "RATE_LIMITED",
            )

        hits.append(now)

        # Keys go quiet permanently (a user logs out and never returns), so drop
        # emptied windows rather than growing a dict entry per user forever.
        if not hits:
            self._hits.pop(key, None)

    def prune(self) -> None:
        cutoff = time.monotonic() - self.window_s
        for key in list(self._hits):
            hits = self._hits[key]
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if not hits:
                self._hits.pop(key, None)
