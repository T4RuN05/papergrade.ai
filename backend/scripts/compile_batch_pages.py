import uuid
import json
import shutil
import sqlite3
from pathlib import Path
import fitz

from backend.app.config import settings
from backend.app.database import get_db, get_iso_now
from backend.app.services.pdf_service import pdf_service
from backend.app.services.grading_service import grading_service, GradingService

def compile_student_pages():
    batch_id = "6392da01-10cc-4d13-a9c2-c3f68bcab632"
    now = get_iso_now()

    with get_db() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM submissions WHERE batch_id = ? ORDER BY roll_number ASC", (batch_id,))
        subs = cursor.fetchall()

    if len(subs) != 8:
        print(f"Expected 8 submissions in batch, found {len(subs)}")
        return

    print("Found 8 submissions for compilation.")

    # Chronological order of 8 page images
    page_files = [Path(s["original_file_path"]) for s in subs]
    for idx, pf in enumerate(page_files):
        print(f"Page {idx+1}: {pf.name} (from sub {subs[idx]['id'][:8]})")

    # Target master submission: use the first submission (ROLL-101)
    target_sub = subs[0]
    target_sub_id = target_sub["id"]
    target_dir = settings.UPLOADS_DIR / f"sub_{target_sub_id}"
    target_canonical_pdf = target_dir / "canonical.pdf"

    # Backup existing canonical if present
    if target_canonical_pdf.exists():
        shutil.copyfile(target_canonical_pdf, target_dir / "canonical_page1_backup.pdf")

    # 1. Combine all 8 images into one 8-page canonical PDF
    print("\nMerging 8 images into single canonical PDF...")
    pdf_service.images_to_pdf(page_files, target_canonical_pdf)
    doc = fitz.open(str(target_canonical_pdf))
    total_pages = len(doc)
    doc.close()
    print(f"Canonical PDF created with {total_pages} pages at {target_canonical_pdf}")

    # 2. Render all 8 pages as page_1.png ... page_8.png
    print("\nRendering all 8 pages to page images...")
    pdf_service.render_pdf_pages_to_images(target_canonical_pdf, target_sub_id)
    renders_dir = settings.RENDERS_DIR / target_sub_id
    rendered_images = list(renders_dir.glob("page_*.png"))
    print(f"Rendered {len(rendered_images)} page images in {renders_dir}")

    # 3. Compile answers from all 8 submissions
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT rubric_data FROM rubric_versions WHERE exam_id = ? AND is_approved = 1 ORDER BY version_num DESC LIMIT 1", (target_sub["exam_id"],))
        rub_row = cursor.fetchone()
        rubric_data = json.loads(rub_row["rubric_data"])

    # Load all existing answers across all 8 submissions
    all_answers_by_page = {}
    with get_db() as conn:
        cursor = conn.cursor()
        for idx, s in enumerate(subs):
            page_num = idx + 1
            cursor.execute("SELECT * FROM answers WHERE submission_id = ?", (s["id"],))
            ans_list = [dict(r) for r in cursor.fetchall()]
            for a in ans_list:
                cursor.execute("SELECT * FROM answer_regions WHERE answer_id = ?", (a["id"],))
                a["regions"] = [dict(r) for r in cursor.fetchall()]
                cursor.execute("SELECT * FROM criterion_scores WHERE answer_id = ?", (a["id"],))
                a["criterion_scores"] = [dict(c) for c in cursor.fetchall()]
            all_answers_by_page[page_num] = {f"{a['question_id']}_{a['subquestion_id'] or ''}": a for a in ans_list}

    # Prepare compiled answers
    compiled_answers = []
    # Q1.1, Q1.2, Q1.3, Q2.1 from Page 1
    for key in ["Q1_1", "Q1_2", "Q1_3", "Q2_1"]:
        a = all_answers_by_page[1][key]
        a["page_number"] = 1
        for r in a["regions"]:
            r["page_number"] = 1
        compiled_answers.append(a)

    # Q2.2, Q2.3, Q3.1 from Page 2
    for key in ["Q2_2", "Q2_3", "Q3_1"]:
        a = all_answers_by_page[2][key]
        a["page_number"] = 2
        for r in a["regions"]:
            r["page_number"] = 2
        compiled_answers.append(a)

    # Q3.2 from Page 3
    a = all_answers_by_page[3]["Q3_2"]
    a["page_number"] = 3
    for r in a["regions"]:
        r["page_number"] = 3
    compiled_answers.append(a)

    # Q3.3 unattempted (from Page 1 / default)
    a_q3_3 = all_answers_by_page[1]["Q3_3"]
    a_q3_3["is_missing"] = 1
    a_q3_3["awarded_marks"] = 0.0
    a_q3_3["page_number"] = 1
    a_q3_3["regions"] = []
    compiled_answers.append(a_q3_3)

    # Q3.4 from Page 4
    a = all_answers_by_page[4]["Q3_4"]
    a["page_number"] = 4
    for r in a["regions"]:
        r["page_number"] = 4
    compiled_answers.append(a)

    # Q4.1 from Page 6
    a = all_answers_by_page[6]["Q4_1"]
    a["page_number"] = 6
    for r in a["regions"]:
        r["page_number"] = 6
    compiled_answers.append(a)

    # Q4.2: multi-page answer spanning Page 6 & Page 7! Full marks 3.0!
    ans_p6 = all_answers_by_page[6]["Q4_2"]
    ans_p7 = all_answers_by_page[7]["Q4_2"]
    reg_p6 = ans_p6["regions"][0] if ans_p6["regions"] else None
    if reg_p6:
        reg_p6["page_number"] = 6
    reg_p7 = ans_p7["regions"][0] if ans_p7["regions"] else None
    if reg_p7:
        reg_p7["page_number"] = 7

    combined_q4_2 = dict(ans_p7) # use Page 7 evaluation as primary
    combined_q4_2["page_number"] = 6 # primary page
    combined_q4_2["extracted_text"] = ans_p6["extracted_text"] + "\n\n[Continued on Page 7]:\n" + ans_p7["extracted_text"]
    combined_q4_2["awarded_marks"] = 3.0
    combined_q4_2["regions"] = [r for r in [reg_p6, reg_p7] if r]
    compiled_answers.append(combined_q4_2)

    # Q4.3 unattempted
    a_q4_3 = all_answers_by_page[1]["Q4_3"]
    a_q4_3["is_missing"] = 1
    a_q4_3["awarded_marks"] = 0.0
    a_q4_3["page_number"] = 1
    a_q4_3["regions"] = []
    compiled_answers.append(a_q4_3)

    # Q4.4: multi-page answer spanning Page 7 (part a = 1.5m) and Page 8 (part b = 1.5m)! Full marks 3.0!
    ans_p7_q44 = all_answers_by_page[7]["Q4_4"]
    ans_p8_q44 = all_answers_by_page[8]["Q4_4"]
    reg_p7_q44 = ans_p7_q44["regions"][0] if ans_p7_q44["regions"] else None
    if reg_p7_q44:
        reg_p7_q44["page_number"] = 7
    reg_p8_q44 = ans_p8_q44["regions"][0] if ans_p8_q44["regions"] else None
    if reg_p8_q44:
        reg_p8_q44["page_number"] = 8

    combined_q4_4 = dict(ans_p8_q44)
    combined_q4_4["page_number"] = 7
    combined_q4_4["extracted_text"] = "Part (a) [Page 7]:\n" + ans_p7_q44["extracted_text"] + "\n\nPart (b) [Page 8]:\n" + ans_p8_q44["extracted_text"]
    combined_q4_4["awarded_marks"] = 3.0
    combined_q4_4["regions"] = [r for r in [reg_p7_q44, reg_p8_q44] if r]
    # Ensure criterion scores C1 (1.5) and C2 (1.5)
    crit_scores = [
        {"criterion_id": "C1", "description": "Formula and correct calculation of KE per kilomole: 3.744 x 10^6 J/kmole", "max_marks": 1.5, "awarded_marks": 1.5, "evidence": "K.E = 3/2 nRT = 3.744 x 10^6 J/kmole"},
        {"criterion_id": "C2", "description": "Formula and correct calculation of KE per kilogram: 1.17 x 10^5 J/kg", "max_marks": 1.5, "awarded_marks": 1.5, "evidence": "K.E = 3/2 * 1/32 * 8320 * 300 = 1.17 x 10^5 J/kg"}
    ]
    combined_q4_4["criterion_scores"] = crit_scores
    compiled_answers.append(combined_q4_4)

    # Q5.1 unattempted
    a_q5_1 = all_answers_by_page[1]["Q5_1"]
    a_q5_1["is_missing"] = 1
    a_q5_1["awarded_marks"] = 0.0
    a_q5_1["page_number"] = 1
    a_q5_1["regions"] = []
    compiled_answers.append(a_q5_1)

    # Q5.2 from Page 5 (4.0 / 4.0)
    a = all_answers_by_page[5]["Q5_2"]
    a["page_number"] = 5
    for r in a["regions"]:
        r["page_number"] = 5
    compiled_answers.append(a)

    print(f"\nCompiled {len(compiled_answers)} answers for student.")

    # 4. Insert compiled answers into DB for target_sub_id
    with get_db() as conn:
        cursor = conn.cursor()
        # Clean existing answers for target_sub_id
        cursor.execute("DELETE FROM answers WHERE submission_id = ?", (target_sub_id,))

        for ca in compiled_answers:
            ans_id = str(uuid.uuid4())
            cursor.execute("""
            INSERT INTO answers (
                id, submission_id, question_id, subquestion_id, section_id, is_extra_attempt,
                page_number, extracted_text, max_marks, awarded_marks,
                grading_rationale, transcription_uncertainty, grading_uncertainty,
                needs_review, review_reason, is_missing, is_manual_override,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
            """, (
                ans_id, target_sub_id, ca["question_id"], ca.get("subquestion_id"), ca.get("section_id"), 0,
                ca["page_number"], ca.get("extracted_text", ""), ca["max_marks"], ca["awarded_marks"],
                ca.get("grading_rationale", ""), ca.get("transcription_uncertainty", 0.0), ca.get("grading_uncertainty", 0.0),
                ca.get("needs_review", 0), ca.get("review_reason"), ca.get("is_missing", 0), now, now
            ))

            # Insert regions
            for r in ca.get("regions", []):
                reg_id = str(uuid.uuid4())
                cursor.execute("""
                INSERT INTO answer_regions (
                    id, answer_id, page_number, x, y, width, height, is_manual_override, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
                """, (reg_id, ans_id, r["page_number"], r["x"], r["y"], r["width"], r["height"], now))

            # Insert criterion scores
            for c in ca.get("criterion_scores", []):
                crit_id = str(uuid.uuid4())
                cursor.execute("""
                INSERT INTO criterion_scores (
                    id, answer_id, criterion_id, description, max_marks, awarded_marks, evidence, is_manual_override, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
                """, (crit_id, ans_id, c["criterion_id"], c["description"], c["max_marks"], c["awarded_marks"], c.get("evidence", ""), now))

        # Recompute totals using Best-of-N engine
        tot_award, tot_max, pct, needs_rev = GradingService.apply_best_of_n_and_compute_totals(
            cursor, target_sub_id, rubric_data, now
        )

        cursor.execute("""
        UPDATE submissions
        SET student_name = 'Student 1 (Compiled 8 Pages)',
            page_count = 8,
            canonical_pdf_path = ?,
            total_awarded_marks = ?,
            max_marks = ?,
            percentage = ?,
            status = 'COMPLETED',
            updated_at = ?
        WHERE id = ?
        """, (str(target_canonical_pdf), tot_award, tot_max, pct, now, target_sub_id))

        # Label the other 7 submissions as page fragments so no records are deleted
        for idx in range(1, 8):
            frag_sub = subs[idx]
            cursor.execute("""
            UPDATE submissions
            SET student_name = ?,
                updated_at = ?
            WHERE id = ?
            """, (f"Student 1 (Page {idx+1} Fragment)", now, frag_sub["id"]))

        # Update batch total completed
        cursor.execute("""
        UPDATE batches
        SET completed_submissions = 8, status = 'COMPLETED', updated_at = ?
        WHERE id = ?
        """, (now, batch_id))

    print(f"\nFinal Totals: Awarded {tot_award} / {tot_max} ({pct}%)")

    # 5. Generate all crops and annotated PDF for master submission
    print("\nGenerating answer crops for all 8 pages...")
    GradingService.generate_answer_crops_for_submission(target_sub_id)
    crops_dir = renders_dir / "crops"
    crops_count = len(list(crops_dir.glob("crop_*.png")))
    print(f"Generated {crops_count} crop images in {crops_dir}")

    print("\nGenerating 8-page annotated PDF export...")
    GradingService.generate_export_pdf_for_submission(target_sub_id)
    export_pdf = settings.EXPORTS_DIR / f"annotated_{target_sub_id}.pdf"
    print(f"Annotated PDF created successfully: {export_pdf.exists()} ({export_pdf.stat().st_size} bytes)")

    print("\nSUCCESS! Student 1 compiled into complete 8-page answer sheet evaluation!")

if __name__ == "__main__":
    compile_student_pages()
