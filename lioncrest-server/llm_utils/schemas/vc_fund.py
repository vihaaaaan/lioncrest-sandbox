from enum import StrEnum
from typing import Optional
from pydantic import BaseModel, Field
from ..schemas.common import USStateName

class VCFundStage(StrEnum):
    PreSeed = "Pre-Seed"       
    Seed = "Seed"              
    SeedPlus = "Seed+"         
    SeedMinus = "Seed-"        
    SeriesA = "Series A"       
    SeriesAPlus = "Series A+"  
    SeriesAMinus = "Series A-" 
    SeriesB = "Series B"       
    SeriesBPlus = "Series B+"  
    SeriesBMinus = "Series B-" 
    SeriesCPlus = "Series C+"  
    Debt = "Debt"            

class VCFund(BaseModel):
    name: Optional[str] = Field(
        None, alias="Name",
        description="Fund or firm name (e.g., 'Sequoia Capital')."
    )
    stage: Optional[str] = Field(
        None, alias="Stage",
        description=(
            "Single string. If multiple apply, use a comma-separated list (no arrays). "
            "Allowed tokens: 'Pre-Seed', 'Seed', 'Seed+', 'Seed-', 'Series A', 'Series A+', "
            "'Series A-', 'Series B', 'Series B+', 'Series B-', 'Series C+', 'Debt'. "
            "Semantics: 'X+' means X or above; 'X-' means earlier/softer end of X. "
            "Redundancy rule: do NOT combine an 'X+' token with later specific stages "
            "(e.g., avoid 'Series B+, Series C+' since 'Series B+' already implies ≥B). "
            "Examples: 'Seed', 'Seed+, Series A', 'Series C+', 'Seed-, Series A'."
        )
    )
    date: Optional[str] = Field(
        None, alias="Date",
        description="Relevant date (ISO preferred: YYYY-MM-DD; otherwise 'Sep 2025' is acceptable)."
    )
    name_of_contact: Optional[str] = Field(
        None, alias="Name of Contact",
        description="Primary contact’s full name at the fund."
    )
    title: Optional[str] = Field(
        None, alias="Title",
        description="Contact’s role at the fund."
    )
    email: Optional[str] = Field(
        None, alias="Email",
        description="Work email for the contact (single address)."
    )
    phone: Optional[str] = Field(
        None, alias="Phone",
        description="Contact phone (international format if not US based & available)."
    )
    country: Optional[str] = Field(
        None, alias="Country",
        description="Country where the fund/contact is based (e.g., 'United States'). If the fund is global or based out of multiple countries use a '/' to separate (e.g., 'United States/Israel')."
    )
    state: Optional[USStateName] = Field(
        None, alias="State",
        description="US state/territory if applicable."
    )
    industry_focus: Optional[str] = Field(
        None, alias="Industry Focus",
        description="Single string, comma-separated verticals (e.g., 'Fintech, DevTools, Healthtech')."
    )
    check_size: Optional[str] = Field(
        None, alias="Check Size",
        description="Typical investment check size; ranges OK. Use finance shorthand (e.g., '500k–1.5MM', '1M', '5MM–10MM'). If there are multiple ranges/tiers seperate with a '|' (e.g., '500k–1.5MM | 5MM–10MM')."
    )
    linkedin: Optional[str] = Field(
        None, alias="LinkedIn",
        description="LinkedIn URL for the fund (full URL; leave null if unknown)."
    )
    notes: Optional[str] = Field(
        None, alias="Notes",
        description="Short, high-signal context (thesis, intro path, timing) or any important details/action items. Make sure it's concise and relevant."
    )

    model_config = {"populate_by_name": True}
