from fastapi import APIRouter
router = APIRouter()

@router.get("/")
async def list_commits():
    return {"message": "commits router — coming soon"}