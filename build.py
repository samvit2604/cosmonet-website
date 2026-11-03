"""Copy the original public frontend to dist/ using only Python's standard library."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parent
out = root / "dist"
out.mkdir(exist_ok=True)

for entry in sorted(root.iterdir()):
    if entry.name.startswith(".") or entry.name in {"dist", "__pycache__"}:
        continue
    if entry.is_dir() and entry.name != "assets" and not any(entry.rglob("*.html")):
        continue
    if entry.is_file() and entry.suffix not in {".html", ".css", ".js"}:
        continue
    destination = out / entry.name
    if entry.is_dir():
        shutil.copytree(entry, destination, dirs_exist_ok=True)
    else:
        shutil.copy2(entry, destination)

print("Built dist/. Run: python3 -m http.server 8000 --directory dist")
