"""Portal State Epoch Manager for sub-millisecond ETag / 304 caching.

Maintains RAM-based version vectors for institute branches, submission windows,
and student user states. Allows student polling requests to be validated in <0.2ms
with zero database queries when state has not modified.
"""

import threading
from typing import Dict, Optional


class PortalStateEpochManager:
    _lock = threading.Lock()
    _branch_epochs: Dict[str, int] = {}
    _user_epochs: Dict[str, int] = {}
    _global_epoch: int = 1

    @classmethod
    def get_etag(cls, branch_id: Optional[str] = None, user_id: Optional[str] = None) -> str:
        """Returns a weak ETag representing the composite state of the branch and user."""
        with cls._lock:
            g = cls._global_epoch
            b = cls._branch_epochs.get(branch_id or "all", 1)
            u = cls._user_epochs.get(user_id or "none", 1)
            return f'W/"{g}-{b}-{u}"'

    @classmethod
    def bump_branch(cls, branch_id: Optional[str] = None) -> None:
        """Bumps epoch when an exam is created/deleted/published or a window opens/closes."""
        with cls._lock:
            cls._global_epoch += 1
            b_key = branch_id or "all"
            cls._branch_epochs[b_key] = cls._branch_epochs.get(b_key, 1) + 1

    @classmethod
    def bump_user(cls, user_id: Optional[str] = None) -> None:
        """Bumps epoch when a specific student submits, cancels, or requests revaluation."""
        if not user_id:
            return
        with cls._lock:
            cls._user_epochs[user_id] = cls._user_epochs.get(user_id, 1) + 1

    @classmethod
    def bump_all(cls) -> None:
        """Bumps global epoch invalidating all cached student portal responses."""
        with cls._lock:
            cls._global_epoch += 1
