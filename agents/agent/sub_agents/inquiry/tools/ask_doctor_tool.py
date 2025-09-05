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

def ask_doctor(user_input: str, session_id: Optional[str] = None) -> Dict[str, Any]:
    """
    调用多轮在线问诊AI模型。
    该工具模拟患者与AI医生进行对话。它会处理会话ID，并根据模型的响应判断对话是否结束。

    :param user_input: str, 患者的输入，例如“我头晕”或对医生问题的回答。
    :param session_id: Optional[str], 对话的会话ID。如果是首轮对话，请保持为None；
                       如果是多轮对话，请传入上一轮返回的session_id。
    :return: Dict[str, Any], 一个包含以下键的字典:
             - 'scene' (int): 对话场景状态码。0表示对话继续，202表示对话结束。
             - 'model_response' (list): AI医生返回的内容。
             - 'session_id' (str): 当前对话的会话ID，用于下一轮调用。
             - 'error' (str): 如果发生错误，则包含错误信息。
    
    **重要使用说明**:
    如果返回结果中 'scene' 的值为 0，意味着对话尚未结束，Agent必须根据'model_response'的内容再次调用此工具以继续问诊。
    如果 'scene' 的值为 202，意味着问诊结束，Agent可以向用户展示最终诊断报告。
    """
    stream = False
    
    # 如果 session_id 是 None (首次对话)，API需要一个空字符串
    current_session_id = session_id or ""

    message = {
        "model": "third-common-v3-consultationAssistant",
        "stream": False,  # Tool中通常使用非流式以获得完整响应
        "session_id": current_session_id,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "body": user_input
                    }
                ]
            }
        ]
    }

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
            return line.decode('utf-8')
    else:
        response = requests.post(reqUrl, data=json.dumps(message), headers=headers)
        data = json.loads(response.text)

        return {
            "scene": data['result'][0]['messages'][0]['scene'],
            "model_response": data['result'][0]['messages'][0]['content'],
            "session_id": data['result'][0]['session_id']
        }

ask_doctor_tool = FunctionTool(func=ask_doctor)