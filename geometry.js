import * as THREE from 'three';
const C=globalThis.ClipperLib, S=1000;
export function union(paths){const c=new C.Clipper();c.AddPaths(paths,C.PolyType.ptSubject,true);const out=[];c.Execute(C.ClipType.ctUnion,out,C.PolyFillType.pftNonZero,C.PolyFillType.pftNonZero);return C.Clipper.CleanPolygons(out,30);}
function offset(paths,amount){const o=new C.ClipperOffset(2,40);o.AddPaths(paths,C.JoinType.jtRound,C.EndType.etClosedPolygon);const result=[];o.Execute(result,amount*S);return result;}
function positive(p){return C.Clipper.Area(p)>0?p:[...p].reverse();}
function circle(x,y,r){return positive(Array.from({length:80},(_,i)=>({X:Math.round((x+Math.cos(i*Math.PI/40)*r)*S),Y:Math.round((y+Math.sin(i*Math.PI/40)*r)*S)})));}
function bridge(a,b,r){const dx=b.X-a.X,dy=b.Y-a.Y,l=Math.hypot(dx,dy)||1,nx=-dy/l*r*S,ny=dx/l*r*S;return positive([{X:a.X+nx,Y:a.Y+ny},{X:a.X-nx,Y:a.Y-ny},{X:b.X-nx,Y:b.Y-ny},{X:b.X+nx,Y:b.Y+ny}].map(p=>({X:Math.round(p.X),Y:Math.round(p.Y)})));}
export function bounds(paths){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const path of paths)for(const p of path){minX=Math.min(minX,p.X/S);minY=Math.min(minY,p.Y/S);maxX=Math.max(maxX,p.X/S);maxY=Math.max(maxY,p.Y/S);}return{minX,minY,maxX,maxY,width:maxX-minX,height:maxY-minY};}
export function transform(paths,scale=1,x=0,y=0){return paths.map(path=>path.map(p=>({X:Math.round(p.X*scale+x*S),Y:Math.round(p.Y*scale+y*S)})));}
export function normalize(paths,height){if(!paths.length)return[];const b=bounds(paths);return transform(paths,height/b.height,-b.minX*height/b.height,-b.minY*height/b.height);}
// Trace the edges of the binary image, preserving holes. Clipper resolves touching pixels.
export function trace(data,w,h,threshold=180,invert=false){const solid=new Uint8Array(w*h);for(let i=0;i<solid.length;i++){const k=i*4,l=.2126*data[k]+.7152*data[k+1]+.0722*data[k+2];solid[i]=data[k+3]>100&&(invert?l>threshold:l<threshold)?1:0;}
 const edges=new Map();const add=(x,y,X,Y)=>{const key=y*(w+1)+x;const a=edges.get(key)||[];a.push(Y*(w+1)+X);edges.set(key,a);};const on=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&solid[y*w+x];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(on(x,y)){if(!on(x,y-1))add(x,y,x+1,y);if(!on(x+1,y))add(x+1,y,x+1,y+1);if(!on(x,y+1))add(x+1,y+1,x,y+1);if(!on(x-1,y))add(x,y+1,x,y);}
 const paths=[];while(edges.size){const start=edges.keys().next().value;let current=start;const p=[];let steps=0;do{p.push({X:(current%(w+1))*S,Y:-Math.floor(current/(w+1))*S});const list=edges.get(current);if(!list)break;current=list.pop();if(!list.length)edges.delete(p[p.length-1].Y/-S*(w+1)+p[p.length-1].X/S);if(++steps>w*h*4)throw Error('Image is too complex. Try a simpler silhouette.');}while(current!==start);if(p.length>=3)paths.push(p);}
 const simple=C.Clipper.SimplifyPolygons(paths,C.PolyFillType.pftNonZero);return union(simple).filter(p=>Math.abs(C.Clipper.Area(p))>S*S*3);
}
export function makeDesign(namePaths,imagePaths,o){let name=normalize(namePaths,18),art=normalize(imagePaths,o.imageSize);if(!name.length&&!art.length)throw Error('Enter a name or add an image with visible details.');const nb=bounds(name),ab=bounds(art),gap=2;
 if(art.length&&name.length){if(o.placement==='above'){name=transform(name,1,(Math.max(nb.width,ab.width)-nb.width)/2,0);art=transform(art,1,(Math.max(nb.width,ab.width)-ab.width)/2,nb.height+gap);}else if(o.placement==='right'){art=transform(art,1,nb.width+gap,(nb.height-ab.height)/2);}else{name=transform(name,1,ab.width+gap,(ab.height-nb.height)/2);}}
 const all=[...name,...art],b=bounds(all),scale=o.width/b.width;name=transform(name,scale);art=transform(art,scale);
 let backing=union(offset(union([...name,...art]).filter(p=>C.Clipper.Area(p)>0),o.border));
 // Connect disjoint silhouettes using nearest boundary points; all features share one base.
 let outer=backing.filter(p=>C.Clipper.Area(p)>0),count=0;while(outer.length>1&&count++<100){const first=outer[0];let best=Infinity,a,b;for(const other of outer.slice(1))for(const p of first)for(const q of other){const d=(p.X-q.X)**2+(p.Y-q.Y)**2;if(d<best){best=d;a=p;b=q;}}backing=union([...backing,bridge(a,b,Math.max(1.1,o.border*.65)),circle(a.X/S,a.Y/S,1.2),circle(b.X/S,b.Y/S,1.2)]);outer=backing.filter(p=>C.Clipper.Area(p)>0);}
 if(outer.length!==1)throw Error('Too many disconnected details. Simplify the image or increase the border.');
 // Fill enclosed backing counters so raised letter counters expose the backing color.
 backing=outer;const bb=bounds(backing),target=backing[0].reduce((a,p)=>p.X<a.X?p:a),r=o.hole/2,outerR=r+2,cx=bb.minX-outerR+1,cy=target.Y/S;
 backing=union([...backing,circle(cx,cy,outerR),bridge({X:Math.round(cx*S),Y:Math.round(cy*S)},target,1.5)]);
 const cut=new C.Clipper();cut.AddPaths(backing,C.PolyType.ptSubject,true);cut.AddPath(circle(cx,cy,r),C.PolyType.ptClip,true);const result=[];cut.Execute(C.ClipType.ctDifference,result,C.PolyFillType.pftNonZero,C.PolyFillType.pftNonZero);backing=result;
 const box=bounds(backing),tx=-(box.minX+box.maxX)/2,ty=-(box.minY+box.maxY)/2;backing=transform(backing,1,tx,ty);name=transform(name,1,tx,ty);art=transform(art,1,tx,ty);
 const parts=[{name:'Backing',paths:backing,z:0,depth:o.base,color:o.colors[0]}];if(name.length)parts.push({name:'Name',paths:name,z:o.base,depth:o.relief,color:o.colors[1]});if(art.length)parts.push({name:'Image',paths:art,z:o.base,depth:o.relief,color:o.colors[2]});
 for(const part of parts)part.geometry=extrude(part.paths,part.z,part.depth);
 return {parts,bounds:bounds(backing),height:o.base+o.relief};
}
export function extrude(paths,z,depth){const c=new C.Clipper();c.AddPaths(paths,C.PolyType.ptSubject,true);const tree=new C.PolyTree();c.Execute(C.ClipType.ctUnion,tree,C.PolyFillType.pftNonZero,C.PolyFillType.pftNonZero);const shapes=[];function path(p,Type){const t=new Type();p.forEach((v,i)=>i?t.lineTo(v.X/S,v.Y/S):t.moveTo(v.X/S,v.Y/S));t.closePath();return t;}function visit(node){for(const n of node.Childs()){if(!n.IsHole()){const shape=path(n.Contour(),THREE.Shape);for(const hole of n.Childs())if(hole.IsHole())shape.holes.push(path(hole.Contour(),THREE.Path));shapes.push(shape);}visit(n);}}visit(tree);const g=new THREE.ExtrudeGeometry(shapes,{depth,bevelEnabled:false,curveSegments:8,steps:1});g.translate(0,0,z);return g;}
export function indexedMesh(geometry){const pos=geometry.getAttribute('position'),map=new Map(),vertices=[],triangles=[];for(let i=0;i<pos.count;i+=3){const tri=[];for(let j=0;j<3;j++){const v=[pos.getX(i+j),pos.getY(i+j),pos.getZ(i+j)].map(n=>Math.round(n*100000)/100000),key=v.join(',');if(!map.has(key)){map.set(key,vertices.length);vertices.push(v);}tri.push(map.get(key));}if(new Set(tri).size===3)triangles.push(tri);}return{vertices,triangles};}
