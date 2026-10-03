import * as THREE from 'three';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';
import {partMaterial, fittedDistance} from './rendering';
import {Gesture} from './interaction';
import type {Snapshot} from './types';
type Part={id:string;label:string;role:string;kind?:string;color:string;file:string;sha256:string};
export class LockScene {
 private renderer:THREE.WebGLRenderer;
 private environment:THREE.WebGLRenderTarget;
 private floor:THREE.Mesh<THREE.PlaneGeometry,THREE.ShadowMaterial>;
 private contact:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;
 private contactTexture:THREE.CanvasTexture;
 private outlines:THREE.LineBasicMaterial[]=[];
 private keyLight:THREE.DirectionalLight;
 private savedCamera=false;private autoFramed=true;
 private themeDark=false;private dirty=true;

 private scene=new THREE.Scene();
 private camera=new THREE.PerspectiveCamera(38,1,.1,3000);
 private orbit:OrbitControls;
 private lid=new THREE.Group();private drive=new THREE.Group();
 private parts:THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>[]=[];
 private interactives:THREE.Object3D[]=[];
 private sensors=new Map<string,THREE.Mesh<THREE.SphereGeometry,THREE.MeshStandardMaterial>>();
 private texture:THREE.CanvasTexture; private canvas=document.createElement('canvas');
 private screenKey='';private observer:ResizeObserver; private controller=new AbortController();
 private raf=0;private disposed=false;private pending:PointerEvent|null=null;private highlighted:THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>|null=null;
 private ray=new THREE.Raycaster();private pointer=new THREE.Vector2();private gesture=new Gesture();
 private cameraDragging=false;private held=false;private transparent=false;private current:Snapshot|null=null;
 private from={lid:105,bolt:0};private to={lid:105,bolt:0};private arrived=0;private interpolate=false;private reduceMotion=false;
 readonly intervals:number[]=[];private previousFrame=0;
 constructor(private container:HTMLElement,private button:(pressed:boolean)=>void,private lidIntent:()=>void,private info:(text:string)=>void,private failed:(text:string)=>void) {
  this.renderer=new THREE.WebGLRenderer({antialias:true});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
  this.renderer.toneMappingExposure=1.05;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
  this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.needsUpdate=true;
  this.renderer.setClearColor(0xf7f6f2);container.append(this.renderer.domElement);
  this.camera.up.set(0,0,1);this.orbit=new OrbitControls(this.camera,this.renderer.domElement);
  this.orbit.enableDamping=true;this.orbit.dampingFactor=.09;
  this.orbit.minDistance=80;this.orbit.maxDistance=1800;
  this.lid.position.set(0,-55,51);this.scene.add(this.lid,this.drive);
  // Procedural studio reflections, bundled locally; no HDR download.
  const room=new RoomEnvironment();room.rotation.x=Math.PI/2;
  const pmrem=new THREE.PMREMGenerator(this.renderer);
  this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.environment.texture;
  this.scene.environmentIntensity=.45;room.dispose();pmrem.dispose();
  const sky=new THREE.HemisphereLight(0xf7f9ff,0x8e9c8d,.8);sky.position.set(0,0,1);this.scene.add(sky);
  this.keyLight=new THREE.DirectionalLight(0xfff5e9,2.3);this.keyLight.position.set(-180,150,420);
  this.keyLight.target.position.set(0,0,35);this.keyLight.castShadow=true;
  this.keyLight.shadow.mapSize.set(512,512);
  Object.assign(this.keyLight.shadow.camera,{left:-200,right:200,top:230,bottom:-200,near:10,far:800});
  this.keyLight.shadow.camera.updateProjectionMatrix();
  this.keyLight.shadow.bias=-.001;this.keyLight.shadow.normalBias=.5;
  this.keyLight.shadow.radius=3;this.keyLight.shadow.intensity=.7;
  this.scene.add(this.keyLight,this.keyLight.target);
  const fill=new THREE.DirectionalLight(0xd5e6ff,.85);fill.position.set(240,160,140);this.scene.add(fill);
  const rim=new THREE.DirectionalLight(0xffffff,1.1);rim.position.set(0,-220,200);this.scene.add(rim);
  this.floor=new THREE.Mesh(new THREE.PlaneGeometry(1600,1600),new THREE.ShadowMaterial({opacity:.16}));
  this.floor.position.z=-.6;this.floor.receiveShadow=true;this.scene.add(this.floor);
  const contactCanvas=document.createElement('canvas');contactCanvas.width=128;contactCanvas.height=128;
  const context=contactCanvas.getContext('2d')!;
  const gradient=context.createRadialGradient(64,64,8,64,64,64);
  gradient.addColorStop(0,'rgba(0,0,0,.26)');gradient.addColorStop(.5,'rgba(0,0,0,.12)');gradient.addColorStop(1,'rgba(0,0,0,0)');
  context.fillStyle=gradient;context.fillRect(0,0,128,128);
  this.contactTexture=new THREE.CanvasTexture(contactCanvas);
  this.contact=new THREE.Mesh(new THREE.PlaneGeometry(360,210),new THREE.MeshBasicMaterial({map:this.contactTexture,transparent:true,depthWrite:false,toneMapped:false}));
  this.contact.position.z=-.5;this.scene.add(this.contact);
  this.canvas.width=512;this.canvas.height=256;this.texture=new THREE.CanvasTexture(this.canvas);this.texture.colorSpace=THREE.SRGBColorSpace;
  // Fixed face on the OLED module: no camera-facing sprite.
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(25,13),new THREE.MeshBasicMaterial({map:this.texture,toneMapped:false}));
  screen.position.set(101.5,56.6,35);screen.rotation.x=-Math.PI/2;this.scene.add(screen);
  for(const [id,position] of Object.entries({lid_closed:[65,-50,52],retracted:[84,-24,46],extended:[84,-10,46]})) {
   const marker=new THREE.Mesh(new THREE.SphereGeometry(3),new THREE.MeshStandardMaterial({color:0x8796a0,roughness:.45,emissive:0x000000}));marker.position.fromArray(position);marker.userData.part={id,label:({lid_closed:'盖板传感器',retracted:'退栓传感器',extended:'伸栓传感器'} as Record<string,string>)[id],role:'sensor'};this.scene.add(marker);this.sensors.set(id,marker);this.interactives.push(marker);
  }
  this.preset('iso');
  let saved:string|null=null;try{saved=localStorage.getItem('tetherlock.camera');}catch{}if(saved)try{const value=JSON.parse(saved);if(value.position?.length===3&&value.target?.length===3&&[...value.position,...value.target].every((v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<10000)){this.camera.position.fromArray(value.position);this.orbit.target.fromArray(value.target);this.orbit.update();this.savedCamera=true;this.autoFramed=false;}}catch{}
  this.orbit.addEventListener('start',()=>{this.autoFramed=false;this.cameraDragging=true;this.pending=null;this.highlighted?.material.emissive.setHex(0);this.highlighted=null;this.dirty=true;});
  this.orbit.addEventListener('end',()=>{this.cameraDragging=false;this.saveCamera();});
  const surface=this.renderer.domElement;const options={signal:this.controller.signal};
  surface.addEventListener('webglcontextlost',event=>{event.preventDefault();this.release();this.failed('WebGL 上下文丢失');},options);
  // Capture runs before OrbitControls sees the physical button.
  surface.addEventListener('pointerdown',event=>{this.gesture.down(event.clientX,event.clientY);if(this.pick(event)?.userData.part?.id==='button'){this.held=true;this.orbit.enabled=false;surface.setPointerCapture(event.pointerId);this.button(true);event.stopImmediatePropagation();event.preventDefault();}}, {...options,capture:true});
  surface.addEventListener('pointermove',event=>{this.gesture.move(event.clientX,event.clientY);this.pending=event;},options);
  surface.addEventListener('pointerup',event=>{const held=this.held;const click=this.gesture.up(event.clientX,event.clientY);this.release();if(!held&&click&&this.pick(event)?.userData.part?.role==='lid')this.lidIntent();},options);
  for(const name of ['pointercancel','lostpointercapture'])surface.addEventListener(name,()=>{this.gesture.cancel();this.release();},options);
  window.addEventListener('blur',()=>{this.gesture.cancel();this.release();},options);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){this.gesture.cancel();this.release();}},options);
  this.observer=new ResizeObserver(()=>{const w=Math.max(1,container.clientWidth),h=Math.max(1,container.clientHeight);this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.dirty=true;if(this.autoFramed&&this.parts.length)this.fit(false);});this.observer.observe(container);
  this.frame(0);
 }
 async load(){
  const manifest=await(await fetch('./manifest.json',{signal:this.controller.signal})).json();const loader=new STLLoader();
  for(const part of manifest.parts as Part[]){
   const response=await fetch(`./${part.file}`,{signal:this.controller.signal});if(!response.ok)throw Error(`缺少 CAD ${part.id}`);
   const bytes=await response.arrayBuffer();if(this.disposed)return;
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
   if(this.disposed)return;
   if(hash!==part.sha256)throw Error(`CAD 校验失败 ${part.id}`);
   const geometry=toCreasedNormals(loader.parse(bytes),THREE.MathUtils.degToRad(30));if(part.role==='lid')geometry.translate(0,55,-51);
   geometry.computeBoundingBox();geometry.computeBoundingSphere();
   const mesh=new THREE.Mesh(geometry,partMaterial(part));mesh.userData.part=part;mesh.name=part.id;
   mesh.material.shadowSide=THREE.BackSide;
   mesh.castShadow=part.id!=='acrylic';mesh.receiveShadow=part.id!=='acrylic';
   // Fine structural edges clarify CAD corners without drawing triangle seams.
   if(['base_box','lid','window_grille','bolt','lock_base','nut_carriage','battery_hatch','upper_deck'].includes(part.id)){
    const ink=new THREE.LineBasicMaterial({color:this.themeDark?0x9baea4:0x344d43,transparent:true,opacity:this.themeDark?.16:.14,depthWrite:false});
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,35),ink);mesh.add(edges);this.outlines.push(ink);
   }
   (part.role==='lid'?this.lid:part.role==='drive'?this.drive:this.scene).add(mesh);this.parts.push(mesh);
   // Every named part supports hover inspection; only lid/button handle clicks.
   this.interactives.push(mesh);
  }
  this.setTransparent(this.transparent);if(!this.savedCamera)this.fit(false);this.renderer.shadowMap.needsUpdate=true;this.intervals.length=0;this.previousFrame=0;this.info(`${this.parts.length} 个 CAD 部件 · 毫米`);
 }
 private bounds(){
  this.scene.updateMatrixWorld(true);const box=new THREE.Box3();
  for(const mesh of this.parts){if(mesh.geometry.boundingBox)box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));}
  return box;
 }
 private saveCamera(){try{localStorage.setItem('tetherlock.camera',JSON.stringify({position:this.camera.position.toArray(),target:this.orbit.target.toArray()}));}catch{}}
 fit(persist=true){
  const box=this.bounds();if(box.isEmpty())return;
  const direction=this.camera.position.clone().sub(this.orbit.target).normalize();
  if(direction.lengthSq()===0)direction.set(1,1.2,.8).normalize();
  const distance=fittedDistance(box,direction,this.camera.fov,this.camera.aspect);
  this.orbit.target.copy(box.getCenter(new THREE.Vector3()));
  this.camera.position.copy(this.orbit.target).addScaledVector(direction,distance);
  this.orbit.update();this.dirty=true;this.autoFramed=true;if(persist)this.saveCamera();
 }
 preset(kind:string){
  this.dirty=true;
  if(kind==='front'){this.camera.position.set(0,350,110);this.orbit.target.set(0,0,45);}
  else if(kind==='mechanism'){this.camera.position.set(110,100,170);this.orbit.target.set(50,5,25);}
  else{this.camera.position.set(290,350,270);this.orbit.target.set(0,0,55);}
  this.orbit.update();
  if(this.parts.length){this.fit(false);this.saveCamera();}
 }
 setTheme(dark:boolean){
  this.dirty=true;this.themeDark=dark;this.renderer.setClearColor(dark?0x171c1a:0xf7f6f2);
  this.floor.material.opacity=dark?.3:.16;this.contact.material.opacity=dark?.65:1;
  for(const material of this.outlines){material.color.setHex(dark?0x9baea4:0x344d43);material.opacity=dark?.16:.14;}
 }
 setReducedMotion(enabled:boolean){this.reduceMotion=enabled;this.orbit.enableDamping=!enabled;}
 setTransparent(enabled:boolean){this.transparent=enabled;for(const mesh of this.parts){if(['base_box','lid'].includes(mesh.name)){mesh.material.transparent=enabled;mesh.material.opacity=enabled?.18:1;mesh.material.depthWrite=!enabled;mesh.castShadow=!enabled;mesh.receiveShadow=!enabled;mesh.material.needsUpdate=true;}}this.renderer.shadowMap.needsUpdate=true;this.dirty=true;}
 update(snapshot:Snapshot){
  const p=snapshot.physical,previous=this.current?.physical;
  if(!previous||previous.button_pressed!==p.button_pressed||previous.inputs.lid_closed!==p.inputs.lid_closed||previous.inputs.retracted!==p.inputs.retracted||previous.inputs.extended!==p.inputs.extended)this.dirty=true;
  this.current=snapshot;
  this.from={lid:THREE.MathUtils.radToDeg(this.lid.rotation.x),bolt:this.drive.position.y};this.to={lid:p.lid_angle,bolt:p.bolt_position};this.arrived=performance.now();
  this.interpolate=!snapshot.paused&&snapshot.state.control_state!=='fault'&&(p.motor_target!==null||p.lid_angle!==p.lid_target);
  for(const [id,marker] of this.sensors)marker.material.color.setHex(p.inputs[id as keyof typeof p.inputs]?0x20a881:0x8796a0);
  const button=this.parts.find(m=>m.name==='button');button?.material.color.setHex(p.button_pressed?0xffc857:0xa5afb8);
  const key=`${p.screen_text}|${p.screen_progress}|${snapshot.state.remaining_seconds}`;
  if(key!==this.screenKey){this.screenKey=key;const c=this.canvas.getContext('2d')!;c.fillStyle='#193a47';c.fillRect(0,0,512,256);c.fillStyle='#dcf8ef';c.font='30px sans-serif';c.fillText(p.screen_text,16,60);c.fillText(snapshot.state.remaining_seconds===null?'':`${snapshot.state.remaining_seconds} 秒`,16,115);c.fillStyle='#219bac';c.fillRect(16,185,480*p.screen_progress/100,24);this.texture.needsUpdate=true;this.dirty=true;}
 }
 private pick(event:PointerEvent){const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2);this.scene.updateMatrixWorld(true);this.ray.setFromCamera(this.pointer,this.camera);return this.ray.intersectObjects(this.interactives,false)[0]?.object;}
 release(){if(this.held){this.held=false;this.button(false);}this.orbit.enabled=true;this.cameraDragging=false;}
 private frame=(time:number)=>{
  if(this.disposed)return;
  try{
   const t=this.interpolate&&!this.reduceMotion?Math.min(1,(performance.now()-this.arrived)/34):1;
   const priorLid=this.lid.rotation.x,priorBolt=this.drive.position.y;
   this.lid.rotation.x=THREE.MathUtils.degToRad(THREE.MathUtils.lerp(this.from.lid,this.to.lid,t));this.drive.position.y=THREE.MathUtils.lerp(this.from.bolt,this.to.bolt,t);
   const moving=priorLid!==this.lid.rotation.x||priorBolt!==this.drive.position.y;
   if(moving)this.renderer.shadowMap.needsUpdate=true;
   if(this.pending&&!this.cameraDragging){const hit=this.pick(this.pending) as typeof this.highlighted;if(hit!==this.highlighted){this.highlighted?.material.emissive.setHex(0);hit?.material.emissive.setHex(0x204b58);this.highlighted=hit;this.dirty=true;}if(hit){const part=hit.userData.part;let label=part.label;const p=this.current?.physical;if(p){if(part.role==='sensor')label+=p.inputs[part.id as keyof typeof p.inputs]?' · 触发':' · 未触发';else if(part.id==='button')label+=p.button_pressed?' · 按下':' · 释放';else if(part.role==='lid')label+=` · ${p.lid_angle.toFixed(1)}°`;else if(part.role==='drive')label+=` · ${p.bolt_position.toFixed(1)} mm`;}this.info(label);}this.pending=null;}
   if(this.cameraDragging)this.pending=null;
   const cameraChanged=this.orbit.update();
   // Keep polling gestures/poses, but avoid drawing identical idle frames.
   if(this.dirty||moving||cameraChanged){this.renderer.render(this.scene,this.camera);this.dirty=false;}
   if(this.previousFrame){this.intervals.push(time-this.previousFrame);if(this.intervals.length>3600)this.intervals.shift();}this.previousFrame=time;
   this.raf=requestAnimationFrame(this.frame);
  }catch(error){this.release();this.failed(String(error));}
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.release();cancelAnimationFrame(this.raf);this.controller.abort();this.observer.disconnect();this.orbit.dispose();this.scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];for(const mat of mats)mat.dispose();}});this.texture.dispose();this.contactTexture.dispose();this.environment.dispose();this.keyLight.shadow.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
