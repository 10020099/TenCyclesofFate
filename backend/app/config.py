from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # OpenAI API Settings
    OPENAI_API_KEY: str | None = None
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    OPENAI_MODEL: str = "gpt-3.5-turbo"
    OPENAI_MODEL_CHEAT_CHECK: str = "qwen3-235b-a22b"
    
    # Image Generation Settings (optional)
    IMAGE_GEN_MODEL: str | None = None
    IMAGE_GEN_BASE_URL: str | None = None
    IMAGE_GEN_API_KEY: str | None = None
    IMAGE_GEN_IDLE_SECONDS: int = 10

    # Context Management
    MAX_CONTEXT_TOKENS: int = 200000  # 模型最大上下文窗口 (Claude 4.5 Sonnet = 200K)

    # Server Settings
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    UVICORN_RELOAD: bool = True

    # Point to the .env file in the 'backend' directory relative to the project root
    model_config = SettingsConfigDict(env_file="backend/.env")

# Create a single instance of the settings
settings = Settings()