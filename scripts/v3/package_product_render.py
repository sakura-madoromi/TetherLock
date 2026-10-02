"""Re-clock headless WebGL captures and package the product-showcase renders."""
from pathlib import Path
import hashlib, html, json, shutil, sys, tempfile, zipfile
import gi
gi.require_version('Gst', '1.0')
from gi.repository import Gst

Gst.init(None)
root = Path(__file__).resolve().parents[2]
out = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / 'artifacts/v3/product-render'
fps = 10

def decode(path):
    uri = Gst.filename_to_uri(str(path.resolve()))
    pipe = Gst.parse_launch(f'uridecodebin uri="{uri}" name=d d. ! queue ! videoconvert ! appsink name=s emit-signals=false sync=false')
    sink = pipe.get_by_name('s'); sink.set_property('max-buffers', 1000); sink.set_property('drop', False)
    pipe.set_state(Gst.State.PLAYING); count = 0; first = last = None
    while True:
        sample = sink.emit('try-pull-sample', Gst.SECOND)
        if sample:
            buffer = sample.get_buffer(); count += 1
            if first is None: first = buffer.pts
            last = buffer.pts
        else:
            message = pipe.get_bus().pop_filtered(Gst.MessageType.EOS | Gst.MessageType.ERROR)
            if message and message.type == Gst.MessageType.ERROR:
                pipe.set_state(Gst.State.NULL); raise RuntimeError(message.parse_error())
            if message: break
    pipe.set_state(Gst.State.NULL)
    return count, (last-first)/Gst.SECOND

def reclock(path):
    tmp = path.with_suffix('.reclock.webm')
    uri = Gst.filename_to_uri(str(path.resolve()))
    launch = (f'uridecodebin uri="{uri}" name=d d. ! queue ! videoconvert ! video/x-raw,format=I420 ! '
              f'identity name=clock ! vp9enc deadline=1 cpu-used=8 target-bitrate=8000000 keyframe-max-dist={fps*2} '
              f'! webmmux ! filesink location="{tmp}"')
    pipe = Gst.parse_launch(launch); counter = {'n': 0}
    def stamp(pad, info):
        buffer = info.get_buffer(); index = counter['n']
        buffer.pts = Gst.util_uint64_scale(index, Gst.SECOND, fps)
        buffer.dts = Gst.CLOCK_TIME_NONE
        buffer.duration = Gst.util_uint64_scale(1, Gst.SECOND, fps)
        counter['n'] = index + 1
        return Gst.PadProbeReturn.OK
    pipe.get_by_name('clock').get_static_pad('src').add_probe(Gst.PadProbeType.BUFFER, stamp)
    pipe.set_state(Gst.State.PLAYING); bus = pipe.get_bus()
    while True:
        message = bus.timed_pop_filtered(10*Gst.SECOND, Gst.MessageType.EOS | Gst.MessageType.ERROR)
        if message and message.type == Gst.MessageType.EOS: break
        if message and message.type == Gst.MessageType.ERROR:
            pipe.set_state(Gst.State.NULL); tmp.unlink(missing_ok=True); raise RuntimeError(message.parse_error())
    pipe.set_state(Gst.State.NULL); tmp.replace(path)

manifest_path = out / 'render-manifest.json'
manifest = json.loads(manifest_path.read_text())
videos = []
for name in manifest['videos']:
    path = out / name
    if '--reclock' in sys.argv: reclock(path)
    frames, duration = decode(path)
    assert frames >= 30 and 8 <= frames/max(duration, .01) <= 12, (name, frames, duration)
    videos.append(dict(file=name, width=1920, height=1080, frames=frames,
                       durationSeconds=round(duration, 3), decodedRateFps=round(frames/duration, 2), codec='VP9'))

shots = [
    ('01-closed-hero.png', '闭合产品主视觉'), ('02-open-with-phone-card.png', '开盖展示手机与银行卡尺寸参照'),
    ('03-open-top-layout.png', '开盖俯视布局'), ('04-hinge-and-pin.png', '铰链与销轴背面视角'),
    ('05-exploded-assembly.png', '分层爆炸总装'), ('06-internal-mechanism-xray.png', 'X射线内部机构展示'),
    ('07-grille-window-detail.png', '栅窗与亚克力细节'), ('08-oled-and-button-detail.png', '屏幕与按键细节'),
]
for name, _ in shots:
    b=(out/name).read_bytes(); assert b[:8] == b'\x89PNG\r\n\x1a\n' and (int.from_bytes(b[16:20],'big'),int.from_bytes(b[20:24],'big')) == (3840,2160)

manifest.update(imageResolution='3840x2160', videoCaptureRequestedFps=30, videoPostprocessFps=fps,
                videoPlayback=videos, imageCaptions=dict(shots),
                sha256={name:hashlib.sha256((out/name).read_bytes()).hexdigest() for name,_ in shots} |
                        {v['file']:hashlib.sha256((out/v['file']).read_bytes()).hexdigest() for v in videos})
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
readme = ['# TetherLock V3 产品展示渲染', '', '白色外壳，浅灰摄影棚背景。静态图为 3840×2160 PNG；动画为 1920×1080 VP9 WebM，包含实际解码帧数和时长记录。', '', '## 静态图', '']
readme += [f'- `{name}`：{caption}' for name,caption in shots]
readme += ['', '## 动画', '', '- `09-opening-cycle-1080p.webm`：退栓、开盖停留、闭盖与上锁的完整循环。', '- `10-open-close-detail-1080p.webm`：分别展示开盖和闭盖动作。', '', '模型来自 V3 CAD 工作台；手机与虚构银行卡作为独立尺寸参照显示。动画用于产品动作展示。']
(out/'README.md').write_text('\n'.join(readme)+'\n')
cards=[]
for name,caption in shots:
    cards.append(f'<figure><a href="{html.escape(name)}"><img loading="lazy" src="{html.escape(name)}" alt="{html.escape(caption)}"></a><figcaption>{html.escape(caption)}</figcaption></figure>')
for v,caption in zip(videos,['完整开合循环','开盖与闭盖动作']):
    cards.append(f'<figure><video controls preload="metadata" src="{html.escape(v["file"])}"></video><figcaption>{html.escape(caption)} · {v["durationSeconds"]} s</figcaption></figure>')
gallery='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>TetherLock V3 产品展示</title><style>body{font:16px system-ui;background:#eef1f2;color:#26343a;margin:0;padding:32px}h1{font-size:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px}figure{margin:0;background:white;padding:12px;border-radius:10px;box-shadow:0 5px 22px #192e3814}img,video{width:100%;height:auto;display:block;border-radius:5px}figcaption{padding:10px 2px 2px}</style><h1>TetherLock V3 · 产品展示渲染</h1><main>'+''.join(cards)+'</main>'
(out/'gallery.html').write_text(gallery)
verification=dict(complete=True,images=len(shots),videos=videos,imageResolution='3840x2160',package='TetherLock-V3-product-showcase.zip')
(out/'render-verification.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2)+'\n')
archive=out/'TetherLock-V3-product-showcase.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for name in ['README.md','gallery.html','render-manifest.json','render-verification.json',*(n for n,_ in shots),*(v['file'] for v in videos)]: z.write(out/name,name)
    assert z.testzip() is None
print('Packaged',len(shots),'4K images and',len(videos),'1080p animations ->',archive,archive.stat().st_size,'bytes')
