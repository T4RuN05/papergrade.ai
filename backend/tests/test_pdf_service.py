import os
from pathlib import Path
from PIL import Image
import fitz
import pytest

from backend.app.config import settings
from backend.app.services.pdf_service import pdf_service

def test_pdf_service_operations(tmp_path):
    # 1. Create a sample synthetic page image
    img_path = tmp_path / "sample_page.png"
    img = Image.new("RGB", (600, 800), color=(250, 250, 250))
    img.save(img_path)

    # 2. Convert to PDF
    pdf_path = tmp_path / "test_doc.pdf"
    pdf_service.images_to_pdf([img_path], pdf_path)
    assert pdf_path.exists()

    # 3. Check page count with PyMuPDF
    doc = fitz.open(str(pdf_path))
    assert len(doc) == 1
    doc.close()

    # 4. Render page to image
    renders = pdf_service.render_pdf_pages_to_images(pdf_path, "test_sub_123")
    assert len(renders) == 1
    assert renders[0].exists()

    # 5. Crop answer region
    crop_path = tmp_path / "crop.png"
    cropped = pdf_service.crop_answer_region(
        page_img_path=renders[0],
        x=0.1,
        y=0.2,
        width=0.5,
        height=0.3,
        output_crop_path=crop_path
    )
    assert cropped is not None
    assert crop_path.exists()

    # 6. Generate annotated PDF
    annotated_pdf = tmp_path / "annotated.pdf"
    pdf_service.generate_annotated_pdf(
        original_pdf_path=pdf_path,
        output_pdf_path=annotated_pdf,
        graded_answers=[
            {
                "question_id": "Q1",
                "max_marks": 4.0,
                "awarded_marks": 4.0,
                "needs_review": False,
                "regions": [{"page_number": 1, "x": 0.1, "y": 0.2, "width": 0.5, "height": 0.3}]
            }
        ]
    )
    assert annotated_pdf.exists()
    doc_ann = fitz.open(str(annotated_pdf))
    assert len(doc_ann) == 1
    doc_ann.close()

def test_files_to_canonical_pdf_multiple_images(tmp_path):
    # Create 3 synthetic page images
    img1 = tmp_path / "qp_page1.jpg"
    img2 = tmp_path / "qp_page2.jpg"
    img3 = tmp_path / "qp_page3.jpg"

    Image.new("RGB", (600, 800), color=(255, 255, 255)).save(img1)
    Image.new("RGB", (600, 800), color=(240, 240, 240)).save(img2)
    Image.new("RGB", (600, 800), color=(230, 230, 230)).save(img3)

    combined_pdf = tmp_path / "canonical_question_paper.pdf"
    pdf_service.files_to_canonical_pdf([img1, img2, img3], combined_pdf)

    assert combined_pdf.exists()
    doc = fitz.open(str(combined_pdf))
    assert len(doc) == 3
    doc.close()
