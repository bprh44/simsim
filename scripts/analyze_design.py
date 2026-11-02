import os
import re

design_path = r"D:\Vibe\simsim\spatA\designs\stitch_telemetry_system_analysis_v2\viewer.html"
code_path = r"D:\Vibe\simsim\spatA\designs\stitch_telemetry_system_analysis_v2\mission_control_telemetry_operations\code.html"

for name, p in [("design_viewer", design_path), ("design_code", code_path)]:
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            content = f.read()
        print(f"=== {name} ===")
        sections = re.findall(r'<section[^>]+id=["\']([^"\']+)["\']', content)
        print("Sections:", sections)
        subviews = re.findall(r'id=["\'](subview-[^"\']+)["\']', content)
        print("Subviews:", subviews)
        ids = re.findall(r'id=["\']([a-zA-Z0-9_-]+)["\']', content)
        print("Key elements with id (sample 25):", ids[:25])
