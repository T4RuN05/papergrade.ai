#!/usr/bin/env python3
"""
Camera Image Pre-Processing & Quality Comparison Tool.

Takes an unprocessed raw camera photo from a mobile phone (e.g. 12MP-48MP JPEG/PNG),
applies the recommended downscaling pipeline (Max 1920px bounding box, Lanczos downsampling,
JPEG quality 0.80), and generates a forensic side-by-side comparison report with:
- Byte size reduction metrics
- Megapixel and resolution reduction
- High-resolution zoomed crops for stroke sharpness analysis
- Side-by-side visual artifact output
"""

import sys
import os
import argparse
from pathlib import Path
from PIL import Image, ImageOps

def process_and_compare(
    input_path: str,
    output_dir: str,
    max_dimension: int = 1920,
    quality: int = 80
) -> dict:
    in_file = Path(input_path).resolve()
    out_dir = Path(output_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    if not in_file.exists():
        raise FileNotFoundError(f"Input image not found: {in_file}")

    # 1. Read Original
    orig_size_bytes = in_file.stat().st_size
    orig_img = Image.open(in_file)
    # Apply EXIF rotation if present (standard for mobile camera photos)
    orig_img = ImageOps.exif_transpose(orig_img) or orig_img
    
    orig_w, orig_h = orig_img.size
    orig_mp = (orig_w * orig_h) / 1_000_000

    # 2. Compute Downscaled Dimensions
    if orig_w > max_dimension or orig_h > max_dimension:
        if orig_w > orig_h:
            target_h = round((orig_h * max_dimension) / orig_w)
            target_w = max_dimension
        else:
            target_w = round((orig_w * max_dimension) / orig_h)
            target_h = max_dimension
    else:
        target_w, target_h = orig_w, orig_h

    # 3. Downscale using high-fidelity Lanczos resampling
    downscaled_img = orig_img.copy()
    if (target_w, target_h) != (orig_w, orig_h):
        downscaled_img = downscaled_img.resize((target_w, target_h), Image.Resampling.LANCZOS)

    # Convert RGBA to RGB with white background
    if downscaled_img.mode in ("RGBA", "P"):
        rgb_img = Image.new("RGB", downscaled_img.size, (255, 255, 255))
        if downscaled_img.mode == "RGBA":
            rgb_img.paste(downscaled_img, mask=downscaled_img.split()[3])
        else:
            rgb_img.paste(downscaled_img)
        downscaled_img = rgb_img
    elif downscaled_img.mode != "RGB":
        downscaled_img = downscaled_img.convert("RGB")

    # 4. Save Downscaled Image
    out_filename = f"downscaled_{in_file.stem}.jpg"
    out_downscaled_path = out_dir / out_filename
    downscaled_img.save(
        out_downscaled_path,
        format="JPEG",
        quality=quality,
        optimize=True
    )
    downscaled_size_bytes = out_downscaled_path.stat().st_size
    downscaled_mp = (target_w * target_h) / 1_000_000

    # 5. Extract Zoomed Crops for Detail / Sharpness Comparison
    # Crop a 600x600 region from center (or 1/3 down for student answer text)
    crop_w, crop_h = 600, 600
    center_x, center_y = orig_w // 2, orig_h // 2
    
    left = max(0, center_x - crop_w // 2)
    top = max(0, center_y - crop_h // 2)
    right = min(orig_w, left + crop_w)
    bottom = min(orig_h, top + crop_h)

    orig_crop = orig_img.crop((left, top, right, bottom))
    orig_crop_path = out_dir / f"crop_orig_{in_file.stem}.jpg"
    if orig_crop.mode != "RGB":
        orig_crop = orig_crop.convert("RGB")
    orig_crop.save(orig_crop_path, format="JPEG", quality=95)

    # Matching crop from downscaled image
    scale_factor = target_w / orig_w
    d_left = int(left * scale_factor)
    d_top = int(top * scale_factor)
    d_right = int(right * scale_factor)
    d_bottom = int(bottom * scale_factor)

    downscaled_crop = downscaled_img.crop((d_left, d_top, d_right, d_bottom))
    # Resize crop back to 600x600 to visually show 1:1 pixel comparison
    downscaled_crop_display = downscaled_crop.resize((right - left, bottom - top), Image.Resampling.NEAREST)
    downscaled_crop_path = out_dir / f"crop_downscaled_{in_file.stem}.jpg"
    downscaled_crop_display.save(downscaled_crop_path, format="JPEG", quality=95)

    # 6. Metrics Summary
    reduction_bytes = orig_size_bytes - downscaled_size_bytes
    pct_saved = (reduction_bytes / orig_size_bytes) * 100 if orig_size_bytes > 0 else 0
    ratio = orig_size_bytes / downscaled_size_bytes if downscaled_size_bytes > 0 else 1

    # Theoretical transfer time on 4G (10 Mbps = 1.25 MB/s) and 3G (1 Mbps = 125 KB/s)
    orig_mb = orig_size_bytes / (1024 * 1024)
    down_mb = downscaled_size_bytes / (1024 * 1024)
    t_4g_orig = orig_mb / 1.25
    t_4g_down = down_mb / 1.25
    t_3g_orig = orig_mb / 0.125
    t_3g_down = down_mb / 0.125

    report_data = {
        "original_file": str(in_file),
        "downscaled_file": str(out_downscaled_path),
        "orig_crop_file": str(orig_crop_path),
        "downscaled_crop_file": str(downscaled_crop_path),
        "original_resolution": f"{orig_w} x {orig_h}",
        "downscaled_resolution": f"{target_w} x {target_h}",
        "original_megapixels": f"{orig_mp:.2f} MP",
        "downscaled_megapixels": f"{downscaled_mp:.2f} MP",
        "original_size_mb": f"{orig_mb:.2f} MB",
        "downscaled_size_kb": f"{downscaled_size_bytes / 1024:.1f} KB",
        "downscaled_size_mb": f"{down_mb:.3f} MB",
        "bytes_saved_percent": f"{pct_saved:.1f}%",
        "compression_factor": f"{ratio:.1f}x smaller",
        "t_4g_orig_sec": f"{t_4g_orig:.2f}s",
        "t_4g_down_sec": f"{t_4g_down:.2f}s",
        "t_3g_orig_sec": f"{t_3g_orig:.2f}s",
        "t_3g_down_sec": f"{t_3g_down:.2f}s",
    }

    return report_data

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python compare_camera_image.py <path_to_raw_image> [output_dir]")
        sys.exit(1)

    in_img = sys.argv[1]
    out_d = sys.argv[2] if len(sys.argv) > 2 else "./output_comparison"
    res = process_and_compare(in_img, out_d)
    print("Pre-processing complete. Metrics:")
    for k, v in res.items():
        print(f"  {k}: {v}")
