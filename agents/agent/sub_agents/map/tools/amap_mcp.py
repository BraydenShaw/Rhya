from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset
from google.adk.tools.mcp_tool.mcp_session_manager import SseServerParams

amap_mcp_tools = MCPToolset(
    connection_params=SseServerParams(
        url="https://mcp.amap.com/sse?key=2089a5b76f6b77a5a896a61203f040f9",  # 替换为你的 SSE server 地址
    ),
)