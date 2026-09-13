import importlib.metadata
import platform
from pathlib import Path

DEFAULT_ARTIFACT_DIRECTORY = Path(__file__).resolve().parents[2] / "artifacts"
ARTIFACT_FORMAT_VERSION = 1
RUNTIME_PACKAGES = ("numpy", "scikit-learn", "scipy", "joblib", "xgboost-cpu")


def runtime_versions() -> dict[str, str]:
    return {"python": ".".join(platform.python_version_tuple()[:2]), **{name: importlib.metadata.version(name) for name in RUNTIME_PACKAGES}}
