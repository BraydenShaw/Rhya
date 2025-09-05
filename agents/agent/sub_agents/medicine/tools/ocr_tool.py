import requests
from typing import Dict, Any
from google.adk.tools import FunctionTool

from dotenv import load_dotenv
import os

load_dotenv()

API_KEY = os.getenv("API_KEY")
SECRET_KEY = os.getenv("SECRET_KEY")

def get_access_token():
    url = "https://aip.baidubce.com/oauth/2.0/token"
    params = {
        "grant_type": "client_credentials",
        "client_id": API_KEY,
        "client_secret": SECRET_KEY,
    }
    return str(requests.post(url, params=params).json().get("access_token"))

def recognize_text(
    url: str,
    detect_direction: bool = False,
    paragraph: bool = False,
    probability: bool = False,
) -> Dict[str, Any]:
    """
    调用百度OCR API识别图片中的文字, 可用于药品包装的识别。

    :param url: str, 网络图片路径（如 "http://images/test.jpg"）。
    :param detect_direction: bool, 是否检测文字方向（默认False）。
    :param paragraph: bool, 是否返回段落信息（默认False）。
    :param probability: bool, 是否返回置信度（默认False）。
    
    :return: Dict[str, Any], 返回识别结果，包含以下字段：
             - 'text' (str): 识别出的文字内容。
             - 'error' (str): 如果出错，返回错误信息。
    """
    try:
        # 1. 获取 access_token
        url_access = "https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token=" + get_access_token()
        

        # 2. 读取图片并转换为 Base64
        # with open(image_path, "rb") as f:
        #     image_base64 = base64.b64encode(f.read()).decode("utf-8")

        # 3. 构造请求 payload
        payload = {
            "url": url,
            "detect_direction": "true" if detect_direction else "false",
            "paragraph": "true" if paragraph else "false",
            "probability": "true" if probability else "false",
        }

        # 4. 发送请求
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        }
        response = requests.post(url_access, headers=headers, data=payload)
        result = response.json()
        result_num = result.get("words_result_num", 0)

        # 5. 解析结果
        if result_num == 0:
            return {
                "text": "",
                "error": f"OCR识别失败: {result['error_msg']}",
            }

        # 提取识别文本
        text = "\n".join([item["words"] for item in result.get("words_result", [])])

        return {
            "text": text,
            "error": "",
        }

    except Exception as e:
        return {
            "text": "",
            "error": f"OCR识别异常: {str(e)}",
        }

ocr_tool = FunctionTool(func=recognize_text)