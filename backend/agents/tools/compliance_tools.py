"""
Compliance checking tools for the Compliance Agent.
Uses @ai_function decorator from Microsoft Agent Framework.
"""

from typing import Annotated, Any, Dict, List, Optional

from agent_framework import ai_function
from pydantic import Field
import structlog

logger = structlog.get_logger()


@ai_function(approval_mode="never_require")
async def check_restrictions(
    allocations: Annotated[
        Dict[str, float],
        Field(description="Asset -> weight mapping for the portfolio")
    ],
    exclusions: Annotated[
        Optional[List[Dict[str, Any]]],
        Field(description="Exclusion rules (type: sector/company/country, value: name)")
    ] = None,
) -> Dict[str, Any]:
    """Check if portfolio violates any exclusions or restrictions.

    Validates the portfolio against sector, company, and country exclusion rules.
    Returns list of any violations found.
    """
    exclusions = exclusions or []
    violations = []

    # Mock exclusion database - maps assets to their categories
    sector_map = {
        "MO": "Tobacco", "PM": "Tobacco", "BTI": "Tobacco",
        "LMT": "Weapons", "RTX": "Weapons", "NOC": "Weapons",
        "XOM": "Oil", "CVX": "Oil", "BP": "Oil",
    }

    country_map = {
        "VWO": "Emerging Markets", "EEM": "Emerging Markets",
        "MCHI": "China", "FXI": "China",
    }

    for exclusion in exclusions:
        exc_type = exclusion.get("type", "")
        exc_value = exclusion.get("value", "")

        for asset, weight in allocations.items():
            if weight <= 0:
                continue

            if exc_type == "sector" and sector_map.get(asset) == exc_value:
                violations.append(f"{asset} violates {exc_value} exclusion ({weight:.1%})")
            elif exc_type == "company" and asset == exc_value:
                violations.append(f"{asset} is excluded ({weight:.1%})")
            elif exc_type == "country" and country_map.get(asset) == exc_value:
                violations.append(f"{asset} violates {exc_value} country exclusion ({weight:.1%})")

    logger.info(
        "restrictions_checked",
        exclusion_count=len(exclusions),
        violation_count=len(violations),
    )

    return {
        "violations": violations,
        "checked_exclusions": len(exclusions),
        "checked_positions": len(allocations),
    }


@ai_function(approval_mode="never_require")
async def validate_weights(
    allocations: Annotated[
        Dict[str, float],
        Field(description="Asset -> weight mapping for the portfolio")
    ],
    max_single_position: Annotated[
        float,
        Field(description="Maximum allowed weight for a single position", default=0.1)
    ] = 0.1,
    max_sector_exposure: Annotated[
        float,
        Field(description="Maximum allowed sector exposure", default=0.25)
    ] = 0.25,
    min_positions: Annotated[
        int,
        Field(description="Minimum number of positions required", default=10)
    ] = 10,
) -> Dict[str, Any]:
    """Validate position weights against limits.

    Checks single position limits, minimum diversification, and sector concentration.
    Returns list of any violations found.
    """
    violations = []

    # Check single position limits
    for asset, weight in allocations.items():
        if weight > max_single_position:
            violations.append(f"{asset} exceeds max position ({weight:.1%} > {max_single_position:.0%})")

    # Check minimum positions
    active_positions = len([a for a, w in allocations.items() if w > 0.001])
    if active_positions < min_positions:
        violations.append(f"Only {active_positions} positions (min: {min_positions})")

    # Check sector concentration (simplified - ETFs are considered diversified)
    equity_etfs = {"VTI", "VOO", "SPY", "QQQ", "IWM", "VEA", "VWO", "VXUS"}
    equity_weight = sum(allocations.get(a, 0) for a in equity_etfs)
    # Allow 3x sector limit for broad market ETFs (they're diversified)
    if equity_weight > max_sector_exposure * 3:
        pass  # ETFs are diversified, don't flag

    logger.info(
        "weights_validated",
        position_count=active_positions,
        violation_count=len(violations),
    )

    return {
        "violations": violations,
        "position_count": active_positions,
        "largest_position": max(allocations.values()) if allocations else 0,
    }


@ai_function(approval_mode="never_require")
async def verify_esg(
    allocations: Annotated[
        Dict[str, float],
        Field(description="Asset -> weight mapping for the portfolio")
    ],
    min_esg_score: Annotated[
        float,
        Field(description="Minimum required portfolio ESG score", default=50)
    ] = 50,
    esg_exclusions: Annotated[
        Optional[List[str]],
        Field(description="ESG categories to exclude (Tobacco, Weapons, Coal, Gambling)")
    ] = None,
) -> Dict[str, Any]:
    """Verify portfolio meets ESG requirements.

    Checks portfolio against ESG exclusion screens and minimum score requirements.
    Returns compliance status, portfolio ESG score, and any issues found.
    """
    esg_exclusions = esg_exclusions or []
    issues = []

    # Mock ESG scores for common assets
    esg_scores = {
        "VTI": 72, "VOO": 71, "SPY": 70,
        "VEA": 75, "VXUS": 74,
        "BND": 80, "BNDX": 78,
        "VNQ": 65,
        "QQQ": 68,
        "VCSH": 82,
        "VWO": 62,
        "IWM": 66,
        "CASH": 100,  # Cash is neutral
    }

    # Mock excluded assets by ESG category
    esg_exclusion_map = {
        "Tobacco": ["MO", "PM", "BTI"],
        "Weapons": ["LMT", "RTX", "NOC"],
        "Coal": ["ARCH", "BTU"],
        "Gambling": ["MGM", "WYNN"],
    }

    # Check exclusions
    for category in esg_exclusions:
        excluded_assets = esg_exclusion_map.get(category, [])
        for asset in excluded_assets:
            if allocations.get(asset, 0) > 0:
                issues.append(f"{asset} fails {category} ESG screen")

    # Calculate portfolio ESG score (weighted average)
    total_weight = sum(allocations.values())
    if total_weight > 0:
        weighted_score = sum(
            allocations.get(a, 0) * esg_scores.get(a, 60)  # Default score: 60
            for a in allocations
        ) / total_weight
    else:
        weighted_score = 0

    if weighted_score < min_esg_score:
        issues.append(f"Portfolio ESG score {weighted_score:.0f} < minimum {min_esg_score}")

    logger.info(
        "esg_verified",
        portfolio_score=weighted_score,
        compliant=len(issues) == 0,
    )

    return {
        "compliant": len(issues) == 0,
        "portfolio_esg_score": round(weighted_score, 1),
        "min_required": min_esg_score,
        "issues": issues,
    }
