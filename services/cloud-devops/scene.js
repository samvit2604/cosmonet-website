import * as T from '/assets/vendor/three.module.min.js';
import { createCloudBloom } from './bloom.js?v=8';

// A native reconstruction of the supplied cloud infrastructure composition.
// Hardware stays anchored. Parallel ingress and the infinity glow follow the reference timing.
export function createCloudScene(mount) {
  const canvas=document.createElement('canvas');canvas.dataset.cloudCanvas='';
  const context=canvas.getContext('webgl2',{alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
  if(!context)throw Error('WebGL unavailable');
  const renderer=new T.WebGLRenderer({canvas,context,alpha:true,antialias:true,preserveDrawingBuffer:true});
  renderer.setClearColor(0x000000,0);renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;mount.append(canvas);
  const bloom=createCloudBloom(renderer);
  const scene=new T.Scene(),root=new T.Group();scene.add(root);
  const camera=new T.OrthographicCamera(-5,5,4,-4,.1,80);camera.position.set(7,6.5,10);camera.lookAt(0,2.05,0);
  const studio=document.createElement('canvas');studio.width=1024;studio.height=512;
  const ec=studio.getContext('2d'),wash=ec.createLinearGradient(0,0,0,512);
  wash.addColorStop(0,'#d8d8e9');wash.addColorStop(.3,'#65647c');wash.addColorStop(.6,'#21192c');wash.addColorStop(1,'#06040e');ec.fillStyle=wash;ec.fillRect(0,0,1024,512);
  ec.fillStyle='#fff1ff';ec.fillRect(85,65,235,120);ec.fillStyle='#bbbfff';ec.fillRect(665,55,115,240);
  const env=new T.CanvasTexture(studio);env.colorSpace=T.SRGBColorSpace;env.mapping=T.EquirectangularReflectionMapping;
  const pmrem=new T.PMREMGenerator(renderer),environment=pmrem.fromEquirectangular(env);scene.environment=environment.texture;env.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight(0xe8e1ff,0x23112f,1.35));
  const key=new T.DirectionalLight(0xfff3ff,3.4);key.position.set(-5,10,8);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-7,right:7,top:8,bottom:-5});key.shadow.normalBias=.025;scene.add(key);
  const pink=new T.PointLight(0xff28d5,90,18,2);pink.position.set(-5,4,4);scene.add(pink);
  const blue=new T.PointLight(0x386dff,90,18,2);blue.position.set(5,2.7,4);scene.add(blue);
  const topLight=new T.PointLight(0xaf6ff5,16,10,2);topLight.position.set(0,6,2);scene.add(topLight);
  const bodyMaterial=new T.MeshPhysicalMaterial({color:0x58237d,metalness:.48,roughness:.22,clearcoat:1,clearcoatRoughness:.12,envMapIntensity:1.15});
  const sideMaterial=new T.MeshPhysicalMaterial({color:0x55298a,metalness:.62,roughness:.20,clearcoat:1,clearcoatRoughness:.10,envMapIntensity:1.35});
  const darkMetal=new T.MeshPhysicalMaterial({color:0x35204f,metalness:.64,roughness:.22,clearcoat:1,envMapIntensity:1.15});
  const pipeMaterial=new T.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,metalness:.42,roughness:.18,clearcoat:1,clearcoatRoughness:.08,emissive:0x45135d,emissiveIntensity:.10,envMapIntensity:1.25});
  const pinkColor=new T.Color('#f644d6'),blueColor=new T.Color('#4c7cfa');
  const smooth=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
  const activity=(t,a,b)=>t<=a||t>=b?0:Math.sin(Math.PI*(t-a)/(b-a))**2;
  const axisY=new T.Vector3(0,1,0),axisZ=new T.Vector3(0,0,1);
  const edgeMaterials=[];
  // Weld the shading normals along the curved depth and bevel. The mesh
  // silhouette remains exact, without visible strips on polished surfaces.
  function polish(geometry){
    const positions=geometry.attributes.position,normals=geometry.attributes.normal,sums=new Map(),indices=[];
    for(const group of geometry.groups){if(group.materialIndex!==1)continue;
      for(let i=group.start;i<group.start+group.count;i++){
        const key=[positions.getX(i),positions.getY(i),positions.getZ(i)].map(v=>Math.round(v*100000)).join(',');
        const normal=sums.get(key)||new T.Vector3();normal.x+=normals.getX(i);normal.y+=normals.getY(i);normal.z+=normals.getZ(i);sums.set(key,normal);indices.push([i,key]);
      }
    }
    for(const [i,key]of indices){const normal=sums.get(key).clone().normalize();normals.setXYZ(i,normal.x,normal.y,normal.z);}
    normals.needsUpdate=true;return geometry;
  }
  function rounded(w,h,r){const s=new T.Shape(),x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;}
  function colorGeometry(geometry,offset=0){const a=geometry.attributes.position,c=new Float32Array(a.count*3);for(let i=0;i<a.count;i++){pinkColor.clone().lerp(blueColor,T.MathUtils.clamp((a.getX(i)+offset+3.4)/6.8,0,1)).toArray(c,i*3);}geometry.setAttribute('color',new T.BufferAttribute(c,3));return geometry;}
  // Soft silver carries the coloured studio reflections without becoming a
  // dark disc. Vertex colour keeps the source's pale pink-to-cyan rim tint.
  function silverGeometry(geometry){
    const positions=geometry.attributes.position,colors=new Float32Array(positions.count*3);
    const rose=new T.Color('#f0c5e8'),silver=new T.Color('#eeebf4'),ice=new T.Color('#b1d9f5');
    for(let i=0;i<positions.count;i++){
      const u=T.MathUtils.clamp((positions.getX(i)+4)/8,0,1);
      const color=u<.5?rose.clone().lerp(silver,u*2):silver.clone().lerp(ice,(u-.5)*2);
      color.toArray(colors,i*3);
    }
    geometry.setAttribute('color',new T.BufferAttribute(colors,3));return geometry;
  }
  // The cloud keeps a saturated face and polished cyan depth, matching the
  // three-lobed reference instead of relying on lights to colour a black cap.
  function cloudColors(geometry){
    const positions=geometry.attributes.position,normals=geometry.attributes.normal,colors=new Float32Array(positions.count*3);
    const magenta=new T.Color('#dd16d5'),violet=new T.Color('#8422cf'),blue=new T.Color('#2152de'),cyan=new T.Color('#16b9f4');
    for(let i=0;i<positions.count;i++){
      const u=T.MathUtils.clamp((positions.getX(i)+2.6)/5.2,0,1),side=Math.abs(normals.getZ(i))<.72;
      let color;
      if(side)color=magenta.clone().lerp(cyan,u);
      else color=u<.5?magenta.clone().lerp(violet,u*2):violet.clone().lerp(blue,(u-.5)*2);
      color.multiplyScalar(side?1:.90+.08*T.MathUtils.clamp((positions.getY(i)+1.1)/3.2,0,1));
      color.toArray(colors,i*3);
    }
    geometry.setAttribute('color',new T.BufferAttribute(colors,3));return geometry;
  }
  function outline(parent,shape,z,offset=0,radius=.012,opacity=.85){const points=shape.getPoints(180).map(v=>new T.Vector3(v.x,v.y,z));const curve=new T.CatmullRomCurve3(points,true,'centripetal');const geometry=colorGeometry(new T.TubeGeometry(curve,220,radius,6,true),offset);const material=new T.MeshBasicMaterial({vertexColors:true,transparent:true,opacity,toneMapped:false});const mesh=new T.Mesh(geometry,material);parent.add(mesh);return material;}
  function block(w,h,d,x,y,z,material=bodyMaterial){const group=new T.Group();group.position.set(x,y,z);const shape=rounded(w,h,Math.min(.13,h*.3)),geometry=new T.ExtrudeGeometry(shape,{depth:d,steps:1,bevelEnabled:true,bevelSize:.035,bevelThickness:.04,bevelSegments:4,curveSegments:24});geometry.translate(0,0,-d/2);polish(geometry);const mesh=new T.Mesh(geometry,[material,sideMaterial]);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);root.add(group);return {group,shape,w,h,d};}
  function band(parent,w,d,y,xOffset){const shape=rounded(w,d,.13),points=shape.getPoints(100).map(v=>new T.Vector3(v.x,y,v.y));const path=new T.CatmullRomCurve3(points,true,'centripetal');const geometry=colorGeometry(new T.TubeGeometry(path,160,.012,6,true),xOffset),material=new T.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.72,toneMapped:false});parent.add(new T.Mesh(geometry,material));return material;}
  function texture(kind,glow=false,side=null){const c=document.createElement('canvas');c.width=1024;c.height=640;const g=c.getContext('2d');g.strokeStyle='#fff8ff';g.lineWidth=glow?64:48;g.shadowBlur=glow?70:0;g.shadowColor='#fff0ff';g.lineCap='round';g.lineJoin='round';if(side){g.beginPath();g.rect(side==='left'?0:512,0,512,640);g.clip();}g.beginPath();if(kind==='infinity'){for(let i=0;i<=256;i++){const a=i/256*Math.PI*2,x=512+350*Math.cos(a),y=320+193*Math.sin(2*a);i?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();}else{g.moveTo(380,190);g.lineTo(235,320);g.lineTo(380,450);g.moveTo(644,190);g.lineTo(789,320);g.lineTo(644,450);g.moveTo(570,145);g.lineTo(450,495);g.stroke();}const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return tex;}

  // Three smoothly joined lobes with the same low, broad cloud silhouette.
  const cloudShape=new T.Shape();cloudShape.moveTo(-1.64,-.94);
  cloudShape.bezierCurveTo(-2.36,-.94,-2.58,-.35,-2.54,.16);
  cloudShape.bezierCurveTo(-2.50,.85,-1.94,1.40,-1.28,1.29);
  cloudShape.bezierCurveTo(-1.08,1.26,-.91,1.12,-.84,1.18);
  cloudShape.bezierCurveTo(-.60,2.13,.10,2.15,.73,1.85);
  cloudShape.bezierCurveTo(1.24,1.61,1.40,1.13,1.43,.74);
  cloudShape.bezierCurveTo(1.47,.55,1.73,.60,1.92,.48);
  cloudShape.bezierCurveTo(2.53,.12,2.61,-.75,2.05,-1.03);
  cloudShape.bezierCurveTo(1.85,-1.15,1.57,-1.13,1.33,-1.10);
  cloudShape.lineTo(-1.64,-.94);
  const cloud=new T.Group();cloud.position.set(0,3.25,-.65);root.add(cloud);
  const cloudGeometry=new T.ExtrudeGeometry(cloudShape,{depth:.68,steps:1,bevelEnabled:true,bevelSize:.065,bevelThickness:.06,bevelSegments:6,curveSegments:48});cloudGeometry.translate(0,0,-.34);
  polish(cloudGeometry);cloudColors(cloudGeometry);
  const cloudNormals=cloudGeometry.attributes.normal,cloudPositions=cloudGeometry.attributes.position;
  for(let i=0;i<cloudNormals.count;i++){if(cloudNormals.getZ(i)>.999){const n=new T.Vector3(cloudPositions.getX(i)*.055,(cloudPositions.getY(i)-.35)*.055,1).normalize();cloudNormals.setXYZ(i,n.x,n.y,n.z);}}
  const cloudFaceMaterial=new T.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,metalness:.40,roughness:.23,clearcoat:1,clearcoatRoughness:.12,envMapIntensity:1.10});
  const cloudDepthMaterial=new T.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,metalness:.66,roughness:.18,clearcoat:1,clearcoatRoughness:.08,envMapIntensity:.85});
  const cloudMesh=new T.Mesh(cloudGeometry,[cloudFaceMaterial,cloudDepthMaterial]);cloudMesh.castShadow=true;cloudMesh.receiveShadow=true;cloud.add(cloudMesh);
  // Front cap extends to .400; both rim and stamp sit outside it.
  const cloudEdge=outline(cloud,cloudShape,.418,0,.014,.82);
  const infinity=new T.Mesh(new T.PlaneGeometry(2.15,1.34),new T.MeshBasicMaterial({map:texture('infinity'),transparent:true,depthWrite:false,toneMapped:false}));infinity.position.set(0,.45,.425);cloud.add(infinity);
  const infinityHaloMaterial=new T.MeshBasicMaterial({map:texture('infinity',true,'left'),transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
  const infinityHalo=new T.Mesh(new T.PlaneGeometry(2.15,1.34),infinityHaloMaterial);infinityHalo.position.set(0,.45,.423);cloud.add(infinityHalo);
  const infinityRightHaloMaterial=infinityHaloMaterial.clone();infinityRightHaloMaterial.map=texture('infinity',true,'right');
  const infinityRightHalo=new T.Mesh(new T.PlaneGeometry(2.15,1.34),infinityRightHaloMaterial);infinityRightHalo.position.copy(infinityHalo.position);cloud.add(infinityRightHalo);
  const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=256;
  const gc=glowCanvas.getContext('2d'),radial=gc.createRadialGradient(128,128,0,128,128,128);
  radial.addColorStop(0,'rgba(255,255,255,1)');radial.addColorStop(.13,'rgba(255,250,255,.95)');radial.addColorStop(.35,'rgba(217,198,255,.46)');radial.addColorStop(.7,'rgba(163,121,255,.11)');radial.addColorStop(1,'rgba(163,121,255,0)');gc.fillStyle=radial;gc.fillRect(0,0,256,256);
  const glowTexture=new T.CanvasTexture(glowCanvas);glowTexture.colorSpace=T.SRGBColorSpace;
  function glowSprite(parent,size){const sprite=new T.Sprite(new T.SpriteMaterial({map:glowTexture,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false}));sprite.scale.setScalar(size);parent.add(sprite);return sprite;}
  infinityHaloMaterial.color.setRGB(2.4,2.4,2.4);infinityRightHaloMaterial.color.setRGB(2.4,2.4,2.4);
  const glyphGlow=glowSprite(cloud,.72),glyphRightGlow=glowSprite(cloud,.72);
  glyphGlow.position.set(-.37,.45,.47);glyphRightGlow.position.set(.37,.45,.47);
  const infinityLeftLight=new T.PointLight(0xffdfff,0,2.4,2),infinityRightLight=new T.PointLight(0xe4eeff,0,2.4,2);
  infinityLeftLight.position.set(-.38,.45,.70);infinityRightLight.position.set(.38,.45,.70);cloud.add(infinityLeftLight,infinityRightLight);
  const glyphDot=new T.Mesh(new T.SphereGeometry(.060,20,14),new T.MeshBasicMaterial({color:0xfffaff,transparent:true,opacity:0,toneMapped:false}));cloud.add(glyphDot);

  const serverEdges=[],serverDots=[];
  const whiteLed=new T.MeshBasicMaterial({color:0xe9c9ff,toneMapped:false});
  for(let i=0;i<3;i++){
    const unit=block(1.27,.33,1.10,-2.52,.235+i*.37,.68);
    serverEdges.push(band(unit.group,1.28,1.11,-.10,-2.52));
    for(let j=0;j<2;j++){const material=whiteLed.clone();const dot=new T.Mesh(new T.SphereGeometry(.027,16,12),material);dot.position.set(-.18+j*.12,-.015,.598);unit.group.add(dot);serverDots.push({material,row:i,column:j});}
  }
  const rightBase=block(1.72,.32,1.34,2.35,.20,.56,darkMetal),rightEdges=[band(rightBase.group,1.73,1.35,-.09,2.35)];
  for(let i=0;i<2;i++){const unit=block(1.27,.34,1.08,2.35,.55+i*.38,.56);rightEdges.push(band(unit.group,1.28,1.09,-.10,2.35));}
  const codeBase=block(1.83,.25,1.45,.05,.155,2.27,darkMetal),codeUnit=block(1.47,.53,1.17,.05,.59,2.27),codeEdges=[band(codeBase.group,1.84,1.46,-.07,.05),band(codeUnit.group,1.48,1.18,-.19,.05)];
  const codeStamp=new T.Mesh(new T.PlaneGeometry(.86,.54),new T.MeshBasicMaterial({map:texture('code'),transparent:true,depthWrite:false,toneMapped:false}));codeStamp.rotation.x=-Math.PI/2;codeStamp.position.set(0,.312,0);codeUnit.group.add(codeStamp);
  const codeConfirmEdge=band(codeUnit.group,1.48,1.18,.322,.05);codeConfirmEdge.opacity=.16;
  const codeHaloMaterial=new T.MeshBasicMaterial({map:texture('code',true),transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
  const codeHalo=new T.Mesh(new T.PlaneGeometry(.86,.54),codeHaloMaterial);codeHalo.rotation.x=-Math.PI/2;codeHalo.position.set(0,.311,0);codeUnit.group.add(codeHalo);
  for(const [x,z,size]of[[-1.76,2.60,.36],[2.32,2.55,.36]]){const cube=block(size,.30,size,x,.185,z);band(cube.group,size+.01,size+.01,-.095,x);}

  // Circular plinth remains fixed throughout the deployment sequence.
  const pedestal=new T.Group();root.add(pedestal);
  const plinthProfile=[[0,-.32],[3.91,-.32],[3.98,-.30],[4,-.25],[4,-.08],[3.99,-.035],[3.96,-.02],[0,-.02]].map(([r,y])=>new T.Vector2(r,y));
  const plinthGeometry=silverGeometry(new T.LatheGeometry(plinthProfile,160));
  const plinthMaterial=new T.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,metalness:.48,roughness:.24,clearcoat:1,clearcoatRoughness:.13,envMapIntensity:.95});
  const plinth=new T.Mesh(plinthGeometry,plinthMaterial);plinth.receiveShadow=true;plinth.castShadow=true;pedestal.add(plinth);
  const topGeometry=silverGeometry(new T.CylinderGeometry(3.97,3.97,.045,160));
  const topMaterial=new T.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,metalness:.30,roughness:.25,clearcoat:.95,clearcoatRoughness:.14,envMapIntensity:.85});
  const top=new T.Mesh(topGeometry,topMaterial);top.position.y=.002;top.receiveShadow=true;pedestal.add(top);
  const rimGeometry=colorGeometry(new T.TorusGeometry(3.98,.018,12,180)),rimMaterial=new T.MeshBasicMaterial({vertexColors:true,toneMapped:false});const rim=new T.Mesh(rimGeometry,rimMaterial);rim.rotation.x=Math.PI/2;rim.position.y=.029;pedestal.add(rim);
  // The source's base is fixed: a broad white arc moves over its top lip,
  // from screen-right to front-centre to front-left after the infinity peak.
  const rimUniforms={head:{value:0},width:{value:.48},energy:{value:0}};
  const rimPulseMaterial=new T.ShaderMaterial({uniforms:rimUniforms,transparent:true,depthWrite:false,toneMapped:false,
    vertexShader:'varying float angle;void main(){angle=atan(position.y,position.x);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying float angle;uniform float head;uniform float width;uniform float energy;
      void main(){float d=atan(sin(angle-head),cos(angle-head));float a=exp(-.5*d*d/(width*width))*energy;
        gl_FragColor=vec4(vec3(4.2),a);}`});
  const rimPulse=new T.Mesh(new T.TorusGeometry(3.985,.029,16,256),rimPulseMaterial);
  rimPulse.rotation.x=Math.PI/2;rimPulse.position.y=.037;pedestal.add(rimPulse);
  const rimLight=new T.PointLight(0xfff5ff,0,2.0,2);scene.add(rimLight);
  const sparkles=[];
  for(let i=0;i<9;i++){
    const angle=-.35+i*.33,radius=3.55+(i%3)*.12;
    const sparkle=glowSprite(pedestal,.10+(i%2)*.025);
    sparkle.position.set(Math.cos(angle)*radius,.05,Math.sin(angle)*radius);
    sparkle.material.color.setRGB(2.1,2.1,2.1);sparkles.push(sparkle);
  }
  const floor=new T.Mesh(new T.CircleGeometry(5.5,96),new T.ShadowMaterial({opacity:.20,depthWrite:false}));floor.rotation.x=-Math.PI/2;floor.position.y=-.34;floor.receiveShadow=true;root.add(floor);

  function collar(point,tangent,color,radius=.158){const group=new T.Group();group.position.copy(point);group.quaternion.setFromUnitVectors(axisZ,tangent.clone().normalize());const metal=new T.Mesh(new T.CylinderGeometry(radius,radius,.15,32),new T.MeshPhysicalMaterial({color:0x5e417e,metalness:.58,roughness:.2,clearcoat:1}));metal.rotation.x=Math.PI/2;group.add(metal);for(const z of [-.075,.075]){const ring=new T.Mesh(new T.TorusGeometry(radius,.014,10,40),new T.MeshBasicMaterial({color,toneMapped:false}));ring.position.z=z;group.add(ring);}root.add(group);return group;}
  function port(x,y,z){const unit=block(.39,.43,.40,x,y,z,darkMetal);outline(unit.group,unit.shape,.256,x,.009,.6);return unit;}
  const leftPort=port(-.87,2.20,-.20),rightPort=port(.86,2.12,-.20);
  const leftPortGlow=glowSprite(leftPort.group,.75),rightPortGlow=glowSprite(rightPort.group,.75);
  leftPortGlow.position.set(0,-.12,.27);rightPortGlow.position.set(0,-.12,.27);
  const paths=[
    [new T.Vector3(-1.85,.58,.72),new T.Vector3(-1.42,.50,1.00),new T.Vector3(-.91,.64,.79),new T.Vector3(-.86,1.20,.10),new T.Vector3(-.87,1.99,-.20)],
    [new T.Vector3(.86,1.91,-.20),new T.Vector3(.86,1.16,.03),new T.Vector3(1.08,.60,.43),new T.Vector3(1.28,.43,.89)],
    [new T.Vector3(1.28,.43,.89),new T.Vector3(1.40,.43,1.40),new T.Vector3(1.28,.43,1.91),new T.Vector3(.83,.49,2.28)],
  ];
  const pipes=paths.map((points,i)=>{
    const curve=new T.CatmullRomCurve3(points,false,'centripetal');
    const geometry=colorGeometry(new T.TubeGeometry(curve,144,.108,24,false)),mesh=new T.Mesh(geometry,pipeMaterial);
    mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
    if(i!==2)collar(curve.getPointAt(i===0?.45:.96),curve.getTangentAt(i===0?.45:.96),i===0?0xf76be8:0x8a9eff);
    const uniforms={head:{value:-1},tail:{value:-1},energy:{value:0},reverse:{value:i===0?0:1}};
    const material=new T.ShaderMaterial({uniforms,transparent:true,depthWrite:false,toneMapped:false,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:`varying vec2 vUv;uniform float head;uniform float tail;uniform float energy;uniform float reverse;
        void main(){float u=mix(vUv.x,1.0-vUv.x,reverse);
          float fill=(1.0-smoothstep(head-.10,head+.10,u))*smoothstep(tail-.13,tail+.13,u)*energy;
          gl_FragColor=vec4(vec3(3.8),fill);}`});
    const core=new T.Mesh(new T.TubeGeometry(curve,144,.113,24,false),material);root.add(core);
    const light=new T.PointLight(i===0?0xffe4fd:0xebefff,0,1.8,2);scene.add(light);
    return {curve,core,uniforms,light};
  });
  function flow(pipe,t,start,end,reverse=false){
    const duration=end-start,progress=(t-start)/duration;
    const gate=smooth((t-start)/.14)*(1-smooth((t-end)/.38));
    pipe.uniforms.head.value=progress*1.14;
    pipe.uniforms.tail.value=(t-start-.95)/duration*1.14-.12;
    pipe.uniforms.energy.value=gate;
    pipe.core.visible=gate>.0001;
    const u=T.MathUtils.clamp(progress,0,1);
    pipe.light.position.copy(pipe.curve.getPointAt(reverse?1-u:u)).add(new T.Vector3(0,.10,.06));
    pipe.light.intensity=4.5*gate*Math.sin(Math.PI*u);
  }
  let oldWidth=0,oldHeight=0;
  function resize(){const {width,height}=mount.getBoundingClientRect();if(!width||!height)return;oldWidth=width;oldHeight=height;renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(width,height,false);const aspect=width/height,h=Math.max(7.3,9.0/aspect)*1.12;camera.left=-h*aspect/2;camera.right=h*aspect/2;camera.top=h/2;camera.bottom=-h/2;camera.updateProjectionMatrix();}
  // Per-frame halo brightness sampled from the two source infinity loops.
  const referenceGlow=[[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0018,0.0037,0.0056,0.007,0.0081,0.0088,0.0094,0.0097,0.0099,0.0099,0.0101,0.0102,0.0105,0.0107,0.0111,0.0114,0.0117,0.0118,0.0121,0.0122,0.0123,0.0124,0.0126,0.0126,0.0125,0.0124,0.0124,0.0126,0.013,0.0136,0.0139,0.0139,0.0138,0.0145,0.0165,0.02,0.0264,0.0366,0.0521,0.0719,0.0975,0.1286,0.1653,0.2039,0.2438,0.2838,0.3254,0.3668,0.4092,0.4517,0.4954,0.5376,0.5779,0.6151,0.6507,0.6838,0.7156,0.7451,0.7739,0.8007,0.8265,0.8501,0.8728,0.8934,0.9131,0.9307,0.947,0.9607,0.9725,0.9813,0.9878,0.9921,0.9953,0.9979,1.0,1.0,1.0,1.0,0.9999,0.9957,0.9897,0.981,0.9709,0.9583,0.9447,0.9291,0.9129,0.8949,0.8764,0.8565,0.8363,0.8142,0.791,0.7658,0.7399,0.7121,0.6836,0.6531,0.6223,0.5898,0.5569,0.5224,0.4882,0.4523,0.4163,0.3792,0.3426,0.3047,0.2665,0.2275,0.1893,0.1505,0.1143,0.0825,0.0607,0.0479,0.0432,0.0419,0.0424,0.0427,0.043,0.0434,0.044,0.0443,0.0443,0.0441,0.0441,0.0443,0.0446,0.0449,0.0454,0.0458,0.0462,0.0465,0.0469,0.0472,0.0476,0.0479,0.0485,0.0489,0.0492,0.0494,0.0498,0.05,0.0503,0.0505,0.051,0.0514,0.0518,0.0522,0.0528,0.0532,0.0539,0.0547,0.0558,0.0568,0.058,0.0592,0.0608,0.062,0.0628,0.063,0.0631],[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0004,0.002,0.0031,0.004,0.0042,0.0041,0.0035,0.003,0.0026,0.0024,0.0022,0.0023,0.0022,0.002,0.0017,0.0015,0.0013,0.0011,0.0009,0.0009,0.0009,0.0012,0.0019,0.0032,0.0049,0.0078,0.0127,0.0204,0.0294,0.0402,0.0526,0.0684,0.086,0.1082,0.1362,0.1727,0.2134,0.2575,0.3038,0.3549,0.408,0.4627,0.5166,0.5709,0.6227,0.6722,0.7177,0.761,0.8007,0.8376,0.8701,0.8984,0.9216,0.9407,0.9554,0.9671,0.9757,0.9832,0.9895,0.9954,0.9996,1.0,1.0,1.0,1.0,0.9978,0.9911,0.9821,0.9703,0.9569,0.9415,0.9252,0.9067,0.8873,0.8663,0.845,0.8217,0.7974,0.7711,0.7444,0.7157,0.6862,0.6549,0.6234,0.5901,0.5563,0.521,0.4862,0.4499,0.4135,0.3756,0.3381,0.2991,0.26,0.22,0.1811,0.1416,0.1044,0.0713,0.0477,0.033,0.0271,0.0252,0.0254,0.0255,0.0257,0.0259,0.0263,0.0264,0.0263,0.0261,0.0263,0.0266,0.027,0.0274,0.028,0.0284,0.0287,0.0288,0.0293,0.0297,0.0303,0.031,0.032,0.0327,0.0332,0.0334,0.034,0.0345,0.0351,0.0357,0.0366,0.0373,0.0381,0.0389,0.0401,0.0411,0.0423,0.0434,0.0446,0.0455,0.0464,0.0474,0.049,0.0507,0.0522,0.053,0.0534]];
  function sampledGlow(side,t){
    const frame=Math.min(189,t*24),index=Math.floor(frame),fraction=frame-index,values=referenceGlow[side];
    const value=values[index]+(values[Math.min(189,index+1)]-values[index])*fraction;
    return value*(1-smooth((t-5.6)/.8));
  }
  function render(time){
    const t=((time%10)+10)%10;
    const intake=activity(t,0,2.2),leftGlow=sampledGlow(0,t),rightGlow=sampledGlow(1,t),launch=activity(t,0,.7);
    serverEdges.forEach((material,i)=>{material.opacity=.58+.25*intake*(.5+.5*Math.sin(t*9-i*1.3));});
    serverDots.forEach(({material,row,column})=>{const strength=.40+.45*intake*(.5+.5*Math.sin(t*9-row*1.3-column*.4));material.color.setRGB(strength,strength*.81,strength);});
    cloudEdge.opacity=.78+.22*Math.max(leftGlow,rightGlow);
    infinityHaloMaterial.opacity=.95*leftGlow;infinityRightHaloMaterial.opacity=.95*rightGlow;
    glyphDot.visible=false;
    glyphGlow.material.opacity=.78*leftGlow;glyphRightGlow.material.opacity=.78*rightGlow;
    infinityLeftLight.intensity=3.5*leftGlow;infinityRightLight.intensity=3.5*rightGlow;
    leftPortGlow.material.opacity=.80*activity(t,1.35,3.6);
    rightPortGlow.material.opacity=.80*activity(t,1.15,3.4);
    rightEdges.forEach(material=>{material.opacity=.62+.18*activity(t,.7,2.3);});
    codeEdges.forEach(material=>{material.opacity=.62+.18*launch;});
    codeConfirmEdge.opacity=.16+.24*launch;codeHaloMaterial.opacity=.3*launch;
    // Source direction: left rack → cloud, in parallel with code → coupler → cloud.
    flow(pipes[0],t,.02,2.25);
    flow(pipes[2],t,.02,1.3,true);
    flow(pipes[1],t,.95,2.4,true);
    const rimEnergy=smooth((t-4.1)/.5)*(1-smooth((t-8.0)/1.5));
    const rimHead=-.611+Math.PI*T.MathUtils.clamp((t-4.2)/3.7,0,1);
    rimUniforms.head.value=rimHead;rimUniforms.width.value=.36+.18*smooth((t-4.2)/1.8);rimUniforms.energy.value=.96*rimEnergy;
    rimLight.position.set(Math.cos(rimHead)*3.82,.16,Math.sin(rimHead)*3.82);rimLight.intensity=1.4*rimEnergy;
    sparkles.forEach((sparkle,i)=>{const pulse=Math.max(0,Math.sin(t*4.4+i*2.37))**12;
      sparkle.material.opacity=pulse*.7*smooth((t-1.2)/.7)*(1-smooth((t-8.5)/1));});
    topLight.intensity=16+8*Math.max(leftGlow,rightGlow);
    bloom.render(scene,camera);
  }
  resize();return {canvas,resize,render};
}
