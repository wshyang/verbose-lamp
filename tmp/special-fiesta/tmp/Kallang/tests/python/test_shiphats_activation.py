import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INERT = [".gitlab-ci.yml.shiphats", "sonar-project.properties.shiphats",
         ".gitlab/CODEOWNERS.shiphats", ".gitlab/merge_request_templates/Default.md.shiphats"]


def test_activate_renders_all_files_without_placeholders(tmp_path):
    for rel in INERT + ["activate-shiphats.sh"]:
        dest = tmp_path / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / rel, dest)
    env = {**os.environ, "SHIPHATS_PROJECT": "demo", "SHIPHATS_TEMPLATES_REF": "v1.1.12",
           "SHIPHATS_SONAR_PROJECTKEY": "demo", "SHIPHATS_CODEOWNER": "@team/demo"}
    result = subprocess.run(["bash", "activate-shiphats.sh", "--non-interactive"],
                            cwd=tmp_path, env=env, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    for rel in INERT:
        active = tmp_path / rel.removesuffix(".shiphats")
        assert active.exists(), rel
        assert "@@SHIPHATS_" not in active.read_text()
    assert "build-job:" in (tmp_path / ".gitlab-ci.yml").read_text()
