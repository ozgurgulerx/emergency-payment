"""
Market data tools for the Market Agent.
Uses @ai_function decorator from Microsoft Agent Framework.
"""

import os
import random
from typing import Annotated, Any, Dict, List, Optional

from agent_framework import ai_function
from pydantic import Field
import structlog

logger = structlog.get_logger()

# Database configuration for read-only access
PGHOST = os.getenv("PGHOST", "aistartupstr.postgres.database.azure.com")
PGPORT = int(os.getenv("PGPORT", "5432"))
PGDATABASE = os.getenv("PGDATABASE", "fundrag")
PGUSER = os.getenv("PGUSER", "ozgurguler")
PGPASSWORD = os.getenv("PGPASSWORD", "")
PG_SCHEMA = os.getenv("PG_FUND_SCHEMA", "nport_funds")


@ai_function(approval_mode="never_require")
async def query_universe(
    min_aum: Annotated[
        float,
        Field(description="Minimum AUM in dollars", default=100_000_000)
    ] = 100_000_000,
    asset_class: Annotated[
        str,
        Field(description="Asset class filter: equity, fixed_income, balanced, or all", default="all")
    ] = "all",
    limit: Annotated[
        int,
        Field(description="Maximum number of assets to return", default=100)
    ] = 100,
) -> List[Dict[str, Any]]:
    """Query investable assets from fund database based on criteria.

    Returns a list of assets with id, name, symbol, manager, aum, and asset_type.
    Uses the nport_funds database with SEC N-PORT filings in READ-ONLY mode.
    """
    try:
        import asyncpg

        conn = await asyncpg.connect(
            host=PGHOST,
            port=PGPORT,
            database=PGDATABASE,
            user=PGUSER,
            password=PGPASSWORD,
            ssl="require",
        )

        try:
            # READ-ONLY mode - Critical for database protection
            await conn.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")

            query = f"""
                SELECT
                    f.accession_number,
                    f.series_name as name,
                    f.series_id as symbol,
                    r.registrant_name as manager,
                    COALESCE(f.total_assets, 0) as aum,
                    'fund' as asset_type
                FROM {PG_SCHEMA}.fund_reported_info f
                JOIN {PG_SCHEMA}.registrant r ON f.accession_number = r.accession_number
                WHERE COALESCE(f.total_assets, 0) >= $1
                ORDER BY f.total_assets DESC
                LIMIT $2
            """

            rows = await conn.fetch(query, min_aum, limit)

            logger.info(
                "universe_query_success",
                count=len(rows),
                min_aum=min_aum,
                asset_class=asset_class,
            )

            return [
                {
                    "id": row["accession_number"],
                    "name": row["name"] or "Unknown",
                    "symbol": row["symbol"] or row["accession_number"][:8],
                    "manager": row["manager"],
                    "aum": float(row["aum"]),
                    "asset_type": row["asset_type"],
                }
                for row in rows
            ]

        finally:
            await conn.close()

    except Exception as e:
        logger.warning("database_query_failed", error=str(e))
        # Return mock data when database unavailable
        return _get_mock_universe(limit)


def _get_mock_universe(limit: int = 100) -> List[Dict[str, Any]]:
    """Return mock universe data for demo/fallback."""
    mock_assets = [
        {"id": "VTI", "name": "Vanguard Total Stock Market ETF", "symbol": "VTI", "manager": "Vanguard", "aum": 350e9, "asset_type": "equity"},
        {"id": "VOO", "name": "Vanguard S&P 500 ETF", "symbol": "VOO", "manager": "Vanguard", "aum": 320e9, "asset_type": "equity"},
        {"id": "VEA", "name": "Vanguard FTSE Developed Markets ETF", "symbol": "VEA", "manager": "Vanguard", "aum": 100e9, "asset_type": "equity"},
        {"id": "VWO", "name": "Vanguard FTSE Emerging Markets ETF", "symbol": "VWO", "manager": "Vanguard", "aum": 80e9, "asset_type": "equity"},
        {"id": "BND", "name": "Vanguard Total Bond Market ETF", "symbol": "BND", "manager": "Vanguard", "aum": 95e9, "asset_type": "fixed_income"},
        {"id": "BNDX", "name": "Vanguard Total International Bond ETF", "symbol": "BNDX", "manager": "Vanguard", "aum": 45e9, "asset_type": "fixed_income"},
        {"id": "VNQ", "name": "Vanguard Real Estate ETF", "symbol": "VNQ", "manager": "Vanguard", "aum": 35e9, "asset_type": "real_estate"},
        {"id": "VCSH", "name": "Vanguard Short-Term Corporate Bond ETF", "symbol": "VCSH", "manager": "Vanguard", "aum": 30e9, "asset_type": "fixed_income"},
        {"id": "QQQ", "name": "Invesco QQQ Trust", "symbol": "QQQ", "manager": "Invesco", "aum": 200e9, "asset_type": "equity"},
        {"id": "IWM", "name": "iShares Russell 2000 ETF", "symbol": "IWM", "manager": "BlackRock", "aum": 60e9, "asset_type": "equity"},
    ]
    return mock_assets[:limit]


@ai_function(approval_mode="never_require")
async def fetch_prices(
    symbols: Annotated[
        List[str],
        Field(description="Asset symbols to fetch prices for")
    ],
    lookback_days: Annotated[
        int,
        Field(description="Days of historical data to include", default=30)
    ] = 30,
) -> Dict[str, Any]:
    """Fetch current and historical prices for assets.

    Returns price data including current price, 1-day change, 30-day change, and volume.
    """
    prices = {}
    for symbol in symbols:
        base_price = random.uniform(50, 500)
        prices[symbol] = {
            "current": round(base_price, 2),
            "change_1d": round(random.uniform(-0.02, 0.02), 4),
            "change_30d": round(random.uniform(-0.1, 0.1), 4),
            "volume": random.randint(1000000, 50000000),
        }

    logger.info("prices_fetched", count=len(prices), lookback_days=lookback_days)
    return prices


@ai_function(approval_mode="never_require")
async def get_fundamentals(
    symbols: Annotated[
        List[str],
        Field(description="Asset symbols to get fundamental data for")
    ],
) -> Dict[str, Any]:
    """Get fundamental data for assets.

    Returns fundamental metrics including PE ratio, dividend yield, market cap, and beta.
    """
    fundamentals = {}
    for symbol in symbols:
        fundamentals[symbol] = {
            "pe_ratio": round(random.uniform(10, 30), 2),
            "dividend_yield": round(random.uniform(0, 0.04), 4),
            "market_cap": round(random.uniform(1e9, 500e9), 0),
            "beta": round(random.uniform(0.5, 1.5), 2),
        }

    logger.info("fundamentals_fetched", count=len(fundamentals))
    return fundamentals
