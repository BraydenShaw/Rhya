import json
import hashlib
import json
import time
import requests
import hmac
from typing import Optional
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

def skin_disease_query(
    url: str, 
    query: str, 
    session_id: Optional[str] = None) -> str:
    """
    调用皮肤病诊断 API 进行图片和文本的问诊。

    Args:
        url: str, 图片的路径（如 "http://images/test.jpg"）。
        query: str, 用户提出的关于皮肤病的具体问题。
        session_id: Optional[str], 对话 session_id。首轮对话可为空，后续对话传入可保留上下文。

    Returns:
        返回 API 的 JSON 字符串格式的应答。如果请求失败，则返回包含错误信息的字符串。
    """

    stream = False
    message = {
        "model": "third-skin-v1-diagnose", # third-skin-v1-diagnose, third-skin-v2-diagnose
        "stream": stream,
        "session_id": session_id or "", # 应用型API生效，首轮对话时为空，后续对话时可传入首轮对话返回的session_id，保留上下文信息
        "messages": [
            {
                "role": "user",            # 角色
                "content": [               # 消息内容
                    {
                        "type": "image",
                        "url": url,
                    },
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
                return(line.decode('utf-8'))
        else:
            response = requests.post(reqUrl, data=json.dumps(message), headers=headers)
            return(response.text)

    except requests.exceptions.RequestException as e:
        return json.dumps({"error": f"API request failed: {str(e)}"}, indent=2)
    except Exception as e:
        return json.dumps({"error": f"An unexpected error occurred: {str(e)}"}, indent=2)

skin_disease_tool = FunctionTool(func=skin_disease_query)