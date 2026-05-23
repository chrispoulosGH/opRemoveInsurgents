// Generates client/public/mushroom_cloud.glb with embedded cloud texture
// Run: node gen_mushroom_cloud.js
'use strict';
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ─── CRC32 (needed for PNG chunks) ────────────────────────────────────────
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcIn = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(crcIn));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// ─── PNG encoder (pure Node, RGBA 8-bit) ──────────────────────────────────
function encodePng(w, h, rgba) {
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  const row = w * 4;
  const raw = Buffer.alloc((row + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (row + 1)] = 0; // filter None
    rgba.copy(raw, y * (row + 1) + 1, y * row, (y + 1) * row);
  }
  const compressed = zlib.deflateSync(raw, { level: 6 });

  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', compressed), pngChunk('IEND', Buffer.alloc(0))]);
}

// ─── Noise / FBM ─────────────────────────────────────────────────────────
const _p = new Uint8Array(512);
{
  const base = Array.from({length:256},(_,i)=>i).sort(()=>Math.random()-.5);
  for (let i=0;i<256;i++) _p[i]=_p[i+256]=base[i];
}
function fade(t){ return t*t*t*(t*(t*6-15)+10); }
function grad2(h,x,y){ h&=3; return ((h<2)?x:y)*((h&1)?-1:1)+((h<2)?y:x)*((h&2)?-1:1); }
function noise(x,y){
  const X=Math.floor(x)&255, Y=Math.floor(y)&255;
  x-=Math.floor(x); y-=Math.floor(y);
  const u=fade(x),v=fade(y),a=_p[X]+Y,b=_p[X+1]+Y;
  return ( (1-v)*((1-u)*grad2(_p[a],x,y)+u*grad2(_p[b],x-1,y))
         +    v *((1-u)*grad2(_p[a+1],x,y-1)+u*grad2(_p[b+1],x-1,y-1)) )*0.5+0.5;
}
function fbm(x,y,oct=7){
  let v=0,a=0.5,f=1,mx=0;
  for(let i=0;i<oct;i++){v+=noise(x*f,y*f)*a; mx+=a; a*=0.5; f*=2.1;}
  return v/mx;
}

// Cellular / Voronoi distance — gives solar granulation cell boundaries
function hash01(x,y,s){ const n=Math.sin(x*127.1+y*311.7+s*74.9)*43758.5453; return n-Math.floor(n); }
function voronoi(x,y){
  const ix=Math.floor(x),iy=Math.floor(y); let d=9;
  for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
    const cx=ix+dx,cy=iy+dy;
    const px=cx+hash01(cx,cy,0), py=cy+hash01(cx,cy,1);
    const dd=(x-px)**2+(y-py)**2; if(dd<d) d=dd;
  }
  return Math.sqrt(d);
}

// ─── Generate 512×512 solar-surface texture ───────────────────────────────
function makeCloudTexture(W=512,H=512){
  const rgba = Buffer.alloc(W*H*4);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    // Four tiling scales of solar granulation (small + large cells mixed)
    const nx=x/W, ny=y/H;

    // Small granules (high frequency)
    const sg = voronoi(nx*18+fbm(nx*3,ny*3,3)*0.8, ny*18+fbm(nx*3+5,ny*3,3)*0.8);
    // Large supergranules
    const lg = voronoi(nx*6 +fbm(nx*2,ny*2,3)*0.5, ny*6 +fbm(nx*2+7,ny*2,3)*0.5);
    // Fine turbulence FBM
    const warp = fbm(nx*8+0.3, ny*8+1.7, 5);
    const fine = fbm(nx*16+warp*1.5, ny*16+warp*1.5, 4);

    // Invert voronoi: center of each cell (dist→0) = hottest
    const cellVal = Math.pow(Math.max(0, 1.0 - sg * 3.5), 1.6)   // small cells
                  + Math.pow(Math.max(0, 1.0 - lg * 1.8), 2.2)*0.4; // large cells

    // Combine: cell brightness + fine detail
    const raw = cellVal * 0.72 + fine * 0.28;
    // Stretch contrast so we get full range dark→bright
    const t = Math.pow(Math.max(0,Math.min(1, raw*1.35-0.05)), 1.1);

    // Solar colour ramp: near-black red → deep crimson → orange → yellow-orange → white-yellow
    let r,g,b;
    if(t < 0.12){
      const k=t/0.12; r=10+k*60;  g=2+k*8;   b=2+k*4;
    } else if(t < 0.30){
      const k=(t-0.12)/0.18; r=70+k*100;  g=10+k*30;  b=6+k*5;
    } else if(t < 0.52){
      const k=(t-0.30)/0.22; r=170+k*60;  g=40+k*70;  b=11+k*6;
    } else if(t < 0.70){
      const k=(t-0.52)/0.18; r=230+k*20;  g=110+k*80; b=17+k*15;
    } else if(t < 0.86){
      const k=(t-0.70)/0.16; r=250+k*5;   g=190+k*45; b=32+k*60;
    } else {
      const k=(t-0.86)/0.14; r=255;        g=235+k*20; b=92+k*100;
    }
    const i=(y*W+x)*4;
    rgba[i]  =Math.min(255,r|0);
    rgba[i+1]=Math.min(255,g|0);
    rgba[i+2]=Math.min(255,b|0);
    rgba[i+3]=255;
  }
  return encodePng(W,H,rgba);
}

