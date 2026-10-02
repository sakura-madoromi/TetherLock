import * as THREE from 'three';
import sizes from '../../engineering/references.json' with { type: 'json' };

export { sizes as referenceDimensions };

function roundedShape(length, width, radius) {
  const s = new THREE.Shape(), x = -length/2, y = -width/2, r = radius;
  s.moveTo(x+r,y); s.lineTo(x+length-r,y); s.quadraticCurveTo(x+length,y,x+length,y+r);
  s.lineTo(x+length,y+width-r); s.quadraticCurveTo(x+length,y+width,x+length-r,y+width);
  s.lineTo(x+r,y+width); s.quadraticCurveTo(x,y+width,x,y+width-r);
  s.lineTo(x,y+r); s.quadraticCurveTo(x,y,x+r,y); return s;
}
function slab(parent, size, position, color, radius=2, metalness=0) {
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedShape(size[0],size[1],radius),
    {depth:size[2], bevelEnabled:false, curveSegments:16}),
    new THREE.MeshStandardMaterial({color,roughness:.4,metalness}));
  mesh.position.set(...position); mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh); return mesh;
}
function faceTexture(parent, length, width, z, paint) {
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
  paint(canvas.getContext('2d'),canvas.width,canvas.height);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const geometry=new THREE.ShapeGeometry(roundedShape(length,width,2.5)), uv=geometry.getAttribute('uv');
  for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/length+.5,uv.getY(i)/width+.5);
  const mesh=new THREE.Mesh(geometry,
    new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,toneMapped:false}));
  mesh.position.z=z;parent.add(mesh);
}
export function createReferences() {
  const root=new THREE.Group();root.name='dimension-references';root.userData={dimensionReference:true,units:'mm'};
  const p=sizes.phone, phone=new THREE.Group();phone.name='reference-phone';phone.userData={...p,dimensionReference:true};
  phone.position.set(...p.center,0);root.add(phone);
  const back=p.lowestZ+p.cameraGlass+p.cameraPlateau, screen=back+p.body[2];
  slab(phone,p.body,[0,0,back],'#d7d9df',12,.65);
  slab(phone,[46,74,p.cameraPlateau],[-p.body[0]/2+26,0,p.lowestZ+p.cameraGlass],'#b4b7c0',9,.5);
  for(const [long,short] of p.lensCentersFromTopLeft) {
    const lens=new THREE.Mesh(new THREE.CylinderGeometry(p.lensDiameter/2,p.lensDiameter/2,p.cameraGlass,48),
      new THREE.MeshStandardMaterial({color:'#151b23',metalness:.4,roughness:.18}));
    lens.rotation.x=Math.PI/2;lens.position.set(-p.body[0]/2+long,-p.body[1]/2+short,p.lowestZ+p.cameraGlass/2);phone.add(lens);
  }
  const display=slab(phone,[159.8,74.4,.015],[0,0,screen-.015],'#070d17',10);
  display.material.polygonOffset=true;display.material.polygonOffsetFactor=-1;display.material.polygonOffsetUnits=-1;
  // Local decoration: bezel, dynamic island and screen highlights. No remote textures.
  slab(phone,[4,21,.01],[-p.body[0]/2+6,0,screen],'#010203',1.5);
  for(const [fromTop,length,side] of [[34.28,6.9,-1],[48.43,11.2,-1],[62.63,11.2,-1],[55.53,17.7,1],[111.82,17.1,1]]) {
    const button=new THREE.Mesh(new THREE.BoxGeometry(length,.45,2.66),new THREE.MeshStandardMaterial({color:'#aeb2ba',metalness:.7,roughness:.3}));
    button.position.set(-p.body[0]/2+fromTop,side*(p.body[1]/2+.225),back+4.375);phone.add(button);
  }
  const c=sizes.card, card=new THREE.Group();card.name='reference-card';card.userData={...c,dimensionReference:true};
  card.position.set(...c.center,c.bottomZ);root.add(card);slab(card,c.size,[0,0,0],'#193c54',3.18);
  faceTexture(card,c.size[0]-.5,c.size[1]-.5,c.size[2]+.003,(ctx,w,h)=>{
    ctx.fillStyle='#193c54';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#4c8799';ctx.lineWidth=4;
    for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(w*.55+i*30,0);ctx.lineTo(w,h*.6+i*30);ctx.stroke();}
    ctx.fillStyle='#d8e5eb';ctx.font='bold 45px sans-serif';ctx.fillText('DEMO BANK',55,90);
    ctx.fillStyle='#c5b17c';ctx.fillRect(65,160,125,95);ctx.strokeStyle='#756541';ctx.lineWidth=3;
    ctx.strokeRect(65,160,125,95);ctx.beginPath();ctx.moveTo(65,208);ctx.lineTo(190,208);ctx.moveTo(125,160);ctx.lineTo(125,255);ctx.stroke();
    ctx.fillStyle='#d8e5eb';ctx.font='34px monospace';ctx.fillText('SAMPLE / NO ACCOUNT',55,360);
    ctx.font='24px sans-serif';ctx.fillText('85.60 × 53.98 mm  ·  FICTIONAL CARD',55,430);
  });
  return {root,phone,card,apply(state){phone.visible=state.phone;card.visible=state.card;}};
}
