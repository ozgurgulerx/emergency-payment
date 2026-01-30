"""
Smoke tests for the Emergency Payment Runbook API.
Tests basic functionality with mocked/stubbed responses.
"""

import os
import pytest
from httpx import AsyncClient, ASGITransport

# Set dry-run mode for tests
os.environ["DRY_RUN_MODE"] = "true"
os.environ["LOG_FORMAT"] = "text"
os.environ["DATABASE_URL"] = "sqlite:///./test_runbook.db"

from app.main import app
from app.schemas import RunbookStartRequest, PaymentOverrides
from app.orchestrator import PaymentIntakeParser


# =============================================================================
# Test Fixtures
# =============================================================================

@pytest.fixture
def sample_message():
    """Sample payment request message."""
    return "Process emergency payment of $250,000 USD to ACME Trading LLC"


@pytest.fixture
def sample_blocked_message():
    """Sample message that should trigger sanctions block."""
    return "Process payment of $100,000 USD to BANK MASKAN"


# =============================================================================
# Parser Tests
# =============================================================================

class TestPaymentIntakeParser:
    """Tests for the PaymentIntakeParser."""

    def test_parse_basic_message(self, sample_message):
        """Test parsing a basic payment message."""
        payment = PaymentIntakeParser.parse(sample_message)

        assert payment.amount == 250000.0
        assert payment.currency == "USD"
        assert payment.beneficiary_name == "ACME Trading LLC"
        assert payment.entity == "BankSubsidiary_TR"

    def test_parse_with_overrides(self, sample_message):
        """Test parsing with field overrides."""
        overrides = {
            "entity": "GroupTreasuryCo",
            "currency": "EUR",
        }
        payment = PaymentIntakeParser.parse(sample_message, overrides)

        assert payment.entity == "GroupTreasuryCo"
        assert payment.currency == "EUR"
        assert payment.amount == 250000.0

    def test_parse_different_currencies(self):
        """Test parsing different currency formats."""
        messages = [
            ("Pay 100000 EUR to Test Corp", "EUR", 100000),
            ("Transfer $50,000 dollars to ABC Ltd", "USD", 50000),
            ("Send 75000 TRY to XYZ Bank", "TRY", 75000),
        ]

        for message, expected_currency, expected_amount in messages:
            payment = PaymentIntakeParser.parse(message)
            assert payment.currency == expected_currency
            assert payment.amount == expected_amount


# =============================================================================
# API Tests
# =============================================================================

@pytest.mark.asyncio
class TestHealthEndpoint:
    """Tests for the health check endpoint."""

    async def test_health_check(self):
        """Test health check returns healthy status."""
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["dry_run_mode"] == True


@pytest.mark.asyncio
class TestRunbookAPI:
    """Tests for the runbook API endpoints."""

    async def test_start_runbook(self, sample_message):
        """Test starting a new runbook workflow."""
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/runbook/start",
                json={"message": sample_message}
            )

        assert response.status_code == 200
        data = response.json()
        assert "run_id" in data
        assert data["status"] == "started"

    async def test_start_runbook_with_overrides(self, sample_message):
        """Test starting a workflow with overrides."""
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/runbook/start",
                json={
                    "message": sample_message,
                    "overrides": {
                        "entity": "GroupTreasuryCo",
                        "payment_id": "TXN-TEST-001",
                    }
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert "run_id" in data

    async def test_list_runs(self):
        """Test listing workflow runs."""
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.get("/api/runbook/runs")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    async def test_get_nonexistent_run(self):
        """Test getting a non-existent run."""
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.get("/api/runbook/run/nonexistent-run-id")

        assert response.status_code == 404


@pytest.mark.asyncio
class TestDirectAgentEndpoints:
    """Tests for direct agent invocation endpoints."""

    async def test_direct_sanctions_clear(self):
        """Test direct sanctions screening with clear result."""
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/agents/sanctions/screen",
                params={"beneficiary_name": "ACME Trading LLC"}
            )

        assert response.status_code == 200
        data = response.json()
        assert data["decision"] == "CLEAR"
        assert data["pass_to_next_agent"] == True

    async def test_direct_sanctions_block(self):
        """Test direct sanctions screening with block result."""
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/agents/sanctions/screen",
                params={"beneficiary_name": "BANK MASKAN"}
            )

        assert response.status_code == 200
        data = response.json()
        assert data["decision"] == "BLOCK"
        assert data["pass_to_next_agent"] == False

    async def test_direct_liquidity_no_breach(self):
        """Test direct liquidity check with no breach."""
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/agents/liquidity/check",
                params={
                    "amount": 100000,
                    "currency": "USD",
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert data["breach_assessment"]["breach"] == False

    async def test_direct_liquidity_breach(self):
        """Test direct liquidity check with breach."""
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/agents/liquidity/check",
                params={
                    "amount": 500000,  # Large amount triggers breach
                    "currency": "USD",
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert data["breach_assessment"]["breach"] == True


# =============================================================================
# Cleanup
# =============================================================================

@pytest.fixture(scope="session", autouse=True)
def cleanup():
    """Clean up test database after tests."""
    yield
    # Remove test database
    import os
    if os.path.exists("test_runbook.db"):
        os.remove("test_runbook.db")