console.log('Generating cloud texture...');
const pngBuf = makeCloudTexture(512,512);
console.log(`  PNG: ${(pngBuf.length/1024).toFixed(1)} KB`);

// ─── Geometry helpers (with UV) ───────────────────────────────────────────
function uvSphere(segs,rings){
  const v=[],n=[],uv=[],idx=[];
  for(let r=0;r<=rings;r++){
    const theta=r/rings*Math.PI, st=Math.sin(theta), ct=Math.cos(theta);
    for(let s=0;s<=segs;s++){
      const phi=s/segs*2*Math.PI, cp=Math.cos(phi), sp=Math.sin(phi);
      v.push(cp*st, ct, sp*st);
      n.push(cp*st, ct, sp*st);
      uv.push(s/segs, r/rings);
    }
  }
  for(let r=0;r<rings;r++) for(let s=0;s<segs;s++){
    const a=r*(segs+1)+s, b=a+segs+1;
    idx.push(a,b,a+1, b,b+1,a+1);
  }
  return {v,n,uv,idx};
}

function frustum(bR,tR,segs){
  const v=[],n=[],uv=[],idx=[];
  const slope=bR-tR, nl=Math.sqrt(1+slope*slope);
  // lateral
  for(let s=0;s<=segs;s++){
    const phi=s/segs*2*Math.PI, cp=Math.cos(phi), sp=Math.sin(phi);
    v.push(cp*bR,0,sp*bR); n.push(cp/nl,slope/nl,sp/nl); uv.push(s/segs,0);
    v.push(cp*tR,1,sp*tR); n.push(cp/nl,slope/nl,sp/nl); uv.push(s/segs,1);
  }
  for(let s=0;s<segs;s++){
    const b0=s*2,t0=b0+1,b1=b0+2,t1=b0+3;
    idx.push(b0,b1,t0, t0,b1,t1);
  }
  // bottom cap
  const bc=v.length/3; v.push(0,0,0); n.push(0,-1,0); uv.push(0.5,0.5);
  for(let s=0;s<=segs;s++){
    const phi=s/segs*2*Math.PI;
    v.push(Math.cos(phi)*bR,0,Math.sin(phi)*bR); n.push(0,-1,0);
    uv.push(0.5+0.5*Math.cos(phi), 0.5+0.5*Math.sin(phi));
  }
  for(let s=0;s<segs;s++) idx.push(bc, bc+s+2, bc+s+1);
  // top cap
  const tc=v.length/3; v.push(0,1,0); n.push(0,1,0); uv.push(0.5,0.5);
  for(let s=0;s<=segs;s++){
    const phi=s/segs*2*Math.PI;
    v.push(Math.cos(phi)*tR,1,Math.sin(phi)*tR); n.push(0,1,0);
    uv.push(0.5+0.5*Math.cos(phi), 0.5+0.5*Math.sin(phi));
  }
  for(let s=0;s<segs;s++) idx.push(tc, tc+s+1, tc+s+2);
  return {v,n,uv,idx};
}

function xform(mesh, sx,sy,sz, tx,ty,tz){
  const v2=[], n2=[], uv2=[...mesh.uv];
  for(let i=0;i<mesh.v.length;i+=3)
    v2.push(mesh.v[i]*sx+tx, mesh.v[i+1]*sy+ty, mesh.v[i+2]*sz+tz);
  for(let i=0;i<mesh.n.length;i+=3){
    const nx=mesh.n[i]/sx, ny=mesh.n[i+1]/sy, nz=mesh.n[i+2]/sz;
    const l=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
    n2.push(nx/l,ny/l,nz/l);
  }
  return {v:v2,n:n2,uv:uv2,idx:mesh.idx};
}

// ─── Build parts ──────────────────────────────────────────────────────────
const S=28, R=18;
const parts=[
  xform(uvSphere(S,R), 0.30,0.17,0.30,  0,0.17,0),   // base burst
  xform(frustum(0.09,0.06,S), 1,0.56,1,  0,0,0),      // stem
  xform(uvSphere(S,R), 0.19,0.08,0.19,  0,0.53,0),    // collar
  xform(uvSphere(S,R), 0.45,0.24,0.45,  0,0.72,0),    // cap
  xform(uvSphere(S,R), 0.34,0.19,0.34,  0,0.88,0),    // upper dome
  xform(uvSphere(S,12), 0.22,0.12,0.22, 0,1.03,0),    // top puff
];

