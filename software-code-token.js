import * as THREE from '/assets/vendor/three.module.min.js';

// The code is engraved into the token's own material, so it cannot slide over its face.
export function createCodeToken(mount, video) {
  const canvas = document.createElement('canvas');
  canvas.dataset.softwareDecal = '';
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('webgl2', { alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  if (!context) throw Error('3D token unavailable');
  const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  mount.append(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 2000);
  camera.position.z = 1000;
  const studio = document.createElement('canvas'); studio.width = 1024; studio.height = 512;
  const sc = studio.getContext('2d');
  const wash = sc.createLinearGradient(0, 0, 0, 512);
  wash.addColorStop(0, '#ffffff'); wash.addColorStop(.4, '#d5d5e4'); wash.addColorStop(.6, '#858196'); wash.addColorStop(1, '#393344');
  sc.fillStyle = wash; sc.fillRect(0, 0, 1024, 512);
  sc.fillStyle = '#fff8ed'; sc.fillRect(100, 70, 260, 120);
  sc.fillStyle = '#eeeaff'; sc.fillRect(640, 80, 140, 230);
  const environmentTexture = new THREE.CanvasTexture(studio);
  environmentTexture.mapping = THREE.EquirectangularReflectionMapping;
  environmentTexture.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(environmentTexture).texture;
  environmentTexture.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xf6f3ff, 0x544565, 1.3));
  const light = new THREE.DirectionalLight(0xfff4e9, 2.4); light.position.set(-200, 350, 700); scene.add(light);
  const fill = new THREE.DirectionalLight(0xc4caff, 1.0); fill.position.set(300, 100, 500); scene.add(fill);

  const face = document.createElement('canvas'); face.width = face.height = 512;
  const fc = face.getContext('2d'); fc.fillStyle = '#dedbe8'; fc.fillRect(0, 0, 512, 512);
  fc.strokeStyle = '#57317c'; fc.lineWidth = 19; fc.lineCap = fc.lineJoin = 'round';
  function code(ctx) {
    ctx.beginPath();
    ctx.moveTo(190,176); ctx.lineTo(112,256); ctx.lineTo(190,336);
    ctx.moveTo(322,176); ctx.lineTo(400,256); ctx.lineTo(322,336);
    ctx.moveTo(286,151); ctx.lineTo(226,361); ctx.stroke();
  }
  code(fc);
  const height = document.createElement('canvas'); height.width = height.height = 512;
  const hc = height.getContext('2d'); hc.fillStyle = '#bcbcbc'; hc.fillRect(0,0,512,512);
  hc.strokeStyle = '#535353'; hc.lineWidth = 19; hc.lineCap = hc.lineJoin = 'round'; code(hc);
  const texture = new THREE.CanvasTexture(face); texture.colorSpace = THREE.SRGBColorSpace;
  const relief = new THREE.CanvasTexture(height);
  const faceMaterial = new THREE.MeshPhysicalMaterial({ map: texture, bumpMap: relief, bumpScale: .035, roughness: .34, metalness: .32, clearcoat: .25, envMapIntensity: .7 });
  const metal = new THREE.MeshPhysicalMaterial({ color: 0xb6b1c9, metalness: .85, roughness: .23, clearcoat: .5, envMapIntensity: 1.2 });
  const violet = new THREE.MeshPhysicalMaterial({ color: 0x6a408e, metalness: .7, roughness: .25, envMapIntensity: .9 });
  const token = new THREE.Group(); const spin = new THREE.Group(); token.add(spin); scene.add(token);
  const profile = [[0,-.11],[.98,-.11],[1.045,-.075],[1.08,-.02],[1.08,.02],[1.045,.075],[.98,.11],[0,.11]].map(([r,z])=>new THREE.Vector2(r,z));
  const bodyGeometry = new THREE.LatheGeometry(profile, 96); bodyGeometry.rotateX(Math.PI/2);
  spin.add(new THREE.Mesh(bodyGeometry, metal));
  for (const side of [-1,1]) {
    const disk = new THREE.Mesh(new THREE.CircleGeometry(.97,96), faceMaterial);
    disk.position.z = side*.112; if(side<0)disk.rotation.y=Math.PI; spin.add(disk);
    const rim = new THREE.Mesh(new THREE.RingGeometry(.965,1.035,96),violet);
    rim.position.z = side*.114; if(side<0)rim.rotation.y=Math.PI; spin.add(rim);
  }
  const U=new THREE.Vector3(),V=new THREE.Vector3(),N=new THREE.Vector3(),basis=new THREE.Matrix4();
  let oldWidth=0,oldHeight=0;
  return {
    canvas,
    draw(time, tracking) {
      if(!tracking||!video.videoWidth)return;
      const {width,height}=mount.getBoundingClientRect();if(!width||!height)return;
      if(width!==oldWidth||height!==oldHeight){oldWidth=width;oldHeight=height;renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(width,height,false);camera.left=-width/2;camera.right=width/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();}
      const length=tracking.poses.length,frame=(time%tracking.duration)/tracking.duration*length,index=Math.floor(frame)%length,mix=frame-Math.floor(frame);
      const p=tracking.poses[index].map((v,i)=>v+(tracking.poses[(index+1)%length][i]-v)*mix);
      const [x,y,xx,xy,yy]=p;
      const half=(xx+yy)/2,delta=Math.hypot((xx-yy)/2,xy),radius=half+delta,ratio=Math.max(.025,Math.min(.99,(half-delta)/radius));
      const angle=.5*Math.atan2(-2*xy,xx-yy)+Math.PI/2;
      const nx=Math.cos(angle),ny=Math.sin(angle),tilt=Math.sqrt(1-ratio*ratio);
      U.set(xx/radius,-xy/radius,-tilt*nx).normalize();V.set(-xy/radius,yy/radius,-tilt*ny).normalize();N.crossVectors(U,V).normalize();basis.makeBasis(U,V,N);
      token.quaternion.setFromRotationMatrix(basis);
      const scale=Math.max(width/video.videoWidth,height/video.videoHeight),right=getComputedStyle(video).objectPosition.startsWith('100%');
      const dx=(width-video.videoWidth*scale)*(right?1:.5),dy=(height-video.videoHeight*scale)/2,size=radius*scale;
      token.scale.setScalar(size);
      token.position.set(dx+x*scale-width/2-N.x*size*.112,height/2-dy-y*scale-N.y*size*.112,-N.z*size*.112);
      spin.rotation.z=-time/tracking.duration*Math.PI*12;
      renderer.render(scene,camera);
    }
  };
}
