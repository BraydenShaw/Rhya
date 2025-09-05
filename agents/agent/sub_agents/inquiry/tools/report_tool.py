import html as _html
from string import Template

def render_html_std(template_str: str, **variables) -> str:
    """
    使用标准库 string.Template 渲染，变量写法为 $var 或 ${var}。
    会对变量做 HTML 转义；不支持循环/条件。
    """
    safe_vars = {k: _html.escape(str(v)) for k, v in variables.items()}
    return Template(template_str).safe_substitute(safe_vars)

tpl = """
<h1>$title</h1>
<p>$intro</p>
"""

html = render_html_std(tpl, title="报告页", intro="这是简介。")

print(html)