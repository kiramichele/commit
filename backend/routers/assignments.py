from fastapi import APIRouter
router = APIRouter()

@router.get("/")
async def list_assignments():
    return {"message": "assignments router — coming soon"}