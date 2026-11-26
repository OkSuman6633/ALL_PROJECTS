from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "AI Operations Diagnostic"
    environment: str = "local"
    data_dir: str = "./data"
    auth_mode: str = "demo"  # demo is for local synthetic-data use only
    demo_token: str = "local-demo-token-change-me"
    max_upload_mb: int = 10
    max_files_per_assessment: int = 5
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.1-flash-lite"
    gcp_project_id: str | None = None
    gcs_state_bucket: str | None = None
    gcs_source_bucket: str | None = None
    gcs_report_bucket: str | None = None
    model_config = SettingsConfigDict(
        env_file=(".env", "api/.env"),
        env_prefix="AOD_",
        extra="ignore",
    )

@lru_cache
def get_settings() -> Settings:
    return Settings()
