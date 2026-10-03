#!/usr/bin/env python3
"""Exercise the real Tauri/WebKit UI and save light/dark acceptance screenshots.

Requires the simulator Vite server and tauri-driver. Run the driver with an
isolated XDG_DATA_HOME to keep test data separate from user devices.
"""
import base64
import json
import os
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENDPOINT = os.environ.get('TAURI_DRIVER_URL', 'http://127.0.0.1:4464')
OUTPUT = ROOT / 'generated/validation/visual-system'
BINARY = os.environ.get('TAURI_TEST_BINARY', str(ROOT / 'apps/simulator/src-tauri/target/debug/tetherlock-simulator-tauri'))


def call(method, path, data=None):
    request = urllib.request.Request(ENDPOINT + path, method=method,
        data=None if data is None else json.dumps(data).encode(),
        headers={'Content-Type': 'application/json'})
    value = json.load(urllib.request.urlopen(request, timeout=30))['value']
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


def wait(check, timeout=20):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if check():
            return
        time.sleep(.1)
    raise TimeoutError('Visual acceptance condition timed out')


def click(label):
    js("const button=[...document.querySelectorAll('button')].find(b=>b.offsetParent!==null&&b.textContent.trim()===arguments[0]);if(!button)throw Error('missing visible button '+arguments[0]);button.click();", label)


def theme(value):
    js("const select=document.querySelector('[aria-label=\"外观主题\"]');select.value=arguments[0];select.dispatchEvent(new Event('change',{bubbles:true}));", value)
    wait(lambda: js('return document.documentElement.dataset.theme') == value)


try:
    call('POST', prefix + '/timeouts', {'script': 15000, 'pageLoad': 20000})
    wait(lambda: js("return !!document.querySelector('canvas') && document.querySelector('footer').textContent.includes('37 个 CAD')"))
    assert not js("return !!document.querySelector('.render-error')"), js('return document.body.innerText')
    assert js("return document.querySelectorAll('[role=tab]').length") == 4
    invoke('operate', {'action': {'type': 'pause', 'paused': True}})
    click('关闭盖板')
    wait(lambda: invoke('show_snapshot')['physical']['lid_target'] == 0)
    invoke('operate', {'action': {'type': 'advance', 'ms': 600}})
    assert invoke('show_snapshot')['physical']['lid_angle'] == 0
    click('连接')
    js("const input=document.querySelector('#panel-connection input');input.value='VISUAL-DRAFT';input.dispatchEvent(new Event('input',{bubbles:true}));")
    click('调试')
    assert js("return !document.querySelector('#panel-debug').hidden")
    assert js("return document.querySelector('#panel-connection').hidden")
    click('连接')
    assert js("return document.querySelector('#panel-connection input').value") == 'VISUAL-DRAFT'
    click('概览')
    # Keyboard tab navigation follows the same tab activation behavior.
    js("document.querySelector('#tab-overview').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));")
    wait(lambda: js("return document.activeElement.id==='tab-debug' && !document.querySelector('#panel-debug').hidden"))
    click('概览')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for width, height, name in [(1280, 720, 'desktop'), (640, 540, 'narrow')]:
        call('POST', prefix + '/window/rect', {'width': width, 'height': height})
        for value in ['light', 'dark']:
            theme(value)
            js('document.activeElement.blur();')
            time.sleep(.3)
            assert js('return document.documentElement.scrollWidth<=innerWidth+1'), f'{name}/{value}: horizontal overflow'
            assert js("return document.querySelectorAll('canvas').length") == 1
            assert not js("return !!document.querySelector('.render-error')")
            (OUTPUT / f'simulator-{name}-{value}.png').write_bytes(base64.b64decode(call('GET', prefix + '/screenshot')))
        if name == 'narrow':
            assert js("return getComputedStyle(document.querySelector('main')).display") == 'flex'
        else:
            assert js("return getComputedStyle(document.querySelector('main')).display") == 'grid'
    call('POST', prefix + '/refresh', {})
    wait(lambda: js("return !!document.querySelector('canvas') && document.querySelector('footer').textContent.includes('37 个 CAD')"))
    assert js('return document.documentElement.dataset.theme') == 'dark'
    assert invoke('show_snapshot')['paused']
    assert not invoke('show_snapshot')['physical']['button_pressed']
    print('PASS: real WebKit CAD, overview/debug/connection tabs, draft retention, keyboard tabs, light/dark at 1280×720 and 640×540, persisted appearance, runtime preserved on refresh', flush=True)
finally:
    call('DELETE', prefix, {})
