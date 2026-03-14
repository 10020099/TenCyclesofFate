"""
简化认证模块 - 基于密钥的本地登录系统

玩家通过自定义密钥登录，密钥同时作为用户标识符。
密钥存储在 cookie 中，用于 HTTP 和 WebSocket 认证。
"""
import hashlib
import logging
from typing import Annotated

from fastapi import Depends, HTTPException, status, Cookie

logger = logging.getLogger(__name__)


def _stable_user_id(player_key: str) -> int:
    """根据密钥生成稳定的数字 ID（不受 PYTHONHASHSEED 影响）"""
    return int(hashlib.md5(player_key.encode("utf-8")).hexdigest()[:8], 16)


async def get_current_user(player_key: Annotated[str | None, Cookie()] = None) -> dict:
    """
    从 cookie 中读取玩家密钥，返回用户信息字典。
    如果 cookie 不存在则抛出 401。
    """
    if not player_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未登录，请先输入密钥",
        )
    return {
        "username": player_key,
        "id": _stable_user_id(player_key),
        "name": player_key,
    }


async def get_current_active_user(
    current_user: Annotated[dict, Depends(get_current_user)]
) -> dict:
    """获取当前活跃用户（兼容旧接口）"""
    return current_user