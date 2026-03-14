import logging
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import (
    FastAPI, APIRouter, Depends, HTTPException, status,
    WebSocket, WebSocketDisconnect, Request
)
from fastapi.responses import RedirectResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import auth, game_logic, state_manager
from .websocket_manager import manager as websocket_manager
from .config import settings

# --- Logging Configuration ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- App Lifecycle ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.info("Application startup...")
    await state_manager.init_storage()
    state_manager.start_auto_save_task()
    yield
    logging.info("Application shutdown...")
    await state_manager.shutdown_storage()

# --- FastAPI App Instance ---
app = FastAPI(lifespan=lifespan, title="浮生十梦")

# --- Routers ---
api_router = APIRouter(prefix="/api")


# --- Authentication Routes (简化密钥登录) ---
class LoginRequest(BaseModel):
    key: str


@api_router.post("/login")
async def login(req: LoginRequest):
    """
    使用玩家自定义密钥登录。
    密钥同时作为用户标识符，存储在 cookie 中。
    """
    key = req.key.strip()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="密钥不能为空",
        )
    if len(key) > 64:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="密钥长度不能超过64个字符",
        )

    response = JSONResponse(content={"message": "登录成功", "username": key})
    response.set_cookie(
        "player_key",
        value=key,
        max_age=60 * 60 * 24 * 365,  # 1年
        samesite="lax",
    )
    return response


@api_router.post("/logout")
async def logout():
    """登出，清除 cookie"""
    response = JSONResponse(content={"message": "已登出"})
    response.delete_cookie("player_key")
    return response


# --- Game Routes ---
@api_router.post("/game/init")
async def init_game(
    current_user: dict = Depends(auth.get_current_active_user),
):
    """
    初始化或获取当天的游戏会话。
    """
    game_state = await game_logic.get_or_create_daily_session(current_user)
    return game_state


# --- WebSocket Endpoint ---
@api_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """处理游戏的 WebSocket 连接"""
    player_key = websocket.cookies.get("player_key")
    if not player_key:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing player_key")
        return

    username = player_key
    await websocket_manager.connect(websocket, username)

    try:
        user_info = await auth.get_current_user(player_key)
        session = await state_manager.get_session(user_info["username"])
        if session:
            await websocket_manager.send_json_to_player(
                user_info["username"], {"type": "full_state", "data": session}
            )

        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action:
                # 检查是否为修改器状态更新
                if action == "__modifier_update__":
                    state_data = data.get("state_data", {})
                    await game_logic.apply_modifier_update(user_info, state_data)
                else:
                    await game_logic.process_player_action(user_info, action)

    except WebSocketDisconnect:
        websocket_manager.disconnect(username)


# --- Include API Router and Mount Static Files ---
app.include_router(api_router)
static_files_dir = Path(__file__).parent.parent.parent / "frontend"

# --- 404 Exception Handler ---
@app.exception_handler(404)
async def not_found_handler(request: Request, exc: HTTPException):
    """Redirect all 404 errors to the root page."""
    return RedirectResponse(url="/")

app.mount("/", StaticFiles(directory=static_files_dir, html=True), name="static")

# --- Uvicorn Runner ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        app_dir="backend/app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.UVICORN_RELOAD
    )