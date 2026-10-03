// Triangle/plane sections, in actual CAD mm. Each part is polygonized separately
// so contacting materials keep their own closed boundary. Holes use even-odd fill.
export function sliceMesh(positions,axis,value,{tolerance=0.0001}={}) {
  const k={X:0,Y:1,Z:2}[axis];if(k===undefined)throw new Error('剖切轴无效');
  const remaining=[0,1,2].filter(i=>i!==k),project=p=>remaining.map(i=>p[i]);
  const quant=n=>Math.round(n/tolerance),key=p=>p.map(quant).join(',');
  const segments=new Map(),points=new Map();
  for(let t=0;t+8<positions.length;t+=9){
    const tri=[0,3,6].map(i=>Array.from(positions.slice(t+i,t+i+3))),hit=[];
    for(let i=0;i<3;i++){
      const a=tri[i],b=tri[(i+1)%3],da=a[k]-value,db=b[k]-value;
      if(Math.abs(da)<1e-8)hit.push(project(a));
      if(da*db<0){const ratio=da/(da-db);hit.push(project(a.map((n,j)=>n+(b[j]-n)*ratio)));}
    }
    const unique=[...new Map(hit.map(p=>[key(p),p])).values()];
    if(unique.length!==2)continue;
    const [a,b]=unique.map(key);if(a===b)continue;
    points.set(a,unique[0]);points.set(b,unique[1]);const id=a<b?a+'|'+b:b+'|'+a;segments.set(id,[a,b]);
  }
  const adjacency=new Map();
  for(const [id,[a,b]] of segments){for(const [p,q] of [[a,b],[b,a]]){const edges=adjacency.get(p)||[];edges.push([q,id]);adjacency.set(p,edges);}}
  const invalid=[...adjacency].filter(([,edges])=>edges.length!==2);
  if(invalid.length)throw new Error(`${axis}=${value} 剖面有 ${invalid.length} 个未闭合或分叉节点；请核对网格/截面位置`);
  const unused=new Set(segments.keys()),loops=[];
  while(unused.size){
    const first=unused.values().next().value,[start,next]=segments.get(first);unused.delete(first);
    const loop=[points.get(start),points.get(next)];let current=next;
    while(current!==start){
      const edge=adjacency.get(current).find(([,id])=>unused.has(id));
      if(!edge)throw new Error('剖面轮廓未闭合');unused.delete(edge[1]);current=edge[0];loop.push(points.get(current));
      if(loop.length>segments.size+2)throw new Error('剖面轮廓回路异常');
    }
    if(loop.length>=4)loops.push(loop);
  }
  return {axis,value,loops,tolerance,segmentCount:segments.size,closed:true,axes:remaining.map(i=>'XYZ'[i])};
}

export function sectionPath(section,transform=p=>p) {
  return section.loops.map(loop=>loop.map((p,i)=>{const q=transform(p);return (i?'L':'M')+q.map(n=>n.toFixed(4)).join(',');}).join('')+'Z').join('');
}

export function pointInSection(point,loops) {
  let inside=false;
  for(const loop of loops)for(let i=0,j=loop.length-1;i<loop.length;j=i++){
    const a=loop[i],b=loop[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
