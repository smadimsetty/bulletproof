import os


def load_env():
    """Load key=value pairs from the repo-root .env file into os.environ."""
    here = os.path.abspath(os.path.dirname(__file__))
    root = here
    while not os.path.isdir(os.path.join(root, ".git")):
        parent = os.path.dirname(root)
        if parent == root:
            raise RuntimeError("Could not locate repo root (no .git directory found)")
        root = parent
    env_path = os.path.join(root, ".env")
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ[key.strip()] = value.strip()
