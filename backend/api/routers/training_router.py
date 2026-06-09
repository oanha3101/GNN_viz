from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from services import training_service

router = APIRouter()

@router.websocket("/ws/train")
async def train_websocket(websocket: WebSocket):
    await training_service.handle_training_websocket(websocket)
