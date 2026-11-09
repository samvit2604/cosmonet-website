import * as T from '/assets/vendor/three.module.min.js';
import { createPerson } from './people.js?v=2';
import { sampleReferenceMotion, LOOP_DURATION } from './motion.js?v=2';

// The first 7.93 seconds follow all 190 reference frames. A short continuation
// closes the loop; each card column, light effect and hand has its own track.
export function createRecruitmentScene(mount) {
  const canvas = document.createElement('canvas');
  canvas.dataset.recruitmentCanvas = '';
  const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  mount.append(canvas);

  const scene = new T.Scene();
  const root = new T.Group();
  scene.add(root);
  const camera = new T.OrthographicCamera(-6, 6, 4, -4, .1, 70);
  const target = new T.Vector3(-.65, 1.45, .1);
  camera.position.copy(target).add(new T.Vector3(-8, 9.2, 15));
  camera.lookAt(target);
  scene.add(new T.HemisphereLight(0xfff9ff, 0xb8a9d6, 1.6));
  const key = new T.DirectionalLight(0xfffaf5, 2.4);
  key.position.set(-5, 10, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 7, bottom: -6, near: .5, far: 30 });
  key.shadow.bias = -.0002;
  key.shadow.normalBias = .035;
  key.shadow.radius = 4;
  scene.add(key);
  const fill = new T.DirectionalLight(0xc9d9ff, .75);
  fill.position.set(7, 5, -3);
  scene.add(fill);
  const magentaFill = new T.PointLight(0xe661df, 9, 7, 2);
  magentaFill.position.set(-1, 2, -1);
  scene.add(magentaFill);

  const standard = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: .43, metalness: .03, ...extra });
  const white = standard('#f9f5ff');
  const paper = standard('#ffffff');
  const lavender = standard('#e7dcfa');
  const navy = standard('#242047');
  const purple = standard('#873bec');
  const pink = standard('#d91db8');
  const blue = standard('#4862d8');
  const glowMaterial = color => new T.MeshBasicMaterial({ color, transparent: true, opacity: 1, toneMapped: false });
  const shared = { sphere: new T.SphereGeometry(1, 20, 16), cylinder: new T.CylinderGeometry(1, 1, 1, 16) };

  function roundedShape(w, h, r) {
    const s = new T.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  function roundedGeometry(w, h, d, r = .09) {
    if (Math.min(w, h, d) < .035) return new T.BoxGeometry(w, h, d);
    const bevel = Math.min(.0125, w / 8, h / 8, d / 8);
    const radius = Math.min(r, (Math.min(w, h) - bevel * 2) / 2);
    const geometry = new T.ExtrudeGeometry(roundedShape(w - bevel * 2, h - bevel * 2, radius), { depth: d - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 10 });
    geometry.translate(0, 0, -(d - bevel * 2) / 2);
    return geometry;
  }
  function box(parent, w, h, d, x, y, z, material, radius = .04) {
    const mesh = new T.Mesh(roundedGeometry(w, h, d, radius), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  function sphere(parent, x, y, z, r, material) {
    const mesh = new T.Mesh(shared.sphere, material); mesh.position.set(x, y, z); mesh.scale.setScalar(r); mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  const axisY = new T.Vector3(0, 1, 0);
  function rod(parent, a, b, radius, material) {
    const delta = new T.Vector3().subVectors(b, a);
    const mesh = new T.Mesh(shared.cylinder, material);
    mesh.position.copy(a).add(b).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(axisY, delta.clone().normalize());
    mesh.scale.set(radius, delta.length(), radius); mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  function gradientGeometry(geometry) {
    const a = geometry.attributes.position, colors = new Float32Array(a.count * 3);
    const magenta = new T.Color('#b72ad5'), violet = new T.Color('#7435dc'), cobalt = new T.Color('#5261de');
    for (let i = 0; i < a.count; i++) {
      const u = T.MathUtils.clamp((a.getX(i) + 2) / 4, 0, 1);
      const color = u < .5 ? magenta.clone().lerp(violet, u * 2) : violet.clone().lerp(cobalt, (u - .5) * 2);
      color.toArray(colors, i * 3);
    }
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3)); return geometry;
  }
  const platformSide = standard('#ffffff', { vertexColors: true, roughness: .34 });
  function platform(w, d, x, z) {
    const group = new T.Group(); group.position.set(x, .11, z); root.add(group);
    const base = new T.Mesh(gradientGeometry(roundedGeometry(w, d, .22, .23)), platformSide);
    base.rotation.x = -Math.PI / 2; base.castShadow = true; base.receiveShadow = true; group.add(base);
    const top = new T.Mesh(roundedGeometry(w, d, .065, .23), white);
    top.rotation.x = -Math.PI / 2; top.position.y = .135; top.receiveShadow = true; top.castShadow = true; group.add(top);
    return group;
  }
  platform(3.25, 2.65, -4.45, -.30);
  platform(3.95, 3.05, .05, -1.5);
  platform(3.35, 2.65, 1.85, 2.50);
  const floor = new T.Mesh(new T.PlaneGeometry(24, 20), new T.ShadowMaterial({ opacity: .08, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.08; floor.receiveShadow = true; root.add(floor);

  function radialTexture(stops) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d'), g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    for (const [position, color] of stops) g.addColorStop(position, color);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    const texture = new T.CanvasTexture(c); texture.colorSpace = T.SRGBColorSpace; return texture;
  }
  const haloTexture = radialTexture([[0, '#fff7ffed'], [.3, '#f1a0ed60'], [.65, '#d786f421'], [1, '#d786f400']]);
  const contactTexture = radialTexture([[0, '#8c5abb28'], [.6, '#aa72d315'], [1, '#aa72d300']]);
  for (const [x, z, size] of [[-4.45, -.30, 4.7], [.05, -1.5, 5.1], [1.85, 2.50, 4.6]]) {
    const shadow = new T.Mesh(new T.PlaneGeometry(size, size), new T.MeshBasicMaterial({ map: contactTexture, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.set(x, -.07, z); root.add(shadow);
  }

  // Six candidates, in the same two staggered rows as the source.
  const candidates = [];
  const candidateSpec = [
    [-4.28, .98, '#d3c4f3', false, true, null],
    [-3.50, .72, '#8f58d3', false, true, null],
    [-2.76, 1.00, '#f1e9fe', false, false, null],
    [-4.08, 1.91, '#8c45c6', false, true, 'briefcase'],
    [-3.30, 2.12, '#e256b8', true, false, 'resume'],
    [-2.47, 1.88, '#8652c9', true, true, 'folder'],
  ];
  candidateSpec.forEach(([x, z, shirt, female, jacket, accessory], i) => {
    const person = createPerson({ shirt, female, jacket, accessory, skirt: i === 5, pose: accessory === 'resume' || accessory === 'folder' ? 'holding' : 'standing', trousers: i === 4 ? '#29233d' : '#282544', skin: ['#eebda3', '#dfac94', '#eebba5'][i % 3] });
    person.position.set(x - 1, .29, z - 1.85); person.rotation.y = .72; person.scale.setScalar(1.03 + (i % 3) * .025);
    person.userData.baseScale = person.scale.x;
    root.add(person); candidates.push(person);
  });

  function profileTexture({ selected = false, small = false } = {}) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 768;
    const ctx = c.getContext('2d'); ctx.scale(2, 2);
    ctx.fillStyle = selected ? '#ffffff' : '#eee5ff'; ctx.fillRect(0, 0, 256, 384);
    const gradient = ctx.createLinearGradient(75, 40, 185, 160); gradient.addColorStop(0, '#a85ae7'); gradient.addColorStop(1, '#753be2');
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(128, 91, small ? 43 : 51, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(128, 91, small ? 43 : 51, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = selected ? '#e047ac' : '#fffaff'; ctx.beginPath(); ctx.ellipse(128, 132, 39, 38, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f9edee'; ctx.beginPath(); ctx.roundRect(119, 101, 17, 23, 5); ctx.fill();
    ctx.beginPath(); ctx.ellipse(128, 86, 21, 26, -.08, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = selected ? '#29234a' : '#ffffff'; ctx.beginPath(); ctx.moveTo(106, 85); ctx.bezierCurveTo(94, 46, 151, 42, 150, 78); ctx.lineTo(140, 71); ctx.bezierCurveTo(124, 80, 116, 69, 106, 85); ctx.fill();
    ctx.restore();
    function star(x, y) {
      ctx.beginPath();
      for (let j = 0; j < 10; j++) { const angle = -Math.PI / 2 + j * Math.PI / 5, r = j % 2 ? 5.5 : 12; const px = x + Math.cos(angle) * r, py = y + Math.sin(angle) * r; if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#9b35be'; for (let i = 0; i < 5; i++) star(57 + i * 35.5, 192);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#ac7bd8'; ctx.beginPath(); ctx.arc(42, 240 + i * 38, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d4c3e9'; ctx.beginPath(); ctx.roundRect(61, 234 + i * 38, i === 1 ? 135 : 154, 11, 4); ctx.fill();
    }
    const texture = new T.CanvasTexture(c); texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return texture;
  }
  const selectedTexture = profileTexture({ selected: true }), sideTexture = profileTexture({ small: true });
  function profileCard(x, y, z, scale, selected = false) {
    const group = new T.Group(); group.position.set(x, y, z); group.scale.setScalar(scale); root.add(group);
    const body = box(group, 1.75, 2.85, .115, 0, 0, 0, selected ? purple : standard('#bb98ed'), .13);
    body.castShadow = false;
    const face = new T.Mesh(new T.ShapeGeometry(roundedShape(1.68, 2.78, .12), 20), new T.MeshBasicMaterial({ map: selected ? selectedTexture : sideTexture, toneMapped: false }));
    // ShapeGeometry UVs are world coordinates; map the profile art to its face.
    const uv = face.geometry.attributes.uv, pos = face.geometry.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + .84) / 1.68, (pos.getY(i) + 1.39) / 2.78);
    face.position.z = .072; group.add(face);
    return group;
  }
  const rearLeft = profileCard(-1.24, 2.15, -2.02, .67);
  const rearRight = profileCard(1.02, 2.58, -2.38, .67);
  const nextLeft = profileCard(-1.24, 2.15, -2.025, .67);
  const nextRight = profileCard(1.02, 2.58, -2.385, .67);
  const ghostCard = profileCard(-.47, 2.65, -2.55, .71);
  ghostCard.traverse(object => { if (object.material) { object.material.transparent = true; object.material.opacity = .16; object.material.depthWrite = false; } });
  const mainCard = profileCard(-.35, 1.92, -1.27, 1, true);
  const rimPoints = roundedShape(1.77, 2.87, .13).getPoints(120).map(p => new T.Vector3(p.x, p.y, .052));
  const rimCurve = new T.CatmullRomCurve3(rimPoints, true);
  const cardRimMaterial = new T.MeshBasicMaterial({ color: '#e65bd9', transparent: true, opacity: .8, depthWrite: false, toneMapped: false });
  const cardRim = new T.Mesh(new T.TubeGeometry(rimCurve, 160, .020, 8, true), cardRimMaterial); mainCard.add(cardRim);
  const cardRimHaloMaterial = cardRimMaterial.clone(); cardRimHaloMaterial.opacity = .12;
  mainCard.add(new T.Mesh(new T.TubeGeometry(rimCurve, 160, .060, 8, true), cardRimHaloMaterial));
  const halo = new T.Mesh(new T.PlaneGeometry(3.1, 3.1), new T.MeshBasicMaterial({ map: haloTexture, transparent: true, opacity: .95, depthWrite: false, toneMapped: false }));
  halo.rotation.x = -Math.PI / 2; halo.position.set(-.35, .30, -1.05); root.add(halo);
  const ringMaterial = glowMaterial('#f7c9ff');
  const selectionRing = new T.Mesh(new T.TorusGeometry(.88, .022, 12, 96), ringMaterial);
  selectionRing.rotation.x = -Math.PI / 2; selectionRing.position.set(-.35, .308, -.95); root.add(selectionRing);

  // The recruiter holds a real, thick glass lens; the camera never rotates.
  const recruiter = createPerson({ shirt: '#9345d0', trousers: '#282040', pose: 'magnifier', skin: '#e7ad91' });
  recruiter.position.set(1.14, .29, -.66); recruiter.rotation.y = -1.08; recruiter.scale.setScalar(1.10); root.add(recruiter);
  const lens = new T.Group(); root.add(lens);
  const lensRim = new T.Mesh(new T.TorusGeometry(.55, .058, 16, 96), navy); lensRim.castShadow = true; lens.add(lensRim);
  const rimAccent = new T.Mesh(new T.TorusGeometry(.549, .016, 10, 96), purple); rimAccent.position.z = .049; lens.add(rimAccent);
  const glass = new T.Mesh(new T.CircleGeometry(.505, 72), new T.MeshPhysicalMaterial({ color: '#eee5ff', transparent: true, opacity: .105, roughness: .03, metalness: .1, depthWrite: false, side: T.DoubleSide }));
  lens.add(glass);
  const reflection = new T.Mesh(new T.TorusGeometry(.466, .014, 8, 48, 1.1), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .72, depthWrite: false }));
  reflection.position.z = .018; reflection.rotation.z = .6; lens.add(reflection);
  rod(lens, new T.Vector3(.39, -.39, 0), new T.Vector3(.88, -.86, .025), .047, navy);
  rod(lens, new T.Vector3(.60, -.60, .01), new T.Vector3(.88, -.86, .025), .066, standard('#3a2c63'));
  recruiter.userData.leftArm.visible = false;
  const sleeve = standard('#9345d0'), skin = standard('#e7ad91');
  const scanningArm = [rod(root, new T.Vector3(), new T.Vector3(0, 1, 0), .077, sleeve), rod(root, new T.Vector3(), new T.Vector3(0, 1, 0), .065, sleeve)];
  const scanningElbow = sphere(root, 0, 0, 0, .075, sleeve), scanningHand = sphere(root, 0, 0, 0, .064, skin);
  const shoulderPosition = new T.Vector3(), gripPosition = new T.Vector3(), elbowPosition = new T.Vector3(), direction = new T.Vector3();

  // Connected paths carry a highlight from the candidate queue to the desk.
  const paths = [
    new T.CatmullRomCurve3([new T.Vector3(-2.82, .25, -.45), new T.Vector3(-2.52, .15, -.25), new T.Vector3(-2.25, .15, -.50), new T.Vector3(-1.92, .25, -.80)], false, 'centripetal'),
    new T.CatmullRomCurve3([new T.Vector3(.82, .18, .025), new T.Vector3(.74, .15, .60), new T.Vector3(.48, .15, .88), new T.Vector3(.54, .17, 1.2)], false, 'centripetal'),
  ];
  const pulseTexture = radialTexture([[0, '#ffffff'], [.13, '#fff0ff'], [.36, '#e866e9b0'], [1, '#e866e900']]);
  const pulses = [];
  paths.forEach((curve, index) => {
    const tube = new T.Mesh(new T.TubeGeometry(curve, 64, .018, 10, false), standard(index ? '#ba47d7' : '#ad49dd', { roughness: .3 })); root.add(tube);
    for (const t of [0, 1]) {
      const p = curve.getPoint(t), port = new T.Mesh(new T.CylinderGeometry(.09, .09, .035, 24), glowMaterial(t ? '#dc5ed7' : '#9771db'));
      port.position.copy(p); root.add(port);
    }
    for (let j = 0; j < 2; j++) {
      const dot = sphere(root, 0, 0, 0, .038, glowMaterial('#ffb9f4'));
      const flare = new T.Sprite(new T.SpriteMaterial({ map: pulseTexture, transparent: true, depthWrite: false, toneMapped: false, opacity: .8 })); flare.scale.setScalar(.28); root.add(flare);
      pulses.push({ curve, dot, flare, offset: index * .5 + j * .5 });
    }
  });

  // Interviewer's workstation, with an open laptop, plant and status panel.
  const desk = new T.Group(); desk.position.set(1.75, .29, 2.50); root.add(desk);
  box(desk, 2.05, .09, 1.04, -.15, 1.08, .15, paper, .055);
  box(desk, .72, 1.02, .91, -.79, .53, .15, lavender, .025);
  box(desk, .025, .95, .06, .78, .50, -.24, white, .008);
  box(desk, .025, .95, .06, .78, .50, .54, white, .008);
  box(desk, .65, .64, .035, -.80, .65, .625, standard('#e6ddf4'), .015);
  // Chair placed behind the seated operator, facing the laptop.
  const chair = new T.Group(); chair.position.set(.39, 0, -.51); desk.add(chair);
  box(chair, .70, .11, .66, 0, .58, 0, navy, .09);
  const chairBack = box(chair, .68, .97, .10, 0, 1.02, -.29, navy, .09); chairBack.rotation.x = -.09;
  box(chair, .54, .79, .035, 0, 1.07, -.215, standard('#3d2e6e'), .065);
  for (const x of [-.26, .26]) for (const z of [-.24, .24]) rod(chair, new T.Vector3(x, .56, z), new T.Vector3(x * 1.2, .025, z * 1.25), .024, navy);
  const interviewer = createPerson({ female: true, shirt: '#df3ba5', trousers: '#27223d', pose: 'seated', skin: '#e9b39a' });
  interviewer.position.set(.35, .015, -.48); interviewer.scale.setScalar(.84); desk.add(interviewer);
  const laptop = new T.Group(); laptop.position.set(.13, 1.145, .21); desk.add(laptop);
  box(laptop, .76, .035, .51, 0, 0, 0, standard('#6650b0'), .035);
  const lid = new T.Group(); lid.position.set(0, .015, .23); lid.rotation.x = .24; laptop.add(lid);
  box(lid, .77, .50, .035, 0, .25, 0, standard('#6c4ab2'), .035);
  // The camera sees the outer lid while the operator sees the keyboard.
  const logo = new T.Mesh(new T.CircleGeometry(.037, 24), standard('#aa89e0')); logo.position.set(0, .25, .021); lid.add(logo);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) box(laptop, .055, .004, .035, -.25 + col * .071, .023, -.17 + row * .048, navy, .005);
  box(laptop, .20, .004, .07, 0, .024, .06, lavender, .007);
  const pot = new T.Mesh(new T.CylinderGeometry(.12, .085, .20, 28), white); pot.position.set(-.81, 1.23, .03); desk.add(pot);
  const soil = new T.Mesh(new T.CircleGeometry(.10, 24), standard('#64517b')); soil.rotation.x = -Math.PI / 2; soil.position.set(-.81, 1.336, .03); desk.add(soil);
  for (let i = 0; i < 5; i++) {
    const angle = (i - 2) * .64, height = i === 2 ? .40 : .26;
    const leaf = new T.Mesh(shared.sphere, i % 2 ? purple : standard('#a455d6'));
    leaf.scale.set(.046, height / 2, .016); leaf.position.set(-.81 + Math.sin(angle) * .13, 1.37 + height / 2, .03 + Math.cos(angle) * .02); leaf.rotation.z = -angle * .55; desk.add(leaf);
    rod(desk, new T.Vector3(-.81, 1.33, .03), leaf.position, .009, purple);
  }

  const status = new T.Group(); status.position.set(1.47, 2.35, 1.30); root.add(status);
  box(status, 1.89, 1.30, .065, 0, 0, 0, purple, .06);
  box(status, 1.81, 1.17, .025, 0, -.035, .05, paper, .045);
  box(status, 1.83, .12, .026, 0, .58, .05, purple, .025);
  for (let i = 0; i < 3; i++) sphere(status, -.77 + i * .085, .58, .075, .018, white);
  const miniProfile = new T.Mesh(new T.PlaneGeometry(.65, .96), new T.MeshBasicMaterial({ map: sideTexture, toneMapped: false })); miniProfile.position.set(-.49, -.02, .077); status.add(miniProfile);
  for (let i = 0; i < 2; i++) box(status, .76 - i * .09, .045, .006, .38, .35 - i * .13, .08, lavender, .01);
  const confirmation = box(status, .71, .62, .035, .40, -.19, .095, pink, .075);
  const check = new T.Group(); check.position.set(.40, -.19, .128); status.add(check);
  const checkMaterial = glowMaterial('#fffaff');
  rod(check, new T.Vector3(-.15, 0, 0), new T.Vector3(-.035, -.12, 0), .025, checkMaterial);
  rod(check, new T.Vector3(-.035, -.12, 0), new T.Vector3(.18, .13, 0), .025, checkMaterial);
  const approvalFlare = new T.Sprite(new T.SpriteMaterial({ map: pulseTexture, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
  approvalFlare.position.set(.40, -.19, .18); approvalFlare.scale.setScalar(1.6); status.add(approvalFlare);
  status.traverse(object => { object.castShadow = false; });

  // The source has rising, open white arcs behind the selected profile.
  const lightArc = new T.CatmullRomCurve3([new T.Vector3(-.9, .5, -1.64), new T.Vector3(-1.14, 1.8, -1.64), new T.Vector3(-1.1, 3.45, -1.64), new T.Vector3(-.62, 3.98, -1.64), new T.Vector3(.10, 3.91, -1.64)]);
  const arcUniforms = { head: { value: 0 }, alpha: { value: 0 } };
  const arcMaterial = new T.ShaderMaterial({
    uniforms: arcUniforms, transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: 'varying float along;void main(){along=uv.x;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying float along;uniform float head;uniform float alpha;void main(){float d=(along-head)/.18;float a=exp(-d*d)*alpha;gl_FragColor=vec4(1.0,.92,1.0,a);}',
  });
  root.add(new T.Mesh(new T.TubeGeometry(lightArc, 96, .025, 8, false), arcMaterial));
  const arcHaloMaterial = arcMaterial.clone(); arcHaloMaterial.uniforms = arcUniforms;
  root.add(new T.Mesh(new T.TubeGeometry(lightArc, 96, .075, 8, false), arcHaloMaterial));

  // Small glints are confined to the selection area, as in the reference.
  const glints = [];
  for (let i = 0; i < 5; i++) {
    const glint = new T.Sprite(new T.SpriteMaterial({ map: pulseTexture, transparent: true, opacity: .45, depthWrite: false, toneMapped: false }));
    glint.position.set(-1.5 + i * .64, 3.1 + (i % 3) * .27, -1.7 - (i % 2) * .5); glint.scale.setScalar(.10); root.add(glint); glints.push(glint);
  }
  // Small details do not need separate shadow draws on a phone GPU.
  root.updateMatrixWorld(true);
  const worldScale = new T.Vector3(), geometrySize = new T.Vector3();
  root.traverse(object => {
    if (!object.isMesh || !object.castShadow) return;
    object.geometry.computeBoundingBox();
    object.geometry.boundingBox.getSize(geometrySize); object.getWorldScale(worldScale); geometrySize.multiply(worldScale);
    if (Math.max(geometrySize.x, geometrySize.y, geometrySize.z) < .38) object.castShadow = false;
  });

  let disposed = false;
  function resize() {
    const { width, height } = mount.getBoundingClientRect();
    if (!width || !height || disposed) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(width, height, false);
    const aspect = width / height, h = Math.max(6.8, 11.6 / aspect);
    camera.left = -h * aspect / 2; camera.right = h * aspect / 2; camera.top = h / 2; camera.bottom = -h / 2; camera.updateProjectionMatrix();
  }
  const smooth = x => { x = T.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  function track(t, keys) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
      const [a, v] = keys[i - 1], [b, w] = keys[i]; return T.MathUtils.lerp(v, w, smooth((t - a) / (b - a)));
    }
    return keys.at(-1)[1];
  }
  const leftOutgoingY = [[0,208],[.5,193],[1,176],[1.5,157],[2,139],[2.5,117],[3,94],[3.35,80],[6.15,264],[6.5,226],[6.75,217],[7,210],[7.25,202],[7.5,193],[7.75,184],[7.93,178],[9.6,208]];
  const leftIncomingY = [[0,267],[2.7,267],[3,252],[3.25,234],[3.5,227],[3.75,217],[4,206],[4.25,198],[4.5,188],[4.75,178],[5,169],[5.25,160],[5.5,151],[5.75,142],[6,135],[6.25,129],[6.5,118],[6.8,108],[9.6,267]];
  const leftOutgoingAlpha = [[0,1],[2.7,1],[3,.65],[3.35,0],[6.15,0],[6.5,.7],[6.75,1],[9.6,1]];
  const leftIncomingAlpha = [[0,0],[2.7,0],[3,.5],[3.25,1],[6.1,1],[6.25,.6],[6.5,.2],[6.7,0],[9.6,0]];
  const rightOutgoingY = [[0,127],[1,92],[2,61],[2.5,44],[2.8,30],[7.35,260],[7.5,229],[7.75,194],[7.875,182],[7.93,177],[9.6,127]];
  const rightIncomingY = [[0,260],[2.5,260],[2.75,232],[3,186],[3.25,159],[3.5,143],[3.75,130],[4,121],[4.25,113],[4.5,104],[4.75,94],[5,84],[5.25,74],[5.5,64],[5.75,54],[6,45],[6.25,39],[6.5,38],[6.75,43],[7,35],[9.6,260]];
  const rightOutgoingAlpha = [[0,1],[2.3,1],[2.6,.45],[2.85,0],[7.35,0],[7.5,.4],[7.75,.85],[7.93,1],[9.6,1]];
  const rightIncomingAlpha = [[0,0],[2.5,0],[2.75,.25],[3,.65],[3.25,1],[6.25,1],[6.5,.6],[6.75,.15],[7,0],[9.6,0]];
  function animateCard(card, y, opacity, baseline, baselineY) {
    card.position.y = baselineY + (baseline - y) * .0105; card.visible = opacity > .005;
    for (const child of card.children) if (child.material) { child.material.transparent = true; child.material.opacity = opacity; child.material.depthWrite = opacity > .98; }
  }
  function flash(t, center, width) { const d = Math.abs(t - center) / width; return Math.exp(-d * d * 3); }
  function render(time) {
    if (disposed) return;
    const t = ((time % LOOP_DURATION) + LOOP_DURATION) % LOOP_DURATION, phase = t * Math.PI * 2 / LOOP_DURATION;
    const motion = sampleReferenceMotion(t);
    mainCard.position.y = 1.92 + (177 - motion.cardTop) * .0105;
    animateCard(rearLeft, track(t, leftOutgoingY), track(t, leftOutgoingAlpha), 208, 2.15);
    animateCard(nextLeft, track(t, leftIncomingY), track(t, leftIncomingAlpha), 208, 2.15);
    animateCard(rearRight, track(t, rightOutgoingY), track(t, rightOutgoingAlpha), 127, 2.58);
    animateCard(nextRight, track(t, rightIncomingY), track(t, rightIncomingAlpha), 127, 2.58);
    ghostCard.position.y = 2.67 + (mainCard.position.y - 1.92) * .7;
    lens.position.set(-.20 + (motion.lensX - 746.5) * .0105, 2.79 - (motion.lensY - 212) * .0105, -.99);
    // The handle flattens as the hand lowers, with the shoulder planted.
    const scan = T.MathUtils.clamp((motion.lensY - 201) / 38, 0, 1);
    lens.rotation.z = -.10 + .20 * scan;
    lens.rotation.y = -.045;
    recruiter.userData.head.rotation.y = -.10 + .012 * Math.sin(phase * 2);
    recruiter.updateMatrixWorld(true); lens.updateMatrixWorld(true);
    shoulderPosition.set(-.216, 1.475, .005); recruiter.localToWorld(shoulderPosition);
    gripPosition.set(.76, -.74, .025); lens.localToWorld(gripPosition);
    elbowPosition.copy(shoulderPosition).lerp(gripPosition, .52); elbowPosition.y -= .18; elbowPosition.z += .075;
    for (let i = 0; i < 2; i++) {
      const a = i ? elbowPosition : shoulderPosition, b = i ? gripPosition : elbowPosition, mesh = scanningArm[i];
      direction.subVectors(b, a); mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(axisY, direction.clone().normalize()); mesh.scale.y = direction.length();
    }
    scanningElbow.position.copy(elbowPosition); scanningHand.position.copy(gripPosition);
    candidates.forEach((person, i) => {
      const head = person.userData.head;
      if (head) head.rotation.y = .012 * Math.sin(phase + i * .65);
      // Only the first two rear candidates enter; the assembled queue stays put.
      const reveal = i < 2 ? smooth((time - .18 - i * .035) / .50) : 1;
      person.visible = reveal > .005; person.scale.y = person.userData.baseScale * reveal;
    });
    if (interviewer.userData.head) interviewer.userData.head.rotation.x = .08 + .025 * Math.sin(phase * 2);
    if (interviewer.userData.leftForearm) interviewer.userData.leftForearm.rotation.x = interviewer.userData.restPose.leftForearm.x + .025 * Math.sin(phase * 8);
    if (interviewer.userData.rightForearm) interviewer.userData.rightForearm.rotation.x = interviewer.userData.restPose.rightForearm.x - .025 * Math.sin(phase * 8);
    pulses.forEach(({ curve, dot, flare, offset }) => {
      const p = (t * 3 / LOOP_DURATION + offset) % 1; dot.position.copy(curve.getPoint(p)); flare.position.copy(dot.position);
      flare.material.opacity = .7 * Math.sin(p * Math.PI);
    });
    const approval = track(t, [[0,1],[.15,0],[.94,0],[1.16,1],[5.25,1],[5.375,0],[5.75,0],[6.1,1],[LOOP_DURATION,1]]);
    const bloom = flash(t, 2.95, .55) + flash(t, 5.0, .40);
    check.scale.setScalar(.96 + .04 * approval); checkMaterial.opacity = approval;
    approvalFlare.material.opacity = Math.min(1, bloom); approvalFlare.scale.setScalar(1.4 + bloom * .35);
    confirmation.material.emissive.set('#d46bbd'); confirmation.material.emissiveIntensity = .04 + bloom * .8;
    const haloStrength = track(t, [[0,.12],[.5,.10],[.7,.2],[1.5,1],[2,1],[2.6,0],[3.25,.2],[4,1],[4.5,.8],[5,0],[5.35,1],[5.6,.8],[6.3,0],[7,.15],[7.6,1],[7.93,1],[9.6,.12]]);
    const haloScale = track(t, [[0,.6],[.65,.55],[1.7,1.35],[2.6,1.5],[2.7,.5],[3.25,.55],[4.2,1.35],[5,1.5],[5.05,.55],[5.6,1.30],[6.4,1.5],[6.5,.5],[7,.55],[7.93,1.35],[9.6,.6]]);
    halo.material.opacity = .25 + haloStrength * .7; halo.scale.setScalar(haloScale);
    ringMaterial.opacity = haloStrength * .85; selectionRing.scale.setScalar(haloScale);
    const rimBloom = flash(t, .25, .65) + flash(t, 3.5, .6) + flash(t, 6.95, .45);
    cardRimMaterial.opacity = .18 + Math.min(1, rimBloom) * .8; cardRimHaloMaterial.opacity = .025 + rimBloom * .14;
    const arcTimes = [.67, 2.67, 5.77, 6.9], nearest = arcTimes.map(start => ({ start, progress: (t - start) / .65 })).find(v => v.progress >= 0 && v.progress <= 1.3);
    arcUniforms.head.value = nearest ? nearest.progress : -1;
    arcUniforms.alpha.value = nearest ? Math.sin(Math.min(1, nearest.progress / 1.3) * Math.PI) * .9 : 0;
    glints.forEach((glint, i) => { glint.material.opacity = Math.pow(Math.max(0, Math.sin(t * 2.1 + i * 1.3)), 8) * .65; glint.position.y = 3.1 + (i % 3) * .27 + .11 * Math.sin(t * .7 + i); });
    renderer.render(scene, camera);
  }
  function dispose() {
    if (disposed) return; disposed = true;
    const geometries = new Set(), materials = new Set(), textures = new Set();
    scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); for (const material of object.material ? Array.isArray(object.material) ? object.material : [object.material] : []) { materials.add(material); for (const value of Object.values(material)) if (value?.isTexture) textures.add(value); } });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); renderer.dispose(); canvas.remove();
  }
  resize();
  return { canvas, resize, render, dispose };
}
