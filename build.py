"""Build public website files; server secrets and enquiry data are never published."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
PAGE_DIRS = ("about", "blog", "case-studies", "contact", "gcc", "how-we-work",
             "industries", "privacy", "products", "recruitment", "services",
             "solutions", "team", "technology")
PUBLIC_FILES = ("index.html", "app.js", "hero-scene.js",
                "styles.css", "visual-system.css", "experience.css", "cinematic.css",
                "editorial.css", "brand-theme.css", "home-hero.css", "software-hero.css",
                "software-hero-scene.js", "software-code-token.js")
CAPTURED_ORIGIN = "https://cosmonet.smkxtpwdnn.chatgpt.site"
def public_config(env, production=False):
    # Runtime server settings are NEVER read into the browser build.
    site_url = env.get("SITE_URL", "").strip().rstrip("/")
    if not production and site_url.startswith('http://'):
        # The local Node server uses an HTTP origin; production metadata is not
        # rewritten to that developer address.
        return {}, ''
    if production and not site_url:
        raise ValueError("Production requires SITE_URL.")
    if site_url:
        parsed = urlsplit(site_url)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or
                parsed.path or parsed.query or parsed.fragment or parsed.port or
                parsed.hostname in {"localhost", "127.0.0.1"} or
                not re.fullmatch(r"(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]+)", parsed.hostname)):
            raise ValueError("SITE_URL must be the public HTTPS origin, without a path or port.")
    return {}, site_url


def build(root=ROOT, env=None, production=False):
    config, site_url = public_config(os.environ if env is None else env, production)
    root = Path(root).resolve()
    out = root / "dist"
    if out.is_symlink():
        raise ValueError("dist/ must be a regular build directory, not a symbolic link.")
    # Validate settings before replacing a previous build.
    if out.exists():
        shutil.rmtree(out)
    out.mkdir()
    files = [root / name for name in PUBLIC_FILES if (root / name).is_file()]
    for folder in PAGE_DIRS:
        directory = root / folder
        if directory.exists():
            files.extend(p for p in directory.rglob("*") if p.is_file() and p.suffix in {".html", ".css", ".js"})
    assets = root / "assets"
    if assets.exists():
        files.extend(p for p in assets.rglob("*") if p.is_file() and not any(part.startswith(".") for part in p.relative_to(assets).parts))
    for source in sorted(files):
        if source.is_symlink() or not source.resolve().is_relative_to(root):
            raise ValueError(f"Public files cannot be symbolic links: {source.relative_to(root)}")
        destination = out / source.relative_to(root)
        destination.parent.mkdir(parents=True, exist_ok=True)
        if source.suffix == ".html" and site_url:
            destination.write_text(source.read_text().replace(CAPTURED_ORIGIN, site_url))
        else:
            # Avoid macOS copyfile clone operations, which can stall on cloud-backed
            # source folders. Public assets need byte copies, not filesystem metadata.
            destination.write_bytes(source.read_bytes())
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--production", action="store_true", help="Require the public production SITE_URL.")
    args = parser.parse_args()
    try:
        build(production=args.production)
    except (ValueError, OSError) as error:
        parser.exit(1, f"Build failed: {error}\n")
    print("Built dist/. Start the website and enquiry API with npm start.")
