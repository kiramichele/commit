from fastapi import APIRouter
router = APIRouter()

@router.get("/")
async def list_submissions():
    return {"message": "submissions router — coming soon"}