import os
import shutil
import io
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import List, Tuple, Optional
import fitz  # PyMuPDF
from PIL import Image, ImageOps

from backend.app.config import settings
from backend.app.services.storage import (
    get_storage_service,
    is_remote_storage,
    sync_file_to_remote_storage,
)

class PDFService:
    @staticmethod
    def validate_file(file_path: Path, max_size_mb: int = 50) -> Tuple[bool, str]:
        if not file_path.exists():
            return False, "File does not exist."
        size_mb = file_path.stat().st_size / (1024 * 1024)
        if size_mb > max_size_mb:
            return False, f"File size {size_mb:.1f}MB exceeds limit of {max_size_mb}MB."
        suffix = file_path.suffix.lower()
        if suffix not in [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp"]:
            return False, f"Unsupported file extension {suffix}. Supported: PDF, PNG, JPG, JPEG, WEBP, BMP."
        return True, ""

    @staticmethod
    def _image_to_upright_pdf_bytes(img_path: Path) -> bytes:
        """
        Loads an image, normalizes its orientation via EXIF transposition (e.g. mobile photos),
        and returns PDF bytes for canonical assembly.
        """
        try:
            with Image.open(img_path) as img:
                transposed = ImageOps.exif_transpose(img)
                if transposed.mode in ("RGBA", "P", "LA"):
                    transposed = transposed.convert("RGB")
                buf = io.BytesIO()
                transposed.save(buf, format="PDF", resolution=150.0)
                return buf.getvalue()
        except Exception:
            img_doc = fitz.open(str(img_path))
            try:
                return img_doc.convert_to_pdf()
            finally:
                img_doc.close()

    @staticmethod
    def files_to_canonical_pdf(file_paths: List[Path], output_pdf_path: Path) -> Path:
        """
        Converts one or more files (PDFs and/or images) into a single upright multi-page PDF using PyMuPDF.
        """
        output_pdf_path.parent.mkdir(parents=True, exist_ok=True)
        if not file_paths:
            raise ValueError("No files provided for PDF assembly.")

        # If exactly one PDF file, copy directly
        if len(file_paths) == 1 and file_paths[0].suffix.lower() == ".pdf":
            if file_paths[0].resolve() != output_pdf_path.resolve():
                shutil.copy2(file_paths[0], output_pdf_path)
            return output_pdf_path

        doc = fitz.open()
        try:
            for p in file_paths:
                ext = p.suffix.lower()
                if ext == ".pdf":
                    sub_doc = fitz.open(str(p))
                    doc.insert_pdf(sub_doc)
                    sub_doc.close()
                elif ext in [".png", ".jpg", ".jpeg", ".webp", ".bmp"]:
                    pdf_bytes = PDFService._image_to_upright_pdf_bytes(p)
                    img_pdf = fitz.open("pdf", pdf_bytes)
                    doc.insert_pdf(img_pdf)
                    img_pdf.close()
            doc.save(str(output_pdf_path))
        finally:
            doc.close()
        return output_pdf_path

    @staticmethod
    def images_to_pdf(image_paths: List[Path], output_pdf_path: Path) -> Path:
        """
        Converts one or more image files into a single upright multi-page PDF using PyMuPDF.
        """
        output_pdf_path.parent.mkdir(parents=True, exist_ok=True)
        if not image_paths:
            raise ValueError("No images provided for PDF conversion.")

        doc = fitz.open()
        try:
            for p in image_paths:
                pdf_bytes = PDFService._image_to_upright_pdf_bytes(p)
                img_pdf = fitz.open("pdf", pdf_bytes)
                doc.insert_pdf(img_pdf)
                img_pdf.close()
            doc.save(str(output_pdf_path))
        finally:
            doc.close()
        return output_pdf_path

    @staticmethod
    def render_pdf_pages_to_images(pdf_path: Path, submission_id: str, dpi: int = 150) -> List[Path]:
        """
        Renders each PDF page into a high-res PNG for fast web canvas display and cropping.
        """
        if not pdf_path.exists():
            return []
        dest_dir = settings.RENDERS_DIR / submission_id
        dest_dir.mkdir(parents=True, exist_ok=True)
        rendered_paths = []

        doc = fitz.open(str(pdf_path))
        try:
            for page_num in range(len(doc)):
                page = doc[page_num]
                pix = page.get_pixmap(dpi=dpi)
                page_img_path = dest_dir / f"page_{page_num + 1}.png"
                pix.save(str(page_img_path))
                rendered_paths.append(page_img_path)
        finally:
            doc.close()

        storage = get_storage_service()
        if rendered_paths and is_remote_storage(storage):
            def _upload_page(p: Path) -> None:
                sync_file_to_remote_storage(
                    p,
                    f"renders/{submission_id}/{p.name}",
                    content_type="image/png",
                    storage=storage,
                )

            if len(rendered_paths) == 1:
                _upload_page(rendered_paths[0])
            else:
                with ThreadPoolExecutor(max_workers=4) as pool:
                    list(pool.map(_upload_page, rendered_paths))

        return rendered_paths

    @staticmethod
    def crop_answer_region(
        page_img_path: Path,
        x: float,
        y: float,
        width: float,
        height: float,
        output_crop_path: Path,
        padding_pct: float = 0.02,
        upload_key: Optional[str] = None,
    ) -> Optional[Path]:
        """
        Crops the exact answer region from the rendered page image using normalized coordinates.
        Adds a slight margin/padding for teacher legibility.
        """
        if not page_img_path.exists():
            return None
        output_crop_path.parent.mkdir(parents=True, exist_ok=True)
        img = Image.open(page_img_path)
        img_w, img_h = img.size

        crop_x = max(0, int((x - padding_pct) * img_w))
        crop_y = max(0, int((y - padding_pct) * img_h))
        crop_w = min(img_w - crop_x, int((width + 2 * padding_pct) * img_w))
        crop_h = min(img_h - crop_y, int((height + 2 * padding_pct) * img_h))

        if crop_w <= 5 or crop_h <= 5:
            return None

        cropped = img.crop((crop_x, crop_y, crop_x + crop_w, crop_y + crop_h))
        cropped.save(output_crop_path, format="PNG")
        if upload_key:
            sync_file_to_remote_storage(output_crop_path, upload_key, content_type="image/png")
        return output_crop_path

    @staticmethod
    def generate_annotated_pdf(
        original_pdf_path: Path,
        output_pdf_path: Path,
        graded_answers: List[dict],
        total_awarded_marks: Optional[float] = None,
        max_marks: Optional[float] = None,
        student_name: Optional[str] = None,
        roll_number: Optional[str] = None
    ) -> Optional[Path]:
        """
        Uses PyMuPDF to draw clean vector bounding boxes, color coding,
        and score badges directly onto the student PDF.
        Also adds a prominent teacher score annotation on top of page 1.
        """
        if not original_pdf_path.exists():
            return None

        output_pdf_path.parent.mkdir(parents=True, exist_ok=True)
        doc = fitz.open(str(original_pdf_path))

        # Color definitions (RGB normalized 0 to 1)
        COLOR_CORRECT = (0.05, 0.65, 0.35)     # Emerald Green
        COLOR_PARTIAL = (0.90, 0.55, 0.05)     # Amber/Orange
        COLOR_INCORRECT = (0.85, 0.15, 0.15)   # Red
        COLOR_REVIEW = (0.45, 0.25, 0.85)      # Indigo/Purple

        try:
            # 1. Draw prominent Total Score Annotation on top of Page 1
            if len(doc) > 0:
                first_page = doc[0]
                fpw = first_page.rect.width
                fph = first_page.rect.height

                # Compute total awarded & max marks if not passed
                if total_awarded_marks is None:
                    total_awarded_marks = sum(
                        float(a.get("awarded_marks", 0.0))
                        for a in graded_answers
                        if not a.get("is_extra_attempt", False)
                    )
                if max_marks is None or max_marks <= 0:
                    max_marks = sum(
                        float(a.get("max_marks", 0.0))
                        for a in graded_answers
                        if not a.get("is_extra_attempt", False)
                    )
                if max_marks <= 0:
                    max_marks = 25.0

                # Teacher grade stamp box on upper-right of Page 1
                stamp_w = 216
                stamp_h = 70
                stamp_x = max(10, fpw - stamp_w - 20)
                stamp_y = 18

                stamp_rect = fitz.Rect(stamp_x, stamp_y, stamp_x + stamp_w, stamp_y + stamp_h)

                # Outer border with soft ivory/pink background
                first_page.draw_rect(
                    stamp_rect,
                    color=(0.85, 0.12, 0.12),
                    width=2.5,
                    fill=(1.0, 0.96, 0.96),
                    fill_opacity=0.96
                )
                # Inner decorative border
                inner_rect = fitz.Rect(stamp_x + 3.5, stamp_y + 3.5, stamp_x + stamp_w - 3.5, stamp_y + stamp_h - 3.5)
                first_page.draw_rect(inner_rect, color=(0.85, 0.12, 0.12), width=0.8)

                # Header text
                first_page.insert_text(
                    fitz.Point(stamp_x + 12, stamp_y + 16),
                    "TOTAL MARKS OBTAINED",
                    fontsize=8.5,
                    color=(0.8, 0.1, 0.1),
                    fontname="helv"
                )

                # Big Score text: e.g. "20.5 / 25"
                score_str = f"{total_awarded_marks:g} / {max_marks:g}"
                first_page.insert_text(
                    fitz.Point(stamp_x + 12, stamp_y + 44),
                    score_str,
                    fontsize=24,
                    color=(0.85, 0.1, 0.1),
                    fontname="helv"
                )

                # Subtitle: Percentage & Student info
                pct = round((total_awarded_marks / max_marks) * 100, 1)
                meta_parts = []
                if roll_number:
                    meta_parts.append(str(roll_number))
                if student_name and student_name != "Student 1":
                    meta_parts.append(str(student_name)[:16])
                meta_parts.append(f"{pct}% Score")
                meta_str = " • ".join(meta_parts)

                first_page.insert_text(
                    fitz.Point(stamp_x + 12, stamp_y + 60),
                    meta_str,
                    fontsize=9,
                    color=(0.55, 0.1, 0.1),
                    fontname="helv"
                )

            # 2. Draw per-question bounding boxes and badges across pages
            for ans in graded_answers:
                qid = ans.get("question_id", "Q")
                max_m = float(ans.get("max_marks", 0.0))
                awd_m = float(ans.get("awarded_marks", 0.0))
                needs_rev = bool(ans.get("needs_review", False))
                regions = ans.get("regions", [])

                if needs_rev:
                    stroke_color = COLOR_REVIEW
                    status_text = "REVIEW"
                elif awd_m >= max_m:
                    stroke_color = COLOR_CORRECT
                    status_text = "FULL"
                elif awd_m > 0:
                    stroke_color = COLOR_PARTIAL
                    status_text = "PARTIAL"
                else:
                    stroke_color = COLOR_INCORRECT
                    status_text = "INCORRECT"

                score_label = f"[{qid}] {awd_m:g}/{max_m:g} ({status_text})"

                for r_idx, region in enumerate(regions):
                    page_num = int(region.get("page_number", 1)) - 1
                    if page_num < 0 or page_num >= len(doc):
                        continue

                    page = doc[page_num]
                    pw = page.rect.width
                    ph = page.rect.height

                    rx = float(region.get("x", 0.0)) * pw
                    ry = float(region.get("y", 0.0)) * ph
                    rw = float(region.get("width", 0.1)) * pw
                    rh = float(region.get("height", 0.05)) * ph

                    rect = fitz.Rect(rx, ry, rx + rw, ry + rh)

                    page.draw_rect(
                        rect,
                        color=stroke_color,
                        width=2.0,
                        fill=stroke_color,
                        fill_opacity=0.08
                    )

                    badge_rect = fitz.Rect(rx, max(0, ry - 16), rx + min(rw, 180), ry)
                    page.draw_rect(badge_rect, color=stroke_color, fill=stroke_color, fill_opacity=0.9)
                    page.insert_text(
                        fitz.Point(rx + 4, max(10, ry - 4)),
                        score_label if r_idx == 0 else f"[{qid}] cont.",
                        fontsize=9,
                        color=(1.0, 1.0, 1.0),
                        fontname="helv"
                    )

            doc.save(str(output_pdf_path))
        finally:
            doc.close()

        return output_pdf_path

pdf_service = PDFService()
