import { createReferences } from './references.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { transformPoint, sanitizeCamera } from './state.js';

export class WorkbenchScene {
  constructor(container, manifest, callbacks) {
    this.container = container; this.manifest = manifest; this.cb = callbacks;
    this.parts = new Map(); this.measurements = []; this.pendingMeasure = null; this.capturing = false;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1;
    this.renderer.localClippingEnabled = true;
    this.renderer.domElement.setAttribute('aria-label', 'TetherLock V3 三维模型，拖动旋转，滚轮缩放，单击选择零件');
    this.renderer.domElement.tabIndex = 0; container.prepend(this.renderer.domElement);
    this.perspective = new THREE.PerspectiveCamera(34, 1, 0.2, 3500);
    this.orthographic = new THREE.OrthographicCamera(-200, 200, 200, -200, 0.2, 3500);
    this.camera = this.perspective; this.camera.up.set(0, 0, 1);
    this.camera.position.set(290, 350, 270);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.11;
    this.controls.target.set(0, 0, 25); this.controls.minDistance = 20; this.controls.maxDistance = 1700;
    this.controls.addEventListener('change', () => callbacks.onCamera?.());
    this.model = new THREE.Group(); this.scene.add(this.model);
    this.scene.add(new THREE.HemisphereLight(0xf6f9ff, 0x9faaa8, 1.7));
    const key = new THREE.DirectionalLight(0xfff4e7, 2.4); key.position.set(-170, 140, 350);
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -300, right: 300, top: 320, bottom: -300, near: 20, far: 950 });
    key.shadow.bias = -0.0003; key.shadow.normalBias = 0.2; this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xc8dcec, 1.1); fill.position.set(240, -150, 230); this.scene.add(fill);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.ShadowMaterial({ opacity: 0.13 }));
    this.floor.receiveShadow = true; this.floor.position.z = -0.6; this.scene.add(this.floor);
    this.grid = new THREE.GridHelper(1400, 70, 0xc8d1d8, 0xdce2e6);
    this.grid.rotation.x = Math.PI / 2; this.grid.material.transparent = true; this.grid.material.opacity = 0.6;
    this.scene.add(this.grid);
    this.reference = new THREE.Mesh(new THREE.BoxGeometry(185, 95, 40), new THREE.MeshStandardMaterial({
      color: 0x82a9b7, transparent: true, opacity: 0.32, roughness: 0.7, depthWrite: false,
    }));
    this.reference.position.set(-23, 0, 25); this.scene.add(this.reference);
    const referenceEdges = new THREE.LineSegments(new THREE.EdgesGeometry(this.reference.geometry), new THREE.LineBasicMaterial({ color: 0x688e9e }));
    this.reference.add(referenceEdges);
    this.section = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xc86437, depthTest: false }));
    this.section.renderOrder = 20; this.scene.add(this.section);
    this.clipPlane = new THREE.Plane(); this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(); this.hovered = null;
    this.attachEvents();
    let viewportAspect=container.clientWidth/Math.max(1,container.clientHeight);
    this.observer = new ResizeObserver(() => {
      if(this.capturing||container.clientWidth<1||container.clientHeight<1)return;
      const aspect=container.clientWidth/container.clientHeight;
      const narrower=viewportAspect>0&&aspect<viewportAspect*.8;viewportAspect=aspect;
      this.resize();if(narrower&&this.parts.size)this.frame();
    }); this.observer.observe(container);
    this.resize();
  }

  async load() {
    const loader = new STLLoader(); const items = this.manifest.parts;
    let finished = 0;
    // Six concurrent fetches keep first load responsive on slower local servers.
    let cursor = 0;
    const worker = async () => {
      while (cursor < items.length) {
        const part = items[cursor++];
        const response = await fetch(new URL(part.file, document.baseURI));
        if (!response.ok) throw new Error(`${part.label} 加载失败 (${response.status})`);
        const data = await response.arrayBuffer();
        if (crypto.subtle) {
          const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(b => b.toString(16).padStart(2, '0')).join('');
          if (hash !== part.sha256) throw new Error(`${part.label} 文件与CAD清单不匹配，请重新生成资源`);
        }
        const geometry = loader.parse(data); geometry.computeBoundingBox();
        const material = new THREE.MeshStandardMaterial({ color: part.color, roughness: part.kind === 'fastener' ? 0.36 : 0.63,
          metalness: part.kind === 'fastener' || part.id === 'hinge_pin' ? 0.62 : 0.04, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material); mesh.name = part.id; mesh.matrixAutoUpdate = false;
        mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.part = part;
        const edgeGeometry = new THREE.EdgesGeometry(geometry, 30);
        const edges = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: 0x586370, transparent: true, opacity: 0.35 }));
        edges.renderOrder = 2; mesh.add(edges); this.model.add(mesh);
        let label = null;
        if (['base_box', 'lid', 'bolt', 'nut_carriage', 'motor', 'esp', 'oled', 'battery_holder', 'battery_hatch'].includes(part.id)) {
          label = document.createElement('button'); label.className = 'part-label'; label.textContent = part.label;
          label.addEventListener('click', () => this.cb.onPick(part.id)); this.container.append(label);
        }
        this.parts.set(part.id, { ...part, mesh, edges, geometry, material, edgeGeometry, label });
        this.cb.onProgress?.(++finished, items.length);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    this.references=createReferences();this.scene.add(this.references.root);
    this.addScreen(); this.apply(); this.preset('iso');
  }

  addScreen() {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
    this.screenCanvas = canvas; this.screenTexture = new THREE.CanvasTexture(canvas);
    this.screenTexture.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(20.8, 10.7), new THREE.MeshBasicMaterial({
      map: this.screenTexture, side: THREE.DoubleSide, toneMapped: false,
    }));
    plane.rotation.x = Math.PI / 2; plane.position.set(101.5, 56.52, 34.5);
    this.parts.get('oled').mesh.add(plane); this.screen = plane;
  }

  attachEvents() {
    const canvas = this.renderer.domElement;
    let down = null, moved = false;
    canvas.addEventListener('pointerdown', e => { if(this.cb.canInteract?.()===false)return;down = [e.clientX, e.clientY]; moved = false; });
    canvas.addEventListener('pointermove', e => {
      if(this.cb.canInteract?.()===false)return;
      if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) moved = true;
      if (e.buttons) return;
      const hit = this.pick(e);
      const id = hit?.object.name || null;
      if (id !== this.hovered) { this.hovered = id; this.applyMaterials(); }
      canvas.style.cursor = this.cb.getState().measure ? 'crosshair' : id ? 'pointer' : 'grab';
    });
    canvas.addEventListener('pointerleave', () => {if(this.cb.canInteract?.()===false)return;this.hovered = null; this.applyMaterials(); });
    canvas.addEventListener('pointerup', e => {
      if(this.cb.canInteract?.()===false){down=null;return;}
      if (!down || moved || e.button !== 0) { down = null; return; }
      down = null; const hit = this.pick(e);
      if (this.cb.getState().measure) { if (hit) this.addMeasure(hit); }
      else this.cb.onPick(hit?.object.name || null);
    });
    canvas.addEventListener('dblclick', e => {if(this.cb.canInteract?.()===false)return;const hit = this.pick(e); if (hit) this.frame(hit.object.name); });
  }

  pick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects([...this.parts.values()].filter(p => p.mesh.visible).map(p => p.mesh), false)
      .find(hit => !this.cb.getState().clip || this.clipPlane.distanceToPoint(hit.point) >= -0.001);
  }

  poseMatrix(part, state) {
    const origin = transformPoint([0, 0, 0], part.role, state, part.explode);
    const matrix = new THREE.Matrix4();
    if (part.role === 'lid') matrix.makeRotationX(THREE.MathUtils.degToRad(state.lid));
    const path=state.assemblyOffsets?.[part.id];
    if(path){const offset=new THREE.Vector3(...path.offset);if(path.frame==='lid')offset.applyAxisAngle(new THREE.Vector3(1,0,0),THREE.MathUtils.degToRad(state.lid));origin.forEach((v,i)=>origin[i]=v+offset.getComponent(i));}
    matrix.setPosition(...origin); return matrix;
  }

  apply({ section = true } = {}) {
    const state = this.cb.getState();
    for (const part of this.parts.values()) {
      part.mesh.matrix.copy(this.poseMatrix(part, state)); part.mesh.matrixWorldNeedsUpdate = true;
      part.mesh.visible = !state.hidden.includes(part.id) && (!state.isolated || state.isolated === part.id);
    }
    this.model.updateMatrixWorld(true);
    this.reference.visible = state.reference;
    this.references?.apply(state);
    const box = this.bounds();
    this.floor.position.z = Math.min(-0.6, box.isEmpty() ? -0.6 : box.min.z - 0.6);
    this.grid.position.z = this.floor.position.z + 0.05;
    this.grid.visible = state.grid && state.style !== 'blueprint';
    this.scene.background = new THREE.Color(state.style === 'blueprint' ? '#193449' : '#edf0f2');
    this.floor.visible = state.style !== 'blueprint';
    const axis = state.clipAxis.toLowerCase(), normal = new THREE.Vector3(); normal[axis] = state.clipReverse ? -1 : 1;
    this.clipPlane.set(normal, -state.clipValue * normal[axis]);
    if(!state.clip)this.section.visible=false;
    this.applyMaterials(); this.updateScreen();
    if (section) this.updateSection();
  }

  applyMaterials() {
    const state = this.cb.getState();
    for (const p of this.parts.values()) {
      const highlighted=state.assemblyHighlights?.includes(p.id),selected = p.id === state.selected||highlighted, hovered = p.id === this.hovered;
      p.material.color.set(state.style === 'technical' ? '#d8dce1' : state.style === 'blueprint' ? '#56778e' : p.color);
      let opacity = p.id === 'acrylic' ? 0.23 : 1;
      if (p.group === 'shell' || p.id === 'lid') opacity *= state.opacity;
      if (state.style === 'xray') opacity = selected ? 0.8 : 0.15;
      if (state.style === 'blueprint') opacity = 0.28;
      if(state.mode==='assembly'&&!highlighted&&(p.group==='shell'||p.role==='lid'))opacity*=.22;
      if(highlighted&&Number.isFinite(state.assemblyOperation))p.material.color.set('#dfac72');
      p.material.opacity = opacity; p.material.transparent = opacity < 1; p.material.depthWrite = opacity > 0.45;
      p.material.emissive.set(selected ? '#8e411d' : hovered ? '#3b5464' : '#000000');
      p.material.emissiveIntensity = selected ? 0.35 : 0.13;
      if(highlighted&&Number.isFinite(state.assemblyOperation))p.material.emissiveIntensity=.2+.3*Math.sin(state.assemblyOperation*2*Math.PI)**2;
      p.material.clippingPlanes = state.clip ? [this.clipPlane] : [];
      p.mesh.castShadow = opacity > 0.5;
      p.edges.visible = state.edges || selected || hovered || state.style === 'technical' || state.style === 'blueprint';
      p.edges.material.color.set(selected ? '#c46636' : state.style === 'blueprint' ? '#b9dae8' : '#546572');
      p.edges.material.opacity = selected || state.style === 'blueprint' ? 0.85 : 0.34;
      p.edges.material.clippingPlanes = state.clip ? [this.clipPlane] : [];
      if (p.label) p.label.hidden = !state.labels || !p.mesh.visible;
    }
    if (this.screen) this.screen.material.clippingPlanes = state.clip ? [this.clipPlane] : [];
  }

  updateScreen() {
    if (!this.screenCanvas) return;
    const state = this.cb.getState(), context = this.screenCanvas.getContext('2d');
    context.fillStyle = '#06191f'; context.fillRect(0, 0, 256, 128);
    context.fillStyle = '#8addd6'; context.font = 'bold 18px monospace'; context.fillText('TETHERLOCK', 18, 28);
    context.font = 'bold 25px monospace'; context.fillText(state.lid > 1 ? 'OPEN' : state.travel > 1 ? 'LOCKED' : 'UNLOCKED', 18, 74);
    context.fillStyle = '#3b737b'; context.fillRect(18, 100, 220, 5);
    context.fillStyle = '#8addd6'; context.fillRect(18, 100, 220 * state.travel / 14, 5);
    this.screenTexture.needsUpdate = true;
  }

  bounds(id) {
    const box = new THREE.Box3();
    for (const p of this.parts.values()) if (p.mesh.visible && (!id || p.id === id))
      box.union(p.geometry.boundingBox.clone().applyMatrix4(p.mesh.matrixWorld));
    return box;
  }

  frame(id, direction) {
    const box = this.bounds(id); if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dir = direction || this.camera.position.clone().sub(this.controls.target).normalize();
    const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
    const radius = Math.max(sphere.radius, 8);
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(17)) * 1.12 / Math.min(1, aspect);
    this.camera.position.copy(sphere.center).addScaledVector(dir, distance);
    this.controls.target.copy(sphere.center); this.camera.up.set(0, 0, 1);
    this.orthoHeight = radius * 2.5 / Math.min(1, aspect);
    this.camera.zoom = 1; this.resize(); this.controls.update();
  }

  preset(name) {
    const vectors = { iso: [0.7, 1, 0.72], top: [0, 0.00001, 1], front: [0, 1, 0.00001],
      right: [1, 0, 0.00001], back: [0, -1, 0.00001], bottom: [0, 0.00001, -1] };
    const dir = new THREE.Vector3(...(vectors[name] || vectors.iso)).normalize();
    this.frame(null, dir);
  }

  setProjection(type) {
    const next = type === 'orthographic' ? this.orthographic : this.perspective;
    if (next === this.camera) return;
    next.position.copy(this.camera.position); next.quaternion.copy(this.camera.quaternion); next.up.copy(this.camera.up);
    this.camera = next; this.controls.object = next; this.frame();
  }

  resize(width, height, exporting = false) {
    const w = width || this.container.clientWidth, h = height || this.container.clientHeight;
    if (w < 1 || h < 1) return;
    this.renderer.setSize(w, h, !exporting);
    this.perspective.aspect = w / h; this.perspective.updateProjectionMatrix();
    const half = (this.orthoHeight || 310) / 2;
    Object.assign(this.orthographic, { left: -half * w / h, right: half * w / h, top: half, bottom: -half });
    this.orthographic.updateProjectionMatrix();
  }

  snapshot() {
    this.model.updateMatrixWorld(true);
    const v = new THREE.Vector3(), result = [];
    for (const p of this.parts.values()) if (p.mesh.visible) {
      const transform = attribute => {
        const array = new Float64Array(attribute.count * 3);
        for (let i = 0; i < attribute.count; i++) { v.fromBufferAttribute(attribute, i).applyMatrix4(p.mesh.matrixWorld); v.toArray(array, i * 3); }
        return array;
      };
      result.push({ id: p.id, positions: transform(p.geometry.attributes.position), edges: transform(p.edgeGeometry.attributes.position), transparent: p.id === 'acrylic' });
    }
    return result;
  }

  updateSection() {
    const state = this.cb.getState(); this.section.visible = state.clip;
    if (!state.clip || !this.parts.size) return;
    const result = [], v = new THREE.Vector3(), d = [], points = [];
    for (const p of this.parts.values()) if (p.mesh.visible) {
      const a = p.geometry.attributes.position;
      for (let i = 0; i < a.count; i += 3) {
        for (let j = 0; j < 3; j++) { v.fromBufferAttribute(a, i + j).applyMatrix4(p.mesh.matrixWorld); points[j] = v.clone(); d[j] = this.clipPlane.distanceToPoint(v); }
        const cuts = [];
        for (let j = 0; j < 3; j++) {
          const k = (j + 1) % 3;
          if ((d[j] < 0 && d[k] >= 0) || (d[j] >= 0 && d[k] < 0)) cuts.push(points[j].clone().lerp(points[k], d[j] / (d[j] - d[k])));
        }
        if (cuts.length === 2) for (const c of cuts) result.push(c.x, c.y, c.z);
      }
    }
    this.section.geometry.dispose(); this.section.geometry = new THREE.BufferGeometry();
    this.section.geometry.setAttribute('position', new THREE.Float32BufferAttribute(result, 3));
  }

  addMeasure(hit) {
    const endpoint = { id: hit.object.name, local: hit.object.worldToLocal(hit.point.clone()) };
    if (!this.pendingMeasure) { this.pendingMeasure = endpoint; this.cb.onMeasure?.('已选第一个点，请选择第二个点'); return; }
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xbf6335, depthTest: false }));
    line.renderOrder = 40; this.scene.add(line);
    const label = document.createElement('div'); label.className = 'measure-label'; this.container.append(label);
    this.measurements.push({ a: this.pendingMeasure, b: endpoint, line, label }); this.pendingMeasure = null;
    if (this.measurements.length > 5) { const old = this.measurements.shift(); this.scene.remove(old.line); old.line.geometry.dispose(); old.line.material.dispose(); old.label.remove(); }
    this.updateMeasurements(); this.cb.onMeasure?.('测量已添加；端点随各自零件运动');
  }

  clearMeasurements() {
    this.pendingMeasure = null;
    for (const m of this.measurements) { this.scene.remove(m.line); m.line.geometry.dispose(); m.line.material.dispose(); m.label.remove(); }
    this.measurements = []; this.cb.onMeasure?.('测量已清除');
  }

  projectLabel(element, point) {
    const v = point.clone().project(this.camera);
    element.style.left = `${(v.x * .5 + .5) * this.container.clientWidth}px`;
    element.style.top = `${(-v.y * .5 + .5) * this.container.clientHeight}px`;
    element.style.visibility = Math.abs(v.x) > 1 || Math.abs(v.y) > 1 || v.z > 1 ? 'hidden' : 'visible';
  }

  updateMeasurements() {
    for (const m of this.measurements) {
      const a = m.a.local.clone().applyMatrix4(this.parts.get(m.a.id).mesh.matrixWorld);
      const b = m.b.local.clone().applyMatrix4(this.parts.get(m.b.id).mesh.matrixWorld);
      m.line.geometry.setFromPoints([a, b]); m.label.textContent = `${a.distanceTo(b).toFixed(2)} mm`;
      const visible = this.cb.getState().mode!=='assembly' && this.parts.get(m.a.id).mesh.visible && this.parts.get(m.b.id).mesh.visible;
      m.line.visible = visible; m.label.hidden = !visible;
      this.projectLabel(m.label, a.clone().lerp(b, 0.5));
    }
  }

  cameraState() {
    return { position: this.camera.position.toArray(), target: this.controls.target.toArray(), zoom: this.camera.zoom, orthoHeight: this.orthoHeight };
  }

  restoreCamera(saved) {
    saved=sanitizeCamera(saved);
    if (!saved) throw new Error('相机配置无效：需要完整坐标和有效缩放范围');
    this.camera.position.fromArray(saved.position); this.controls.target.fromArray(saved.target);
    this.camera.zoom = saved.zoom;
    this.orthoHeight = saved.orthoHeight;
    this.resize(); this.controls.update();
  }

  render() {
    this.controls.update();
    for (const p of this.parts.values()) if (p.label && !p.label.hidden) {
      const center = p.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(p.mesh.matrixWorld);
      center.z += 4; this.projectLabel(p.label, center);
    }
    this.updateMeasurements(); this.renderer.render(this.scene, this.camera);
  }
}
