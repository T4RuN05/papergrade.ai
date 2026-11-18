"""Portal State Epoch Manager for sub-millisecond ETag / 304 caching.

Maintains RAM-based version vectors for institute branches, submission windows,
and student user states. Allows student polling requests to be validated in <0.2ms
with zero database queries when state has not modified.

OPERATIONAL INVARIANT:
The production service is pinned to single-worker mode (`uvicorn --workers 1`)
to ensure memory-speed synchronization of state epochs. To safeguard against
multi-worker horizontal configurations or unexpected restarts, ETags incorporate
a 60-second coarse time-bucket, ensuring that any desynchronized worker forces
a complete state refresh within at most 60 seconds.
"""

import time
import threading
from collections import OrderedDict
from typing import Dict, Optional


class PortalStateEpochManager:
    _lock = threading.Lock()
    _branch_epochs: Dict[str, int] = {}
    _user_epochs: OrderedDict[str, int] = OrderedDict()
    _global_epoch: int = 1
    _MAX_USER_CACHE_SIZE: int = 10000

    @classmethod
    def get_etag(cls, branch_id: Optional[str] = None, user_id: Optional[str] = None) -> str:
        """Returns a weak ETag representing the composite state of the branch and user.
        
        Incorporates a 60-second coarse epoch bucket to prevent multi-worker desynchronization
        from ever serving stale state for more than 60 seconds.
        """
        now_bucket = int(time.time() // 60)
        with cls._lock:
            g = cls._global_epoch
            b = cls._branch_epochs.get(branch_id or "all", 1)
            u = cls._user_epochs.get(user_id or "none", 1)
            return f'W/"{g}-{b}-{u}-{now_bucket}"'

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
            if user_id in cls._user_epochs:
                cls._user_epochs.move_to_end(user_id)
                cls._user_epochs[user_id] += 1
            else:
                if len(cls._user_epochs) >= cls._MAX_USER_CACHE_SIZE:
                    cls._user_epochs.popitem(last=False)
                cls._user_epochs[user_id] = 2

    @classmethod
    def bump_all(cls) -> None:
        """Bumps global epoch invalidating all cached student portal responses."""
        with cls._lock:
            cls._global_epoch += 1

