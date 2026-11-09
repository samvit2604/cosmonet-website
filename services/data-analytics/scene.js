import * as T from '/assets/vendor/three.module.min.js';

// The reference composition is modelled locally so edges and typography stay
// sharp at any display density. The camera is fixed, as in the supplied clip.
export function createAnalyticsScene(mount) {
  const canvas = document.createElement('canvas');
  canvas.dataset.dataCanvas = '';
  const context = canvas.getContext('webgl2', {alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
  if (!context) throw new Error('WebGL unavailable');
  const renderer = new T.WebGLRenderer({canvas,context,alpha:true,antialias:true,preserveDrawingBuffer:true});
  renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;
  mount.append(canvas);
  const scene=new T.Scene();
  const camera=new T.OrthographicCamera(-5,5,4.5,-4.5,.1,80);
  camera.position.set(0,4.6,17);camera.lookAt(0,.1,0);
  scene.add(new T.HemisphereLight(0xe9e2ff,0x271337,2));
  const key=new T.DirectionalLight(0xfff4ff,4);key.position.set(-4,8,9);scene.add(key);
  const fill=new T.DirectionalLight(0x8c9eff,2.2);fill.position.set(6,3,5);scene.add(fill);
  const pink=new T.PointLight(0xee4cd6,28,16,2);pink.position.set(-3,-.8,4);scene.add(pink);
  const blue=new T.PointLight(0x697cff,22,15,2);blue.position.set(4,-1,4);scene.add(blue);
  const studio=document.createElement('canvas');studio.width=1024;studio.height=512;
  const ec=studio.getContext('2d'),eg=ec.createLinearGradient(0,0,0,512);
  eg.addColorStop(0,'#d5d5e8');eg.addColorStop(.35,'#72718c');eg.addColorStop(.6,'#21192e');eg.addColorStop(1,'#07050d');ec.fillStyle=eg;ec.fillRect(0,0,1024,512);
  ec.fillStyle='#ffffff';ec.fillRect(75,70,260,105);ec.fillStyle='#c8c4ff';ec.fillRect(680,80,105,240);
  const env=new T.CanvasTexture(studio);env.mapping=T.EquirectangularReflectionMapping;env.colorSpace=T.SRGBColorSpace;
  const pmrem=new T.PMREMGenerator(renderer),environment=pmrem.fromEquirectangular(env);scene.environment=environment.texture;env.dispose();pmrem.dispose();
  const metal=new T.MeshPhysicalMaterial({color:0x252039,metalness:.75,roughness:.24,clearcoat:.8});
  const glass=new T.MeshPhysicalMaterial({color:0x413769,metalness:.5,roughness:.18,clearcoat:1});
  const rim=new T.MeshStandardMaterial({color:0x9673e9,metalness:.65,roughness:.25});
  const root=new T.Group();scene.add(root);
  const movingBars=[];
  // Each bar is a mesh attached to its panel. Its baseline stays fixed while
  // its height/length changes, so the animation never moves over the labels.
  function animatedBar(owner,{x,y,value,thickness,color,phase=0,horizontal=false}) {
    const geometry=new T.ExtrudeGeometry(round(horizontal?1:thickness,horizontal?thickness:1,Math.min(.018,thickness/2)),{
      depth:.04,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.006,bevelThickness:.006,curveSegments:8,
    });
    geometry.translate(0,0,-.02);
    const material=new T.MeshPhysicalMaterial({color,metalness:.32,roughness:.27,clearcoat:.8});
    const mesh=new T.Mesh(geometry,material);mesh.position.z=.17;owner.group.add(mesh);
    movingBars.push({mesh,x,y,value,phase,horizontal});
  }
  function pixelBar(owner,width,height,x,y,length,thickness,color,phase,horizontal=false) {
    const {width:pw,height:ph}=owner.art.c;
    animatedBar(owner,{
      x:(x/pw-.5)*width,y:(.5-y/ph)*height,
      value:length/(horizontal?pw:ph)*(horizontal?width:height),
      thickness:thickness/(horizontal?ph:pw)*(horizontal?height:width),color,phase,horizontal,
    });
  }
  function round(w,h,r){const s=new T.Shape(),x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;}
  function bitmap(w,h,paint){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');paint(g,w,h);const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return {c,g,texture};}
  function panel(w,h,x,y,z,paint,light=false){
    const group=new T.Group();group.position.set(x,y,z);group.rotation.set(0,-.15,-.035);
    const depth=.15,geometry=new T.ExtrudeGeometry(round(w,h,.15),{depth,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.035,bevelThickness:.035,curveSegments:16});geometry.translate(0,0,-depth/2);
    group.add(new T.Mesh(geometry,light?glass:metal));
    const art=bitmap(1280,Math.round(1280*h/w),paint);
    const face=new T.Mesh(new T.PlaneGeometry(w-.035,h-.035),new T.MeshBasicMaterial({map:art.texture,transparent:true,toneMapped:false}));face.position.z=depth/2+.038;group.add(face);root.add(group);
    return {group,art,face};
  }
  function base(g,w,h,title,subtle=false){g.clearRect(0,0,w,h);const bg=g.createLinearGradient(0,0,w,h);bg.addColorStop(0,subtle?'#302747':'#251f3d');bg.addColorStop(1,subtle?'#191629':'#11101e');g.fillStyle=bg;g.beginPath();g.roundRect(0,0,w,h,42);g.fill();g.strokeStyle='#aa8bdf66';g.lineWidth=3;g.stroke();g.font='500 42px Inter, Arial';g.fillStyle='#f4edff';g.fillText(title,54,83);}
  function text(g,s,x,y,size=32,color='#b4a6ca'){g.font=`500 ${size}px Inter, Arial`;g.fillStyle=color;g.fillText(s,x,y);}
  const points=[.16,.28,.25,.47,.37,.3,.73,.48,.59,.49];
  let lastTexture=-1;
  const main=panel(5.1,4.35,0,.3,.1,(g,w,h)=>base(g,w,h,'Analytics overview'));
  function dashboard(t){
    const {g,c,texture}=main.art,w=c.width,h=c.height;base(g,w,h,'Analytics overview');
    g.fillStyle='#ffffff09';g.beginPath();g.roundRect(w-270,39,215,57,26);g.fill();text(g,'This month',w-245,77,27,'#d9cee9');
    text(g,'Performance',60,181,31);text(g,'$24.8K',60,265,65,'#ffffff');text(g,'↑ 12.5%',60,321,29,'#b7a0ff');text(g,'vs. last month',60,365,25);
    const x=420,y=200,cw=795,ch=360;
    for(let k=0;k<4;k++){g.strokeStyle='#b5a1d51c';g.lineWidth=2;g.beginPath();g.moveTo(x,y+k*ch/3);g.lineTo(x+cw,y+k*ch/3);g.stroke();}
    const coords=points.map((v,i)=>[x+i/(points.length-1)*cw,y+ch*(1-v)]);
    const path=()=>{g.beginPath();g.moveTo(...coords[0]);for(let i=1;i<coords.length;i++){const a=coords[i-1],b=coords[i];g.bezierCurveTo((a[0]+b[0])/2,a[1],(a[0]+b[0])/2,b[1],b[0],b[1]);}};
    path();g.lineTo(x+cw,y+ch);g.lineTo(x,y+ch);g.closePath();const grad=g.createLinearGradient(0,y,0,y+ch);grad.addColorStop(0,'#b875f8b0');grad.addColorStop(1,'#5b49e82a');g.fillStyle=grad;g.fill();
    path();g.strokeStyle='#cfadff';g.lineWidth=4;g.stroke();
    const phase=(t%8)/8,scan=x+phase*cw;
    g.save();g.beginPath();g.rect(x,y,cw*phase,ch);g.clip();g.beginPath();for(let i=0;i<=100;i++){const u=i/100,px=x+u*cw,py=y+ch*(.62+.17*Math.sin(u*15+t*.35)+.09*Math.cos(u*27));i?g.lineTo(px,py):g.moveTo(px,py);}g.strokeStyle='#b6c1ff';g.lineWidth=3;g.stroke();g.restore();
    const sy=y+ch*(.62+.17*Math.sin(phase*15+t*.35)+.09*Math.cos(phase*27));g.shadowColor='#b3a3ff';g.shadowBlur=15;g.fillStyle='#e1c7ff';g.beginPath();g.arc(scan,sy,6,0,Math.PI*2);g.fill();g.shadowBlur=0;
    ['Jan','Feb','Mar','Apr','May','Jun'].forEach((s,i)=>text(g,s,x+i*cw/5-8,y+ch+38,24));
    const labels=['Users','Sessions','Bounce rate','Conversions'],values=['8,932','12,248','24.8%','1,286'];
    const ky=h-290,kw=(w-140)/4;
    labels.forEach((s,i)=>{const kx=50+i*(kw+12);g.fillStyle='#c0a6ff0c';g.beginPath();g.roundRect(kx,ky,kw-4,235,20);g.fill();g.strokeStyle='#a991d522';g.lineWidth=2;g.stroke();text(g,s,kx+22,ky+51,25);text(g,values[i],kx+22,ky+118,43,'#f2eaff');text(g,['↑ 8.2%','↑ 13.3%','↓ 4.6%','↑ 18.4%'][i],kx+22,ky+167,25,'#bfa7f8');});
    texture.needsUpdate=true;
  }
  const donut=panel(2.3,2.45,-3.6,.8,1,(g,w,h)=>{base(g,w,h,'Traffic sources',true);text(g,'Organic',w*.64,h*.43,56);text(g,'45%',w*.64,h*.5,62,'#e7d7ff');text(g,'Direct',w*.64,h*.68,56);text(g,'28%',w*.64,h*.75,62,'#bfa8ef');},true);
  const donutGroup=new T.Group();donutGroup.position.set(-.44,-.16,.27);donut.group.add(donutGroup);
  const colors=[0xae6af1,0x6a65eb,0x7162ad,0xdd85cf];let angle=0;
  [.45,.28,.17,.1].forEach((share,i)=>{const geo=new T.TorusGeometry(.50,.125,16,64,share*Math.PI*2-.03),m=new T.MeshPhysicalMaterial({color:colors[i],metalness:.4,roughness:.21,clearcoat:1});const mesh=new T.Mesh(geo,m);mesh.rotation.z=angle;donutGroup.add(mesh);angle+=share*Math.PI*2;});
  const bars=panel(2.15,1.6,-3.55,-1.7,1.2,(g,w,h)=>{base(g,w,h,'Conversions',true);text(g,'5,248',60,225,94,'#f6efff');},true);
  for(let i=0;i<7;i++)pixelBar(bars,2.15,1.6,431+i*100,520,130+i*35,62,[0x7c5ed9,0x9f71ef,0xc17ae9][i%3],i*.5);
  const countries=panel(2.2,3.1,3.55,.38,.65,(g,w,h)=>{base(g,w,h,'Top countries',true);g.fillStyle='#bc9cdf70';for(let row=0;row<12;row++)for(let col=0;col<24;col++){const a=col/24,b=row/12;if((Math.sin(a*17+b*6)+Math.cos(b*13-a*3)>.4)&&!(a>.45&&a<.55&&b>.5)){g.beginPath();g.arc(110+col*43,200+row*38,5,0,Math.PI*2);g.fill();}}['United States','Germany','India','Brazil','Others'].forEach((s,i)=>{const yy=850+i*140;text(g,s,65,yy,46);g.fillStyle='#4e3a6e';g.fillRect(65,yy+27,1000,14);});},true);
  for(let i=0;i<5;i++)pixelBar(countries,2.2,3.1,65,884+i*140,750-i*130,18,[0xbe7be9,0x9773ed,0x7a6ae4][i%3],i*.65,true);
  const barIcon=panel(1.05,.86,1.35,3.13,.35,(g,w,h)=>base(g,w,h,'',true),true);
  [.35,.57,.8].forEach((v,i)=>pixelBar(barIcon,1.05,.86,340+i*260,barIcon.art.c.height-160,barIcon.art.c.height*v-130,160,[0xa071eb,0xc18af0,0x8585ef][i],i*.75));
  const metricBadge=panel(1.2,.86,3.75,3.1,.7,(g,w,h)=>{base(g,w,h,'',true);text(g,'$24.8K',115,320,225,'#e7d2ff');text(g,'Users',360,595,135,'#b9a8d3');},true);
  const miniBars=panel(1.65,1,-3.5,3.15,.5,(g,w,h)=>{base(g,w,h,'',true);g.strokeStyle='#b0a0cd55';g.lineWidth=3;g.beginPath();g.moveTo(110,90);g.lineTo(110,h-100);g.lineTo(w-100,h-100);g.stroke();},true);
  for(let i=0;i<7;i++)pixelBar(miniBars,1.65,1,230+i*140,miniBars.art.c.height-100,60+i*55,80,0xa47be8,i*.45+1);
  panel(.65,.65,-3.15,-3.03,1.5,(g,w,h)=>{base(g,w,h,'',true);g.strokeStyle='#c2a3f5';g.lineWidth=35;g.beginPath();g.arc(w/2,h/2,310,0,Math.PI*2);g.stroke();g.beginPath();g.moveTo(w/2,330);g.lineTo(w/2,650);g.lineTo(830,650);g.stroke();},true);
  const pedestal=new T.Group();pedestal.position.set(0,-3.06,.2);root.add(pedestal);
  function cylinder(r,height,y,material){const m=new T.Mesh(new T.CylinderGeometry(r,r,height,128),material);m.position.y=y;pedestal.add(m);return m;}
  cylinder(2.78,.2,-.22,metal);cylinder(2.64,.15,-.045,rim);cylinder(2.51,.14,.09,glass);
  const glowMaterial=new T.MeshStandardMaterial({color:0xbd85f4,emissive:0x8b38d9,emissiveIntensity:.8,metalness:.4,roughness:.22});
  for(const [r,y]of[[2.68,-.1],[2.49,.17],[2.31,.18]]){const ring=new T.Mesh(new T.TorusGeometry(r,.025,12,128),glowMaterial);ring.rotation.x=Math.PI/2;ring.position.y=y;pedestal.add(ring);}
  // Only the highlight travels around the fixed pedestal in the reference.
  const sweep=new T.Mesh(new T.TorusGeometry(2.68,.033,12,64,Math.PI*.3),
    new T.MeshBasicMaterial({color:0xe0c5ff,transparent:true,opacity:.8}));
  sweep.rotation.x=Math.PI/2;sweep.position.y=-.098;pedestal.add(sweep);
  const pie=new T.Group();pie.position.set(2.55,-2.2,2.1);pie.rotation.set(-.35,.05,.27);root.add(pie);
  const wedges=[];let start=.1;
  [.36,.33,.31].forEach((share,i)=>{const arc=share*Math.PI*2-.055,s=new T.Shape();s.moveTo(0,0);s.lineTo(Math.cos(start)*.99,Math.sin(start)*.99);s.absarc(0,0,.99,start,start+arc,false);s.lineTo(0,0);const g=new T.ExtrudeGeometry(s,{depth:.21,bevelEnabled:true,bevelSize:.035,bevelThickness:.035,bevelSegments:3,curveSegments:48});const material=new T.MeshPhysicalMaterial({color:[0xa06de9,0x685ce2,0xc17be5][i],metalness:.45,roughness:.2,clearcoat:1});const m=new T.Mesh(g,material),mid=start+arc/2;m.position.set(Math.cos(mid)*.06,Math.sin(mid)*.06,0);pie.add(m);const vertices=g.attributes.position,polar=new Float32Array(vertices.count*2);
    for(let j=0;j<vertices.count;j++){
      const x=vertices.getX(j),y=vertices.getY(j),radius=Math.hypot(x,y);
      let theta=Math.atan2(y,x);while(theta<start-.2)theta+=Math.PI*2;
      polar[j*2]=radius;polar[j*2+1]=(theta-start)/arc;
    }
    wedges.push({mesh:m,polar});start+=share*Math.PI*2;});
  const shadow=bitmap(256,256,g=>{const a=g.createRadialGradient(128,128,20,128,128,125);a.addColorStop(0,'#a44df42b');a.addColorStop(1,'#a44df400');g.fillStyle=a;g.fillRect(0,0,256,256);});const floor=new T.Mesh(new T.PlaneGeometry(8,5),new T.MeshBasicMaterial({map:shadow.texture,transparent:true,depthWrite:false}));floor.rotation.x=-Math.PI/2;floor.position.set(0,-3.43,.3);root.add(floor);
  function resize(){const {width:w,height:h}=mount.getBoundingClientRect();if(!w||!h)return;renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(w,h,false);const aspect=w/h,height=Math.max(8.6,10.5/aspect);camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();}
  function render(t){
    const wave=t*Math.PI/2;
    main.group.position.y=.3+Math.sin(wave/2)*.025;
    donut.group.position.y=.8+Math.sin(wave/2+.8)*.025;
    countries.group.position.y=.38+Math.sin(wave/2+1.2)*.02;
    bars.group.position.y=-1.7;
    miniBars.group.position.y=3.15;
    barIcon.group.position.y=3.13+Math.sin(wave/2+.4)*.025;
    // The reference pie stays facing forward: its lower sectors rebalance
    // while the separated slices gently rock, without spinning the whole pie.
    pie.rotation.x=-.35+Math.sin(wave)*.045;
    pie.rotation.y=.05+Math.sin(wave+.3)*.07;
    pie.rotation.z=.27+Math.sin(wave)*.045;
    const change=.035*Math.sin(wave-.35),shares=[.36,.33+change,.31-change];
    let sectorStart=.1;
    wedges.forEach(({mesh,polar},i)=>{
      const arc=shares[i]*Math.PI*2-.055,mid=sectorStart+arc/2;
      const separation=.065+.025*(.5+.5*Math.sin(wave+i*.35));
      mesh.position.set(Math.cos(mid)*separation,Math.sin(mid)*separation,0);
      const vertices=mesh.geometry.attributes.position;
      for(let j=0;j<vertices.count;j++){
        const radius=polar[j*2],angle=sectorStart+polar[j*2+1]*arc;
        vertices.setXY(j,Math.cos(angle)*radius,Math.sin(angle)*radius);
      }
      vertices.needsUpdate=true;mesh.geometry.computeVertexNormals();
      sectorStart+=shares[i]*Math.PI*2;
    });
    // Sector tracking in all 190 source frames shows a clockwise turn, after
    // a short initial settle. The panel and legend remain fixed.
    const turn=Math.max(0,t-.95),settledTurn=turn-.25*(1-Math.exp(-turn/.25));
    donutGroup.rotation.z=-settledTurn*Math.PI*2/9.2;
    donutGroup.rotation.y=Math.sin(wave/2)*.035;
    movingBars.forEach(({mesh,x,y,value,phase,horizontal})=>{
      const growth=Math.min(t/4,1),ease=growth*growth*(3-2*growth);
      const factor=horizontal ? .58+.42*ease+.055*Math.sin(wave+phase) : .88+.18*Math.sin(t*Math.PI*2/3+phase);
      const size=value*factor;
      if(horizontal){mesh.scale.x=size;mesh.position.x=x+size/2;mesh.position.y=y;}
      else{mesh.scale.y=size;mesh.position.x=x;mesh.position.y=y+size/2;}
    });
    // The two upper widgets appear during the first second, then remain in place.
    const reveal=Math.max(0,Math.min(1,(t-.55)/.65)),scale=reveal*reveal*(3-2*reveal);
    for(const widget of [miniBars,metricBadge]){widget.group.visible=reveal>0;widget.group.scale.setScalar(Math.max(.001,scale));}
    sweep.rotation.z=-t*Math.PI/2;
    glowMaterial.emissiveIntensity=.65+.1*Math.sin(wave/2);
    const f=Math.floor(t*24);
    if(f!==lastTexture){dashboard(t);lastTexture=f;}
    renderer.render(scene,camera);
  }
  resize();return {canvas,resize,render};
}
