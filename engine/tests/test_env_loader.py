import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import env_loader


def test_resolve_main_repo_root_from_worktree_gitdir_pointer(tmp_path):
    """_resolve_main_repo_root must correctly walk a worktree's `.git`
    pointer file up to the main checkout's root, using a fully synthetic
    directory tree -- no dependency on however this suite happens to be
    checked out (worktree or not), so it behaves identically in CI."""
    main_root = tmp_path / "main-repo"
    worktree_root = tmp_path / "some-worktree"
    gitdir = main_root / ".git" / "worktrees" / "some-worktree"
    gitdir.mkdir(parents=True)
    worktree_root.mkdir()
    (worktree_root / ".git").write_text(f"gitdir: {gitdir}\n", encoding="utf-8")

    resolved = env_loader._resolve_main_repo_root(str(worktree_root))

    assert os.path.normpath(resolved) == os.path.normpath(str(main_root))


def test_load_env_finds_env_in_a_normal_clone(tmp_path, monkeypatch):
    """load_env() must find .env via a directory-style .git, the normal
    (non-worktree) case -- built on a synthetic tree, not the ambient
    checkout, so this passes the same way in CI as it does here."""
    repo_root = tmp_path / "normal-clone"
    (repo_root / ".git").mkdir(parents=True)
    (repo_root / ".env").write_text("SOME_TEST_KEY=normal-clone-value\n", encoding="utf-8")
    fake_module_file = repo_root / "engine" / "env_loader.py"
    fake_module_file.parent.mkdir()

    monkeypatch.setattr(env_loader, "__file__", str(fake_module_file))
    monkeypatch.delenv("SOME_TEST_KEY", raising=False)

    env_loader.load_env()

    assert os.environ["SOME_TEST_KEY"] == "normal-clone-value"


def test_load_env_finds_env_via_worktree_gitdir_pointer(tmp_path, monkeypatch):
    """load_env() must find .env in the MAIN checkout when run from inside
    a worktree (a file-style .git), since worktrees never get gitignored
    files like .env copied into them -- built on a synthetic tree mirroring
    test_resolve_main_repo_root_from_worktree_gitdir_pointer's setup."""
    main_root = tmp_path / "main-repo"
    worktree_root = tmp_path / "some-worktree"
    gitdir = main_root / ".git" / "worktrees" / "some-worktree"
    gitdir.mkdir(parents=True)
    (main_root / ".env").write_text("SOME_TEST_KEY=worktree-value\n", encoding="utf-8")
    fake_module_file = worktree_root / "engine" / "env_loader.py"
    fake_module_file.parent.mkdir(parents=True)
    (worktree_root / ".git").write_text(f"gitdir: {gitdir}\n", encoding="utf-8")

    monkeypatch.setattr(env_loader, "__file__", str(fake_module_file))
    monkeypatch.delenv("SOME_TEST_KEY", raising=False)

    env_loader.load_env()

    assert os.environ["SOME_TEST_KEY"] == "worktree-value"