// Merge
const allV=[],allN=[],allUV=[],allIdx=[];
let off=0;
for(const p of parts){
  allV.push(...p.v); allN.push(...p.n); allUV.push(...p.uv);
  allIdx.push(...p.idx.map(i=>i+off));
  off+=p.v.length/3;
}

// Bounding box
let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
for(let i=0;i<allV.length;i+=3) for(let k=0;k<3;k++){
  mn[k]=Math.min(mn[k],allV[i+k]); mx[k]=Math.max(mx[k],allV[i+k]);
}

// ─── Pack binary ──────────────────────────────────────────────────────────
const pad4=b=>{ const r=b.length%4; return r?Buffer.concat([b,Buffer.alloc(4-r)]):b; };

const vBuf  = pad4(Buffer.from(new Float32Array(allV).buffer));
const nBuf  = pad4(Buffer.from(new Float32Array(allN).buffer));
const uvBuf = pad4(Buffer.from(new Float32Array(allUV).buffer));
const useU32= off>65535;
const iBuf  = pad4(Buffer.from(useU32?new Uint32Array(allIdx).buffer:new Uint16Array(allIdx).buffer));
const imgBuf= pad4(pngBuf);

const vOff=0, nOff=vBuf.length, uvOff=nOff+nBuf.length,
      iOff=uvOff+uvBuf.length, imgOff=iOff+iBuf.length;
const binBuf=Buffer.concat([vBuf,nBuf,uvBuf,iBuf,imgBuf]);

// ─── GLTF JSON ────────────────────────────────────────────────────────────
const nV=off, nI=allIdx.length;
const gltf={
  asset:{version:'2.0',generator:'TC mushroom-cloud gen v2'},
  scene:0, scenes:[{nodes:[0]}], nodes:[{mesh:0}],
  meshes:[{
    name:'mushroom_cloud',
    primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,material:0}]
  }],
  materials:[{
    name:'smoke_cloud',
    pbrMetallicRoughness:{
      baseColorTexture:{index:0},
      metallicFactor:0.0,
      roughnessFactor:0.98,
    },
    doubleSided:true,
  }],
  textures:[{source:0,sampler:0}],
  samplers:[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}], // LINEAR_MIPMAP_LINEAR, REPEAT
  images:[{bufferView:4,mimeType:'image/png'}],
  accessors:[
    {bufferView:0,byteOffset:0,componentType:5126,count:nV,type:'VEC3',min:mn,max:mx},
    {bufferView:1,byteOffset:0,componentType:5126,count:nV,type:'VEC3'},
    {bufferView:2,byteOffset:0,componentType:5126,count:nV,type:'VEC2'},
    {bufferView:3,byteOffset:0,componentType:useU32?5125:5123,count:nI,type:'SCALAR'},
  ],
  bufferViews:[
    {buffer:0,byteOffset:vOff,  byteLength:vBuf.length,  target:34962},
    {buffer:0,byteOffset:nOff,  byteLength:nBuf.length,  target:34962},
    {buffer:0,byteOffset:uvOff, byteLength:uvBuf.length, target:34962},
    {buffer:0,byteOffset:iOff,  byteLength:iBuf.length,  target:34963},
    {buffer:0,byteOffset:imgOff,byteLength:pngBuf.length},
  ],
  buffers:[{byteLength:binBuf.length}],
};

const jsonStr=JSON.stringify(gltf);
const jsonPad=Math.ceil(jsonStr.length/4)*4;
const jsonBuf=Buffer.alloc(jsonPad,0x20);
Buffer.from(jsonStr).copy(jsonBuf);

const total=12+8+jsonPad+8+binBuf.length;
const glb=Buffer.alloc(total);
let o=0;
glb.writeUInt32LE(0x46546C67,o);o+=4;
glb.writeUInt32LE(2,o);          o+=4;
glb.writeUInt32LE(total,o);      o+=4;
glb.writeUInt32LE(jsonPad,o);    o+=4;
glb.writeUInt32LE(0x4E4F534A,o); o+=4;
jsonBuf.copy(glb,o);             o+=jsonPad;
glb.writeUInt32LE(binBuf.length,o); o+=4;
glb.writeUInt32LE(0x004E4942,o);    o+=4;
binBuf.copy(glb,o);

const out=path.join(__dirname,'client','public','mushroom_cloud.glb');
fs.writeFileSync(out,glb);
console.log(`Written ${(glb.length/1024).toFixed(1)} KB → ${out}`);
console.log(`Vertices: ${nV}  Triangles: ${(nI/3)|0}  Texture: 512×512`);
