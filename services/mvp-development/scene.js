import * as T from '/assets/vendor/three.module.min.js';

// Native geometry follows the reference's fixed-camera assembly sequence.
// Seconds 8–12 provide the re-grip/lift continuation needed for a seamless loop.
export function createMvpScene(mount) {
  const canvas=document.createElement('canvas');canvas.dataset.mvpCanvas='';
  const context=canvas.getContext('webgl2',{alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
  if(!context)throw Error('WebGL unavailable');
  const renderer=new T.WebGLRenderer({canvas,context,alpha:true,antialias:true,preserveDrawingBuffer:true});
  renderer.setClearColor(0x000000,0);renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;mount.append(canvas);
  const scene=new T.Scene(),root=new T.Group();scene.add(root);
  const camera=new T.OrthographicCamera(-4,4,5,-5,.1,100);
  camera.position.set(-6.5,7.4,14);camera.lookAt(0,2.4,0);
  const studio=document.createElement('canvas');studio.width=1024;studio.height=512;
  const ec=studio.getContext('2d'),gradient=ec.createLinearGradient(0,0,0,512);
  gradient.addColorStop(0,'#c7c9dd');gradient.addColorStop(.3,'#45445f');gradient.addColorStop(.6,'#151020');gradient.addColorStop(1,'#03030a');
  ec.fillStyle=gradient;ec.fillRect(0,0,1024,512);ec.fillStyle='#fff1ff';ec.fillRect(80,60,210,135);ec.fillStyle='#b4bbff';ec.fillRect(650,45,95,235);
  const environmentMap=new T.CanvasTexture(studio);environmentMap.colorSpace=T.SRGBColorSpace;environmentMap.mapping=T.EquirectangularReflectionMapping;
  const pmrem=new T.PMREMGenerator(renderer),environment=pmrem.fromEquirectangular(environmentMap);scene.environment=environment.texture;environmentMap.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight(0xdcd7f6,0x160c29,1.25));
  const key=new T.DirectionalLight(0xe8deff,3.2);key.position.set(-5,9,8);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-7,right:7,top:9,bottom:-3});key.shadow.normalBias=.025;scene.add(key);
  const pink=new T.PointLight(0xff20d4,105,20,2);pink.position.set(-4.5,4,3.5);scene.add(pink);
  const blue=new T.PointLight(0x306fff,90,19,2);blue.position.set(4,1.4,4);scene.add(blue);
  const upper=new T.PointLight(0xe64bff,26,12,2);upper.position.set(.4,6.3,1);scene.add(upper);
  const faceMetal=new T.MeshPhysicalMaterial({color:0x25223a,metalness:.42,roughness:.25,clearcoat:1,clearcoatRoughness:.12});
  const sideMetal=new T.MeshPhysicalMaterial({color:0x29263e,metalness:.78,roughness:.23,clearcoat:.8});
  const silver=new T.MeshPhysicalMaterial({color:0xaaa4c0,metalness:.78,roughness:.22,clearcoat:1});
  const chrome=new T.MeshPhysicalMaterial({color:0x232237,metalness:.98,roughness:.14,clearcoat:1});
  const purple=new T.MeshPhysicalMaterial({color:0x56446f,metalness:.55,roughness:.25,clearcoat:.8});
  const pinkColor=new T.Color('#ff35df'),blueColor=new T.Color('#397fff');
  const ease=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
  const mix=T.MathUtils.lerp;

  function round(w,h,r){const s=new T.Shape(),x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;}
  function led(geometry,opacity=1,offsetX=0){const a=geometry.attributes.position,colors=new Float32Array(a.count*3);for(let i=0;i<a.count;i++){const t=T.MathUtils.clamp((a.getX(i)+offsetX+3.3)/6.6,0,1),c=pinkColor.clone().lerp(blueColor,t);c.toArray(colors,i*3);}geometry.setAttribute('color',new T.BufferAttribute(colors,3));return new T.Mesh(geometry,new T.MeshBasicMaterial({vertexColors:true,transparent:opacity<1,opacity,toneMapped:false}));}
  // A clockwise outline. Positive edges are tabs; negative edges are sockets.
  function puzzleShape(edges){
    const s=new T.Shape(),h=1,r=.13,k=.55228475;
    function edge(ax,ay,bx,by,type){const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,nx=-uy,ny=ux,cx=(ax+bx)/2,cy=(ay+by)/2;
      if(type){const radius=type>0?.275:.305,n=type>0?1:-1;s.lineTo(cx-ux*radius,cy-uy*radius);s.bezierCurveTo(cx-ux*radius+nx*n*k*radius,cy-uy*radius+ny*n*k*radius,cx+nx*n*radius-ux*k*radius,cy+ny*n*radius-uy*k*radius,cx+nx*n*radius,cy+ny*n*radius);s.bezierCurveTo(cx+nx*n*radius+ux*k*radius,cy+ny*n*radius+uy*k*radius,cx+ux*radius+nx*n*k*radius,cy+uy*radius+ny*n*k*radius,cx+ux*radius,cy+uy*radius);}s.lineTo(bx,by);
    }
    s.moveTo(-h+r,h);edge(-h+r,h,h-r,h,edges[0]);s.quadraticCurveTo(h,h,h,h-r);edge(h,h-r,h,-h+r,edges[1]);s.quadraticCurveTo(h,-h,h-r,-h);edge(h-r,-h,-h+r,-h,edges[2]);s.quadraticCurveTo(-h,-h,-h,-h+r);edge(-h,-h+r,-h,h-r,edges[3]);s.quadraticCurveTo(-h,h,-h+r,h);return s;
  }
  function icon(kind){const c=document.createElement('canvas');c.width=c.height=1024;const g=c.getContext('2d');g.scale(2,2);g.strokeStyle='#fff8ff';g.lineWidth=11;g.lineCap='round';g.lineJoin='round';
    if(kind==='code'){g.beginPath();g.moveTo(180,184);g.lineTo(110,255);g.lineTo(180,326);g.moveTo(333,184);g.lineTo(403,255);g.lineTo(333,326);g.moveTo(284,157);g.lineTo(230,351);g.stroke();}
    if(kind==='bulb'){g.beginPath();g.moveTo(219,300);g.bezierCurveTo(220,273,172,250,175,207);g.bezierCurveTo(179,111,334,111,337,207);g.bezierCurveTo(340,250,292,273,293,300);g.closePath();g.stroke();for(const y of [319,341]){g.beginPath();g.moveTo(221,y);g.lineTo(291,y);g.stroke();}g.beginPath();g.moveTo(234,360);g.quadraticCurveTo(256,378,279,360);g.stroke();for(let i=0;i<7;i++){const a=Math.PI+i*Math.PI/6;g.beginPath();g.moveTo(256+110*Math.cos(a),209+110*Math.sin(a));g.lineTo(256+134*Math.cos(a),209+134*Math.sin(a));g.stroke();}}
    if(kind==='stack'){for(const y of [165,245,325]){g.beginPath();g.moveTo(151,y+25);g.lineTo(242,y-23);g.lineTo(355,y+14);g.lineTo(261,y+66);g.closePath();g.stroke();}}
    if(kind==='rocket'){g.beginPath();g.moveTo(190,301);g.bezierCurveTo(183,220,250,140,360,118);g.bezierCurveTo(349,224,302,287,225,318);g.closePath();g.stroke();g.beginPath();g.arc(289,203,24,0,Math.PI*2);g.stroke();g.beginPath();g.moveTo(191,242);g.lineTo(138,270);g.lineTo(142,326);g.lineTo(198,296);g.moveTo(262,302);g.lineTo(247,362);g.lineTo(194,379);g.lineTo(205,319);g.moveTo(166,345);g.lineTo(128,385);g.moveTo(174,362);g.lineTo(151,393);g.stroke();}
    const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return texture;
  }
  function tile(kind,edges,x,y){const group=new T.Group();group.position.set(x,y,.35);const shape=puzzleShape(edges),geometry=new T.ExtrudeGeometry(shape,{depth:.45,bevelEnabled:true,bevelSize:.025,bevelThickness:.04,bevelSegments:4,steps:1,curveSegments:36});geometry.translate(0,0,-.225);const mesh=new T.Mesh(geometry,[faceMetal,sideMetal]);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    const points=shape.getPoints(200).map(v=>new T.Vector3(v.x,v.y,.279));const curve=new T.CatmullRomCurve3(points,true,'centripetal');group.add(led(new T.TubeGeometry(curve,240,.016,6,true),1,x));group.add(led(new T.TubeGeometry(curve,240,.035,6,true),.075,x));
    const stamp=new T.Mesh(new T.PlaneGeometry(1.14,1.14),new T.MeshBasicMaterial({map:icon(kind),transparent:true,depthWrite:false,toneMapped:false}));stamp.position.z=.269;group.add(stamp);root.add(group);return group;
  }
  tile('bulb',[0,-1,1,0],-1.03,3.13);tile('code',[-1,1,0,0],-1.03,1.07);tile('rocket',[1,0,0,-1],1.03,1.07);
  const moving=tile('stack',[0,0,-1,1],1.03,4.23);

  const pedestal=new T.Group();root.add(pedestal);
  const baseMaterial=new T.MeshPhysicalMaterial({color:0x211a36,metalness:.78,roughness:.2,clearcoat:1});
  function disk(radius,height,y,material){const mesh=new T.Mesh(new T.CylinderGeometry(radius,radius,height,144),material);mesh.position.y=y;mesh.receiveShadow=true;mesh.castShadow=true;pedestal.add(mesh);}
  disk(3.3,.25,-.18,baseMaterial);disk(3.24,.055,-.025,chrome);
  const baseLed=led(new T.TorusGeometry(3.25,.022,12,160));baseLed.rotation.x=Math.PI/2;baseLed.position.y=.008;pedestal.add(baseLed);
  const halo=led(new T.TorusGeometry(3.25,.07,12,160),.07);halo.rotation.x=Math.PI/2;halo.position.y=-.005;pedestal.add(halo);
  function floorLight(x,color){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d'),v=g.createRadialGradient(128,128,0,128,128,128);v.addColorStop(0,color);v.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=v;g.fillRect(0,0,256,256);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const mesh=new T.Mesh(new T.PlaneGeometry(4.8,4.8),new T.MeshBasicMaterial({map:tex,transparent:true,opacity:.35,depthWrite:false,toneMapped:false}));mesh.rotation.x=-Math.PI/2;mesh.position.set(x,-.315,1);root.add(mesh);return mesh;}
  const poolPink=floorLight(-1.9,'rgba(217,21,195,.4)'),poolBlue=floorLight(1.9,'rgba(44,86,245,.35)');
  const floor=new T.Mesh(new T.CircleGeometry(5.2,96),new T.ShadowMaterial({opacity:.23,depthWrite:false}));floor.rotation.x=-Math.PI/2;floor.position.y=-.32;floor.receiveShadow=true;root.add(floor);

  const sphereGeometry=new T.SphereGeometry(1,32,24),limbGeometry=new T.CylinderGeometry(1,1,1,16);
  const up=new T.Vector3(0,1,0),direction=new T.Vector3();
  function sphere(parent,r,material,x=0,y=0,z=0){const mesh=new T.Mesh(sphereGeometry,material);mesh.scale.setScalar(r);mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh;}
  function segment(parent,r,material){const mesh=new T.Mesh(limbGeometry,material);mesh.castShadow=true;parent.add(mesh);return {mesh,r};}
  function between(part,a,b){direction.subVectors(b,a);const len=direction.length();part.mesh.position.copy(a).add(b).multiplyScalar(.5);part.mesh.quaternion.setFromUnitVectors(up,direction.normalize());part.mesh.scale.set(part.r,len,part.r);}
  function figure(){const group=new T.Group();root.add(group);const body=new T.Mesh(new T.CapsuleGeometry(.17,.35,8,16),silver);body.position.set(0,.87,0);body.castShadow=true;group.add(body);sphere(group,.19,purple,0,.57,0);const head=sphere(group,.27,chrome,0,1.40,0);const collar=new T.Mesh(new T.TorusGeometry(.115,.025,10,32),purple);collar.rotation.x=Math.PI/2;collar.position.y=1.16;group.add(collar);
    const legs=[],arms=[];for(const sign of [-1,1]){const hip=new T.Vector3(sign*.115,.6,0),knee=new T.Vector3(sign*.14,.32,.035),foot=new T.Vector3(sign*.15,.08,.08);const upperLeg=segment(group,.08,silver),lowerLeg=segment(group,.07,silver),kneeBall=sphere(group,.083,silver);const shoe=new T.Mesh(new T.CapsuleGeometry(.08,.15,6,12),silver);shoe.rotation.x=Math.PI/2;shoe.position.copy(foot);shoe.castShadow=true;group.add(shoe);legs.push({hip,knee,foot,upperLeg,lowerLeg,kneeBall,shoe,sign});
      const shoulder=new T.Vector3(sign*.21,1.04,.015);sphere(group,.09,silver,...shoulder.toArray());arms.push({shoulder,upper:segment(group,.065,silver),lower:segment(group,.057,silver),elbow:sphere(group,.073,silver),hand:sphere(group,.065,silver),sign});}
    function arm(index,target){const part=arms[index],elbow=part.shoulder.clone().lerp(target,.52);elbow.z+=.17;elbow.y-=.055;between(part.upper,part.shoulder,elbow);between(part.lower,elbow,target);part.elbow.position.copy(elbow);part.hand.position.copy(target);}
    function stance(step=0){legs.forEach(part=>{const lift=Math.max(0,Math.sin(step+part.sign*Math.PI))*.15;const knee=part.knee.clone();knee.y+=lift*.65;knee.z+=lift;const foot=part.foot.clone();foot.y+=lift;foot.z+=lift*.45;between(part.upperLeg,part.hip,knee);between(part.lowerLeg,knee,foot);part.kneeBall.position.copy(knee);part.shoe.position.copy(foot);});}
    return {group,head,arm,stance};
  }
  const reader=figure();reader.group.position.set(-2.75,.045,1.05);reader.group.scale.setScalar(.83);reader.group.rotation.y=.13;
  const tablet=new T.Mesh(new T.ExtrudeGeometry(round(.42,.54,.04),{depth:.035,bevelEnabled:true,bevelSize:.015,bevelThickness:.01,bevelSegments:2,curveSegments:12}),chrome);tablet.position.set(-.025,.92,.38);tablet.rotation.set(-.23,.12,-.09);reader.group.add(tablet);
  const screen=new T.Mesh(new T.PlaneGeometry(.33,.43),new T.MeshBasicMaterial({color:0x392c65}));screen.position.z=.05;tablet.add(screen);for(let i=0;i<3;i++){const line=new T.Mesh(new T.PlaneGeometry(.21-i*.03,.012),new T.MeshBasicMaterial({color:i===0?0xe2b6fb:0x9d88d9}));line.position.set(-.01,.105-i*.065,.052);tablet.add(line);}
  const guide=figure();guide.group.scale.setScalar(.85);

  const rig=new T.Group();root.add(rig);const hub=sphere(rig,.18,chrome);const ring=new T.Mesh(new T.TorusGeometry(.115,.025,12,40),silver);ring.position.y=-.30;rig.add(ring);
  const hubBand=new T.Mesh(new T.TorusGeometry(.16,.012,10,48),new T.MeshBasicMaterial({color:0xc967ef}));hubBand.rotation.x=Math.PI/2;hubBand.position.y=-.07;rig.add(hubBand);
  const rope=[segment(root,.009,silver),segment(root,.007,chrome)];
  const claw=Array.from({length:3},()=>({arm:segment(root,.021,silver),tip:sphere(root,.035,chrome)}));
  const fixedTop=new T.Vector3(1.2,8.5,.25),hook=new T.Vector3();
  const anchors=[new T.Vector3(-.68,.94,.27),new T.Vector3(.68,.94,.27),new T.Vector3(.2,.96,-.24)];
  const freeEnds=[new T.Vector3(-.35,-.90,.18),new T.Vector3(.35,-.90,.18),new T.Vector3(.05,-.83,-.22)];
  const handPoints=[new T.Vector3(.80,-.75,.31),new T.Vector3(.98,-.65,.31)];
  const seatedHub=new T.Vector3(1.03,5.13,.35);
  let width=0,height=0;
  function resize(){const size=mount.getBoundingClientRect();if(!size.width||!size.height)return;width=size.width;height=size.height;renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(width,height,false);const aspect=width/height,h=Math.max(8.6,7.8/aspect);camera.left=-h*aspect/2;camera.right=h*aspect/2;camera.top=h/2;camera.bottom=-h/2;camera.updateProjectionMatrix();}
  function render(time){
    const t=((time%12)+12)%12;
    let offset=1.1,side=.18,tilt=.12,release=0,hubLift=0,guideY=2.05,guideX=2.28,guideWeight=1,step=0;
    if(t<1.75){const q=ease(t/1.75);offset+=.18*q;side+=.12*q;tilt+=.025*q;guideY+=.08*q;}
    else if(t<5.25){const q=ease((t-1.75)/3.5);offset=1.28*(1-q);side=.30*(1-q);tilt=.145*(1-q);guideY=mix(2.13,1.73,q);}
    else if(t<6.3){offset=side=tilt=0;release=ease((t-5.25)/.32);hubLift=1.05*ease((t-5.45)/.8);const q=ease((t-5.35)/.95);guideY=mix(1.73,.045,q);guideX=2.28+.20*q;guideWeight=1-ease((t-5.25)/.6);step=q*Math.PI*4;}
    else if(t<6.75){offset=side=tilt=0;release=1;hubLift=1.05;guideY=.045;guideX=2.48;guideWeight=0;}
    else if(t<8){offset=side=tilt=0;release=1;hubLift=1.05*(1-ease((t-6.75)/1.25));guideY=.045;guideX=2.48;guideWeight=0;}
    else if(t<9.6){offset=side=tilt=0;release=1-ease((t-8)/.45);const q=ease((t-8)/1.6);guideY=mix(.045,1.73,q);guideX=mix(2.48,2.28,q);guideWeight=ease((t-8.7)/.9);step=(1-q)*Math.PI*4;}
    else{const q=ease((t-9.6)/2.4);offset=1.1*q;side=.18*q;tilt=.12*q;guideY=mix(1.73,2.05,q);}
    moving.position.set(1.03+side,3.13+offset,.35+.045*(offset/1.28));moving.rotation.set(.025*offset/1.28,-.055*offset/1.28,tilt);moving.updateMatrixWorld(true);
    rig.position.copy(moving.position).add(new T.Vector3(0,2+hubLift,0));rig.position.x-=.08*(offset/1.28);rig.updateMatrixWorld(true);
    hook.copy(rig.position).add(new T.Vector3(0,-.39,0));
    for(let i=0;i<2;i++){const delta=(i-.5)*.025,top=fixedTop.clone();top.x+=delta;const bottom=rig.position.clone();bottom.x+=delta;bottom.y+=.15;between(rope[i],top,bottom);}
    claw.forEach((part,i)=>{const attached=moving.localToWorld(anchors[i].clone()),free=rig.localToWorld(freeEnds[i].clone()),end=attached.lerp(free,release);between(part.arm,hook,end);part.tip.position.copy(end);});
    guide.group.position.set(guideX,guideY+.40*(offset/1.28),1.05);guide.group.rotation.y=-.25;guide.group.updateMatrixWorld(true);
    for(let i=0;i<2;i++){const target=guide.group.worldToLocal(moving.localToWorld(handPoints[i].clone())),rest=new T.Vector3((i===0?-1:1)*.17,.72,.18);target.lerp(rest,1-guideWeight);guide.arm(i,target);}
    guide.stance(step);guide.head.rotation.y=-.12+Math.sin(t*Math.PI/6)*.025;
    reader.arm(0,new T.Vector3(-.20,.97,.39));reader.arm(1,new T.Vector3(.18,.88,.41));reader.stance();reader.head.rotation.set(-.14,.16+.025*Math.sin(t*Math.PI/6),0);
    poolPink.material.opacity=.32+.025*Math.sin(t*Math.PI/6);poolBlue.material.opacity=.32-.025*Math.sin(t*Math.PI/6);
    renderer.render(scene,camera);
  }
  resize();return {canvas,resize,render};
}
