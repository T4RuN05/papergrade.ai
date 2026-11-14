import pytest
import uuid
from backend.app.db.session import get_session
from backend.app.db.models import Institute, Branch, Batch, Exam, User
from sqlalchemy import select, delete
from backend.app.routers.auth import create_user, CreateUserRequest
from backend.app.routers.tenancy import (
    list_branches,
    list_batches,
    create_batch,
    CreateBatchRequest,
    delete_batch,
)
from backend.app.routers.exams import create_exam, delete_exam
from backend.app.services.auth import require_branch_manager
from fastapi import HTTPException

@pytest.fixture
def tenancy_fixture():
    with get_session() as session:
        # Create two test institutes
        inst_a_id = f"inst_{uuid.uuid4().hex[:10]}"
        inst_b_id = f"inst_{uuid.uuid4().hex[:10]}"

        inst_a = Institute(id=inst_a_id, name="Apex Academy", code="APEX", created_at="2026-11-14T00:00:00Z")
        inst_b = Institute(id=inst_b_id, name="Zenith Classes", code="ZENITH", created_at="2026-11-14T00:00:00Z")
        session.add_all([inst_a, inst_b])

        # Create two branches for Institute A, one for Institute B
        br_a1_id = f"br_{uuid.uuid4().hex[:10]}"
        br_a2_id = f"br_{uuid.uuid4().hex[:10]}"
        br_b1_id = f"br_{uuid.uuid4().hex[:10]}"

        br_a1 = Branch(id=br_a1_id, institute_id=inst_a_id, name="Apex South", code="APX-S", city="Delhi", created_at="2026-11-14T00:00:00Z")
        br_a2 = Branch(id=br_a2_id, institute_id=inst_a_id, name="Apex North", code="APX-N", city="Delhi", created_at="2026-11-14T00:00:00Z")
        br_b1 = Branch(id=br_b1_id, institute_id=inst_b_id, name="Zenith Central", code="ZEN-C", city="Mumbai", created_at="2026-11-14T00:00:00Z")
        session.add_all([br_a1, br_a2, br_b1])
        session.commit()

    yield {
        "inst_a_id": inst_a_id,
        "inst_b_id": inst_b_id,
        "br_a1_id": br_a1_id,
        "br_a2_id": br_a2_id,
        "br_b1_id": br_b1_id,
    }

    # Cleanup
    with get_session() as session:
        session.execute(delete(Batch).where(Batch.branch_id.in_([br_a1_id, br_a2_id, br_b1_id])))
        session.execute(delete(User).where(User.institute_id.in_([inst_a_id, inst_b_id])))
        session.execute(delete(Branch).where(Branch.id.in_([br_a1_id, br_a2_id, br_b1_id])))
        session.execute(delete(Institute).where(Institute.id.in_([inst_a_id, inst_b_id])))
        session.commit()

def test_provision_institute_director(tenancy_fixture):
    root_user = {"sub": "usr_root_test", "role": "ROOT_ADMIN"}
    inst_a = tenancy_fixture["inst_a_id"]

    with get_session() as session:
        # 1. Provision Institute Director for Institute A
        email = f"director_{uuid.uuid4().hex[:6]}@apex.edu"
        res = create_user(
            CreateUserRequest(
                email=email,
                password="DirectorSecurePassword123!",
                full_name="Director Sharma",
                role="INSTITUTE_DIRECTOR",
                institute_id=inst_a,
            ),
            current_user=root_user,
            db=session
        )
        assert res["status"] == "success"
        assert res["role"] == "INSTITUTE_DIRECTOR"
        director_id = res["user_id"]

        # 2. Verify director in DB
        u = session.scalar(select(User).where(User.id == director_id))
        assert u is not None
        assert u.institute_id == inst_a
        assert u.role == "INSTITUTE_DIRECTOR"

def test_institute_director_branch_and_batch_scoping(tenancy_fixture):
    inst_a = tenancy_fixture["inst_a_id"]
    br_a1 = tenancy_fixture["br_a1_id"]
    br_a2 = tenancy_fixture["br_a2_id"]
    br_b1 = tenancy_fixture["br_b1_id"]

    director_user = {
        "sub": "usr_dir_test_1",
        "role": "INSTITUTE_DIRECTOR",
        "institute_id": inst_a,
    }

    with get_session() as session:
        # 1. Director lists branches -> MUST see both branches of Institute A, and ZERO of Institute B
        branches = list_branches(current_user=director_user, db=session)
        branch_ids = [b["id"] for b in branches]
        assert br_a1 in branch_ids
        assert br_a2 in branch_ids
        assert br_b1 not in branch_ids

        # 2. Director creates a batch in Branch A1 -> Success
        batch1 = create_batch(
            CreateBatchRequest(branch_id=br_a1, name="Apex NEET 2026 Batch 1", code="APX-N1"),
            current_user=director_user,
            db=session
        )
        assert batch1["status"] == "success"
        b1_id = batch1["id"]

        # 3. Director switches and creates a batch in Branch A2 -> Success
        batch2 = create_batch(
            CreateBatchRequest(branch_id=br_a2, name="Apex JEE 2026 Batch 2", code="APX-J2"),
            current_user=director_user,
            db=session
        )
        assert batch2["status"] == "success"
        b2_id = batch2["id"]

        # 4. Director attempts to create a batch in Branch B1 (belonging to Institute B) -> 403 Forbidden!
        with pytest.raises(HTTPException) as exc_info:
            create_batch(
                CreateBatchRequest(branch_id=br_b1, name="Malicious Batch", code="HACK"),
                current_user=director_user,
                db=session
            )
        assert exc_info.value.status_code == 403

        # 5. Director lists batches:
        # Filtered by Branch A1:
        batches_a1 = list_batches(branch_id=br_a1, current_user=director_user, db=session)
        assert any(b["id"] == b1_id for b in batches_a1)
        assert not any(b["id"] == b2_id for b in batches_a1)

        # Unfiltered: gets batches across both branches of Institute A
        all_batches_a = list_batches(current_user=director_user, db=session)
        all_ids = [b["id"] for b in all_batches_a]
        assert b1_id in all_ids
        assert b2_id in all_ids

