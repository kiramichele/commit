# commit — developer documentation

> commit to learning. commit to code.

A free AP CSP learning platform that blends Google Classroom, CodeHS, and GitHub Classroom into a single purpose-built tool for high school CS education.

---

## quick start

You need two terminals running at the same time.

**Terminal 1 — Backend:**
```bash
cd commit/backend
venv\Scripts\activate
uvicorn main:app --reload --host 0.0.0.0 --port 8888
```

**Terminal 2 — Frontend:**
```bash
cd commit/frontend
npm run dev
```

Then open `http://localhost:3000` in your browser.

- Admin panel: `http://localhost:3000/admin`
- API docs: `http://localhost:8888/docs`

---

## project structure

```
commit/
├── backend/                    ← FastAPI (Python)
│   ├── main.py                 ← App entry point, routers registered here
│   ├── db.py                   ← Supabase clients (anon + admin)
│   ├── auth_deps.py            ← JWT auth, role guards (require_teacher, require_admin)
│   ├── .env                    ← secrets — never commit this
│   └── routers/
│       ├── auth.py             ← login, signup, /me
│       ├── classrooms.py       ← classroom CRUD, add students
│       ├── assignments.py      ← assignment CRUD
│       ├── submissions.py      ← code execution, commit, submit, grade
│       ├── help_requests.py    ← help queue, claim, resolve
│       ├── admin.py            ← teacher approvals, platform stats
│       ├── playground.py       ← stub (Phase 2)
│       └── commits.py          ← stub (Phase 2)
│
├── frontend/                   ← Next.js 16 + React + Tailwind
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                          ← landing page
│   │   │   ├── login/page.tsx                    ← login
│   │   │   ├── signup/page.tsx                   ← teacher application
│   │   │   ├── dashboard/page.tsx                ← teacher dashboard
│   │   │   ├── admin/page.tsx                    ← admin panel
│   │   │   ├── learn/
│   │   │   │   ├── page.tsx                      ← student home
│   │   │   │   └── [classroom_id]/page.tsx       ← student classroom view
│   │   │   └── classroom/
│   │   │       └── [id]/
│   │   │           ├── page.tsx                  ← teacher classroom view
│   │   │           ├── assignment/
│   │   │           │   └── [assignment_id]/
│   │   │           │       └── page.tsx          ← code editor
│   │   │           └── submissions/
│   │   │               └── [assignment_id]/
│   │   │                   └── page.tsx          ← teacher submissions + grading
│   │   ├── components/
│   │   │   └── HelpQueue.tsx                     ← help request queue component
│   │   └── lib/
│   │       ├── api.ts                            ← FastAPI client
│   │       ├── auth-context.tsx                  ← auth provider + useAuth hook
│   │       └── supabase.ts                       ← Supabase browser client
│   ├── .env.local              ← frontend env vars — never commit this
│   ├── next.config.ts          ← Next.js config
│   └── package.json
│
└── supabase/
    └── migrations/
        ├── 001_core_schema.sql         ← all tables and indexes
        ├── 002a_rls_helpers.sql        ← helper functions for RLS
        ├── 002b_rls_policies.sql       ← row level security policies
        └── 003_functions_triggers.sql  ← stored procedures and triggers
```

---

## environment variables

### backend/.env
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SECRET_KEY=any-random-string
ENVIRONMENT=development
FRONTEND_URL=http://localhost:3000
JUDGE0_API_KEY=your-rapidapi-key
```

### frontend/.env.local
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_API_URL=http://localhost:8888
```

---

## tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind CSS |
| Backend | FastAPI (Python) |
| Database | Supabase (PostgreSQL + Auth + Realtime) |
| Code execution | Judge0 API (RapidAPI) |
| Hosting (future) | Vercel (frontend) + Railway (backend) |

---

## user roles

| Role | How created | Access |
|---|---|---|
| `admin` | Manually in Supabase SQL | Full platform access |
| `teacher` | Self-registers, manually approved | Own classrooms only |
| `student` | Teacher creates account | Own classroom + assignments |

