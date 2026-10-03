import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { zipSync, strToU8 } from 'fflate';

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const canvasBlob = (canvas) => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片生成失败，尝试较低分辨率')), 'image/png'));

export async function capturePNG(workbench, width = 2560, height = 1440, transparent = false) {
  const r = workbench.renderer, scene = workbench.scene, camera = workbench.camera;
  const limit = r.getContext().getParameter(r.getContext().MAX_RENDERBUFFER_SIZE);
  if (width > limit || height > limit) throw new Error(`此显卡最大导出边长 ${limit}px`);
  const saved = { ratio: r.getPixelRatio(), background: scene.background, floor: workbench.floor.visible,
    grid: workbench.grid.visible, aspect: camera.aspect };
  workbench.capturing = true;
  try {
    r.setPixelRatio(1); workbench.resize(width, height, true);
    if (transparent) { scene.background = null; workbench.floor.visible = false; workbench.grid.visible = false; r.setClearColor(0x000000, 0); }
    r.render(scene, camera);
    const image = document.createElement('canvas'); image.width = width; image.height = height;
    const context = image.getContext('2d'); context.drawImage(r.domElement, 0, 0);
    const projection = point => { const p = point.clone().project(camera); return [(p.x * .5 + .5) * width, (1 - (p.y * .5 + .5)) * height, p.z]; };
    const font = Math.max(14, Math.round(width / 145));
    const text = (label, point, tint = '#344653') => {
      const [x, y, z] = projection(point); if (z > 1 || x < 0 || x > width || y < 0 || y > height) return;
      context.font = `500 ${font}px sans-serif`; const tw = context.measureText(label).width;
      const px = Math.min(width-tw-font, Math.max(font, x-tw/2));
      context.fillStyle = 'rgba(255,255,255,.94)'; context.fillRect(px-font*.4,y-font*1.1,tw+font*.8,font*1.55);
      context.fillStyle = tint; context.fillText(label,px,y+font*.05);
    };
    if (workbench.cb.getState().labels) for (const p of workbench.parts.values()) if (p.label && p.mesh.visible) {
      const anchor = p.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(p.mesh.matrixWorld); anchor.z += 4;
      text(p.label.textContent, anchor);
    }
    for (const m of workbench.measurements) if (m.line.visible) {
      const a=m.a.local.clone().applyMatrix4(workbench.parts.get(m.a.id).mesh.matrixWorld);
      const b=m.b.local.clone().applyMatrix4(workbench.parts.get(m.b.id).mesh.matrixWorld);
      text(`${a.distanceTo(b).toFixed(2)} mm`,a.clone().lerp(b,.5),'#b6592f');
    }
    return await canvasBlob(image);
  } finally {
    scene.background=saved.background; workbench.floor.visible=saved.floor; workbench.grid.visible=saved.grid;
    r.setPixelRatio(saved.ratio); workbench.resize(); workbench.capturing=false; workbench.render();
  }
}

export async function drawingPNG(svg, width = 3840) {
  const image = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise((resolve,reject)=> { image.onload=resolve; image.onerror=()=>reject(new Error('SVG图纸无法转换为图片')); image.src=url; });
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.round(width*297/420);
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return await canvasBlob(canvas);
  } finally { URL.revokeObjectURL(url); }
}

export function printDrawing(svg) {
  const tab=window.open('', '_blank');
  if (!tab) throw new Error('请允许打开打印窗口，或下载SVG后打印');
  tab.document.write(`<!doctype html><html lang="zh-CN"><head><title>TetherLock V3 工程参考图</title><style>@page{size:A3 landscape;margin:0}*{box-sizing:border-box}body{margin:0}svg{display:block;width:420mm;height:297mm}@media screen{body{background:#dce2e8;padding:20px}svg{margin:auto;box-shadow:0 4px 30px #0002}}</style></head><body>${svg}</body></html>`);
  tab.document.close();tab.document.fonts.ready.then(()=>{if(!tab.closed){tab.focus();tab.print();}});
}

export async function exportViews(workbench, settings, onProgress) {
  const camera=workbench.cameraState(), files={};
  const views=['iso','top','front','right','back'];
  try {
    for(let i=0;i<views.length;i++) {
      onProgress(`正在生成 ${i+1}/${views.length} · ${views[i]}`);
      workbench.preset(views[i]);
      const blob=await capturePNG(workbench,...settings);
      files[`TetherLock-V3-${views[i]}.png`]=new Uint8Array(await blob.arrayBuffer());
    }
    files['view.json']=strToU8(JSON.stringify({state:workbench.cb.getState(),camera,source:workbench.manifest.sourceSHA256},null,2));
    return new Blob([zipSync(files,{level:0})],{type:'application/zip'});
  } finally {workbench.restoreCamera(camera);}
}

export async function exportGLB(workbench, includeReferences = false) {
  const model=workbench.model.clone(true);
  if(includeReferences && workbench.references) model.add(workbench.references.root.clone(true));
  model.scale.setScalar(0.001);model.name='TetherLock-V3';
  model.userData={units:'m',CADUnits:'mm',source:workbench.manifest.sourceSHA256};
  model.updateMatrixWorld(true);
  const data=await new GLTFExporter().parseAsync(model,{binary:true,onlyVisible:true});
  return new Blob([data],{type:'model/gltf-binary'});
}

export function startRecording(canvas) {
  if (!canvas.captureStream || !window.MediaRecorder) throw new Error('此浏览器不支持WebM录制，请使用桌面版Chrome或Edge');
  const type=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
  if (!type) throw new Error('此浏览器没有可用的WebM编码器');
  const stream=canvas.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:10000000});
  const chunks=[];
  const done=new Promise((resolve,reject)=>{
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());resolve(new Blob(chunks,{type}));};
    recorder.onerror=e=>{stream.getTracks().forEach(t=>t.stop());reject(new Error(e.error?.message||'动画录制失败'));};
  });
  recorder.start(100);
  return {recorder,done,stop:()=>{if(recorder.state!=='inactive')recorder.stop();}};
}
