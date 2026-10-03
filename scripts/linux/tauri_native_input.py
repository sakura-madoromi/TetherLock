#!/usr/bin/env python3
"""Native input acceptance in a standalone WebKitGTK application, via AT-SPI/X11."""
import os,subprocess,tempfile,time,re
from pathlib import Path
import gi
gi.require_version('Atspi','2.0')
from gi.repository import Atspi
ROOT=Path(__file__).resolve().parents[2]
def wait(fn,seconds=20):
 end=time.monotonic()+seconds
 while time.monotonic()<end:
  try:
   result=fn()
   if result:return result
  except Exception:pass
  time.sleep(.1)
 raise TimeoutError('native UI condition failed')
def nodes(node):
 yield node
 for i in range(node.get_child_count()):
  child=node.get_child_at_index(i)
  if child:yield from nodes(child)
def named(app,text):return next((n for n in nodes(app) if text in (n.get_name() or '')),None)
def position(node):
 r=node.get_component_iface().get_extents(Atspi.CoordType.SCREEN)
 return r.x+r.width//2,r.y+r.height//2
with tempfile.TemporaryDirectory(prefix='tetherlock-native-') as directory:
 log=open(Path(directory)/'stderr.log','w+')
 process=subprocess.Popen([str(ROOT/'apps/simulator/src-tauri/target/debug/tetherlock-simulator-tauri')],env={**os.environ,'GDK_BACKEND':'x11','XDG_DATA_HOME':directory},stdout=log,stderr=log)
 try:
  app=wait(lambda:next((Atspi.get_desktop(0).get_child_at_index(i) for i in range(Atspi.get_desktop(0).get_child_count()) if Atspi.get_desktop(0).get_child_at_index(i).get_process_id()==process.pid),None))
  wait(lambda:named(app,'三维模型 · 已加载'),30)
  button=wait(lambda:named(app,'按住实体按钮'))
  window=subprocess.check_output(['xdotool','search','--onlyvisible','--pid',str(process.pid)],text=True).splitlines()[0]
  subprocess.run(['xdotool','windowactivate','--sync',window],check=True)
  time.sleep(.3)
  def pressed():return button.get_state_set().contains(Atspi.StateType.CHECKED) or button.get_state_set().contains(Atspi.StateType.PRESSED)
  subprocess.run(['xdotool','mouseup','1']);
  x,y=position(button);print('Native WebKit button position',x,y,flush=True)
  subprocess.run(['xdotool','mousemove',str(x),str(y),'mousedown','1'],check=True)
  time.sleep(.5)
  wait(pressed)
  subprocess.run(['xdotool','mousemove','20','200','mouseup','1'],check=True)
  wait(lambda:not pressed())
  print('PASS native pointer capture and release outside button',flush=True)
  subprocess.run(['xdotool','mousemove',str(x),str(y),'mousedown','1'],check=True);wait(pressed)
  focus=subprocess.Popen(['python3','-c','import gi;gi.require_version("Gtk","3.0");from gi.repository import Gtk;w=Gtk.Window(title="TetherLock test focus");w.show_all();w.present();Gtk.main()'],env={**os.environ,'GDK_BACKEND':'x11'})
  try:wait(lambda:not pressed())
  finally:subprocess.run(['xdotool','mouseup','1']);focus.terminate();focus.wait(timeout=5)
  print('PASS native loss of focus releases button',flush=True)
  window=subprocess.check_output(['xdotool','search','--onlyvisible','--pid',str(process.pid)],text=True).splitlines()[0]
  subprocess.run(['xdotool','windowactivate','--sync',window],check=True)
  subprocess.run(['xdotool','key','space'],check=True);wait(lambda:not pressed())
  print('PASS keyboard release',flush=True)
  named(app,'关闭盖板').get_action_iface().do_action(0)
  # Rotate the actual CAD continuously while the lid is moving.
  geometry=dict(line.split('=',1) for line in subprocess.check_output(['xdotool','getwindowgeometry','--shell',window],text=True).splitlines())
  px=int(geometry['X'])+230;py=int(geometry['Y'])+350
  subprocess.run(['xdotool','mousemove',str(px),str(py),'mousedown','1'],check=True)
  for i in range(120):
   subprocess.run(['xdotool','mousemove',str(px+i*2),str(py+i%25)],check=True);time.sleep(.025)
  subprocess.run(['xdotool','mouseup','1'],check=True)
  for _ in range(30):
   named(app,'关闭盖板').get_action_iface().do_action(0)
   named(app,'打开盖板').get_action_iface().do_action(0)
  named(app,'性能信息').get_action_iface().do_action(0);time.sleep(.1)
  named(app,'性能采样').get_action_iface().do_action(0);time.sleep(.3)
  texts=[]
  for n in nodes(app):
   try:
    iface=n.get_text_iface()
    if iface:texts.append(Atspi.Text.get_text(iface,0,-1))
   except Exception:pass
  metrics=next(text for text in texts if '帧间隔 P95' in text)
  print(metrics,flush=True)
  frame=re.search(r'帧间隔 P95 ([0-9.]+) ms',metrics);latency=re.search(r'操作往返 P95 ([0-9.]+) ms',metrics)
  x,y=position(button);subprocess.run(['xdotool','mousemove',str(x),str(y),'mousedown','1'],check=True);wait(pressed)
  # WM_DELETE_WINDOW is the native close path (same helper as the existing smoke).
  subprocess.run(['xdotool','key','alt+F4'],check=True)
  process.wait(timeout=10)
  assert process.returncode==0,process.returncode
  print('PASS native close',flush=True)
  # Complete release/close acceptance even when a performance budget fails.
  assert frame and float(frame[1])<=25,metrics
  assert latency and float(latency[1])<=100,metrics
 except Exception:
  log.flush();log.seek(0);print(log.read(),flush=True);raise
 finally:
  subprocess.run(['xdotool','mouseup','1'])
  if process.poll() is None:process.terminate();process.wait(timeout=10)
  log.close()
