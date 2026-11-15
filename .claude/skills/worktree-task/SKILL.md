---
name: worktree-task
description: Branch-per-task workflow for this repo. Use at the START of every new task the user gives (feature, fix, change request) — do the work on a branch inside the dedicated git worktree, never in the source repo checkout. Also use when the user says the task is done / ship it / wrap up / open a PR, to close out the branch in the worktree and open a pull request.
---

# Worktree task workflow

All task work happens in the dedicated worktree, never in the source repo.

- **Source repo:** `C:\Nathan Personal\DnD-Combat-Tracker` (stays on `main`, untouched)
- **Worktree:** `C:\Nathan Personal\DnD-Combat-Tracker-worktree` (idle state: detached HEAD at `origin/main`)
- **Remote:** `origin` → `https://github.com/LoneTitan01/DnD-Combat-Tracker`, base branch `main`

Run every git, npm, build and test command with the worktree as the working directory (use absolute paths or `git -C "<worktree>"`), and edit files under the worktree path, not the source repo path.

## 1. Starting a new task

1. Make sure the worktree exists: `git -C "C:\Nathan Personal\DnD-Combat-Tracker" worktree list`. If it's missing, recreate it:
   `git -C "C:\Nathan Personal\DnD-Combat-Tracker" worktree add --detach "C:\Nathan Personal\DnD-Combat-Tracker-worktree" origin/main`
2. Check the worktree is clean (`git status`). If it has uncommitted changes or is still on a previous task's branch, stop and ask the user what to do with that work — don't discard it.
3. `git fetch origin`
4. Pick the branch:
   - **User named a branch:**
     - exists locally → `git switch <branch>`
     - exists only on origin → `git switch --track origin/<branch>`
     - doesn't exist → `git switch -c <branch> origin/main`
   - **No branch given:** create one from a short kebab-case summary of the task with a type prefix (`feature/`, `fix/`, `chore/`, `docs/`), e.g. `feature/initiative-tiebreaker`: `git switch -c <branch> origin/main`
   - If git says the branch is already checked out in another worktree (e.g. the source repo has it), tell the user rather than forcing it.
5. If `node_modules` is missing in the worktree, run `npm ci` there before building or testing.
6. Tell the user in one line which branch and worktree you're working in.

## 2. Iterating

- Stay on that branch in the worktree for all follow-up requests on the task.
- Commit logical chunks as you go with clear messages (end each with the Co-Authored-By attribution line from the system reminder).
- Run the project's checks (`npm run build`, unit/e2e tests as relevant) in the worktree before wrapping up.

## 3. Closing out (when the user says the task is done)

1. Make sure everything is committed and checks pass; report any failures honestly before continuing.
2. Push: `git push -u origin <branch>`
3. Open the PR against `main` in the source repo:
   - If `gh` is available and authenticated: `gh pr create --repo LoneTitan01/DnD-Combat-Tracker --base main --head <branch> --title "<title>" --body "<summary + test notes>"` (end the body with the PR attribution line from the system reminder). Capture the PR URL it prints.
   - If `gh` isn't available, give the user the compare link to open the PR in one click, with a suggested title and body to paste:
     `https://github.com/LoneTitan01/DnD-Combat-Tracker/compare/main...<branch>?expand=1`
4. Close out the branch in the worktree only (the source repo is never touched):
   ```
   git -C "C:\Nathan Personal\DnD-Combat-Tracker-worktree" switch --detach origin/main
   git -C "C:\Nathan Personal\DnD-Combat-Tracker-worktree" branch -D <branch>
   ```
   The branch lives on in `origin` for the PR; only the local copy is removed. Keep the worktree itself so it's ready for the next task.
5. Give the user the PR link.
