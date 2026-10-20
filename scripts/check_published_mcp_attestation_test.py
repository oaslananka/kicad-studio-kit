"""Offline negative-policy tests for the published artifact provenance gate."""

import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "mcp_attestation", Path(__file__).with_name("check-published-mcp-attestation.py")
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class ProvenancePolicyTest(unittest.TestCase):
    def setUp(self):
        self.version = "4.3.0"
        mod.OWNER_REPO = "fixture/expected-repo"
        self.files = [
            {
                "filename": name,
                "url": "https://files.pythonhosted.org/packages/test/" + name,
                "digests": {"sha256": "a" * 64},
            }
            for name in (
                "kicad_mcp_pro-4.3.0-py3-none-any.whl",
                "kicad_mcp_pro-4.3.0.tar.gz",
            )
        ]
        self.publisher = {
            "kind": "GitHub",
            "repository": "fixture/expected-repo",
            "workflow": "publish-python.yml",
            "environment": "pypi",
        }

    def test_rejects_mismatched_release_or_digest(self):
        self.assertEqual(len(mod.artifacts({"urls": self.files}, self.version)), 2)
        for changed in (
            [{**self.files[0], "filename": "unknown.whl"}, self.files[1]],
            [{**self.files[0], "digests": {"sha256": "invalid"}}, self.files[1]],
            [{**self.files[0], "url": "https://evil.example/fake.whl"}, self.files[1]],
        ):
            with self.assertRaises(ValueError):
                mod.artifacts({"urls": changed}, self.version)

    def test_rejects_other_publisher_or_environment(self):
        self.assertIsNone(mod.verify_publisher({"attestation_bundles": [
            {"publisher": self.publisher, "attestations": [{"envelope": {}}]}
        ]}))
        for wrong in (
            {**self.publisher, "repository": "other/repo"},
            {**self.publisher, "workflow": "unreviewed.yml"},
            {**self.publisher, "environment": "testpypi"},
        ):
            with self.assertRaises(ValueError):
                mod.verify_publisher({"attestation_bundles": [
                    {"publisher": wrong, "attestations": [{"envelope": {}}]}
                ]})
        with self.assertRaises(ValueError):
            mod.verify_publisher({"attestation_bundles": []})


if __name__ == "__main__":
    unittest.main()
