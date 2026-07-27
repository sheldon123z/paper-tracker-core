# Python and Node.js environments in Git worktrees

Each Git worktree owns exactly one Python virtual environment and one set of
Node.js installations at its root:

```text
paper-tracker/
├── .cache/pip/                       # shared download cache
├── .cache/npm/                       # shared npm download cache
├── .runtime/node/                    # shared portable Node.js runtime
├── .runtime/python-base.txt          # local Python 3.12 executable path
├── paper-tracker-main/.venv/
├── paper-tracker-main/frontend/node_modules/
├── paper-tracker-main/copilot-runtime/node_modules/
└── paper-tracker-<feature>/...
```

Do not copy, move, or share a `.venv` between worktrees. Virtual environments
contain absolute paths and are disposable. Recreate one when its worktree moves
or its base Python installation changes.

## Windows setup

From a worktree root:

```bat
start.bat --setup-only
```

This command:

1. reads the required Python and Node.js versions from `.python-version` and
   `.node-version`;
2. creates the worktree-local `.venv` when needed;
3. synchronizes backend and MCP requirements when either manifest changes;
4. runs `npm ci` when either application lockfile or the Node.js major version
   changes;
5. reuses the shared `../.cache/pip` and `../.cache/npm` download caches.

`start.bat` without arguments performs the same check and then starts all
services. Set `PAPER_TRACKER_PYTHON` to override the base interpreter for one
invocation. A persistent local interpreter path may be written to
`../.runtime/python-base.txt`.

`scripts/setup-python-env.ps1` verifies that `sys.prefix` resolves to the
current worktree's `.venv`; it will not install through an interpreter that
has fallen back to Conda/base Python. `scripts/setup-node-env.ps1` requires
Node.js 22 or newer and records the lockfile hash inside each `node_modules`.

## Other platforms

From a worktree root:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements-dev.txt
./start.sh
```

`start.sh` requires the root `.venv` to exist. It validates that interpreter,
uses Node.js 22 or newer, runs `npm ci` only when a worktree-local lock stamp
changes, and starts all three services directly from the current worktree.
It does not use a global LaunchAgent. Fixed development ports mean two
worktrees cannot run simultaneously without changing their port configuration;
the script refuses to silently reuse a port owned by another worktree.

Every `.venv` has its own installed packages, so branches can safely use
different dependency versions. Compatible wheels are downloaded once and then
reused from the shared cache; installation into each environment is still
required. Frontend `node_modules` directories follow the same model: one per
worktree, with downloads reused from the shared npm cache.

Dependency synchronization is incremental. If a Python requirement is removed,
or an environment is suspected to be contaminated, delete only that
worktree's `.venv` and run `start.bat --setup-only` again. For Node.js, rerun
the same command with `scripts/setup-node-env.ps1 -ForceSync` when a clean
reinstall is needed. The shared caches normally do not need to be deleted.

The Python requirement files currently use compatible version ranges rather
than a complete lockfile. The worktree layout isolates installations, but a
new environment can still resolve newer packages than an older environment.
Release-grade reproducibility requires a reviewed constraints or lock file.
