# ==========================================
# 《浮生十梦》Docker 镜像构建
# ==========================================

FROM python:3.11-slim

# 设置工作目录为项目根目录
WORKDIR /app

# 安装系统依赖（如有需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 先复制依赖文件，利用 Docker 层缓存
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# 复制项目代码
COPY backend/ backend/
COPY frontend/ frontend/

# 创建数据持久化目录
RUN mkdir -p /app/game_data

# 暴露端口
EXPOSE 8000

# 数据卷：游戏存档 + 数据库 + 环境配置
VOLUME ["/app/game_data", "/app/backend/.env"]

# 设置环境变量默认值
ENV HOST=0.0.0.0
ENV PORT=8000
ENV UVICORN_RELOAD=false

# 启动命令
CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
