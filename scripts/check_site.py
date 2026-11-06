"""Check JavaScript syntax, local links, form wiring, and build isolation."""
from html.parser import HTMLParser
from pathlib import Path
import subprocess
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from build import PAGE_DIRS, build


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.path, self.ids, self.links, self.scripts = path, set(), [], []
        self.errors = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id"):
            if attrs["id"] in self.ids:
                self.errors.append(f"Duplicate id {attrs['id']}")
            self.ids.add(attrs["id"])
        if tag == "script" and attrs.get("src"):
            self.scripts.append(attrs["src"])
        for key in ("href", "src", "poster"):
            if attrs.get(key):
                self.links.append(attrs[key])


def main():
    errors = []
    pages = [ROOT / "index.html"] + [p for d in PAGE_DIRS for p in (ROOT / d).rglob("*.html")]
    parsed = {}
    for path in pages:
        page = Page(path)
        page.feed(path.read_text())
        parsed[path.resolve()] = page
        errors.extend(f"{path.relative_to(ROOT)}: {error}" for error in page.errors)
    links = 0
    for path, page in parsed.items():
        for href in page.links:
            url = urlsplit(href)
            if url.scheme or url.netloc:
                continue
            target = (ROOT / unquote(url.path).lstrip("/") if url.path.startswith("/") else path.parent / unquote(url.path)) if url.path else path
            if target.is_dir():
                target /= "index.html"
            if not target.is_file():
                errors.append(f"{path.relative_to(ROOT)}: missing local resource {href}")
            elif url.fragment and target.resolve() in parsed and unquote(url.fragment) not in parsed[target.resolve()].ids:
                errors.append(f"{path.relative_to(ROOT)}: missing anchor {href}")
            links += 1
    contact = parsed[(ROOT / "contact/index.html").resolve()]
    if "/form-config.js" in contact.scripts:
        errors.append("Contact must use the server config endpoint, not a public config file.")
    for source in sorted(list(ROOT.glob("*.js")) + list((ROOT / "server").glob("*.js"))):
        result = subprocess.run(["node", "--check", str(source)], capture_output=True, text=True)
        if result.returncode:
            errors.append(f"{source.name}: JavaScript syntax check failed\n{result.stderr}")
    output = build()
    for path, page in parsed.items():
        for href in page.links:
            url = urlsplit(href)
            if url.scheme or url.netloc:
                continue
            target = (ROOT / unquote(url.path).lstrip("/") if url.path.startswith("/") else path.parent / unquote(url.path)) if url.path else path
            if target.is_dir():
                target /= "index.html"
            if target.is_file() and not (output / target.relative_to(ROOT)).is_file():
                errors.append(f"Resource not included in public build: {href}")
    for forbidden in ("server", "test", "scripts", ".env", ".data", "form-config.js", "README.md", "package.json", "render.yaml"):
        if (output / forbidden).exists():
            errors.append(f"Private/tooling file was published: {forbidden}")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"Passed: {len(pages)} pages, {links} local references, JavaScript syntax, form script order, isolated build.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
