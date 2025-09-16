from enum import StrEnum
from typing import List, Optional
from pydantic import BaseModel, Field

class USStateName(StrEnum):
    Alabama = "Alabama"
    Alaska = "Alaska"
    Arizona = "Arizona"
    Arkansas = "Arkansas"
    California = "California"
    Colorado = "Colorado"
    Connecticut = "Connecticut"
    Delaware = "Delaware"
    Florida = "Florida"
    Georgia = "Georgia"
    Hawaii = "Hawaii"
    Idaho = "Idaho"
    Illinois = "Illinois"
    Indiana = "Indiana"
    Iowa = "Iowa"
    Kansas = "Kansas"
    Kentucky = "Kentucky"
    Louisiana = "Louisiana"
    Maine = "Maine"
    Maryland = "Maryland"
    Massachusetts = "Massachusetts"
    Michigan = "Michigan"
    Minnesota = "Minnesota"
    Mississippi = "Mississippi"
    Missouri = "Missouri"
    Montana = "Montana"
    Nebraska = "Nebraska"
    Nevada = "Nevada"
    New_Hampshire = "New Hampshire"
    New_Jersey = "New Jersey"
    New_Mexico = "New Mexico"
    New_York = "New York"
    North_Carolina = "North Carolina"
    North_Dakota = "North Dakota"
    Ohio = "Ohio"
    Oklahoma = "Oklahoma"
    Oregon = "Oregon"
    Pennsylvania = "Pennsylvania"
    Rhode_Island = "Rhode Island"
    South_Carolina = "South Carolina"
    South_Dakota = "South Dakota"
    Tennessee = "Tennessee"
    Texas = "Texas"
    Utah = "Utah"
    Vermont = "Vermont"
    Virginia = "Virginia"
    Washington = "Washington"
    West_Virginia = "West Virginia"
    Wisconsin = "Wisconsin"
    Wyoming = "Wyoming"
    Washington_DC = "Washington D.C."
    Israel = "Israel"
    Canada = "Canada"

class LPMainDashboard(BaseModel):
    name: Optional[str] = Field(None, alias="Name")
    amount: Optional[str] = Field(None, alias="Amount $")
    email: Optional[str] = Field(None, alias="Email")
    notes: Optional[str] = Field(None, alias="Notes")
    status: Optional[str] = Field(None, alias="Status") # Need to understand logic behind enumeration for this--what does each field mean??
    fund: Optional[str] = Field(None, alias="Fund")
    sent_email: Optional[str] = Field(None, alias="Sent Email?")
    follow_up_date: Optional[str] = Field(None, alias="Follow Up date") # additional logic outside of capture?
    upcoming_meeting: Optional[str] = Field(None, alias="Upcoming Meeting")
    last_reach_out: Optional[str] = Field(None, alias="Last Reach Out")
    country: Optional[str] = Field(None, alias="Country")
    state: Optional[USStateName] = Field(None, alias="State")
    city: Optional[str] = Field(None, alias="City")

    model_config = {
        "populate_by_name": True
    }

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

class DealFlow(BaseModel):
    name: Optional[str] = Field(None, alias="Company name")
    ceo_primary_contact: Optional[str] = Field(None, alias="CEO/ Primary Contact")
    email: Optional[str] = Field(None, alias="Email")
    date_sourced: Optional[str] = Field(None, alias="Date Sourced")
    revenue_run_rate: Optional[int] = Field(None, alias="Revenue Run Rate", description="Provide the full integer amount DO NOT SHORTEN, e.g., 5000 for $5000 rather than 5 or 5k")
    financing_round: Optional[DealFlowFinancingRound] = Field(None, alias="Financing Round")
    evaluation: Optional[DealFlowEvaluation] = Field(None, alias="Evaluation")
    state: Optional[USStateName] = Field(None, alias="State")
    city: Optional[str] = Field(None, alias="City")
    referral_source: Optional[DealFlowReferralSource] = Field(None, alias="Referral Source")
    name_of_referral: Optional[str] = Field(None, alias="Name of Referral")
    sourced_by: Optional[str] = Field(None, alias="Sourced By")
    dei: Optional[str] = Field(None, alias="DEI")
    equity_debt: Optional[str] = Field(None, alias="Equity/ Debt")
    notes: Optional[str] = Field(None, alias="Notes")
    files: Optional[str] = Field(None, alias="Files")

    model_config = {
        "populate_by_name": True
    }

class VCFund(BaseModel):
    name: Optional[str] = Field(None, alias="Name")
    stage: Optional[str] = Field(None, alias="Stage")
    date: Optional[str] = Field(None, alias="Date")
    name_of_contact: Optional[str] = Field(None, alias="Name of Contact")
    title: Optional[str] = Field(None, alias="Title")
    email: Optional[str] = Field(None, alias="Email")
    phone: Optional[str] = Field(None, alias="Phone")
    country: Optional[str] = Field(None, alias="Country")          
    state: Optional[USStateName] = Field(None, alias="State")
    industry_focus: Optional[str] = Field(None, alias="Industry Focus")
    check_size: Optional[str] = Field(None, alias="Check Size")
    linkedin: Optional[str] = Field(None, alias="LinkedIn")
    notes: Optional[str] = Field(None, alias="Notes")

    model_config = {
        "populate_by_name": True
    }


class Network(BaseModel):
    name: Optional[str] = Field(None, alias="Name")
    linkedin: Optional[str] = Field(None, alias="LinkedIn")
    email: Optional[str] = Field(None, alias="Email")
    phone: Optional[str] = Field(None, alias="Phone")
    company: Optional[str] = Field(None, alias="Company")
    title: Optional[str] = Field(None, alias="Title")
    status: Optional[str] = Field(None, alias="Status") # @TODO: another status field that needs to be enumerated ()
    country: Optional[str] = Field(None, alias="Country")  
    state: Optional[USStateName] = Field(None, alias="State")     
    city: Optional[str] = Field(None, alias="City")      
    notes: Optional[str] = Field(None, alias="Notes")
    date: Optional[str] = Field(None, alias="Date")
    date_last_met: Optional[str] = Field(None, alias="Date (Last Met)")    
    date_last_contact: Optional[str] = Field(None, alias="Date (Last Contact)")

    model_config = {
        "populate_by_name": True
    }
