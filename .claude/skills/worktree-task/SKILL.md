---
name: worktree-task
description: Branch-per-task workflow for this repo. Use at the START of every new task the user gives (feature, fix, change request) — create a dedicated git worktree for the task's branch and do all work there, never in the source repo checkout. Also use when the user says the task is done / ship it / wrap up / open a PR, to push the branch, open a pull request, and remove the task's worktree.
---

# Worktree task workflow

Each task gets its own branch **and its own worktree**. Several Claude sessions may run at once on this repo, so never share a worktree between tasks or switch the branch of a worktree you didn't create.

- **Source repo:** `C:\Nathan Personal\DnD-Combat-Tracker` (stays on `main`, untouched)
- **Worktrees root:** `C:\Nathan Personal\DnD-Combat-Tracker-wt\` — one folder per task, named after the branch with `/` replaced by `-` (e.g. `feature/initiative-tiebreaker` → `DnD-Combat-Tracker-wt\feature-initiative-tiebreaker`)
- **Remote:** `origin` → `https://github.com/LoneTitan01/DnD-Combat-Tracker`, base branch `main`

Run every git, npm, build and test command with the task's worktree as the working directory (use absolute paths or `git -C "<worktree>"`), and edit files under the worktree path, not the source repo path.

## 1. Starting a new task

1. `git -C "C:\Nathan Personal\DnD-Combat-Tracker" fetch origin`
2. Pick the branch name:
   - **User named a branch:** use it.
   - **No branch given:** a short kebab-case summary of the task with a type prefix (`feature/`, `fix/`, `chore/`, `docs/`), e.g. `feature/initiative-tiebreaker`.
3. Check `git -C "C:\Nathan Personal\DnD-Combat-Tracker" worktree list`:
   - **The branch already has a worktree** → this is a continuing task. Use that worktree only if no other session is working in it (check `ListAgents`); if one is, tell the user rather than sharing it.
   - **Otherwise** create the worktree (`<wt>` = the worktree path from the naming rule above):
     - branch doesn't exist → `git -C "<source repo>" worktree add "<wt>" -b <branch> --no-track origin/main`
     - exists locally → `git -C "<source repo>" worktree add "<wt>" <branch>`
     - exists only on origin → `git -C "<source repo>" worktree add "<wt>" --track -b <branch> origin/<branch>`
   - If git says the branch is already checked out in another worktree, tell the user rather than forcing it.
4. Run `npm ci` in the new worktree before building or testing.
5. Tell the user in one line which branch and worktree you're working in.

## 2. Iterating

- Stay on that branch in that worktree for all follow-up requests on the task.
- Commit logical chunks as you go with clear messages (end each with the Co-Authored-By attribution line from the system reminder).
- Run the project's checks (`npm run build`, unit/e2e tests as relevant) in the worktree before wrapping up.
- **E2E ports:** Playwright reuses any server already listening on its ports, so with the default ports (5199/4199) you could end up testing another worktree's dev server. Give each worktree its own ports via env vars, e.g. in PowerShell:
  `$env:E2E_APP_PORT=5201; $env:E2E_PWA_PORT=4201; npx playwright test`
  Pick ports nothing else is using (`Get-NetTCPConnection -LocalPort <port>` returns nothing).

## 3. Closing out (when the user says the task is done)

1. Make sure everything is committed and checks pass; report any failures honestly before continuing.
2. Push: `git -C "<wt>" push -u origin <branch>`
3. Open the PR against `main`:
   - If `gh` is available and authenticated: `gh pr create --repo LoneTitan01/DnD-Combat-Tracker --base main --head <branch> --title "<title>" --body "<summary + test notes>"` (end the body with the PR attribution line from the system reminder). Capture the PR URL it prints.
   - If `gh` isn't available, give the user the compare link to open the PR in one click, with a suggested title and body to paste:
     `https://github.com/LoneTitan01/DnD-Combat-Tracker/compare/main...<branch>?expand=1`
4. Remove the task's worktree and local branch (the source repo's checkout is never touched):
   ```
   git -C "C:\Nathan Personal\DnD-Combat-Tracker" worktree remove "<wt>"
   git -C "C:\Nathan Personal\DnD-Combat-Tracker" branch -D <branch>
   ```
   The branch lives on in `origin` for the PR. If `worktree remove` refuses because of untracked or modified files, stop and show the user what's left instead of passing `--force`. On Windows it can also fail if a process (dev server, editor) still has files open: stop that process and retry.
5. Give the user the PR link.

## Housekeeping

- `git -C "C:\Nathan Personal\DnD-Combat-Tracker" worktree prune` clears records for worktree folders that were deleted by hand. Run it if `worktree list` shows paths that no longer exist.
- Don't remove worktrees belonging to other tasks unless the user asks, even if they look idle; another session may own them.
