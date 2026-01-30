"""
InvestorPolicyStatement (IPS) schema for portfolio optimization.
Captures investor profile, risk appetite, constraints, and preferences.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
import uuid


class InvestorType(str, Enum):
    """Type of investor."""
    INSTITUTIONAL = "institutional"
    INDIVIDUAL = "individual"
    FAMILY_OFFICE = "family_office"
    PENSION = "pension"
    ENDOWMENT = "endowment"


class RiskTolerance(str, Enum):
    """Risk tolerance level."""
    CONSERVATIVE = "conservative"
    MODERATE = "moderate"
    AGGRESSIVE = "aggressive"
    VERY_AGGRESSIVE = "very_aggressive"


class TimeHorizon(str, Enum):
    """Investment time horizon."""
    SHORT = "short"  # < 3 years
    MEDIUM = "medium"  # 3-7 years
    LONG = "long"  # 7-15 years
    VERY_LONG = "very_long"  # > 15 years


class RebalanceFrequency(str, Enum):
    """Portfolio rebalancing frequency."""
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    SEMI_ANNUALLY = "semi_annually"
    ANNUALLY = "annually"
    ON_THRESHOLD = "on_threshold"


class InvestorProfile(BaseModel):
    """Step 1: Investor profile information."""
    investor_type: InvestorType = Field(default=InvestorType.INDIVIDUAL)
    name: Optional[str] = Field(default=None, description="Investor or entity name")
    base_currency: str = Field(default="USD", description="Base currency for portfolio")
    portfolio_value: float = Field(default=1_000_000, ge=10_000, description="Total portfolio value")
    tax_status: Optional[str] = Field(default=None, description="Tax treatment (taxable, tax-deferred, etc.)")
    domicile: Optional[str] = Field(default=None, description="Investor domicile/jurisdiction")


class RiskAppetite(BaseModel):
    """Step 2: Risk appetite and constraints."""
    risk_tolerance: RiskTolerance = Field(default=RiskTolerance.MODERATE)
    max_volatility: float = Field(default=15.0, ge=1, le=50, description="Maximum annualized volatility %")
    max_drawdown: float = Field(default=20.0, ge=5, le=60, description="Maximum drawdown tolerance %")
    var_limit: Optional[float] = Field(default=None, description="Value at Risk limit (95% 1-day) as %")
    time_horizon: TimeHorizon = Field(default=TimeHorizon.MEDIUM)
    liquidity_needs: float = Field(default=0.1, ge=0, le=1, description="% of portfolio needed liquid in 1 day")


class PortfolioConstraints(BaseModel):
    """Step 3: Hard constraints on portfolio construction."""
    # Asset class limits
    min_equity: float = Field(default=0.0, ge=0, le=1, description="Minimum equity allocation")
    max_equity: float = Field(default=1.0, ge=0, le=1, description="Maximum equity allocation")
    min_fixed_income: float = Field(default=0.0, ge=0, le=1, description="Minimum fixed income allocation")
    max_fixed_income: float = Field(default=1.0, ge=0, le=1, description="Maximum fixed income allocation")
    min_cash: float = Field(default=0.0, ge=0, le=1, description="Minimum cash allocation")
    max_cash: float = Field(default=0.3, ge=0, le=1, description="Maximum cash allocation")
    max_alternatives: float = Field(default=0.2, ge=0, le=1, description="Maximum alternatives allocation")

    # Position limits
    max_single_position: float = Field(default=0.1, ge=0.01, le=1, description="Maximum single position size")
    max_sector_exposure: float = Field(default=0.25, ge=0.05, le=1, description="Maximum sector exposure")
    min_positions: int = Field(default=10, ge=1, description="Minimum number of positions")
    max_positions: int = Field(default=100, ge=5, description="Maximum number of positions")

    # Leverage and derivatives
    allow_leverage: bool = Field(default=False)
    max_leverage: float = Field(default=1.0, ge=1, le=3, description="Maximum leverage ratio")
    allow_derivatives: bool = Field(default=False)
    allow_shorting: bool = Field(default=False)


class ExclusionRule(BaseModel):
    """A single exclusion rule."""
    type: str = Field(description="Type: sector, company, country, theme")
    value: str = Field(description="Value to exclude (e.g., 'Tobacco', 'AAPL', 'Russia')")
    reason: Optional[str] = Field(default=None, description="Reason for exclusion")


class InvestmentPreferences(BaseModel):
    """Step 4: Investment preferences and themes."""
    # ESG preferences
    esg_focus: bool = Field(default=False, description="Apply ESG screening")
    min_esg_score: Optional[float] = Field(default=None, ge=0, le=100, description="Minimum ESG score")

    # Exclusions
    exclusions: List[ExclusionRule] = Field(default_factory=list, description="Specific exclusions")

    # Themes and factors
    preferred_themes: List[str] = Field(default_factory=list, description="Preferred themes (AI, CleanEnergy, etc.)")
    factor_tilts: Dict[str, float] = Field(
        default_factory=dict,
        description="Factor tilts (value, growth, momentum, quality, size)"
    )

    # Geographic preferences
    home_bias: float = Field(default=0.6, ge=0, le=1, description="Preference for home market")
    regional_limits: Dict[str, float] = Field(
        default_factory=dict,
        description="Regional allocation limits (US, Europe, EM, etc.)"
    )

    # Income preferences
    dividend_focus: bool = Field(default=False)
    min_yield: Optional[float] = Field(default=None, description="Minimum yield target %")


class BenchmarkSettings(BaseModel):
    """Step 5: Benchmark and performance targets."""
    benchmark: str = Field(default="SPY", description="Primary benchmark ticker or index")
    secondary_benchmarks: List[str] = Field(default_factory=list, description="Secondary benchmarks")
    target_return: Optional[float] = Field(default=None, description="Target annual return %")
    tracking_error_limit: Optional[float] = Field(default=None, description="Maximum tracking error vs benchmark")

    # Rebalancing
    rebalance_frequency: RebalanceFrequency = Field(default=RebalanceFrequency.QUARTERLY)
    rebalance_threshold: float = Field(default=0.05, ge=0.01, le=0.2, description="Drift threshold to trigger rebalance")


class InvestorPolicyStatement(BaseModel):
    """
    Complete Investor Policy Statement (IPS) capturing all portfolio requirements.
    This is the primary input to the portfolio optimization orchestrator.
    """
    # Identification
    policy_id: str = Field(default_factory=lambda: f"ips-{uuid.uuid4().hex[:8]}")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # The 6 steps
    investor_profile: InvestorProfile = Field(default_factory=InvestorProfile)
    risk_appetite: RiskAppetite = Field(default_factory=RiskAppetite)
    constraints: PortfolioConstraints = Field(default_factory=PortfolioConstraints)
    preferences: InvestmentPreferences = Field(default_factory=InvestmentPreferences)
    benchmark_settings: BenchmarkSettings = Field(default_factory=BenchmarkSettings)

    # Additional context
    special_instructions: Optional[str] = Field(default=None, description="Free-form special instructions")
    chat_context: Optional[str] = Field(default=None, description="Context from chat interaction")

    # Metadata
    source: str = Field(default="guided", description="Source: 'guided', 'chat', or 'api'")
    version: int = Field(default=1)

    def summary(self) -> str:
        """Generate human-readable summary of the IPS."""
        return (
            f"IPS for {self.investor_profile.investor_type.value} investor | "
            f"${self.investor_profile.portfolio_value:,.0f} portfolio | "
            f"{self.risk_appetite.risk_tolerance.value} risk | "
            f"Equity: {self.constraints.min_equity*100:.0f}-{self.constraints.max_equity*100:.0f}% | "
            f"Benchmark: {self.benchmark_settings.benchmark}"
        )


# Factory functions for common IPS templates
def create_conservative_ips(portfolio_value: float = 1_000_000) -> InvestorPolicyStatement:
    """Create a conservative IPS template."""
    return InvestorPolicyStatement(
        investor_profile=InvestorProfile(
            investor_type=InvestorType.INDIVIDUAL,
            portfolio_value=portfolio_value,
        ),
        risk_appetite=RiskAppetite(
            risk_tolerance=RiskTolerance.CONSERVATIVE,
            max_volatility=8.0,
            max_drawdown=10.0,
            time_horizon=TimeHorizon.SHORT,
        ),
        constraints=PortfolioConstraints(
            min_equity=0.2,
            max_equity=0.4,
            min_fixed_income=0.4,
            max_fixed_income=0.7,
            min_cash=0.1,
        ),
        benchmark_settings=BenchmarkSettings(
            benchmark="AGG",  # Bond aggregate
            target_return=5.0,
        ),
    )


def create_balanced_ips(portfolio_value: float = 1_000_000) -> InvestorPolicyStatement:
    """Create a balanced IPS template."""
    return InvestorPolicyStatement(
        investor_profile=InvestorProfile(
            investor_type=InvestorType.INDIVIDUAL,
            portfolio_value=portfolio_value,
        ),
        risk_appetite=RiskAppetite(
            risk_tolerance=RiskTolerance.MODERATE,
            max_volatility=12.0,
            max_drawdown=15.0,
            time_horizon=TimeHorizon.MEDIUM,
        ),
        constraints=PortfolioConstraints(
            min_equity=0.4,
            max_equity=0.6,
            min_fixed_income=0.3,
            max_fixed_income=0.5,
        ),
        benchmark_settings=BenchmarkSettings(
            benchmark="SPY",
            target_return=7.0,
        ),
    )


def create_aggressive_ips(portfolio_value: float = 1_000_000) -> InvestorPolicyStatement:
    """Create an aggressive growth IPS template."""
    return InvestorPolicyStatement(
        investor_profile=InvestorProfile(
            investor_type=InvestorType.INDIVIDUAL,
            portfolio_value=portfolio_value,
        ),
        risk_appetite=RiskAppetite(
            risk_tolerance=RiskTolerance.AGGRESSIVE,
            max_volatility=20.0,
            max_drawdown=25.0,
            time_horizon=TimeHorizon.LONG,
        ),
        constraints=PortfolioConstraints(
            min_equity=0.7,
            max_equity=0.95,
            min_fixed_income=0.0,
            max_fixed_income=0.2,
            max_alternatives=0.15,
        ),
        preferences=InvestmentPreferences(
            preferred_themes=["AI", "Technology", "Growth"],
            factor_tilts={"growth": 0.3, "momentum": 0.2},
        ),
        benchmark_settings=BenchmarkSettings(
            benchmark="QQQ",
            target_return=12.0,
        ),
    )
