import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {partMaterial, fittedDistance} from '../src/rendering.ts';

test('camera fitting keeps all corners visible in wide and narrow viewports',()=>{
 const bounds=new THREE.Box3(new THREE.Vector3(-120,-60,0),new THREE.Vector3(120,65,190));
 for(const aspect of [.45,1,1.6,3]) for(const direction of [new THREE.Vector3(1,1.2,.8),new THREE.Vector3(0,1,.2),new THREE.Vector3(0,0,1)]){
  direction.normalize();
  const camera=new THREE.PerspectiveCamera(38,aspect,.1,3000);camera.up.set(0,0,1);
  const center=bounds.getCenter(new THREE.Vector3());
  camera.position.copy(center).addScaledVector(direction,fittedDistance(bounds,direction,38,aspect));camera.lookAt(center);camera.updateMatrixWorld();
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
   const point=new THREE.Vector3(x,y,z).project(camera);
   assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1&&point.z>-1&&point.z<1,`${aspect}: ${point.toArray()}`);
  }
 }
});
test('CAD colors survive surface changes; acrylic is transparent and fasteners metallic',()=>{
 const shell=partMaterial({id:'base_box',kind:'printed',color:'#d2d7db'});
 const screw=partMaterial({id:'fasteners_fixed',kind:'fastener',color:'#a5afb8'});
 const glass=partMaterial({id:'acrylic',kind:'hardware',color:'#bfdde4'});
 assert.equal(shell.color.getHexString(),'d2d7db');assert.equal(shell.metalness,0);
 assert.ok(screw.metalness>.5&&screw.roughness<shell.roughness);
 assert.ok(glass.transparent&&glass.opacity<1&&!glass.depthWrite&&glass.isMeshPhysicalMaterial);
 for(const material of [shell,screw,glass])material.dispose();
});
