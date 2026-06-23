import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import env_loader


def test_git_entry_in_this_checkout_is_a_worktree_pointer_file():
    """Sanity check on the test environment itself: this suite is expected
    to run inside a git worktree (not a normal clone), which is exactly the
    scenario that broke the old `os.path.isdir(.git)` check. If this
    assumption ever stops holding, the rest of this test's value changes.
    """
    here = os.path.abspath(os.path.dirname(__file__))
    root = here
    while not os.path.exists(os.path.join(root, ".git")):
        root = os.path.dirname(root)
    git_entry = os.path.join(root, ".git")
    assert os.path.isfile(git_entry), (
        f"expected {git_entry!r} to be a worktree pointer FILE; "
        "if this repo checkout is no longer a worktree, this test's premise "
        "no longer applies"
    )


def test_resolve_main_repo_root_from_real_worktree():
    """_resolve_main_repo_root must correctly walk a real worktree's
    `.git` pointer file (no mocking) up to the main checkout's root, which
    is where the gitignored `.env` actually lives.
    """
    here = os.path.abspath(os.path.dirname(__file__))
    root = here
    while not os.path.exists(os.path.join(root, ".git")):
        root = os.path.dirname(root)

    main_root = env_loader._resolve_main_repo_root(root)

    # The main repo root must differ from the worktree root...
    assert main_root != root
    # ...and must itself be a normal clone (.git is a directory there).
    assert os.path.isdir(os.path.join(main_root, ".git"))


def test_load_env_succeeds_from_inside_a_worktree():
    """End-to-end: load_env() must not raise when run from within this
    worktree, and must populate os.environ from the main checkout's .env
    (worktrees never get gitignored files copied into them, so if this
    were reading the worktree's own would-be .env it would find nothing).
    """
    # Use a key that shouldn't already be set, to prove load_env (not some
    # ambient environment variable) is what populates it.
    sentinel_key = "SUPABASE_URL"
    os.environ.pop(sentinel_key, None)

    env_loader.load_env()

    assert sentinel_key in os.environ
    assert os.environ[sentinel_key] != ""
