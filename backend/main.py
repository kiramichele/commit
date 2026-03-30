# ============================================================
# COMMIT PLATFORM — FastAPI Backend Entry Point
# ============================================================

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

from routers import auth, classrooms, assignments, submissions, commits, playground

app = FastAPI(
    title="Commit Platform API",
    version="0.1.0",
    docs_url="/docs",       # Swagger UI at /docs
    redoc_url="/redoc",
)

# ============================================================
# CORS — allow the Next.js frontend to call this API
# ============================================================
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# ROUTERS
# ============================================================
app.include_router(auth.router,         prefix="/auth",        tags=["auth"])
app.include_router(classrooms.router,   prefix="/classrooms",  tags=["classrooms"])
app.include_router(assignments.router,  prefix="/assignments", tags=["assignments"])
app.include_router(submissions.router,  prefix="/submissions", tags=["submissions"])
app.include_router(commits.router,      prefix="/commits",     tags=["commits"])
app.include_router(playground.router,   prefix="/playground",  tags=["playground"])


# ============================================================
# HEALTH CHECK
# ============================================================
@app.get("/")
async def root():
    return {"status": "ok", "app": "Commit Platform API"}


@app.get("/health")
async def health():
    return {"status": "healthy"}