from google.adk.agents import Agent
from .model import base_model
from .prompt import ROOT_PROMPT
from .sub_agents.inquiry import inquiry_agent
from .sub_agents.map import map_agent
from .sub_agents.medicine import medicine_agent

root_agent = Agent(
    name="root",
    model=base_model,
    description=(""),
    instruction=(ROOT_PROMPT),
    sub_agents=[inquiry_agent, map_agent, medicine_agent],
)