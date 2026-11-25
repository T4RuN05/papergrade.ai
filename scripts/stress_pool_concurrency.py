"""
PaperGrade AI — Synthetic Database Connection Pool Concurrency Stress Test.

Simulates extreme thread contention against the active QueuePool:
1. 30 concurrent threads executing 150 transactions.
2. 45 concurrent threads testing overflow ceiling (40 slots) and fail-fast queues.
3. Asserts:
   - Zero connection leaks (checkedout count returns to 0).
   - Zero TimeoutError crashes.
   - 100% transaction integrity.
"""

import sys
import time
import concurrent.futures
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from sqlalchemy import select, text
from backend.app.db.session import engine, SessionLocal, get_session

def run_transaction(worker_id: int, query_idx: int) -> dict:
    start = time.perf_counter()
    with get_session() as session:
        # Simple read query
        res = session.execute(text("SELECT 1")).scalar()
        time.sleep(0.05)  # Simulate 50ms realistic query processing
    elapsed_ms = (time.perf_counter() - start) * 1000.0
    return {"worker_id": worker_id, "query_idx": query_idx, "latency_ms": elapsed_ms, "success": res == 1}

def test_concurrency(num_workers: int, queries_per_worker: int):
    print(f"\n--- Testing Concurrency: {num_workers} Workers x {queries_per_worker} Queries ---")
    print(f"Pool state before test: size={engine.pool.size()}, checkedout={engine.pool.checkedout()}, overflow={engine.pool.overflow()}")

    start_all = time.perf_counter()
    errors = []
    successes = 0

    with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as executor:
        futures = []
        for w in range(num_workers):
            for q in range(queries_per_worker):
                futures.append(executor.submit(run_transaction, w, q))

        for f in concurrent.futures.as_completed(futures):
            try:
                res = f.result()
                if res["success"]:
                    successes += 1
                else:
                    errors.append("Invalid result")
            except Exception as e:
                errors.append(str(e))

    total_time = time.perf_counter() - start_all
    tps = (successes + len(errors)) / total_time

    print(f"Completed in {total_time:.2f}s ({tps:.1f} txn/s)")
    print(f"Successes: {successes}/{successes + len(errors)}")
    print(f"Errors   : {len(errors)}")
    print(f"Pool state after test : size={engine.pool.size()}, checkedout={engine.pool.checkedout()}, overflow={engine.pool.overflow()}")

    if errors:
        print(f"First 3 error samples: {errors[:3]}")
        raise RuntimeError(f"Concurrency stress test failed with {len(errors)} errors")

    assert engine.pool.checkedout() == 0, f"Connection leak detected! {engine.pool.checkedout()} checked out sockets remaining."
    print("[PASS] Zero connection leaks detected. All connections returned to pool.")

def main():
    print("=" * 80)
    print("      PAPERGRADE AI — SYNTHETIC QUEUEPOOL CONCURRENCY STRESS TEST")
    print("=" * 80)
    print(f"Engine Pool Class : {engine.pool.__class__.__name__}")
    print(f"Pool Size Cap     : {engine.pool.size()} baseline + {engine.pool._max_overflow} overflow (Max 40)")
    print(f"Pool Timeout      : {engine.pool._timeout}s (Fail-fast ceiling)")

    # Test 1: 25 concurrent workers (within baseline + overflow)
    test_concurrency(num_workers=25, queries_per_worker=4)

    # Test 2: 40 concurrent workers (saturating the full AnyIO thread ceiling)
    test_concurrency(num_workers=40, queries_per_worker=2)

    # Test 3: 45 concurrent workers (>40 ceiling, proving fail-fast overflow queueing clears cleanly under 50ms txns)
    test_concurrency(num_workers=45, queries_per_worker=2)

    print("\n" + "=" * 80)
    print(" [ALL TESTS PASSED] QueuePool successfully handled peak concurrency bursts!")
    print("=" * 80)

if __name__ == "__main__":
    main()
