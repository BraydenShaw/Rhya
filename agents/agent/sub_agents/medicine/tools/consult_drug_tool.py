import json
import hashlib
import json
import time
import requests
import hmac
from typing import Optional, Dict, Any
from google.adk.tools import FunctionTool

from dotenv import load_dotenv
import os

load_dotenv()

ak = os.getenv("ak")
sk = os.getenv("sk")

def getmd5(data):
    return hashlib.md5(data.encode('utf-8')).hexdigest()

def hmacsha256(secret, message):
    data = message.encode('utf-8')
    return hmac.new(secret.encode('utf-8'), data, digestmod=hashlib.sha256).hexdigest()

def consult_drug(
    query: str,
    model: str = "third-common-v1-DrugQA",
    session_id: Optional[str] = None
) -> str:
    """
    针对具体的药物相关问题，调用基于药品说明书的问答 API 进行咨询。
    适用于查询药品的适应症、禁忌症、注意事项、用法用量、特殊人群使用、多药联用等科普性质的问题。

    Args:
        query: 用户提出的关于药物的具体问题。例如："感康里面含有对乙酰氨基酚吗？"
        model: 使用的模型名称。默认为 'third-common-v1-DrugQA'。
               可选值: 'third-common-v1-DrugQA', 'third-common-v2-DrugQA'。
        session_id: 对话 session_id。首轮对话可为空，后续对话传入可保留上下文。

    Returns:
        返回 API 的 JSON 字符串格式的应答。如果请求失败，则返回包含错误信息的字符串。
    """
    host = 'https://01bot.baidu.com'
    router = '/api/01bot/sse-gateway/stream'
    reqUrl = host + router

    message: Dict[str, Any] = {
        "model": model,
        "stream": False,  # MCP 工具通常适用于一次性返回结果，因此设置为 False
        "session_id": session_id or "",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "body": query,
                    }
                ]
            }
        ]
    }

    try:
        md5 = getmd5(json.dumps(message))
        timestr = time.strftime("%d %b %Y %H:%M:%S GMT", time.localtime())
        stream = False
        if not ak:
            raise ValueError("Environment variable 'ak' is not set.")
        authStringPrefix = "ihcloud/" + ak + "/" + timestr + "/300"
        signingKey = hmacsha256(sk, authStringPrefix)
        host = 'https://01bot.baidu.com'
        router = '/api/01bot/sse-gateway/stream'
        reqUrl = host + router
        canonicalRequest = '\n'.join(["POST", router, "content-md5:" + md5])
        signature = hmacsha256(signingKey, canonicalRequest)
        headers = {
            "Content-Type": "application/json",
            "X-IHU-Authorization-V2": authStringPrefix + "/" + signature
        }
        if stream:
            response = requests.post(reqUrl, data=json.dumps(message), headers=headers, stream=True)
            for line in response.iter_lines():
                return line.decode('utf-8')
        else:
            response = requests.post(reqUrl, data=json.dumps(message), headers=headers)
            return response.text

    except requests.exceptions.RequestException as e:
        return json.dumps({"error": f"API request failed: {str(e)}"}, indent=2)
    except Exception as e:
        return json.dumps({"error": f"An unexpected error occurred: {str(e)}"}, indent=2)

    # Ensure a string is always returned
    return json.dumps({"error": "No response generated."}, indent=2)

consult_drug_tool = FunctionTool(func=consult_drug)