from enum import StrEnum
from typing import List, Optional
from pydantic import BaseModel, Field
from ..schemas.common import USStateName, YesNo

class DealFlowEvaluation(StrEnum):
    Pass = "Pass"
    Closed = "Closed"
    Company_Passed = "Company passed"
    Did_Not_Close = "Did not close"
    Due_Diligence = "Due Diligence"
    Evaluating = "Evaluating"
    Legal_Docs = "Legal Docs"
    Out_of_Business = "Out of Business"
    Term_Sheet = "Term Sheet"
    Waitng_for_Info = "Waiting for Info"
    Funded = "Funded"

class DealFlowReferralSource(StrEnum):
    Angel_Investor = "Angel Investor"
    Broker = "Broker"
    Debt_Fund = "Debt Fund"
    Inbound = "Inbound"
    Investment_Banker = "Investment Banker"
    LP = "LP"
    Network = "Network"
    Outbound = "Outbound"
    VC_Fund = "VC Fund"
    Paz_Pina = "Paz Pina"

class DealFlowFinancingRound(StrEnum):
    Pre_Seed = "Pre Seed"
    Seed = "Seed"
    Series_A = "Series A"
    Series_B = "Series B"
    Series_C = "Series C"
    Post_Seed = "Post Seed"
    Bridge = "Bridge"

class EquityDebtType(StrEnum):
    Equity = "Equity"
    Debt = "Debt"
    Both = "Equity + Debt"

class DealFlow(BaseModel):
    name: Optional[str] = Field(
        None, 
        alias="Company name", 
        description="Full legal name of the company being evaluated"
    )
    ceo_primary_contact: Optional[str] = Field(
        None, 
        alias="CEO/ Primary Contact", 
        description="Name of the CEO or primary point of contact at the company"
    )
    email: Optional[str] = Field(
        None, 
        alias="Email", 
        description="Email address for the main company contact"
    )
    date_sourced: Optional[str] = Field(
        None, 
        alias="Date Sourced", 
        description="The date when this deal was first sourced or added to the pipeline"
    )
    revenue_run_rate: Optional[int] = Field(
        None, 
        alias="Revenue Run Rate", 
        description="Provide the full integer amount for the company’s annualized revenue run rate. Do not abbreviate (e.g., use 5000 not 5k)."
    )
    financing_round: Optional[DealFlowFinancingRound] = Field(
        None, 
        alias="Financing Round", 
        description="Current financing stage of the company"
    )
    evaluation: Optional[DealFlowEvaluation] = Field(
        None, 
        alias="Evaluation", 
        description="Current internal evaluation status of the deal (e.g., Due Diligence, Pass, Funded)"
    )
    state: Optional[USStateName] = Field(
        None, 
        alias="State", 
        description="U.S. state where the company’s headquarters is located; leave null if outside the U.S."
    )
    city: Optional[str] = Field(
        None, 
        alias="City", 
        description="City where the company’s headquarters is located"
    )
    referral_source: Optional[List[DealFlowReferralSource]] = Field(
        None, 
        alias="Referral Source", 
        description="The channel or person type that referred this deal (e.g., Angel Investor, VC Fund, Network)"
    )
    name_of_referral: Optional[str] = Field(
        None, 
        alias="Name of Referral", 
        description="Name of the specific individual or entity who referred the company"
    )
    sourced_by: Optional[List[str]] = Field(
        None, 
        alias="Sourced By", 
        description="Internal team member who sourced this deal"
    )
    dei: Optional[YesNo] = Field(
        None, 
        alias="DEI", 
        description="Indicate if the company explicitly has diverse, equity, and inclusion (DEI) attributes; leave null if unspecified"
    )
    equity_debt: Optional[str] = Field(
        None, 
        alias="Equity/ Debt", 
        description="Specify whether the opportunity is equity-based, debt-based, or a mix"
    )
    notes: Optional[str] = Field(
        None, 
        alias="Notes", 
        description="Summarize key insights, red flags, or important context about the deal; keep concise and relevant"
    )
    files: Optional[str] = Field(
        None, 
        alias="Files", 
        description="Leave this null for now"
    )
