# Local Development Setup — Windows 11, Claude Code, Docker Desktop, GitHub

This doc is the **one-time environment setup** for developing Madrasty locally on Windows 11 with Claude Code as the coding agent, Docker Desktop for Postgres/Redis, and GitHub as the remote repo. Once you've done this, [08-claude-code-development-plan.md](./08-claude-code-development-plan.md) covers the *ongoing development method* — how to prompt Claude Code, what order to build in, and how to keep it aligned with the architecture. Everything else — repo structure (doc 02), schema (doc 03), module boundaries — is the same regardless of environment.

**Recommended approach for Windows 11: use WSL2**, not native Windows, for the actual coding/running of the app. Docker Desktop's best mode of operation on Windows is the WSL2 backend, and Claude Code runs more smoothly for a Node/Postgres project inside a Linux environment (matches your production target OS too, since you'll eventually deploy to a Linux host per doc 01 §6). Native Windows installs are supported for both Docker Desktop and Claude Code if you'd rather avoid WSL, and that path is noted where it diverges — but WSL2 is the path assumed by default below.

## 1. What you're installing, in order

1. WSL2 (Windows Subsystem for Linux) + a Linux distro (Ubuntu)
2. Docker Desktop for Windows (WSL2 backend)
3. Git (inside WSL, plus optionally Git for Windows)
4. Node.js (inside WSL, via nvm)
5. Claude Code (inside WSL)
6. GitHub account + SSH key + repo
7. VS Code + the WSL extension (optional but recommended editor pairing)
8. Project scaffolding + `docker-compose` for Postgres/Redis
9. First Claude Code session

---

## 2. Step 1 — Enable WSL2

Open **PowerShell as Administrator** and run:
```powershell
wsl --install
```
This installs WSL2 and Ubuntu (the default distro) in one step. Restart Windows when prompted.

After restart, Ubuntu launches automatically the first time — set a Linux username and password when asked. This is your Linux environment's login, separate from your Windows login.

**Verify:**
```powershell
wsl --status
wsl -l -v
```
You should see Ubuntu listed with version `2`.

**Optional but recommended** — limit how much RAM/CPU WSL2 can consume (prevents it from hogging your machine). Create `%USERPROFILE%\.wslconfig` in Windows (e.g., via Notepad) with:
```ini
[wsl2]
memory=8GB
processors=4
swap=2GB
localhostForwarding=true
```
Restart WSL after editing (`wsl --shutdown` in PowerShell, then reopen Ubuntu).

## 3. Step 2 — Install Docker Desktop

