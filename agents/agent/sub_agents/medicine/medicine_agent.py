from google.adk.agents import Agent
from ...model import base_model
from .prompt import MEDICINE_PROMPT
from .tools.consult_drug_tool import consult_drug_tool
from .tools.ocr_tool import ocr_tool

medicine_agent = Agent(
    name="medicine",
    model=base_model,
    description=(""),
    instruction=(MEDICINE_PROMPT),
    tools=[consult_drug_tool, ocr_tool],
    sub_agents=[]
)