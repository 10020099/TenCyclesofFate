# 《浮生十梦》

**《浮生十梦》** 是一款基于 Web 的沉浸式文字冒险游戏。玩家在游戏中扮演一个与命运博弈的角色，每天有十次机会进入不同的"梦境"（即生命轮回），体验由 AI 动态生成的、独一无二的人生故事。游戏的核心在于"知足"与"贪欲"之间的抉择：是见好就收，还是追求更高的回报但可能失去一切？

> 本项目基于 [CassiopeiaCode/TenCyclesofFate](https://github.com/CassiopeiaCode/TenCyclesofFate) 进行本地化重构，移除了外部 OAuth 认证、直播观战、兑换码等在线功能，专注于纯粹的本地游玩体验。

## ✨ 功能特性

- **动态 AI 生成内容**: 每一次游戏体验都由大型语言模型（如 GPT）实时生成，确保了故事的独特性和不可预测性。
- **实时交互**: 通过 WebSocket 实现前端与后端的实时通信，提供流畅的游戏体验。
- **简易密钥登录**: 玩家自定义密钥即可登录，不同密钥区分不同用户，数据独立持久化。
- **精美的前端界面**: 采用具有"江南园林"风格的 UI 设计，提供沉浸式的视觉体验。
- **互动式判定系统**: 游戏中的关键行动可能触发"天命判定"。AI 会根据情境请求一次 D100 投骰，其"成功"、"失败"、"大成功"或"大失败"的结果将实时影响叙事走向。
- **智能反作弊机制**: 内置一套基于 AI 的反作弊系统，识别并惩罚 Prompt 注入等作弊行为。
- **数据持久化**: 游戏状态自动保存为 JSON 文件，应用重启后进度不丢失。
- **容器化部署**: 提供 Dockerfile 和 GitHub Actions 自动构建流程，支持一键 Docker 部署。

## 🛠️ 技术栈

- **后端**:
  - **框架**: FastAPI
  - **Web 服务器**: Uvicorn
  - **实时通信**: WebSockets
  - **认证**: Cookie 密钥认证（无需第三方服务）
  - **AI 集成**: OpenAI API（兼容任何 OpenAI 格式的 API）
  - **依赖管理**: pip

- **前端**:
  - **语言**: HTML, CSS, JavaScript (ESM)
  - **库**:
    - `marked.js`: 渲染 Markdown 格式的叙事文本
    - `DOMPurify`: HTML 内容安全过滤
    - `pako.js`: Gzip 解压缩 WebSocket 数据
    - `fast-json-patch`: 增量状态更新

## 🚀 部署指南

### 方式一：Docker 部署（推荐）

#### 使用预构建镜像

```bash
# 拉取最新镜像
docker pull ghcr.io/10020099/tencyclesoffate:latest

# 运行容器
docker run -d \
  --name tencyclesoffate \
  -p 8000:8000 \
  -v ./backend/.env:/app/backend/.env \
  -v ./game_data:/app/game_data \
  ghcr.io/10020099/tencyclesoffate:latest
```

#### 本地构建

```bash
# 构建镜像
docker build -t tencyclesoffate .

# 运行
docker run -d \
  --name tencyclesoffate \
  -p 8000:8000 \
  -v ./backend/.env:/app/backend/.env \
  -v ./game_data:/app/game_data \
  tencyclesoffate
```

> **挂载说明**：
> - `-v ./backend/.env:/app/backend/.env` — 挂载配置文件（API 密钥等）
> - `-v ./game_data:/app/game_data` — 挂载游戏存档目录，防止容器重启后数据丢失

### 方式二：直接运行

#### 1. 环境准备

- **Python 3.11+**
- **Git**

#### 2. 获取代码

```bash
git clone https://github.com/10020099/TenCyclesofFate.git
cd TenCyclesofFate
```

#### 3. 安装依赖

```bash
pip install -r backend/requirements.txt
```

#### 4. 配置环境变量

```bash
cp backend/.env.example backend/.env
```

编辑 `backend/.env`，填入必要信息：

```dotenv
# 必填：你的 OpenAI API 密钥
OPENAI_API_KEY="your_openai_api_key_here"

# 如果使用第三方中转 API，修改此 URL
OPENAI_BASE_URL="https://api.openai.com/v1"

# 游戏内容生成模型
OPENAI_MODEL="gpt-4o"

# 反作弊检查模型（可用便宜的模型）
OPENAI_MODEL_CHEAT_CHECK="gpt-3.5-turbo"
```

#### 5. 启动服务

```bash
# Linux/macOS
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000

# 或使用提供的脚本
chmod +x run.sh && ./run.sh
```

浏览器打开 `http://localhost:8000` 即可开始游戏。

## 📁 项目结构

```
.
├── backend/
│   ├── .env.example        # 环境变量示例文件
│   ├── requirements.txt    # Python 依赖
│   └── app/
│       ├── __init__.py
│       ├── main.py         # FastAPI 应用主入口，路由定义
│       ├── config.py       # Pydantic 配置模型
│       ├── auth.py         # 密钥认证
│       ├── game_logic.py   # 核心游戏逻辑 + 修改器系统
│       ├── websocket_manager.py # WebSocket 连接管理
│       ├── state_manager.py  # 游戏状态的保存与加载
│       ├── openai_client.py # OpenAI API 客户端
│       ├── cheat_check.py  # AI 反作弊检查
│       └── prompts/        # AI 系统提示词
│
├── frontend/
│   ├── index.html          # 主页面（登录 + 游戏 + 修改器面板）
│   ├── index.css           # CSS 样式（江南园林主题）
│   └── index.js            # 前端逻辑
│
├── Dockerfile              # Docker 镜像构建
├── .dockerignore           # Docker 构建排除
├── .github/workflows/      # CI/CD 自动构建
├── .gitignore
├── README.md               # 本文档
└── run.sh                  # 启动脚本
```

## 📄 许可证

本项目基于原项目进行修改，仅供个人学习和娱乐用途。
