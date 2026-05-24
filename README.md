# EDUVERSE — Hybrid LAN + Cloud Educational Platform
**by Joseph Brylle D. Egay | 2026**

---

## What is EDUVERSE?

EDUVERSE is a full-featured educational platform for schools, designed to run on a local network (LAN) or in the cloud. It provides:

- **MODE A — Student Grades System**: View grades, report cards, and academic records
- **MODE B — Quiz / Game System**: Take quizzes, play live educational games, leaderboard
- **ADMIN — System Management**: Backup, restore, student management, settings

---

## Requirements

| Requirement | Minimum |
|---|---|
| Node.js | 18 or higher |
| RAM | 2 GB |
| Disk | 500 MB |
| OS | Windows 10/11, macOS 12+, Ubuntu 20.04+ |

---

## Quick Start

### Windows
1. Double-click **`install.bat`**
2. Follow the on-screen instructions
3. Start EDUVERSE with the two commands shown at the end

### Linux / macOS
```bash
chmod +x install.sh
./install.sh
```

---

## Manual Start (after installation)

Open **two** terminal windows in this folder:

**Terminal 1 — API Server (port 5000):**
```bash
cd artifacts/api-server
PORT=5000 node dist/index.mjs
```

**Terminal 2 — Frontend (port 5173):**
```bash
cd artifacts/eduverse
pnpm run dev --port 5173
```

Then open: **http://localhost:5173**

---

## Default Credentials

| Role | Username/ID | Password |
|---|---|---|
| Admin | (any) | `admin123` |
| Teacher | (any) | `teacher123` |
| Student | (student ID) | (set by admin) |

**Change admin password immediately after first login.**

---

## Features

### Quiz System — Normal Quiz Mode
- **7 question types**: Multiple Choice (MCQ), True/False (TF), Matching, Multiple Response, Sequencing, Rating Grid, Word Hunt
- Auto-grading with configurable passing score
- Attempt limits, deadlines, retake requests
- Anti-cheat: tab switch detection & strict mode
- Teacher view sections dashboard (live student status monitoring)
- Edit & manage quizzes after creation

### Quiz System — Live Game Mode
- Kahoot-style PIN-based live games
- Real-time leaderboard
- Students join from any device on the network

### Live Performance Tools
- **Choose Me!** — Random student selector (wheel spin)
- **Ask Me!** — Timed Q&A with random student picker
- **Reveal Me!** — Progressive answer reveal game
- **Student Roulette** — Fun engagement spinner

### Grades System
- Import student grades via Excel/CSV
- Generate report cards
- Track academic performance over multiple periods

### Admin Tools
- Student roster management (import from Excel)
- Full backup and restore (SQLite DB)
- System settings & announcements

---

## LAN Deployment

To let other devices on your network access EDUVERSE:

1. Find your computer's local IP address (e.g. `192.168.1.100`)
2. Start both servers as shown above
3. On the frontend, set `VITE_API_URL=http://192.168.1.100:5000` in `artifacts/eduverse/.env`
4. Restart the frontend server
5. Students navigate to `http://192.168.1.100:5173`

---

## Folder Structure

```
eduverse-installer/
├── artifacts/
│   ├── api-server/     ← Express API + SQLite database
│   └── eduverse/       ← React frontend (Vite)
├── lib/                ← Shared TypeScript libraries
├── install.sh          ← Linux/macOS installer
├── install.bat         ← Windows installer
├── package.json        ← Root workspace config
└── README.md           ← This file
```

---

## Tech Stack

- **Frontend**: React 18 + Vite + TypeScript
- **Backend**: Express 5 + Node.js 24
- **Database**: SQLite (better-sqlite3) — no external DB needed
- **Package Manager**: pnpm workspaces

---

## Support

For issues or customization, refer to the source code in `artifacts/`. The codebase is fully open and documented with comments throughout.
