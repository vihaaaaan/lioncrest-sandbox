from enum import StrEnum
from typing import List, Optional
from pydantic import BaseModel, Field
from ..schemas.common import USStateName

class NetworkStatus(StrEnum):
    Working_On_It = "Working on it"
    Get_Back_To = "Get Back To"
    Next_Fund = "Next Fund"
    Done = "Done"
    Upcoming_Meeting = "Upcoming Meeting"
    Not_Relevant = "Not Relevant"
    Follow_Up_Asap = "FOLLOWUP ASAP"
    Need_To_Get_Scheduled = "Need to get scheduled"
    Soft_Commitment = "SOFT COMMITMENT"

class NetworkCountry(StrEnum):
    USA = "United States"
    Canada = "Canada"
    United_Kingdom = "United Kingdom"
    Israel = "Israel"
    Israel_And_USA = "Israel/United States"
    Israel_And_United_Kingdom = "Israel/United Kingdom"

class NetworkInvestorType(StrEnum):
    Advisor = "Advisor"
    Enterprise = "Enterprise"
    Family_Office = "Family Office"
    Individual = "Individual"
    Institutional = "Institutional"
    Law_Firm = "Law Firm"


class Network(BaseModel):
    name: Optional[str] = Field(
        None,
        alias="Name",
        description="Full name of the contact"
    )
    linkedin: Optional[str] = Field(
        None,
        alias="LinkedIn",
        description="Public LinkedIn profile URL for the contact (full URL; leave null if unknown)"
    )
    email: Optional[str] = Field(
        None,
        alias="Email",
        description="Primary email address for the contact (leave null if unknown)"
    )
    phone: Optional[str] = Field(
        None,
        alias="Phone",
        description="Primary phone number for the contact; include country code if non-US (leave null if unknown)"
    )
    company: Optional[str] = Field(
        None,
        alias="Company",
        description="Current employer or organization associated with the contact"
    )
    title: Optional[str] = Field(
        None,
        alias="Title",
        description="Current role/title at the listed company (e.g., Partner, Senior Engineer); Include company if part of title (e.g., 'Founder at XYZ', 'Director at ABC')"
    )
    status: Optional[str] = Field(
        None,
        alias="Status",
        description="Current status of engagement with the contact; leave null for now"
    )
    country: Optional[NetworkCountry] = Field(
        None,
        alias="Country",
        description="Country of residence or primary work location for the contact"
    )
    state: Optional[USStateName] = Field(
        None,
        alias="State",
        description="U.S. state for the contact’s location; leave null for non-US"
    )
    city: Optional[str] = Field(
        None,
        alias="City",
        description="City for the contact’s location (leave null if unknown)"
    )
    investor_type: Optional[NetworkInvestorType] = Field(
        None,
        alias="Investor Type",
        description="Category of investor; leave null if not an investor or not explicitly stated"
    )
    notes: Optional[str] = Field(
        None,
        alias="Notes",
        description="Concise, high-signal notes or action items; avoid speculation and unnecessary detail"
    )
    date: Optional[str] = Field(
        None,
        alias="Date",
        description="Date this contact was added or first captured (ISO 8601 preferred, e.g., 2025-10-07), if this is the first reach out this may be the current date (leave null if unsure)"
    )
    date_last_met: Optional[str] = Field(
        None,
        alias="Date (Last Met)",
        description="Most recent date you met in person or virtually (ISO 8601; leave null if unsure)"
    )
    date_last_contact: Optional[str] = Field(
        None,
        alias="Date (Last Contact)",
        description="Most recent date of any interaction (email, call, meeting) (ISO 8601; leave null if none)"
    )

    model_config = {
        "populate_by_name": True
    }

