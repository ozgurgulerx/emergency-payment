"""
Shared Azure OpenAI chat client factory for Agent Framework agents.
Uses DefaultAzureCredential for Azure-native authentication.
"""

import os
from functools import lru_cache
from typing import Optional

from azure.identity import DefaultAzureCredential, AzureCliCredential
from agent_framework.azure import AzureOpenAIChatClient
import structlog

logger = structlog.get_logger()

# Configuration from environment
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT", "")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview")
AZURE_OPENAI_KEY = os.getenv("AZURE_OPENAI_KEY", "")


def get_credential():
    """
    Get Azure credential for authentication.

    Tries DefaultAzureCredential first (works with managed identity, Azure CLI, etc.)
    Falls back to API key if DefaultAzureCredential fails and AZURE_OPENAI_KEY is set.
    """
    try:
        # Try DefaultAzureCredential first (managed identity, Azure CLI, etc.)
        credential = DefaultAzureCredential()
        logger.info("azure_credential_initialized", method="DefaultAzureCredential")
        return credential
    except Exception as e:
        logger.warning(
            "default_credential_failed",
            error=str(e),
            fallback="AzureCliCredential"
        )
        try:
            # Fall back to Azure CLI credential
            credential = AzureCliCredential()
            logger.info("azure_credential_initialized", method="AzureCliCredential")
            return credential
        except Exception as e2:
            logger.warning(
                "cli_credential_failed",
                error=str(e2),
            )
            return None


def get_chat_client(
    endpoint: Optional[str] = None,
    deployment: Optional[str] = None,
    api_version: Optional[str] = None,
) -> AzureOpenAIChatClient:
    """
    Factory for Azure OpenAI chat client.

    Args:
        endpoint: Azure OpenAI endpoint URL (uses env var if not provided)
        deployment: Model deployment name (uses env var if not provided)
        api_version: API version (uses env var if not provided)

    Returns:
        Configured AzureOpenAIChatClient instance
    """
    _endpoint = endpoint or AZURE_OPENAI_ENDPOINT
    _deployment = deployment or AZURE_OPENAI_DEPLOYMENT
    _api_version = api_version or AZURE_OPENAI_API_VERSION

    if not _endpoint:
        raise ValueError(
            "Azure OpenAI endpoint not configured. "
            "Set AZURE_OPENAI_ENDPOINT environment variable."
        )

    credential = get_credential()

    if credential:
        # Use credential-based authentication
        client = AzureOpenAIChatClient(
            endpoint=_endpoint,
            credential=credential,
            deployment_name=_deployment,
            api_version=_api_version,
        )
        logger.info(
            "chat_client_created",
            endpoint=_endpoint,
            deployment=_deployment,
            auth="credential",
        )
    elif AZURE_OPENAI_KEY:
        # Fall back to API key authentication
        client = AzureOpenAIChatClient(
            endpoint=_endpoint,
            api_key=AZURE_OPENAI_KEY,
            deployment_name=_deployment,
            api_version=_api_version,
        )
        logger.info(
            "chat_client_created",
            endpoint=_endpoint,
            deployment=_deployment,
            auth="api_key",
        )
    else:
        raise ValueError(
            "No Azure authentication available. "
            "Set up DefaultAzureCredential or AZURE_OPENAI_KEY."
        )

    return client


@lru_cache(maxsize=1)
def get_shared_chat_client() -> AzureOpenAIChatClient:
    """
    Get a cached shared chat client instance.

    Use this when you want to reuse the same client across multiple agents
    to reduce connection overhead. Note: This is cached, so configuration
    changes require a restart.
    """
    return get_chat_client()
