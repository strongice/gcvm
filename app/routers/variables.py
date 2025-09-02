from __future__ import annotations
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["meta"])

@router.get("/ping")
async def ping():
    return {"ok": True}

