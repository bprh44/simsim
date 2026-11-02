p = r"D:\Vibe\simsim\spatA\designs\stitch_telemetry_system_analysis_v2\mission_control_telemetry_operations\code.html"
with open(p, "r", encoding="utf-8") as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")
for i, line in enumerate(lines[420:530], start=421):
    print(f"{i}: {line[:120]}")
