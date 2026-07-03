"""Multi-level caching system for Paper Tracker Core.

Provides in-memory caching with TTL support for frequently accessed data.
"""

import hashlib
import json
import time
from typing import Any


class CacheManager:
    """In-memory cache manager with TTL support and capacity limit."""

    def __init__(self, max_entries: int = 1000):
        self._memory: dict[str, tuple[Any, float]] = {}
        self._max_entries = max_entries

    def get(self, key: str) -> Any | None:
        """Get cached value if exists and not expired."""
        # Opportunistic cleanup: clean expired entries on 10% of get requests
        if hash(key) % 10 == 0:
            self.cleanup_expired()

        if key not in self._memory:
            return None
        value, expires = self._memory[key]
        if time.time() > expires:
            # Expired, remove it
            del self._memory[key]
            return None
        return value

    def set(self, key: str, value: Any, ttl: int = 300) -> None:
        """Set cached value with TTL in seconds."""
        # Opportunistic cleanup: clean expired entries on 10% of set requests
        if hash(key) % 10 == 0:
            self.cleanup_expired()

        # Evict oldest-expiring entries when at capacity
        if len(self._memory) >= self._max_entries and key not in self._memory:
            self._evict_oldest()

        expires = time.time() + ttl
        self._memory[key] = (value, expires)

    def delete(self, key: str) -> None:
        """Delete cached value."""
        self._memory.pop(key, None)

    def clear(self) -> None:
        """Clear all cached values."""
        self._memory.clear()

    def cleanup_expired(self) -> int:
        """Remove expired entries. Returns count of removed entries."""
        now = time.time()
        expired_keys = [k for k, (_, expires) in self._memory.items() if now > expires]
        for key in expired_keys:
            del self._memory[key]
        return len(expired_keys)

    def delete_by_prefix(self, prefix: str) -> int:
        """Delete all cached values with keys starting with the specified prefix.
        Returns the number of entries deleted.
        """
        before = len(self._memory)
        self._memory = {k: v for k, v in self._memory.items() if not k.startswith(prefix)}
        return before - len(self._memory)

    def _evict_oldest(self) -> None:
        """Evict entries with the earliest expiry time to make room."""
        if not self._memory:
            return
        # Find and remove the entry with the smallest (earliest) expiry
        oldest_key = min(self._memory, key=lambda k: self._memory[k][1])
        del self._memory[oldest_key]


# Global cache instance
cache = CacheManager()


def cache_key(*args, **kwargs) -> str:
    """Generate cache key from arguments."""
    key_data = json.dumps({"args": args, "kwargs": kwargs}, sort_keys=True, default=str)
    return hashlib.md5(key_data.encode()).hexdigest()


def cached(ttl: int = 300, key_prefix: str = ""):
    """Decorator for caching function results.

    Args:
        ttl: Time to live in seconds (default 5 minutes)
        key_prefix: Prefix for cache keys
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            ck = key_prefix + cache_key(*args, **kwargs)
            result = cache.get(ck)
            if result is not None:
                return result
            result = func(*args, **kwargs)
            cache.set(ck, result, ttl)
            return result
        return wrapper
    return decorator
