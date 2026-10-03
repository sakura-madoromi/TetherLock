#!/usr/bin/env python3
"""Tests the packaged Tauri application through tauri-driver / WebKitWebDriver.
Start `.tools/bin/tauri-driver --port 4444` first. No Chromium substitution.
"""
import base64,json,os,time,urllib.request,urllib.error,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
ENDPOINT=os.environ.get('TAURI_DRIVER_URL','http://127.0.0.1:4444')
def call(method,path,data=None):
    request=urllib.request.Request(ENDPOINT+path,data=None if data is None else json.dumps(data).encode(),headers={'Content-Type':'application/json'},method=method)
    try:
        result=json.load(urllib.request.urlopen(request,timeout=40))
    except urllib.error.HTTPError as error:
        raise RuntimeError(error.read().decode()) from error
    value=result.get('value')
    if isinstance(value,dict) and value.get('error'):raise RuntimeError(value)
    return value
application=os.environ.get('TAURI_TEST_BINARY',str(ROOT/'apps/simulator/src-tauri/target/debug/tetherlock-simulator-tauri'))
session=call('POST','/session',{'capabilities':{'alwaysMatch':{'tauri:options':{'application':application}}}})['sessionId']
prefix=f'/session/{session}'
def js(script,*args):return call('POST',prefix+'/execute/sync',{'script':script,'args':list(args)})
def async_js(script,*args):return call('POST',prefix+'/execute/async',{'script':script,'args':list(args)})
def invoke(command,args={}):
    result=async_js("const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(v=>done({ok:true,value:v})).catch(e=>done({ok:false,error:String(e)}));",command,args)
    assert result['ok'],result
    return result.get('value')
def snapshot():return invoke('show_snapshot')
def action(action):return invoke('operate',{'action':action})
def wait(predicate,timeout=15):
    until=time.monotonic()+timeout
    while time.monotonic()<until:
        result=predicate()
        if result:return result
        time.sleep(.05)
    raise TimeoutError(js("return {width:innerWidth,height:innerHeight,layout:getComputedStyle(document.querySelector('main')).display}"))
def click(text):return js("const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(arguments[0]));if(!b)throw Error('missing button '+arguments[0]);b.click();",text)
def resize(width,height):
    # WebKitWebDriver's rect can leave the embedding GTK window unchanged.
    # An optional launcher PID lets X11 acceptance resize only this test process.
    pid_file=os.environ.get('TAURI_TEST_PID_FILE')
    if pid_file:
        pid=int(Path(pid_file).read_text().strip())
        windows=subprocess.check_output(['xdotool','search','--onlyvisible','--pid',str(pid)],text=True).splitlines()
        assert len(windows)==1,windows
        subprocess.run(['xdotool','windowsize','--sync',windows[0],str(width),str(height)],check=True,timeout=10)
    else:
        call('POST',prefix+'/window/rect',{'width':width,'height':height})

try:
    call('POST',prefix+'/timeouts',{'script':15000,'pageLoad':20000,'implicit':0})
    wait(lambda:js("return document.querySelector('canvas') && document.querySelector('footer').textContent.includes('37 个 CAD')"))
    assert not js("return !!document.querySelector('.render-error')"),js('return document.body.innerText')
    print('CAD loaded in WebKitGTK',flush=True)
    action({'type':'pause','paused':True})
    click('关闭盖板');wait(lambda:snapshot()['physical']['lid_target']==0)
    action({'type':'advance','ms':600});assert snapshot()['physical']['lid_angle']==0
    # Native pointer/blur/close acceptance is in tauri_native_input.py.
    # WebKit automation sessions suppress external desktop pointer delivery.
    # Resize to the narrow stacked layout, then restore desktop dimensions.
    resize(800,650)
    wait(lambda:js("return getComputedStyle(document.querySelector('main')).display==='flex'"))
    assert js("return document.documentElement.scrollWidth<=innerWidth+1")
    resize(1280,720)
    wait(lambda:js("return getComputedStyle(document.querySelector('main')).display==='grid'"))
    assert js("return document.querySelector('canvas').width>0")
    # Recreate scenes; exactly one live canvas must remain.
    for _ in range(3):
        click('重载三维');wait(lambda:js("return document.querySelectorAll('canvas').length===1 && document.querySelector('footer').textContent.includes('37 个 CAD')"))
    before=snapshot()['simulation_ms']
    call('POST',prefix+'/refresh',{})
    wait(lambda:js("return document.querySelector('canvas') && document.querySelector('footer').textContent.includes('37 个 CAD')"))
    assert snapshot()['simulation_ms']==before
    assert not snapshot()['physical']['button_pressed']
    assert js("return document.querySelectorAll('canvas').length===1")
    action({'type':'pause','paused':False})
    action({'type':'lid','angle':105})
    for i in range(30):
        click(['等轴','正视','机构'][i%3]);time.sleep(.1)
    action({'type':'lid','angle':0});time.sleep(.7)
    click('性能采样');time.sleep(.2)
    metrics=js("return document.querySelector('footer').textContent")
    output=ROOT/'generated/validation/tauri-webkit-smoke.png';output.parent.mkdir(parents=True,exist_ok=True)
    output.write_bytes(base64.b64decode(call('GET',prefix+'/screenshot')))
    print('PASS: actual Tauri/WebKitGTK CAD, narrow/wide resize, scene reload, page reload, paused runtime (native input tested separately)')
    print(metrics)
    print(js("const gl=document.querySelector('canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);"))
finally:
    try:call('DELETE',prefix,{})
    except Exception:pass
