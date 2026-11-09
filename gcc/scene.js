import * as T from '/assets/vendor/three.module.min.js';

// A native geographic globe. Coastlines, land particles, network and routes
// share one geographic rotation; the magenta/blue lighting stays screen-aligned.
export async function createGccScene(mount) {
  const response = await fetch('/assets/gcc-land.json');
  if (!response.ok) throw new Error('Globe geography unavailable');
  const { polygons } = await response.json();
  if (!Array.isArray(polygons) || !polygons.length) throw new Error('Invalid globe geography');
  const canvas = document.createElement('canvas'); canvas.dataset.gccCanvas = '';
  const context = canvas.getContext('webgl2', { alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  if (!context) throw new Error('WebGL unavailable');
  const renderer = new T.WebGLRenderer({ canvas, context, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NoToneMapping;
  mount.append(canvas);
  const resources = new Set(), own = value => { resources.add(value); return value; };
  const scene = new T.Scene(), presentation = new T.Group(), tilt = new T.Group(), earth = new T.Group();
  scene.add(presentation); presentation.add(tilt); tilt.add(earth);
  tilt.rotation.set(.22, 0, -.055);
  const camera = new T.OrthographicCamera(-4, 4, 3, -3, .1, 60);
  camera.position.set(0, 0, 15); camera.lookAt(0, 0, 0);
  const radius = 2.5, radians = Math.PI / 180;
  const time = { value: 0 }, density = { value: 1 };
  let seed = 29471;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const geo = (lon, lat, r = radius) => {
    const a = lon * radians, b = lat * radians, c = Math.cos(b);
    return new T.Vector3(r * c * Math.sin(a), r * Math.sin(b), r * c * Math.cos(a));
  };
  const smooth = v => { const x = T.MathUtils.clamp(v, 0, 1); return x * x * (3 - 2 * x); };
  const spectrum = `
    vec3 spectrum(float x) {
      vec3 pink = vec3(.98, .005, .78);
      vec3 violet = vec3(.50, .035, 1.0);
      vec3 blue = vec3(.005, .25, 1.0);
      float side = smoothstep(-.78, .78, x);
      return side < .48 ? mix(pink, violet, side / .48) : mix(violet, blue, (side - .48) / .52);
    }
  `;
  const colorOutput = '#include <tonemapping_fragment>\n#include <colorspace_fragment>';

  // The same public-domain land outlines drive both the surface mask and stars.
  const atlas = document.createElement('canvas'); atlas.width = 2048; atlas.height = 1024;
  const ac = atlas.getContext('2d', { willReadFrequently: true }); ac.fillStyle = '#000'; ac.fillRect(0, 0, atlas.width, atlas.height); ac.fillStyle = '#fff';
  polygons.forEach(ring => {
    ac.beginPath();
    ring.forEach(([lon, lat], i) => {
      const x = (lon + 180) / 360 * atlas.width, y = (90 - lat) / 180 * atlas.height;
      i ? ac.lineTo(x, y) : ac.moveTo(x, y);
    });
    ac.closePath(); ac.fill();
  });
  const landTexture = own(new T.CanvasTexture(atlas)); landTexture.wrapS = T.RepeatWrapping;
  // Reuse the already-rendered geography instead of checking every sample
  // against every polygon edge during startup.
  const landMask = ac.getImageData(0, 0, atlas.width, atlas.height).data;
  function onLand(lon, lat) {
    if (lon < -180 || lon >= 180 || lat < -90 || lat > 90) return false;
    const x = Math.floor((lon + 180) / 360 * atlas.width);
    const y = Math.min(atlas.height - 1, Math.floor((90 - lat) / 180 * atlas.height));
    return landMask[(y * atlas.width + x) * 4] >= 128;
  }
  const sphereGeometry = own(new T.SphereGeometry(radius, 128, 80));
  const oceanMaterial = own(new T.ShaderMaterial({
    uniforms: { uLand: { value: landTexture } },
    vertexShader: `varying vec3 vLocal; varying vec3 vViewNormal;
      void main() { vLocal = normalize(position); vViewNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D uLand; varying vec3 vLocal; varying vec3 vViewNormal; ${spectrum}
      void main() {
        vec3 n = normalize(vViewNormal);
        vec2 uv = vec2(atan(vLocal.x,vLocal.z)/6.2831853+.5, asin(clamp(vLocal.y,-1.0,1.0))/3.14159265+.5);
        float land = texture2D(uLand, uv).r;
        float edge = pow(1.0-max(n.z,0.0),2.0);
        vec3 hue = spectrum(n.x);
        vec3 ocean = vec3(.004,.002,.014) + hue * (.005 + edge * .045);
        vec3 continent = ocean + hue * (.105 + .06 * edge);
        gl_FragColor = vec4(mix(ocean,continent,land),1.0);
        ${colorOutput}
      }`
  }));
  earth.add(new T.Mesh(sphereGeometry, oceanMaterial));

  function pointMaterial(multiplier = 1, opacity = .9) {
    return own(new T.ShaderMaterial({
      uniforms: { uTime: time, uDensity: density, uMultiplier: { value: multiplier }, uOpacity: { value: opacity } },
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: `attribute float aSize; attribute float aPhase; varying vec3 vHue; varying float vPulse;
        uniform float uTime; uniform float uDensity; uniform float uMultiplier; ${spectrum}
        void main() {
          vec3 n = normalize(mat3(modelViewMatrix)*normalize(position));
          vHue = spectrum(n.x); vPulse = .66 + .34*sin(uTime*1.7+aPhase);
          gl_PointSize = aSize*uDensity*uMultiplier;
          gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }`,
      fragmentShader: `varying vec3 vHue; varying float vPulse; uniform float uOpacity;
        void main() {
          float d=length(gl_PointCoord-.5)*2.0; if(d>1.0) discard;
          float halo=pow(1.0-d,2.0), core=pow(1.0-d,9.0);
          gl_FragColor=vec4(mix(vHue,vec3(1.0,.95,1.0),core*.82),halo*uOpacity*vPulse);
          ${colorOutput}
        }`
    }));
  }
  function pointCloud(points, sizes, phases, material, parent = earth) {
    const geometry = own(new T.BufferGeometry());
    geometry.setAttribute('position', new T.Float32BufferAttribute(points, 3));
    geometry.setAttribute('aSize', new T.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new T.Float32BufferAttribute(phases, 1));
    const mesh = new T.Points(geometry, material); mesh.frustumCulled = false; parent.add(mesh); return mesh;
  }
  const dots = [], dotSizes = [], dotPhases = [];
  let row = 0;
  for (let lat = -80; lat <= 83; lat += .78) {
    const step = .78 / Math.max(.2, Math.cos(lat*radians));
    for (let lon = -180 + (row % 2) * step * .5; lon < 180; lon += step) {
      const x = lon + (random()-.5)*step*.95, y = lat + (random()-.5)*.74;
      if (!onLand(x,y)) continue;
      geo(x,y,radius+.008).toArray(dots,dots.length);
      dotSizes.push(1.6+random()*2.2); dotPhases.push(random()*Math.PI*2);
    }
    row++;
  }
  pointCloud(dots, dotSizes, dotPhases, pointMaterial(1,.95));

  function lineMaterial(opacity) {
    return own(new T.ShaderMaterial({
      uniforms: { uOpacity: { value: opacity } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: `varying vec3 vHue; ${spectrum}
        void main(){ vec3 n=normalize(mat3(modelViewMatrix)*normalize(position));vHue=spectrum(n.x);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vHue; uniform float uOpacity;
        void main(){
          gl_FragColor=vec4(vHue,uOpacity);
          ${colorOutput}
        }`
    }));
  }
  function segments(values, material, parent=earth) {
    const geometry=own(new T.BufferGeometry());geometry.setAttribute('position',new T.Float32BufferAttribute(values,3));
    const mesh=new T.LineSegments(geometry,material);parent.add(mesh);return mesh;
  }
  const coast = [];
  for (const ring of polygons) {
    for (let i=1;i<ring.length;i++) {
      const a=geo(...ring[i-1],radius+.014),b=geo(...ring[i],radius+.014);
      const count=Math.max(1,Math.ceil(a.angleTo(b)/.025));
      for(let k=0;k<count;k++) {
        a.clone().lerp(b,k/count).normalize().multiplyScalar(radius+.014).toArray(coast,coast.length);
        a.clone().lerp(b,(k+1)/count).normalize().multiplyScalar(radius+.014).toArray(coast,coast.length);
      }
    }
  }
  segments(coast,lineMaterial(.68));

  // Fine land triangulation and a sparser ocean-spanning connection mesh.
  const landNodes=[];
  for(let lat=-64;lat<81;lat+=4.2) {
    const step=4.2/Math.max(.25,Math.cos(lat*radians));
    for(let lon=-180;lon<180;lon+=step) {
      const x=lon+(random()-.5)*1.3,y=lat+(random()-.5)*1.2;
      if(onLand(x,y))landNodes.push(geo(x,y,radius+.018));
    }
  }
  const connections=[];
  landNodes.forEach((a,i)=>{
    const near=[];
    for(let j=i+1;j<landNodes.length;j++){const distance=a.distanceToSquared(landNodes[j]);if(distance<.11)near.push({j,distance});}
    near.sort((a,b)=>a.distance-b.distance);
    near.slice(0,4).forEach(({j})=>{a.toArray(connections,connections.length);landNodes[j].toArray(connections,connections.length);});
  });
  segments(connections,lineMaterial(.28));
  const network=[],hubSizes=[],hubPhases=[],oceanNodes=[];
  const count=210,golden=Math.PI*(3-Math.sqrt(5));
  for(let i=0;i<count;i++) {
    const y=1-(i+.5)/count*2,r=Math.sqrt(1-y*y),angle=i*golden;
    const p=new T.Vector3(Math.cos(angle)*r,y,Math.sin(angle)*r).multiplyScalar(radius+.027);
    oceanNodes.push(p);p.toArray(network,network.length);hubSizes.push(i%9===0?10:4.6);hubPhases.push(random()*Math.PI*2);
  }
  const oceanEdges=[];
  oceanNodes.forEach((a,i)=>{
    const near=oceanNodes.map((b,j)=>({j,distance:i===j?Infinity:a.distanceToSquared(b)})).sort((a,b)=>a.distance-b.distance);
    near.slice(0,4).forEach(({j})=>{if(j>i){a.toArray(oceanEdges,oceanEdges.length);oceanNodes[j].toArray(oceanEdges,oceanEdges.length);}});
  });
  segments(oceanEdges,lineMaterial(.22));
  pointCloud(network,hubSizes,hubPhases,pointMaterial(1.15,1));

  const cityCoordinates = [[77.2,28.6],[72.9,19.1],[77.6,13],[55.3,25.2],[103.8,1.35],[139.7,35.7],[151.2,-33.9],[.12,51.5],[-74,40.7],[-122.4,37.8],[8.7,50.1],[18.4,-33.9],[-46.6,-23.5]];
  const cityDots=[],citySizes=[],cityPhases=[];
  cityCoordinates.forEach(([lon,lat],i)=>{geo(lon,lat,radius+.045).toArray(cityDots,cityDots.length);citySizes.push(13+(i%3)*3);cityPhases.push(i*1.71);});
  pointCloud(cityDots,citySizes,cityPhases,pointMaterial(1.2,1));
  const pairs=[[0,4],[0,7],[0,8],[1,3],[2,9],[4,5],[4,6],[7,8],[7,10],[3,11],[8,12],[10,5]];
  const routes=[],routeEdges=[];
  pairs.forEach(([start,end],index)=>{
    const a=geo(...cityCoordinates[start],1),b=geo(...cityCoordinates[end],1),angle=a.angleTo(b),values=[];
    const height=.18+Math.min(angle,2)*.20;
    for(let i=0;i<=72;i++) {
      const u=i/72;
      const p=Math.abs(Math.sin(angle))<.00001?a.clone().lerp(b,u):a.clone().multiplyScalar(Math.sin((1-u)*angle)/Math.sin(angle)).addScaledVector(b,Math.sin(u*angle)/Math.sin(angle));
      p.normalize().multiplyScalar(radius+.06+Math.sin(u*Math.PI)*height);values.push(p);
      if(i){values[i-1].toArray(routeEdges,routeEdges.length);p.toArray(routeEdges,routeEdges.length);}
    }
    routes.push({values,phase:index*.177,speed:.075+(index%4)*.014});
  });
  segments(routeEdges,lineMaterial(.32));
  const travelerPositions=new Float32Array(routes.length*3),travelers=pointCloud(travelerPositions,new Float32Array(routes.length).fill(12),routes.map((_,i)=>i),pointMaterial(1.2,1));

  // Fresnel shells add a colored edge without a dark rectangular backdrop.
  function atmosphere(scale,opacity) {
    const material=own(new T.ShaderMaterial({uniforms:{uOpacity:{value:opacity}},transparent:true,depthWrite:false,side:T.BackSide,
      vertexShader:`varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`varying vec3 vN;uniform float uOpacity;${spectrum}
        void main(){
          vec3 n=normalize(vN);float edge=pow(1.0-abs(n.z),3.4);
          gl_FragColor=vec4(spectrum(n.x),edge*uOpacity);
          ${colorOutput}
        }` }));
    const mesh=new T.Mesh(sphereGeometry,material);mesh.scale.setScalar(scale);earth.add(mesh);
  }
  atmosphere(1.014,.72);atmosphere(1.037,.20);

  let disposed=false;
  function resize() {
    if(disposed)return;
    const {width,height}=mount.getBoundingClientRect();if(!width||!height)return;
    const ratio=Math.min(window.devicePixelRatio||1,2);density.value=ratio;
    renderer.setPixelRatio(ratio);renderer.setSize(width,height,false);
    const aspect=width/height,viewHeight=window.innerWidth>1200?4.72:Math.max(4.72,5.60/aspect);
    camera.left=-viewHeight*aspect/2;camera.right=viewHeight*aspect/2;camera.top=viewHeight/2;camera.bottom=-viewHeight/2;camera.updateProjectionMatrix();
  }
  function render(elapsed) {
    if(disposed)return;
    time.value=elapsed;
    earth.rotation.y=-1.48+elapsed*Math.PI*2/45;
    const cycle=((elapsed%45)+45)%45,pullback=smooth((cycle-1.6)/6.4)*(1-smooth((cycle-37)/8));
    presentation.scale.setScalar(.92*(1-.086*pullback));presentation.position.set(.82-.215*pullback,.27-.06*pullback,0);
    const positions=travelers.geometry.attributes.position;
    routes.forEach((route,index)=>{
      const u=((elapsed*route.speed+route.phase)%1+1)%1,position=u*72,i=Math.floor(position),v=position-i;
      const a=route.values[i],b=route.values[Math.min(i+1,72)];
      positions.setXYZ(index,T.MathUtils.lerp(a.x,b.x,v),T.MathUtils.lerp(a.y,b.y,v),T.MathUtils.lerp(a.z,b.z,v));
    });
    positions.needsUpdate=true;
    renderer.render(scene,camera);
  }
  function dispose(){if(disposed)return;disposed=true;resources.forEach(item=>item.dispose());renderer.dispose();canvas.remove();}
  resize();
  return {canvas,resize,render,dispose};
}
