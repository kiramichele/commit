# ============================================================
# COMMIT PLATFORM — FastAPI Backend Entry Point
# ============================================================

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

from routers import auth, classrooms, assignments, submissions, commits, playground, admin, admin_curriculum, help_requests, curriculum, exercise_responses, students, annotations, discussions, todo, groups, feedback, demo

app = FastAPI(
    title="Commit Platform API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        frontend_url,
        "https://committocode.netlify.app",
        "http://localhost:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,           prefix="/auth",         tags=["auth"])
app.include_router(classrooms.router,     prefix="/classrooms",   tags=["classrooms"])
app.include_router(assignments.router,    prefix="/assignments",  tags=["assignments"])
app.include_router(submissions.router,    prefix="/code",         tags=["code"])
app.include_router(commits.router,        prefix="/commits",      tags=["commits"])
app.include_router(playground.router,     prefix="/playground",   tags=["playground"])
app.include_router(admin.router,          prefix="/admin",        tags=["admin"])
app.include_router(admin_curriculum.router, prefix="/admin/curriculum", tags=["admin-curriculum"])
app.include_router(help_requests.router,  prefix="/help",         tags=["help"])
app.include_router(curriculum.router,     prefix="/curriculum",   tags=["curriculum"])
app.include_router(exercise_responses.router, prefix="/exercises", tags=["exercises"])
app.include_router(students.router,       prefix="/students",     tags=["students"])
app.include_router(annotations.router,    prefix="/annotations",  tags=["annotations"])
app.include_router(discussions.router,    prefix="/discussions",  tags=["discussions"])
app.include_router(todo.router,           prefix="/todo",         tags=["todo"])
app.include_router(groups.router,         prefix="/groups",       tags=["groups"])
app.include_router(feedback.router,       prefix="/feedback",     tags=["feedback"])
app.include_router(demo.router,           prefix="/demo",         tags=["demo"])


@app.get("/")
async def root():
    return {"status": "ok", "app": "Commit Platform API"}


@app.get("/health")
async def health():
    return {"status": "healthy"}