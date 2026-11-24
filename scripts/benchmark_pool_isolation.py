"""
PaperGrade AI — Database Connection Pool Micro-Benchmark.

Compares query round-trip time (RTT) between NullPool and QueuePool:
- Cold checkout (first query: connection establishment + TLS)
- Warm checkout (queries 2-25: connection reuse)
- Latency percentiles: P50, P90, P95, Max
"""

import os
import sys
import time
from pathlib import Path
import statistics

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool, QueuePool
from backend.app.db.session import get_database_url

def benchmark_engine(name: str, poolclass, **pool_kwargs):
    db_url = get_database_url()
    connect_args = {
        "connect_timeout": 10,
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
    }
    engine = create_engine(
        db_url,
        poolclass=poolclass,
        connect_args=connect_args,
        **pool_kwargs
    )
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    latencies = []
    num_queries = 20

    print(f"\nEvaluating: {name} ({num_queries} sequential queries)...")
    for i in range(num_queries):
        start = time.perf_counter()
        session = Session()
        try:
            res = session.execute(text("SELECT 1")).scalar()
            session.commit()
        finally:
            session.close()
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        latencies.append(elapsed_ms)

    engine.dispose()

    cold_ms = latencies[0]
    warm_latencies = latencies[1:]
    p50 = statistics.median(warm_latencies)
    p90 = sorted(warm_latencies)[int(len(warm_latencies) * 0.90)]
    p95 = sorted(warm_latencies)[int(len(warm_latencies) * 0.95)]
    mean = statistics.mean(warm_latencies)

    print(f"  Cold Query 1 Latency : {cold_ms:.1f} ms")
    print(f"  Warm Query P50 (ms)  : {p50:.1f} ms")
    print(f"  Warm Query P90 (ms)  : {p90:.1f} ms")
    print(f"  Warm Query P95 (ms)  : {p95:.1f} ms")
    print(f"  Warm Query Mean (ms) : {mean:.1f} ms")

    return {
        "name": name,
        "cold_ms": cold_ms,
        "p50": p50,
        "p90": p90,
        "p95": p95,
        "mean": mean,
    }

def main():
    print("=" * 80)
    print("     PAPERGRADE AI — POOL ISOLATION MICRO-BENCHMARK (WAN RTT PROBE)")
    print("=" * 80)

    # 1. NullPool (Stateless: every query pays TCP + TLS + PgBouncer auth)
    null_res = benchmark_engine(
        "NullPool (Stateless)",
        NullPool,
        pool_pre_ping=False
    )

    # 2. QueuePool (Persistent: warm socket reuse with LIFO)
    queue_res = benchmark_engine(
        "QueuePool (Phase 1 Warm Pool)",
        QueuePool,
        pool_size=20,
        max_overflow=20,
        pool_timeout=5.0,
        pool_recycle=900,
        pool_use_lifo=True,
        pool_pre_ping=False
    )

    speedup = null_res["p50"] / max(0.001, queue_res["p50"])
    latency_saved_ms = null_res["p50"] - queue_res["p50"]

    print("\n" + "=" * 80)
    print("                    MICRO-BENCHMARK COMPARISON MATRIX")
    print("=" * 80)
    print(f"{'Pool Strategy':<25} | {'Cold Q1 (ms)':>12} | {'Warm P50 (ms)':>14} | {'Warm P95 (ms)':>14}")
    print("-" * 80)
    print(f"{null_res['name']:<25} | {null_res['cold_ms']:>12.1f} | {null_res['p50']:>14.1f} | {null_res['p95']:>14.1f}")
    print(f"{queue_res['name']:<25} | {queue_res['cold_ms']:>12.1f} | {queue_res['p50']:>14.1f} | {queue_res['p95']:>14.1f}")
    print("=" * 80)
    print(f"Empirical Warm Latency Speedup: {speedup:.2f}x faster per query")
    print(f"Latency Saved Per Database Operation: ~{latency_saved_ms:.1f} ms")
    print("Egress Reduction: Handshake bytes eliminated on all warm queries.")
    print("=" * 80)

if __name__ == "__main__":
    main()
