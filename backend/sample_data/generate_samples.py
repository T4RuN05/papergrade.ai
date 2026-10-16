"""
Generates realistic sample exam PDFs and student answer sheets for PaperGrade AI.
"""
from pathlib import Path
import fitz

BASE_DIR = Path(__file__).resolve().parent
EXAM_DIR = BASE_DIR / "sample_exam"
STUDENTS_DIR = BASE_DIR / "sample_students"

EXAM_DIR.mkdir(parents=True, exist_ok=True)
STUDENTS_DIR.mkdir(parents=True, exist_ok=True)

def create_sample_question_paper():
    doc = fitz.open()
    page = doc.new_page(width=595, height=842) # A4

    # Header
    page.insert_text(fitz.Point(160, 50), "DELHI PUBLIC SCHOOL — DEPARTMENT OF PHYSICS", fontsize=12, fontname="helv", color=(0.1, 0.1, 0.1))
    page.insert_text(fitz.Point(180, 70), "MID-TERM EXAMINATION (CLASS XI)", fontsize=14, fontname="helv", color=(0.0, 0.2, 0.5))
    page.insert_text(fitz.Point(50, 95), "Subject: Physics (Theory)", fontsize=10, fontname="helv")
    page.insert_text(fitz.Point(400, 95), "Maximum Marks: 20  |  Time: 1 hr", fontsize=10, fontname="helv")
    page.draw_line(fitz.Point(50, 105), fitz.Point(545, 105), color=(0.4, 0.4, 0.4), width=1)

    # Questions
    content = [
        ("Q1 [4 Marks]", "State Newton's Second Law of Motion and derive its mathematical formula (F = ma)."),
        ("Q2 [6 Marks]", "A 1500 kg automobile accelerates uniformly from rest to 20 m/s in 10 s. Calculate:\n(a) Acceleration of the car,\n(b) Net horizontal force acting on it."),
        ("Q3 [5 Marks]", "Define Work. Calculate the work done when a force of 50 N moves a crate through a distance of 6 m across a frictionless floor."),
        ("Q4 [5 Marks]", "Distinguish clearly between Kinetic Energy and Potential Energy. Give one practical example illustrating each type.")
    ]

    y = 135
    for q_title, q_text in content:
        page.insert_text(fitz.Point(50, y), q_title, fontsize=11, fontname="helv", color=(0.1, 0.2, 0.6))
        y += 20
        for line in q_text.split("\n"):
            page.insert_text(fitz.Point(65, y), line, fontsize=10, fontname="helv", color=(0.15, 0.15, 0.15))
            y += 18
        y += 20

    out_path = EXAM_DIR / "question_paper.pdf"
    doc.save(str(out_path))
    doc.close()
    print(f"Created {out_path}")

def create_sample_answer_key():
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)

    page.insert_text(fitz.Point(170, 50), "OFFICIAL ANSWER KEY & MARKING SCHEME", fontsize=13, fontname="helv", color=(0.1, 0.5, 0.2))
    page.insert_text(fitz.Point(210, 70), "Physics Midterm — Max Marks: 20", fontsize=11, fontname="helv")
    page.draw_line(fitz.Point(50, 85), fitz.Point(545, 85), color=(0.2, 0.5, 0.2), width=1.5)

    answers = [
        ("Q1 (4 Marks):", [
            "• Law: The rate of change of momentum is directly proportional to applied force (2 marks).",
            "• Mathematical: F = dp/dt = d(mv)/dt = m(dv/dt) = ma (2 marks)."
        ]),
        ("Q2 (6 Marks):", [
            "• Part (a): a = (v - u)/t = (20 - 0)/10 = 2 m/s^2 (3 marks).",
            "• Part (b): F = m * a = 1500 kg * 2 m/s^2 = 3000 N (3 marks). Unit 'N' is mandatory."
        ]),
        ("Q3 (5 Marks):", [
            "• Definition: Work done is dot product of force and displacement, W = F * s (2 marks).",
            "• Calculation: W = 50 N * 6 m = 300 Joules (J) (3 marks)."
        ]),
        ("Q4 (5 Marks):", [
            "• Kinetic Energy: Energy possessed due to motion (e.g., bullet fired from gun) (2.5 marks).",
            "• Potential Energy: Energy stored due to configuration/position (e.g., compressed spring) (2.5 marks)."
        ])
    ]

    y = 115
    for title, points in answers:
        page.insert_text(fitz.Point(50, y), title, fontsize=11, fontname="helv", color=(0.1, 0.3, 0.1))
        y += 18
        for pt in points:
            page.insert_text(fitz.Point(65, y), pt, fontsize=9.5, fontname="helv", color=(0.2, 0.2, 0.2))
            y += 16
        y += 16

    out_path = EXAM_DIR / "answer_key.pdf"
    doc.save(str(out_path))
    doc.close()
    print(f"Created {out_path}")

