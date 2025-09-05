from google.adk.agents import Agent
from ...model import base_model
from .prompt import MAP_PROMPT
from .tools.amap_mcp import amap_mcp_tools

map_agent = Agent(
    name="map",
    model=base_model,
    description=(""),
    instruction=(MAP_PROMPT),
    tools=[amap_mcp_tools],
    sub_agents=[]
)