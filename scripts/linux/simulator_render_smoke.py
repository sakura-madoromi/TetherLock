#!/usr/bin/env python3
"""Real Tauri/WebKit rendering acceptance; isolated driver data is recommended."""
import base64
import json
import os
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENDPOINT = os.environ.get('TAURI_DRIVER_URL', 'http://127.0.0.1:4470')
OUTPUT = ROOT / 'generated/validation/simulator-rendering'
BINARY = os.environ.get('TAURI_TEST_BINARY', str(ROOT / 'apps/simulator/src-tauri/target/debug/tetherlock-simulator-tauri'))


def call(method, path, data=None):
    req = urllib.request.Request(ENDPOINT + path, method=method,
        data=None if data is None else json.dumps(data).encode(),
        headers={'Content-Type': 'application/json'})
    value = json.load(urllib.request.urlopen(req, timeout=40))['value']
    if isinstance(value, dict) and value.get('error'):
        raise RuntimeError(value)
    return value


session = call('POST', '/session', {'capabilities': {'alwaysMatch': {'tauri:options': {'application': BINARY}}}})['sessionId']
prefix = f'/session/{session}'


def js(script, *args):
    return call('POST', prefix + '/execute/sync', {'script': script, 'args': list(args)})


def invoke(command, args=None):
    value = call('POST', prefix + '/execute/async', {
        'script': "const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(value=>done({ok:true,value})).catch(error=>done({ok:false,error:String(error)}));",
        'args': [command, args or {}]})
    assert value['ok'], value
    return value.get('value')


def action(value):
    return invoke('operate', {'action': value})


def wait(check, timeout=30):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if check():
            return
        time.sleep(.1)
    raise TimeoutError(js('return document.body.innerText'))


def click(label):
    js("const button=[...document.querySelectorAll('button')].find(b=>b.offsetParent!==null&&b.textContent.trim()===arguments[0]);if(!button)throw Error('missing '+arguments[0]);button.click();", label)


def capture(name):
    js('document.activeElement.blur();')
    time.sleep(.3)
    assert not js("return !!document.querySelector('.render-error')"), js('return document.body.innerText')
    (OUTPUT / name).write_bytes(base64.b64decode(call('GET', prefix + '/screenshot')))


try:
    call('POST', prefix + '/timeouts', {'script': 20000, 'pageLoad': 20000})
    call('POST', prefix + '/window/rect', {'width': 1440, 'height': 900})
    wait(lambda: js("return document.querySelector('.model')?.getAttribute('aria-label')?.includes('已加载')??false"))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    action({'type': 'pause', 'paused': True})
    for value in ['light', 'dark']:
        js("const select=document.querySelector('[aria-label=\"外观主题\"]');select.value=arguments[0];select.dispatchEvent(new Event('change',{bubbles:true}));", value)
        wait(lambda: js('return document.documentElement.dataset.theme') == value)
        action({'type': 'lid', 'angle': 0})
        action({'type': 'advance', 'ms': 600})
        wait(lambda: invoke('show_snapshot')['physical']['lid_angle'] == 0)
        time.sleep(.1)
        click('等轴')
        capture(f'closed-{value}.png')
        action({'type': 'lid', 'angle': 105})
        action({'type': 'advance', 'ms': 600})
        time.sleep(.1)
        click('适配视图')
        capture(f'open-{value}.png')
    js("const box=document.querySelector('.check input');box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));")
    click('机构')
    capture('mechanism-dark.png')
    before = invoke('show_snapshot')['simulation_ms']
    for _ in range(3):
        click('重载三维')
        wait(lambda: js("return document.querySelector('.model')?.getAttribute('aria-label')?.includes('已加载')??false"))
        assert js('return document.querySelectorAll("canvas").length') == 1
    assert invoke('show_snapshot')['simulation_ms'] == before
    assert js('return document.querySelector(".check input").checked')
    for width, height in [(640, 540), (1100, 720), (1440, 900)]:
        call('POST', prefix + '/window/rect', {'width': width, 'height': height})
        click('适配视图')
        time.sleep(.2)
        assert js('return document.documentElement.scrollWidth<=innerWidth+1')
        assert not js("return !!document.querySelector('.render-error')")
    # Continuous moving lid with cached shadow maps invalidated on each pose.
    action({'type': 'pause', 'paused': False})
    action({'type': 'lid', 'angle': 0})
    for index in range(12):
        click(['等轴', '正视', '机构'][index % 3])
        time.sleep(.1)
    assert invoke('show_snapshot')['physical']['lid_angle'] == 0
    js("document.querySelector('footer details').open=true;")
    click('性能采样')
    time.sleep(.1)
    metrics = js("return document.querySelector('footer').textContent")
    frame = re.search(r'帧间隔 P95 ([0-9.]+) ms', metrics)
    assert frame, metrics
    (OUTPUT / 'metrics.txt').write_text(metrics + '\n')
    print('PASS: real WebKit studio materials/shadows, open/closed poses, transparent mechanism, fit across window sizes, three scene reloads, paused runtime preserved and live motion', flush=True)
    print(metrics, flush=True)
finally:
    call('DELETE', prefix, {})
