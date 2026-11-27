from types import SimpleNamespace
from unittest.mock import patch
from backend.app.routers.exams import list_exams
from backend.app.routers.submissions import get_submission_details


def test_list_exams_includes_canonical_exam_date():
    exam_with_window = SimpleNamespace(
        id="exam_win_1",
        institute_id="inst_test_institute",
        branch_id="br_test_1",
        title="Physics Mock Test",
        subject="Physics",
        total_marks=50,
        question_paper_path=None,
        answer_key_path=None,
        current_rubric_version_id=None,
        lifecycle_status="PUBLISHED",
        is_published=1,
        published_at="2026-11-21T08:00:00Z",
        retention_expires_at=None,
        is_document_purged=0,
        purged_at=None,
        created_by="usr_root",
        batch_scope="ALL",
        batch_ids=None,
        status="PUBLISHED",
        created_at="2026-11-19T10:00:00Z",
        updated_at="2026-11-21T08:00:00Z",
    )
    exam_no_window = SimpleNamespace(
        id="exam_draft_2",
        institute_id="inst_test_institute",
        branch_id="br_test_1",
        title="Chemistry Draft",
        subject="Chemistry",
        total_marks=25,
        question_paper_path=None,
        answer_key_path=None,
        current_rubric_version_id=None,
        lifecycle_status="DRAFT",
        is_published=0,
        published_at=None,
        retention_expires_at=None,
        is_document_purged=0,
        purged_at=None,
        created_by="usr_root",
        batch_scope="ALL",
        batch_ids=None,
        status="DRAFT",
        created_at="2026-11-18T09:30:00Z",
        updated_at="2026-11-18T09:30:00Z",
    )

    win_row = SimpleNamespace(
        id="win_1",
        exam_id="exam_win_1",
        branch_id="br_test_1",
        window_number=1,
        opened_at="2026-11-20T09:00:00Z",
        deadline_at="2026-11-20T09:30:00Z",
        grace_deadline_at="2026-11-20T09:32:00Z",
        status="CLOSED",
        reopen_reason=None,
        reopen_scope="UNSUBMITTED_ONLY",
        created_by="usr_root",
        created_at="2026-11-20T09:00:00Z",
    )

    class _FakeExec:
        def __init__(self, rows):
            self._rows = rows

        def all(self):
            return self._rows

    class _FakeDB:
        def __init__(self):
            self.exec_calls = 0

        def execute(self, _stmt):
            self.exec_calls += 1
            if self.exec_calls == 1:
                return _FakeExec([
                    (exam_with_window, "Test Branch", "TEST_B", "Mumbai", "inst_test_institute", "TEST INSTITUTE", "TEST"),
                    (exam_no_window, "Test Branch", "TEST_B", "Mumbai", "inst_test_institute", "TEST INSTITUTE", "TEST"),
                ])
            if self.exec_calls == 2:
                return _FakeExec([("exam_win_1", "2026-11-20T09:00:00Z")])
            return _FakeExec([])

        def scalars(self, _stmt):
            return _FakeExec([win_row])

    items = list_exams(
        limit=200,
        offset=0,
        current_user={"sub": "usr_root", "role": "ROOT_ADMIN"},
        db=_FakeDB(),
    )
    by_id = {item["id"]: item for item in items}
    assert by_id["exam_win_1"]["exam_date"] == "2026-11-20T09:00:00Z"
    assert by_id["exam_draft_2"]["exam_date"] == "2026-11-18T09:30:00Z"


def test_student_submission_details_exposes_exam_date():
    class _FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, _stmt):
            class _R:
                def first(self_inner):
                    return ("stu_1", "BVI-001")
            return _R()

        def scalars(self, _stmt):
            class _S:
                def all(self_inner):
                    return [SimpleNamespace(id="stu_1", roll_number="BVI-001")]
            return _S()

        def scalar(self, _stmt):
            return None

    mock_sub = {
        "id": "sub_1",
        "exam_id": "exam_1",
        "student_name": "Aarav",
        "roll_number": "BVI-001",
        "page_count": 3,
        "submission_status": "SUBMITTED",
        "publication_status": "PUBLISHED",
        "total_awarded_marks": 42.0,
        "max_marks": 50.0,
        "percentage": 84.0,
        "exam_date": "2026-11-20T09:00:00Z",
        "exam": {"id": "exam_1", "title": "Physics", "exam_date": "2026-11-20T09:00:00Z"},
        "created_at": "2026-11-20T09:15:00Z",
    }

    with patch("backend.app.routers.submissions.get_session", return_value=_FakeSession()), \
         patch("backend.app.routers.submissions.grading_service.get_submission_details", return_value=mock_sub):
        payload = get_submission_details(
            submission_id="sub_1",
            current_user={"sub": "usr_stu_1", "role": "STUDENT"},
        )
    assert payload["exam_date"] == "2026-11-20T09:00:00Z"
    assert payload["exam"]["exam_date"] == "2026-11-20T09:00:00Z"