def create_student_sheet(filename: str, student_name: str, roll_no: str, script_answers: list):
    doc = fitz.open()

    # 2 pages per student answer sheet
    for page_idx in range(2):
        page = doc.new_page(width=595, height=842)
        # Lined background like a real answer booklet
        for ly in range(120, 800, 26):
            page.draw_line(fitz.Point(40, ly), fitz.Point(555, ly), color=(0.90, 0.92, 0.95), width=0.7)
        page.draw_line(fitz.Point(90, 110), fitz.Point(90, 800), color=(0.92, 0.82, 0.82), width=1.0) # Margin

        # Header on Page 1
        if page_idx == 0:
            page.draw_rect(fitz.Rect(40, 30, 555, 95), color=(0.3, 0.4, 0.6), fill=(0.96, 0.97, 1.0), width=1)
            page.insert_text(fitz.Point(55, 52), f"Student Name: {student_name}", fontsize=11, fontname="helv", color=(0.1, 0.1, 0.3))
            page.insert_text(fitz.Point(340, 52), f"Roll Number: {roll_no}", fontsize=11, fontname="helv", color=(0.1, 0.1, 0.3))
            page.insert_text(fitz.Point(55, 75), "Class: XI-A   |   Subject: Physics Midterm", fontsize=10, fontname="helv", color=(0.3, 0.3, 0.4))
            page.insert_text(fitz.Point(340, 75), "Answer Sheet Page 1 of 2", fontsize=10, fontname="helv", color=(0.3, 0.3, 0.4))
        else:
            page.insert_text(fitz.Point(440, 45), "Page 2 of 2", fontsize=9, fontname="helv", color=(0.5, 0.5, 0.5))

        # Render answers for this page
        for item in script_answers:
            if item.get("page") == (page_idx + 1):
                py = item.get("y", 150)
                # Question tag in margin
                page.insert_text(fitz.Point(50, py), item["qid"], fontsize=11, fontname="tiro", color=(0.2, 0.2, 0.5))
                # Handwriting style script text
                for line in item["text"]:
                    page.insert_text(fitz.Point(100, py), line, fontsize=10.5, fontname="tiro", color=(0.05, 0.1, 0.35))
                    py += 26

    out_path = STUDENTS_DIR / filename
    doc.save(str(out_path))
    doc.close()
    print(f"Created {out_path}")

def generate_all_samples():
    create_sample_question_paper()
    create_sample_answer_key()

    # Student 1: Aarav Sharma (Full/Strong answers)
    create_student_sheet(
        "student_1_aarav_sharma.pdf",
        "Aarav Sharma",
        "ROLL-101",
        [
            {
                "qid": "Ans 1", "page": 1, "y": 145,
                "text": [
                    "Newton's Second Law: The rate of change of linear momentum of an object",
                    "is directly proportional to the unbalanced external force acting on it.",
                    "Derivation: P = mv",
                    "F proportional to dp/dt = d(mv)/dt = m(dv/dt) = m*a",
                    "Hence, F = m * a."
                ]
            },
            {
                "qid": "Ans 2", "page": 1, "y": 320,
                "text": [
                    "Given: m = 1500 kg, u = 0, v = 20 m/s, t = 10 s.",
                    "(a) Using first equation of motion:",
                    "    v = u + at  =>  20 = 0 + a(10)  =>  a = 2 m/s^2.",
                    "(b) Net force F = m * a = 1500 kg * 2 m/s^2 = 3000 N."
                ]
            },
            {
                "qid": "Ans 3", "page": 2, "y": 140,
                "text": [
                    "Work: Work is said to be done by a force when it causes displacement.",
                    "W = Force x Displacement in direction of force = F * d.",
                    "Given: F = 50 N, d = 6 m.",
                    "W = 50 * 6 = 300 Joules (J)."
                ]
            },
            {
                "qid": "Ans 4", "page": 2, "y": 300,
                "text": [
                    "1. Kinetic Energy: The energy possessed by a body due to its motion.",
                    "   Example: A fast moving cricket ball or flowing water.",
                    "2. Potential Energy: The energy stored due to relative position or shape.",
                    "   Example: Water stored at height in a dam reservoir."
                ]
            }
        ]
    )

    # Student 2: Priya Patel (Missed unit on Q2, good otherwise)
    create_student_sheet(
        "student_2_priya_patel.pdf",
        "Priya Patel",
        "ROLL-102",
        [
            {
                "qid": "Ans 1", "page": 1, "y": 145,
                "text": [
                    "Newton's 2nd law: Force applied is equal to rate of change of momentum.",
                    "F = dp/dt = m*(v - u)/t = ma.",
                    "Therefore F = ma."
                ]
            },
            {
                "qid": "Ans 2", "page": 1, "y": 290,
                "text": [
                    "m = 1500 kg, u = 0, v = 20 m/s, t = 10 s.",
                    "a = (20 - 0)/10 = 2 m/s^2.",
                    "Force = mass * acceleration = 1500 * 2 = 3000.",
                    "[Note: Student forgot unit 'N']"
                ]
            },
            {
                "qid": "Ans 3", "page": 2, "y": 140,
                "text": [
                    "Work is the energy transferred when a force moves an object.",
                    "W = F * s = 50 N * 6 m = 300 J."
                ]
            },
            {
                "qid": "Ans 4", "page": 2, "y": 280,
                "text": [
                    "Kinetic energy: Energy in motion. E.g. running athlete.",
                    "Potential energy: Energy stored due to height. E.g. stretched rubber band."
                ]
            }
        ]
    )

    # Student 3: Rohan Verma (Skipped Q4, partial Q2)
    create_student_sheet(
        "student_3_rohan_verma.pdf",
        "Rohan Verma",
        "ROLL-103",
        [
            {
                "qid": "Ans 1", "page": 1, "y": 145,
                "text": [
                    "Newton's 2nd Law states that force is directly proportional to acceleration.",
                    "F = m * a."
                ]
            },
            {
                "qid": "Ans 2", "page": 1, "y": 280,
                "text": [
                    "a = 20 / 10 = 2 m/s^2.",
                    "F = 1500 * 2 = 3000 N."
                ]
            },
            {
                "qid": "Ans 3", "page": 2, "y": 140,
                "text": [
                    "W = F * d = 50 * 6 = 300 J.",
                    "Work done is 300 Joules."
                ]
            }
            # Q4 omitted / unattempted!
        ]
    )

if __name__ == "__main__":
    generate_all_samples()
