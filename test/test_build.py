import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("cosmonet_build", ROOT / "build.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
PUBLIC_ENV = {
    "WEB3FORMS_ACCESS_KEY": "79d85590-f481-4f92-a54d-53488f74ee27",
    "TURNSTILE_SITE_KEY": "0x4AAAAAAAFixtureKeyOnly",
    "SITE_URL": "https://www.cosmonet.example",
    "TURNSTILE_SECRET_KEY": "secret-that-must-never-be-published",
    "RESEND_API_KEY": "unused-secret-that-must-never-be-published",
}


class BuildTests(unittest.TestCase):
    def test_production_requires_site_origin_only(self):
        with self.assertRaises(ValueError):
            module.public_config({}, production=True)
        config, origin = module.public_config({"SITE_URL": "https://cosmonet.example"}, production=True)
        self.assertEqual(config, {})
        self.assertEqual(origin, "https://cosmonet.example")

    def test_server_secrets_are_not_browser_configuration(self):
        config, origin = module.public_config(PUBLIC_ENV, production=True)
        self.assertEqual(config, {})

    def test_rejects_unsafe_site_origins(self):
        for site in ("http://cosmonet.ai", "https://user:pass@cosmonet.ai", "https://cosmonet.ai/path",
                     "https://cosmonet.ai?debug=1", "https://cosmonet.ai#hash", "https://localhost", "https://cosmonet.ai:8080", "https://.", "https://bad..example"):
            with self.subTest(site=site), self.assertRaises(ValueError):
                module.public_config({**PUBLIC_ENV, "SITE_URL": site}, production=True)

    def test_publish_allowlist_and_no_server_secrets(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "index.html").write_text(module.CAPTURED_ORIGIN + "/contact/")
            (root / "brand-theme.css").write_text("body{color:purple}")
            (root / "hero-scene.js").write_text("// Public hero")
            (root / "server.js").write_text("must not publish")
            (root / "test.js").write_text("must not publish")
            for folder in ("assets/vendor", "contact", "test/fixtures", "server"):
                (root / folder).mkdir(parents=True, exist_ok=True)
            (root / "assets/vendor/three.LICENSE.txt").write_text("license")
            (root / "contact/index.html").write_text("Contact")
            (root / "test/fixtures/index.html").write_text("must not publish")
            (root / "server/config.js").write_text("must not publish")
            (root / ".env").write_text("secret")
            (root / "dist").mkdir()
            (root / "dist/stale.js").write_text("stale")
            output = module.build(root, PUBLIC_ENV, production=True)
            self.assertFalse((output / "form-config.js").exists())
            output_text = "".join(p.read_text() for p in output.rglob("*") if p.is_file())
            self.assertNotIn(PUBLIC_ENV["TURNSTILE_SECRET_KEY"], output_text)
            self.assertNotIn(PUBLIC_ENV["RESEND_API_KEY"], output_text)
            self.assertIn(PUBLIC_ENV["SITE_URL"], (output / "index.html").read_text())
            self.assertEqual((root / "index.html").read_text(), module.CAPTURED_ORIGIN + "/contact/")
            self.assertTrue((output / "brand-theme.css").is_file())
            self.assertTrue((output / "hero-scene.js").is_file())
            self.assertTrue((output / "assets/vendor/three.LICENSE.txt").is_file())
            for forbidden in ("test", "server", ".env", "stale.js", "server.js", "test.js"):
                self.assertFalse((output / forbidden).exists())

    def test_missing_production_config_preserves_previous_build(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "dist").mkdir()
            (root / "dist/index.html").write_text("previous build")
            with self.assertRaises(ValueError):
                module.build(root, {}, production=True)
            self.assertEqual((root / "dist/index.html").read_text(), "previous build")

    def test_refuses_output_symlink(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as outside:
            root = Path(tmp)
            (root / "dist").symlink_to(outside, target_is_directory=True)
            with self.assertRaises(ValueError):
                module.build(root, {})


if __name__ == "__main__":
    unittest.main()
