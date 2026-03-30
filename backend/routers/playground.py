from fastapi import APIRouter
router = APIRouter()

@router.get("/")
async def list_projects():
    return {"message": "playground router — coming soon"}