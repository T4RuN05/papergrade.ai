"""
Render Telemetry and Backend Health Monitor.
Queries Render REST API for service metrics (CPU, RAM, restarts, request errors)
or falls back to local host/process resource monitoring when running locally.
"""

import os
import time
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
import requests

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False


class RenderTelemetryMonitor:
    """
    Monitors backend infrastructure health during load tests:
    - If RENDER_API_KEY and RENDER_SERVICE_ID are provided: fetches live Render metrics & events.
    - If running against local backend: captures host/process CPU, memory, and status via psutil.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        service_id: Optional[str] = None,
        backend_url: str = "http://localhost:8000"
    ):
        self.api_key = api_key or os.environ.get("RENDER_API_KEY")
        self.service_id = service_id or os.environ.get("RENDER_SERVICE_ID")
        self.backend_url = backend_url.rstrip("/")

        self.start_time: Optional[datetime] = None
        self.end_time: Optional[datetime] = None
        self.start_events: List[Dict[str, Any]] = []
        self.end_events: List[Dict[str, Any]] = []
        self.local_cpu_samples: List[float] = []
        self.local_ram_samples: List[float] = []

    def start_monitoring(self):
        """Record baseline telemetry before load test kicks off."""
        self.start_time = datetime.now(timezone.utc)
        if self.api_key and self.service_id:
            self.start_events = self._fetch_render_events()

        if HAS_PSUTIL:
            self.local_cpu_samples.append(psutil.cpu_percent(interval=None))
            self.local_ram_samples.append(psutil.virtual_memory().used / (1024 * 1024))

    def sample_local_metrics(self):
        """Periodic sample hook for local metrics during long running test."""
        if HAS_PSUTIL:
            try:
                self.local_cpu_samples.append(psutil.cpu_percent(interval=None))
                self.local_ram_samples.append(psutil.virtual_memory().used / (1024 * 1024))
            except Exception:
                pass

    def stop_monitoring(self) -> Dict[str, Any]:
        """Stop monitoring and compile telemetry summary."""
        self.end_time = datetime.now(timezone.utc)
        telemetry: Dict[str, Any] = {
            "monitoring_period_seconds": round((self.end_time - self.start_time).total_seconds(), 2) if self.start_time else 0,
            "target_backend_url": self.backend_url,
        }

        # 1. Render API Telemetry (if configured)
        if self.api_key and self.service_id:
            try:
                render_data = self._compile_render_telemetry()
                telemetry.update(render_data)
            except Exception as e:
                telemetry["render_api_error"] = str(e)
        else:
            telemetry["render_telemetry_status"] = (
                "RENDER_API_KEY or RENDER_SERVICE_ID not configured; "
                "using backend status endpoint and local host monitoring."
            )

        # 2. Backend Health Status Endpoint
        try:
            status_res = requests.get(f"{self.backend_url}/api/status", timeout=5.0)
            if status_res.status_code == 200:
                telemetry["backend_api_status"] = status_res.json()
            else:
                telemetry["backend_api_status"] = f"HTTP {status_res.status_code}"
        except Exception as e:
            telemetry["backend_api_status"] = f"Unreachable: {str(e)}"

        # 3. Host Process/System Metrics (via psutil)
        if self.local_cpu_samples and self.local_ram_samples:
            telemetry["local_host_metrics"] = {
                "avg_cpu_percent": round(sum(self.local_cpu_samples) / len(self.local_cpu_samples), 1),
                "peak_cpu_percent": round(max(self.local_cpu_samples), 1),
                "avg_ram_mb": round(sum(self.local_ram_samples) / len(self.local_ram_samples), 1),
                "peak_ram_mb": round(max(self.local_ram_samples), 1),
            }

        return telemetry

    def _fetch_render_events(self) -> List[Dict[str, Any]]:
        """Fetch latest service events from Render REST API."""
        url = f"https://api.render.com/v1/services/{self.service_id}/events?limit=20"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json"
        }
        res = requests.get(url, headers=headers, timeout=10.0)
        if res.status_code == 200:
            return res.json()
        return []

    def _compile_render_telemetry(self) -> Dict[str, Any]:
        """Aggregate Render CPU, RAM, restarts, and error events."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json"
        }

        data: Dict[str, Any] = {}

        # Fetch Service Details
        srv_url = f"https://api.render.com/v1/services/{self.service_id}"
        srv_res = requests.get(srv_url, headers=headers, timeout=10.0)
        if srv_res.status_code == 200:
            srv_info = srv_res.json()
            data["render_service_name"] = srv_info.get("name")
            data["render_service_type"] = srv_info.get("type")
            data["render_service_status"] = srv_info.get("suspended")

        # Fetch Service Events (detect restarts or crashes during test window)
        latest_events = self._fetch_render_events()
        start_event_ids = {e.get("id") for e in self.start_events if "id" in e}
        new_events = [e for e in latest_events if e.get("id") not in start_event_ids]

        restarts = [e for e in new_events if "restart" in str(e).lower()]
        crashes = [e for e in new_events if "crash" in str(e).lower() or "error" in str(e).lower()]

        data["render_new_events_count"] = len(new_events)
        data["render_restarts_during_test"] = len(restarts)
        data["render_crashes_during_test"] = len(crashes)
        if new_events:
            data["render_recent_event_types"] = [e.get("type") or e.get("event") for e in new_events[:5]]

        return data

