from google.adk.agents import Agent
from ...model import base_model
from .prompt import INQUIRY_PROMPT
from .tools.ask_doctor_tool import ask_doctor_tool
from .tools.skin_disease_tool import skin_disease_tool
from .tools.tongue_disease_tool import tongue_disease_tool

inquiry_agent = Agent(
    name="inquiry",
    model=base_model,
    description=(""),
    instruction=(INQUIRY_PROMPT),
    tools=[
        ask_doctor_tool,
        skin_disease_tool,
        tongue_disease_tool
    ],
    sub_agents=[]
)