1. Download Docker Desktop for Windows from docker.com and run the installer.
2. During install, ensure **"Use WSL 2 instead of Hyper-V"** is checked (it's the default on Windows 11).
3. After install, open Docker Desktop → **Settings → Resources → WSL Integration** → enable integration with your Ubuntu distro.
4. Restart Docker Desktop.

**Verify** (from inside the Ubuntu/WSL terminal, not PowerShell):
```bash
docker --version
docker run hello-world
```
If `hello-world` pulls and runs successfully, Docker is correctly wired into WSL2.

## 4. Step 3 — Git

Inside the Ubuntu/WSL terminal:
```bash
sudo apt update
sudo apt install -y git
git config --global user.name "Mohamed Gamal"
git config --global user.email "your-email@example.com"
```
**Keep Git configuration on the WSL side** — if you also have Git for Windows installed for other work, note that it's a *separate* Git installation with its own config; don't assume settings carry over between the two.

## 5. Step 4 — Node.js (via nvm, inside WSL)

Don't install Node.js from the Windows installer for this project — install it inside WSL so it matches your Linux dev/deploy environment:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install --lts
node --version
npm --version
```

## 6. Step 5 — Install Claude Code

Claude Code requires a Claude Pro, Max, Team, Enterprise, or Console account — the free Claude.ai plan doesn't include Claude Code access.

Inside the Ubuntu/WSL terminal, run the native installer (this is the same Linux install command whether you're on WSL, a Mac, or a Linux box — no Node.js dependency, despite Node being installed above for the app itself):
```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**Verify:**
```bash
claude --version
claude doctor
```
`claude doctor` checks installation integrity, PATH, and account status, and tells you exactly what's wrong if something isn't right.

**Authenticate:**
```bash
claude
```
This opens your browser for a one-time login against your Claude account. After that, `claude` runs from any project folder in this WSL environment.

> If you'd rather run Claude Code on native Windows instead of WSL, the install command is `irm https://claude.ai/install.ps1 | iex` from PowerShell (no admin needed), and installing **Git for Windows** is recommended alongside it so Claude Code can use a real Bash tool instead of falling back to PowerShell.

## 7. Step 6 — GitHub Account, SSH Key, and Repo

1. If you don't already have one, create a GitHub account.
2. Generate an SSH key inside WSL (skip if you already have one you want to reuse):
   ```bash
   ssh-keygen -t ed25519 -C "your-email@example.com"
   eval "$(ssh-agent -s)"
   ssh-add ~/.ssh/id_ed25519
   cat ~/.ssh/id_ed25519.pub
   ```
3. Copy the printed public key, add it in GitHub → **Settings → SSH and GPG keys → New SSH key**.
4. Test the connection:
   ```bash
   ssh -T git@github.com
   ```
5. Create a new repository on GitHub (e.g., `madrasty`) — empty, no README/gitignore (you'll push the existing structure).

## 8. Step 7 — VS Code (optional, recommended)

1. Install VS Code on Windows (normal Windows installer, not inside WSL).
2. Install the **"WSL"** extension from the marketplace.
3. From your Ubuntu/WSL terminal, inside your project folder, run:
   ```bash
   code .
   ```
   This opens VS Code on Windows but connected directly to your WSL filesystem — you get a normal Windows GUI editor while all files, terminals, and extensions actually run inside Linux. Also install the **Claude Code extension** from the VS Code marketplace if you want Claude's changes shown as inline diffs alongside your terminal session.

## 9. Step 8 — Project Scaffolding

Inside WSL:
```bash
mkdir -p ~/projects/madrasty && cd ~/projects/madrasty
git init
```
Recreate the folder structure from **doc 02-repo-structure.md** (`packages/server`, `packages/client`, `packages/shared`, `docs/`, etc.) — copy this documentation set into `docs/` right away, since Claude Code reads repo context and having the HLD/schema/payments docs there from the start keeps its generated code aligned with your architecture (same reasoning as doc 08 §2 — Claude Code reads them as context).

Add a `docker-compose.yml` at the repo root for local Postgres + Redis (matches doc 01's stack):
```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: madrasty
      POSTGRES_PASSWORD: madrasty_dev_password
      POSTGRES_DB: madrasty_dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7
    restart: unless-stopped
    ports:
      - "6379:6379"

volumes:
  pgdata:
```
Start it:
```bash
docker compose up -d
docker compose ps
```

Add a root `.env.example` (never commit a real `.env`):
```
DATABASE_URL=postgresql://madrasty:madrasty_dev_password@localhost:5432/madrasty_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-with-a-long-random-string
PAYMOB_API_KEY=
FAWRY_API_KEY=
VODAFONE_CASH_API_KEY=
INSTAPAY_API_KEY=
```
Copy it to `.env` and fill in real values as each integration gets built (docs 04/05/06). Add `.env` to `.gitignore` immediately, before your first commit.

## 10. Step 9 — First Commit and Push to GitHub

```bash
cd ~/projects/madrasty
git add .
git commit -m "Initial project scaffolding + docs"
git branch -M main
git remote add origin git@github.com:<your-username>/madrasty.git
git push -u origin main
```

From here on, a normal feature-branch workflow works well with Claude Code driving the actual coding:
```bash
git checkout -b feature/auth-parent-registration
# ... Claude Code makes changes ...
git add .
git commit -m "Implement parent-first registration flow (doc 11)"
git push -u origin feature/auth-parent-registration
# open a Pull Request on GitHub, review, merge to main
```

## 11. Step 10 — First Claude Code Session

From inside `~/projects/madrasty` in your WSL terminal:
```bash
claude
```
A good first prompt, once you're in the session (following doc 08's "reference the doc explicitly" guidance):

> "Read docs/02-repo-structure.md and docs/03-database-schema.md, then set up the `packages/shared` and `packages/server/db` folders with the initial Drizzle ORM schema for the `users`, `translations`, and `learning_programs` tables."

Keep working module-by-module per doc 09's roadmap phases — the same "don't ask for the whole app in one prompt" guidance from doc 08 applies here too, Claude Code included.

## 12. Daily Workflow Summary

```
Open Windows Terminal → Ubuntu tab (WSL)
cd ~/projects/madrasty
docker compose up -d          # Postgres + Redis running
claude                        # start your coding session
# ... work with Claude Code ...
git add . && git commit -m "..." && git push
```

## 13. Common Pitfalls (Windows-specific)
- **"claude: command not found" after install** — close and fully reopen your terminal (PATH changes need a fresh shell); if it persists, check `claude doctor`.
- **Docker commands hang or fail** — confirm Docker Desktop is actually running (check the system tray) and that WSL Integration is enabled for your Ubuntu distro in Docker Desktop settings.
- **Mixing Windows-side and WSL-side Git** — pick one (WSL is recommended here) and stick to it; the two have independent configs and can cause confusing "wrong author" commits if used interchangeably.
- **Line-ending issues (CRLF vs LF)** — since you're developing entirely inside WSL/Linux, this mostly doesn't come up; avoid editing files with a Windows-native editor that isn't WSL-aware (plain Notepad, some Windows-native IDEs) to sidestep it entirely.
- **Editing files outside WSL's filesystem** — keep the project under WSL's Linux filesystem (`~/projects/...`), not under `/mnt/c/...` (the Windows drive mounted into WSL) — file operations are noticeably slower across that boundary, and it's a common source of confusing performance complaints.
