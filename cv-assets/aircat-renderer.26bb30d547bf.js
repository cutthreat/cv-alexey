/* Native WebGL: textured floor, lit meshes, perspective, bouncing spheres. No CDN. */
(() => {
 'use strict';
 const {WIDTH:W,HEIGHT:H,BALL_TYPES}=AircatCore;
 const ballColors=Object.freeze(Object.fromEntries(BALL_TYPES.map(type=>[type.id,type.color])));
 const normalize=v=>{const d=Math.hypot(...v)||1;return v.map(x=>x/d);};
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
 function multiply(a,b){const r=new Float32Array(16);for(let c=0;c<4;c++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)r[c*4+row]+=a[k*4+row]*b[c*4+k];return r;}
 function camera(aspect){
  const eye=[0,39,25],target=[0,0,0],z=normalize(eye.map((v,i)=>v-target[i])),x=normalize(cross([0,1,0],z)),y=cross(z,x);
  const view=new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
  // Real perspective; fit the near edge too, with room for the cat and bounce arc.
  const distance=Math.hypot(...eye),fov=2*Math.atan((W/2+8)/(distance*Math.min(aspect,1.4))),f=1/Math.tan(fov/2),near=.1,far=160;
  const projection=new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);
  return multiply(projection,view);
 }
 const meshVertex=`attribute vec3 aPosition;attribute vec3 aNormal;
 uniform mat4 uCamera;uniform vec3 uPosition;uniform vec3 uScale;uniform float uYaw;varying mediump vec3 vNormal;
 void main(){vec3 p=aPosition*uScale;float c=cos(uYaw),s=sin(uYaw);p=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);
 vec3 n=aNormal/uScale;vNormal=normalize(vec3(c*n.x+s*n.z,n.y,-s*n.x+c*n.z));gl_Position=uCamera*vec4(p+uPosition,1.0);}`;
 const meshFragment=`precision mediump float;varying mediump vec3 vNormal;uniform vec4 uColor;
 void main(){float light=.35+.65*max(dot(normalize(vNormal),normalize(vec3(-.4,1.0,.65))),0.0);float rim=pow(1.0-abs(vNormal.z),3.0)*.13;gl_FragColor=vec4(uColor.rgb*light+rim,uColor.a);}`;
 const floorVertex=`attribute vec3 aPosition;attribute vec2 aUV;uniform mat4 uCamera;varying mediump vec2 vUV;
 void main(){vUV=aUV;gl_Position=uCamera*vec4(aPosition,1.0);}`;
 const floorFragment=`precision mediump float;varying mediump vec2 vUV;uniform sampler2D uPhoto;uniform sampler2D uMask;uniform vec2 uGrid;uniform float uComplete;uniform float uFlash;
 void main(){float m=texture2D(uMask,vUV).r;float safe=max(step(.8,m),uComplete);float trail=step(.3,m)*(1.0-step(.8,m));
 vec2 cell=fract(vUV*uGrid);float line=1.0-step(.055,min(min(cell.x,1.0-cell.x),min(cell.y,1.0-cell.y)));
 vec3 dark=mix(vec3(.079,.066,.105),vec3(.18,.13,.235),line*.42);
 vec2 tile=floor(vUV*uGrid);float code=step(.977,fract(sin(dot(tile,vec2(12.9898,78.233)))*43758.5453));dark+=vec3(.13,.07,.18)*code;
 vec3 photo=texture2D(uPhoto,vec2(vUV.x,1.0-vUV.y)).rgb;
 vec3 color=mix(dark,photo,safe);color=mix(color,vec3(.86,.64,1.0),trail*(.76+.2*line));
 color+=vec3(.08,.035,.13)*uFlash;gl_FragColor=vec4(color,1.0);}`;
 function sphere(rows=10,cols=16){
  const p=[],n=[];const point=(row,col)=>{const v=row/rows*Math.PI,u=col/cols*Math.PI*2;return [Math.sin(v)*Math.cos(u),Math.cos(v),Math.sin(v)*Math.sin(u)];};
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++)for(const v of [point(row,col),point(row+1,col),point(row+1,col+1),point(row,col),point(row+1,col+1),point(row,col+1)]){p.push(...v);n.push(...v);}
  return {p,n};
 }
 function ears(){
  const p=[-.7,-1,-.6,.7,-1,-.6,0,1,0, .7,-1,-.6,.7,-1,.6,0,1,0, .7,-1,.6,-.7,-1,.6,0,1,0, -.7,-1,.6,-.7,-1,-.6,0,1,0];
  const n=[];for(let i=0;i<p.length;i+=9){const a=p.slice(i,i+3),b=p.slice(i+3,i+6),c=p.slice(i+6,i+9),v=normalize(cross(b.map((x,j)=>x-a[j]),c.map((x,j)=>x-a[j])));n.push(...v,...v,...v);}return {p,n};
 }
 class Renderer {
  constructor(canvas,{onImage=()=>{}}={}){
   this.canvas=canvas;this.onImage=onImage;this.gl=canvas.getContext('webgl',{alpha:false,antialias:true,powerPreference:'low-power'});
   if(!this.gl)throw new Error('webgl-unavailable');
   this.reducedMotion=globalThis.matchMedia?globalThis.matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
   this.buffers=[];this.textures=[];this.programs=[];this.maskRevision=-1;this.photoSerial=0;this.destroyed=false;this.currentImage=null;
   this.meshProgram=this.program(meshVertex,meshFragment,['aPosition','aNormal'],['uCamera','uPosition','uScale','uYaw','uColor']);
   this.floorProgram=this.program(floorVertex,floorFragment,['aPosition','aUV'],['uCamera','uPhoto','uMask','uGrid','uComplete','uFlash']);
   this.sphere=this.mesh(sphere());this.ear=this.mesh(ears());
   this.flat=this.mesh({p:[-1,0,-1,1,0,-1,1,0,1,-1,0,-1,1,0,1,-1,0,1],n:Array.from({length:6},()=>[0,1,0]).flat()});
   this.floorPosition=this.buffer(new Float32Array([-W/2,0,-H/2,W/2,0,-H/2,W/2,0,H/2,-W/2,0,-H/2,W/2,0,H/2,-W/2,0,H/2]));
   this.floorUV=this.buffer(new Float32Array([0,0,1,0,1,1,0,0,1,1,0,1]));
   this.photo=this.texture(new Uint8Array([80,65,100]),1,1,this.gl.RGB,this.gl.LINEAR);
   this.mask=this.texture(new Uint8Array(W*H),W,H,this.gl.LUMINANCE,this.gl.NEAREST);
   const gl=this.gl;gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);this.resize();
  }
  program(v,f,attributes,uniforms){
   const gl=this.gl,p=gl.createProgram();this.programs.push(p);
   for(const [type,source] of [[gl.VERTEX_SHADER,v],[gl.FRAGMENT_SHADER,f]]){
    const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error(message||'shader-failed');}
    gl.attachShader(p,s);gl.deleteShader(s);
   }
   gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'link-failed');
   const result={p};for(const a of attributes)result[a]=gl.getAttribLocation(p,a);for(const u of uniforms)result[u]=gl.getUniformLocation(p,u);return result;
  }
  buffer(data){const gl=this.gl,b=gl.createBuffer();this.buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);return b;}
  mesh(data){return {p:this.buffer(new Float32Array(data.p)),n:this.buffer(new Float32Array(data.n)),count:data.p.length/3};}
  texture(data,width,height,format,filter){
   const gl=this.gl,t=gl.createTexture();this.textures.push(t);gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,format,width,height,0,format,gl.UNSIGNED_BYTE,data);
   for(const target of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,target,gl.CLAMP_TO_EDGE);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);return t;
  }
  loadImage(src){
   if(this.cancelPhoto)this.cancelPhoto();
   const serial=++this.photoSerial,image=new Image();this.currentImage=image;
   return new Promise((resolve,reject)=>{
    this.cancelPhoto=()=>{image.onload=null;image.onerror=null;resolve(false);};
    image.onload=()=>{
     if(serial!==this.photoSerial||this.destroyed){resolve(false);return;}
     this.cancelPhoto=null;
     try{const gl=this.gl;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.photo);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);try{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);}finally{gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);}this.onImage();resolve(true);}catch(error){reject(error);}
    };
    image.onerror=()=>{this.cancelPhoto=null;reject(new Error('image-unavailable'));};image.src=globalThis.AircatLocalPhotos?.[src]||src;
   });
  }
  resize(){
   const width=this.canvas.clientWidth||640,height=this.canvas.clientHeight||480,dpr=Math.min(globalThis.devicePixelRatio||1,1.5);
   this.canvas.width=Math.round(width*dpr);this.canvas.height=Math.round(height*dpr);this.gl.viewport(0,0,this.canvas.width,this.canvas.height);this.camera=camera(width/height);
  }
  bindAttribute(index,buffer,size){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,0,0);}
  shape(mesh,position,scale,color,yaw=0){
   const gl=this.gl,p=this.meshProgram;gl.useProgram(p.p);this.bindAttribute(p.aPosition,mesh.p,3);this.bindAttribute(p.aNormal,mesh.n,3);
   gl.uniformMatrix4fv(p.uCamera,false,this.camera);gl.uniform3fv(p.uPosition,position);gl.uniform3fv(p.uScale,scale);gl.uniform1f(p.uYaw,yaw);gl.uniform4fv(p.uColor,color);gl.drawArrays(gl.TRIANGLES,0,mesh.count);
  }
  drawCat(game){
   const c=game.cat,t=c.moveT,e=t*t*(3-2*t),cx=c.fromX+(c.x-c.fromX)*e+.5-W/2,cz=c.fromY+(c.y-c.fromY)*e+.5-H/2;
   const motion=this.reducedMotion.matches?0:game.time,yaw={down:0,right:Math.PI/2,up:Math.PI,left:-Math.PI/2}[c.direction]||0,bob=Math.sin(motion*4.5)*.10,cy=1.3+bob;
   const fur=[.87,.83,.95,1],pink=[.80,.48,.69,1],dark=[.07,.055,.11,1],size=1.2;
   const part=(mesh,x,y,z,sx,sy,sz,color)=>this.shape(mesh,[cx+size*(Math.cos(yaw)*x+Math.sin(yaw)*z),cy+size*y,cz+size*(-Math.sin(yaw)*x+Math.cos(yaw)*z)],[sx*size,sy*size,sz*size],color,yaw);
   part(this.sphere,0,0,0,.58,.42,.84,fur);part(this.sphere,0,.4,.7,.58,.54,.52,fur);
   for(const side of [-1,1]){
    part(this.ear,side*.38,.95,.64,.29,.34,.26,fur);part(this.ear,side*.38,.97,.81,.16,.22,.07,pink);
    part(this.sphere,side*.24,.48,1.18,.075,.09,.045,dark);part(this.sphere,side*.23,.51,1.21,.023,.03,.013,[1,1,1,1]);
    part(this.sphere,side*.37,-.32,.54,.19,.17,.23,fur);part(this.sphere,side*.37,-.32,-.5,.19,.17,.23,fur);
   }
   part(this.sphere,0,.30,1.24,.095,.06,.06,pink);
   for(let i=0;i<5;i++)part(this.sphere,.3+Math.sin(i*.36+motion*2)*.18,-.04+i*.12,-.68-i*.18,.13,.14,.2,fur);
   this.shape(this.flat,[cx,.018,cz],[.82,.01,1.1],[.08,.045,.12,.32],yaw);
   if(game.catSpeed()>12)this.shape(this.flat,[cx,.035,cz],[.95,.01,1.15],[1,.72,.2,.36],yaw);
  }
  drawEffects(game){
   for(const m of game.marks){
    const fade=Math.min(1,(m.until-game.time)/2),color=[1,.73,.17,.45*fade];
    for(const i of m.cells){
     const x=i%W+.5-W/2,z=Math.floor(i/W)+.5-H/2;
     this.shape(this.flat,[x,.03,z],[.36,.01,.36],color);
    }
    this.shape(this.flat,[m.x+.5-W/2,.05,m.y+.5-H/2],[.13,.01,.4],[1,.88,.43,.85*fade],Math.PI/4);
   }
   for(const w of game.walls){
    const x=w.x+.5-W/2,z=w.y+.5-H/2,fade=Math.min(1,(w.until-game.time)/2);
    this.shape(this.flat,[x,.04,z],[.48,.01,.48],[.28,.13,.07,.75*fade]);
    for(let i=0;i<3;i++)this.shape(this.sphere,[x,.17+i*.20,z],[.40-i*.10,.17,.35-i*.08],[.39,.20,.095,fade]);
   }
  }
  drawDog(game){
   const d=game.dog;if(!d)return;
   const t=d.moveT,e=t*t*(3-2*t),cx=d.fromX+(d.x-d.fromX)*e+.5-W/2,cz=d.fromY+(d.y-d.fromY)*e+.5-H/2;
   const yaw={down:0,right:Math.PI/2,up:Math.PI,left:-Math.PI/2}[d.direction]||0;
   const motion=this.reducedMotion.matches?0:game.time,walk=d.action?0:Math.sin(motion*9)*.06,cy=d.action==='poop'?.36:.46;
   const fur=[.76,.48,.24,1],dark=[.23,.12,.075,1],cream=[.94,.79,.58,1];
   const part=(mesh,x,y,z,sx,sy,sz,color)=>this.shape(mesh,[cx+Math.cos(yaw)*x+Math.sin(yaw)*z,cy+y,cz-Math.sin(yaw)*x+Math.cos(yaw)*z],[sx,sy,sz],color,yaw);
   part(this.sphere,0,.15,0,.44,.37,.73,fur);part(this.sphere,0,.52,.64,.4,.4,.39,fur);
   part(this.sphere,0,.43,1,.27,.21,.32,cream);part(this.sphere,0,.49,1.27,.13,.1,.09,dark);
   for(const side of [-1,1]){
    part(this.sphere,side*.39,.39,.60,.16,.35,.22,dark);
    part(this.sphere,side*.18,.66,.97,.055,.07,.045,dark);
    part(this.sphere,side*.30,-.25+walk*side,.42,.14,.25,.15,cream);
    const raised=d.action==='mark'&&side===1;
    part(this.sphere,side*(raised?.52:.30),raised?.05:-.25-walk*side,-.45,.14,.25,.15,cream);
   }
   part(this.sphere,0,.34,.47,.41,.065,.36,[.24,.47,.92,1]);
   for(let i=0;i<3;i++)part(this.sphere,Math.sin(motion*5)*.12*i,.23+i*.18,-.65-i*.14,.1,.16,.13,fur);
   this.shape(this.flat,[cx,.02,cz],[.59,.01,.9],[.07,.035,.1,.32],yaw);
  }
  draw(game){
   if(this.destroyed||this.gl.isContextLost())return;
   const gl=this.gl;gl.clearColor(.047,.039,.064,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   const p=this.floorProgram;gl.useProgram(p.p);this.bindAttribute(p.aPosition,this.floorPosition,3);this.bindAttribute(p.aUV,this.floorUV,2);
   gl.uniformMatrix4fv(p.uCamera,false,this.camera);gl.uniform2f(p.uGrid,W,H);gl.uniform1f(p.uComplete,game.status==='won'?1:0);gl.uniform1f(p.uFlash,this.reducedMotion.matches?0:game.flash);
   gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.photo);gl.uniform1i(p.uPhoto,0);
   gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.mask);gl.uniform1i(p.uMask,1);
   if(this.maskRevision!==game.revision||this.maskGame!==game){
    const data=new Uint8Array(game.grid.length);for(let i=0;i<data.length;i++)data[i]=game.grid[i]===1?255:game.grid[i]===2?128:0;
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,W,H,gl.LUMINANCE,gl.UNSIGNED_BYTE,data);this.maskRevision=game.revision;this.maskGame=game;
   }
   gl.drawArrays(gl.TRIANGLES,0,6);gl.activeTexture(gl.TEXTURE0);
   // The dark plate edge and cat/ball shadows make depth readable on small screens.
   this.shape(this.flat,[0,-.08,0],[W/2+.24,.01,H/2+.24],[.21,.14,.3,1]);
   this.drawEffects(game);
   for(const b of game.balls){
    const h=game.height(b),x=b.x-W/2,z=b.y-H/2;
    this.shape(this.flat,[x,.015,z],[b.r*(1+h*.18),.01,b.r*(1+h*.18)],[.06,.02,.095,.28]);
   }
   for(const b of game.balls)this.shape(this.sphere,[b.x-W/2,game.height(b),b.y-H/2],[b.r,b.r,b.r],ballColors[b.type]||BALL_TYPES[0].color);
   this.drawDog(game);this.drawCat(game);
  }
  dispose(){
   this.destroyed=true;this.photoSerial++;if(this.cancelPhoto)this.cancelPhoto();this.cancelPhoto=null;if(this.currentImage){this.currentImage.onload=null;this.currentImage.onerror=null;}
   for(const b of this.buffers)this.gl.deleteBuffer(b);for(const t of this.textures)this.gl.deleteTexture(t);for(const p of this.programs)this.gl.deleteProgram(p);
  }
 }
 globalThis.AircatRenderer=Object.freeze({Renderer,camera,multiply});
})();
