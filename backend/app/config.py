"""
Configuration management for the Emergency Payment Runbook.
Loads settings from environment variables with validation.
"""

import os
from functools import lru_cache
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # ==========================================================================
    # Azure AI Foundry Settings
    # ==========================================================================
    azure_foundry_project: str = Field(
        default="ozgurguler-7212",
        description="Azure AI Foundry project name/id"
    )

    azure_foundry_project_endpoint: str = Field(
        default="https://ozgurguler-7212-resource.services.ai.azure.com/api/projects/ozgurguler-7212",
        description="Azure AI Foundry project endpoint URL"
    )

    azure_openai_endpoint: str = Field(
        default="https://ozgurguler-7212-resource.openai.azure.com",
        description="Azure OpenAI endpoint for model inference"
    )

    azure_foundry_agent_sanctions: str = Field(
        default="sanctions-screening-agent",
        description="Sanctions screening agent name"
    )

    azure_foundry_agent_liquidity: str = Field(
        default="liquidity-screening-agent",
        description="Liquidity screening agent name"
    )

    azure_foundry_agent_procedures: str = Field(
        default="operational-procedures-agent",
        description="Operational procedures agent name"
    )

    # ==========================================================================
    # Azure Authentication (for DefaultAzureCredential)
    # ==========================================================================
    azure_tenant_id: Optional[str] = Field(
        default=None,
        description="Azure tenant ID for authentication"
    )

    azure_client_id: Optional[str] = Field(
        default=None,
        description="Azure client ID for service principal auth"
    )

    azure_client_secret: Optional[str] = Field(
        default=None,
        description="Azure client secret for service principal auth"
    )

    # ==========================================================================
    # Application Settings
    # ==========================================================================
    app_name: str = Field(
        default="Emergency Payment Runbook",
        description="Application name"
    )

    app_version: str = Field(
        default="1.0.0",
        description="Application version"
    )

    debug: bool = Field(
        default=False,
        description="Enable debug mode"
    )

    dry_run_mode: bool = Field(
        default=False,
        description="Enable dry-run mode with stubbed agent responses"
    )

    # ==========================================================================
    # Database Settings
    # ==========================================================================
    database_url: str = Field(
        default="sqlite:///./runbook.db",
        description="Database connection URL"
    )

    # ==========================================================================
    # Logging Settings
    # ==========================================================================
    log_level: str = Field(
        default="INFO",
        description="Logging level (DEBUG, INFO, WARNING, ERROR)"
    )

    log_format: str = Field(
        default="json",
        description="Log format (json or text)"
    )

    redact_pii: bool = Field(
        default=True,
        description="Redact PII from logs"
    )

    # ==========================================================================
    # Retry Settings
    # ==========================================================================
    max_retries: int = Field(
        default=3,
        description="Maximum retry attempts for agent calls"
    )

    retry_delay_seconds: float = Field(
        default=1.0,
        description="Initial delay between retries in seconds"
    )

    retry_backoff_factor: float = Field(
        default=2.0,
        description="Backoff multiplier for retry delays"
    )

    # ==========================================================================
    # SSE Settings
    # ==========================================================================
    sse_heartbeat_interval: int = Field(
        default=15,
        description="Heartbeat interval for SSE connections in seconds"
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"  # Allow extra environment variables


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


def is_dry_run() -> bool:
    """Check if running in dry-run mode."""
    settings = get_settings()
    return settings.dry_run_mode or not os.getenv("AZURE_AI_PROJECT_ENDPOINT")
