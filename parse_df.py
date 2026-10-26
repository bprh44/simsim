import re

with open(r'C:\Users\RTX4070\.gemini\antigravity-ide\brain\fbf3410f-8ebd-4a4c-8ab8-ccc891c72295\.system_generated\steps\298\content.md', 'r', encoding='utf-8') as f:
    text = f.read()

# Look for table data, routes, operators, durations
# DirectFerries usually has Route Summary table or paragraphs
print("Length of content:", len(text))

# Search for paragraphs or headings
snippets = re.findall(r'<h[234][^>]*>(.*?)</h[234]>', text, re.DOTALL | re.IGNORECASE)
print("Headings:")
for s in snippets:
    clean = re.sub(r'<[^>]+>', '', s).strip()
    if clean:
        print("  -", clean)

# Extract route names
routes = re.findall(r'href=[\'"]/([a-z0-9_]+_ferry\.htm)[\'"]', text)
print("\nUnique routes found in links:", len(set(routes)))
for r in sorted(set(routes)):
    print("  *", r)
