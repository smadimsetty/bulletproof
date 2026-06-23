import os


def _resolve_main_repo_root(worktree_root):
    """Given a directory containing a `.git` *file* (i.e. a git worktree
    checkout), resolve the main repository's root directory.

    A worktree's `.git` file contains a single line like:
        gitdir: /path/to/main-repo/.git/worktrees/<name>
    The main repo root is two directories up from that gitdir path
    (".git/worktrees/<name>" -> ".git" -> "<main-repo-root>").
    """
    git_file = os.path.join(worktree_root, ".git")
    with open(git_file, encoding="utf-8") as f:
        first_line = f.readline().strip()
    prefix = "gitdir:"
    if not first_line.startswith(prefix):
        raise RuntimeError(f"Unrecognized .git file format in {git_file!r}")
    gitdir = first_line[len(prefix):].strip()
    gitdir = os.path.normpath(gitdir)
    # gitdir == <main-repo-root>/.git/worktrees/<name>
    main_git_dir = os.path.dirname(os.path.dirname(gitdir))
    main_repo_root = os.path.dirname(main_git_dir)
    return main_repo_root


def load_env():
    """Load key=value pairs from the repo-root .env file into os.environ.

    Walks up from this file's directory looking for a `.git` entry, which
    may be either a directory (a normal clone) or a file (a git worktree
    checkout, where `.git` is a pointer file). When it's a worktree, the
    `.env` file lives in the *main* checkout (worktrees don't get
    gitignored files like `.env` copied into them), so the main repo root
    is resolved via the worktree's gitdir pointer.
    """
    here = os.path.abspath(os.path.dirname(__file__))
    root = here
    while not os.path.exists(os.path.join(root, ".git")):
        parent = os.path.dirname(root)
        if parent == root:
            raise RuntimeError("Could not locate repo root (no .git found)")
        root = parent

    git_entry = os.path.join(root, ".git")
    if os.path.isfile(git_entry):
        root = _resolve_main_repo_root(root)

    env_path = os.path.join(root, ".env")
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ[key.strip()] = value.strip()
