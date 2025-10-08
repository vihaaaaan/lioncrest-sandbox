from enum import StrEnum
from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from ..schemas.common import USStateName

class Funds(StrEnum):
    Lioncrest = "Lioncrest"
    Prospeq = "Prospeq"
    Both = "All"

class SentStatus(StrEnum):
    Sent = "Sent"
    In_Communciation = "In Communication"
    Stuck = "Stuck"
    Need_To_Send = "Need to Send"

class LPStatus(StrEnum):
    Committed = "Commits"
    Pending = "Pending"
    Tier_1A = "Tier 1A"
    Tier_1B = "Tier 1B"
    Tier_2 = "Tier 2"
    Close_2 = "Second Close"
    Close_3 = "3rd Close"
    Pass = "PASS"
    Priority_To_Close = "Priority to Close"
    Committed_And_Pending = "Committed+Pending"
    Future_Fund = "Future Fund"


class LPMainDashboard(BaseModel):
    name: Optional[str] = Field(None, alias="Name", description="Full name of LP (Limited Partner) contact")
    amount: Optional[str] = Field(None, alias="Amount $", description="Provide the full integer amount DO NOT SHORTEN, e.g., 5000 for $5000 rather than 5 or 5k")
    email: Optional[str] = Field(None, alias="Email", description="Email address of the LP contact")
    notes: Optional[str] = Field(None, alias="Notes", description="Summarize any key points or action items; be conservative in what you include here, only the most important details")
    # (comitted, pending = verbally comitted, Tier 1A bottom of funnel, Tier 1B spend more time, Tier 2 means not had a full contact but giving less of a priority relevant, 
    # close 2 is week 2 of oct 
    # 3rd close means Im trying to get to to them after the next close 
    # When an LP is busy - 2nd close (timing more than appittl) 
    # Tier 2 - 
    status: Optional[str] = Field(None, alias="Status", description="Leave this null for now") 
    fund: Optional[Funds] = Field(None, alias="Fund", description="This is the name of the fund that the LP is investing or interested in. Lioncrest is our VC fund, Prospeq is our private credit fund, and All means they are interested in both funds.")
    sent_email: Optional[SentStatus] = Field(None, alias="Sent Email?", description="Indicate the status of the conversation within the email thread. If there is any doubt, leave this null.")
    follow_up_date: Optional[str] = Field(None, alias="Follow Up date", description="Leave this null for now")
    upcoming_meeting: Optional[str] = Field(None, alias="Upcoming Meeting", description="Only provide a specific date if an explicit upcoming meeting is mentioned, else null")
    last_reach_out: Optional[str] = Field(None, alias="Last Reach Out", description="The date that you last reached out to this person")
    country: Optional[str] = Field(None, alias="Country", description="Country of the LP contact")
    state: Optional[USStateName] = Field(None, alias="State", description="State of the LP contact, if a non-US contact, leave null")
    city: Optional[str] = Field(None, alias="City", description="City of the LP contact")

    model_config = {
        "populate_by_name": True
    }
