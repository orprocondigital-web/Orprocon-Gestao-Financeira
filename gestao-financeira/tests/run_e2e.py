import subprocess
import re

cmd = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    '--headless=new',
    '--disable-gpu',
    '--dump-dom',
    'file:///c:/Users/Win10/Desktop/Sistema%20de%20concilia%C3%A7%C3%A3o%20bancaria/tests/test_ui.html'
]

res = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
m = re.search(r'<div id="test-output".*?>(.*?)</div>', res.stdout, re.DOTALL)
if m:
    print(m.group(1))
else:
    print("test-output not found. Length:", len(res.stdout))