### creating your admin account
1. Go to Supabase → Authentication → Users → Add user
2. Run in SQL editor:
```sql
insert into profiles (auth_user_id, role, display_name, email, approval_status)
values ('paste-uuid-here', 'admin', 'Your Name', 'your@email.com', 'approved');
```

---

## key concepts

### baby git
Every assignment has a commit system. Students click "commit", write a message, and a snapshot is saved. The visual timeline shows all versions. Teachers see the full commit history. Suspicious commits (large line jumps in short time) are flagged automatically.

### scaffold levels
Assignments have four levels of scaffolding:
- `block_pseudo` — drag-and-drop English pseudocode blocks
- `typed_pseudo` — type pseudocode (no syntax)
- `block_python` — Blockly-style blocks that generate real Python
- `typed_python` — full Python editor

Teachers set the default per assignment and can override per student.

### free tier limits
- 3 classrooms per teacher
- 45 students per classroom
- Enforced in FastAPI endpoint logic (not the database)

---

## common tasks

### adding a new backend route
1. Add the function to the appropriate file in `backend/routers/`
2. If it's a new router file, register it in `backend/main.py`
3. Check route order — specific routes (`/assignment/{id}`) must come BEFORE wildcard routes (`/{id}`)
4. Test at `http://localhost:8888/docs`

### adding a new frontend page
1. Create a folder in `frontend/src/app/` with `page.tsx` inside
2. Dynamic routes use square brackets: `[id]`, `[assignment_id]`
3. Always add `if (loading) return` at the top of auth useEffects
4. Use `useAuth()` hook for the current user profile

### running database migrations
1. Go to Supabase dashboard → SQL Editor
2. Paste the migration file contents
3. Run in order: 001 → 002a → 002b → 003

### known issues / quirks
- **Port 8888**: Backend runs on 8888 (not 8000) because Windows firewall blocks 8080
- **No Turbopack**: `next.config.ts` has webpack config to disable Turbopack — don't remove it
- **api.ts hardcoded URL**: `API_URL` is hardcoded to `http://localhost:8888` due to Turbopack env var bug
- **Supabase insert**: Use `.execute()` then `result.data[0]` — `.select().single()` chaining doesn't work with this client version
- **Route order matters**: In FastAPI, `/assignment/{id}` must be defined before `/{id}/commits` or FastAPI matches the wrong route

---

## phase roadmap

### phase 1 — MVP (current)
- [x] Auth — teacher signup/approval, student accounts
- [x] Classrooms — create, join, manage
- [x] Assignments — create, submit, grade
- [x] Code editor — Python execution via Judge0
- [x] Baby git — commit, timeline, version restore
- [x] Help queue — raise hand, claim, resolve
- [x] Student learn view
- [x] Teacher submissions view + grading
- [x] Admin panel

### phase 2 — core classroom tools
- [ ] Scaffold levels 1-3 (block pseudocode, Blockly)
- [ ] Diff viewer (compare two commits)
- [ ] In-editor debugger for students (step-through, variable inspection, breakpoints — investigate options like Pyodide debug API, DAP-compatible in-browser debugger, or sandboxed backend debug session)
- [ ] Playground (freeform projects)
- [ ] Stand-up meetings
- [ ] Discussion boards
- [ ] Real-time collaboration (Yjs)

### phase 3 — differentiation and scale
- [ ] AI grader (Pro tier)
- [ ] Exam prep / exam mode
- [ ] Create PT mode
- [ ] LMS grade sync (Canvas, Google Classroom)
- [ ] Ads implementation
- [ ] Teacher Pro subscription

### phase 4 — institutional
- [ ] School / district licensing
- [ ] SSO integration
- [ ] Clever / ClassLink rostering

---

## brand

- **Name**: commit
- **Tagline**: commit to learning. commit to code.
- **Logo mark**: `>_`
- **Primary color**: `#1A56DB`
- **Navy**: `#0E2D6E`
- **Font**: DM Sans (UI) + DM Mono (code)
- **Style**: Bold + minimal, light background, all lowercase wordmark
