import * as T from '/assets/vendor/three.module.min.js';

// A fixed isometric network: only the light packets, waveforms and illumination
// move. Geometry stays anchored, as in the supplied automation reference.
export function createAutomationScene(mount) {
  const canvas = document.createElement('canvas');
  canvas.dataset.automationCanvas = '';
  const context = canvas.getContext('webgl2', { alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  if (!context) throw new Error('WebGL unavailable');
  const renderer = new T.WebGLRenderer({ canvas, context, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .93;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  mount.append(canvas);

  const scene = new T.Scene();
  const root = new T.Group();
  scene.add(root);
  const camera = new T.OrthographicCamera(-10, 10, 7, -7, .1, 90);
  camera.position.set(15, 18, 15);
  camera.lookAt(0, .18, 0);
  const SQRT2 = Math.sqrt(2);
  // h runs horizontally across the composition, d toward the viewer.
  const point = (h, d, y = .16) => new T.Vector3((h + d) / SQRT2, y, (d - h) / SQRT2);
  const smooth = x => { x = T.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const gate = (t, start, end, feather = .35) => smooth((t - start) / feather) * (1 - smooth((t - end) / feather));
  const colors = { accent: new T.Color('#7d2eb1'), violet: new T.Color('#5624c7'), blue: new T.Color('#2554df') };
  const resources = new Set();
  const own = value => { resources.add(value); return value; };

  const studio = document.createElement('canvas');
  studio.width = 1024; studio.height = 512;
  const ec = studio.getContext('2d');
  const wash = ec.createLinearGradient(0, 0, 0, 512);
  wash.addColorStop(0, '#ffffff'); wash.addColorStop(.48, '#f6f0ff'); wash.addColorStop(1, '#b6a6d1');
  ec.fillStyle = wash; ec.fillRect(0, 0, 1024, 512);
  ec.fillStyle = '#ffffff'; ec.fillRect(80, 60, 300, 170); ec.fillRect(650, 40, 150, 260);
  const environmentMap = new T.CanvasTexture(studio);
  environmentMap.colorSpace = T.SRGBColorSpace;
  environmentMap.mapping = T.EquirectangularReflectionMapping;
  const pmrem = new T.PMREMGenerator(renderer);
  const environment = pmrem.fromEquirectangular(environmentMap);
  scene.environment = environment.texture;
  environmentMap.dispose(); pmrem.dispose();

  scene.add(new T.HemisphereLight(0xfffaff, 0xa99acb, 1.1));
  const key = new T.DirectionalLight(0xfffcff, 2.0);
  key.position.set(-7, 14, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -13, right: 13, top: 12, bottom: -12, near: .5, far: 40 });
  key.shadow.bias = -.0002; key.shadow.normalBias = .03;
  scene.add(key);
  const fill = new T.DirectionalLight(0xc3d5ff, .7); fill.position.set(9, 5, -6); scene.add(fill);

  const porcelain = own(new T.MeshPhysicalMaterial({ color: 0xfffbff, metalness: .05, roughness: .42, clearcoat: .35, clearcoatRoughness: .38, envMapIntensity: .35 }));
  const porcelainSide = own(new T.MeshPhysicalMaterial({ color: 0xded4f2, metalness: .08, roughness: .40, clearcoat: .30, envMapIntensity: .28 }));
  const gradientMaterial = own(new T.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, metalness: .12, roughness: .39, clearcoat: .28, clearcoatRoughness: .40, envMapIntensity: .13 }));
  const gradientSide = own(new T.MeshPhysicalMaterial({ color: 0xbcb4ff, vertexColors: true, metalness: .18, roughness: .40, clearcoat: .25, envMapIntensity: .10 }));
  const glyphMaterial = own(new T.MeshPhysicalMaterial({ color: 0x4b1aa9, metalness: .08, roughness: .42, clearcoat: .25, envMapIntensity: .12 }));
  const glyphSide = own(new T.MeshPhysicalMaterial({ color: 0x351078, metalness: .08, roughness: .42, clearcoat: .20, envMapIntensity: .10 }));

  function rounded(w, d, radius) {
    const s = new T.Shape(), x = -w / 2, y = -d / 2, r = Math.min(radius, w / 2, d / 2);
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  // ExtrudeGeometry duplicates bevel vertices. Average the curved side normals
  // without softening the broad, perfectly flat porcelain faces.
  function polish(geometry) {
    const p = geometry.attributes.position, n = geometry.attributes.normal, sums = new Map(), indices = [];
    for (const group of geometry.groups) {
      if (group.materialIndex !== 1) continue;
      for (let i = group.start; i < group.start + group.count; i++) {
        const hash = `${Math.round(p.getX(i) * 100000)},${Math.round(p.getY(i) * 100000)},${Math.round(p.getZ(i) * 100000)}`;
        const sum = sums.get(hash) || new T.Vector3();
        sum.x += n.getX(i); sum.y += n.getY(i); sum.z += n.getZ(i); sums.set(hash, sum); indices.push([i, hash]);
      }
    }
    for (const [i, hash] of indices) { const normal = sums.get(hash).normalize(); n.setXYZ(i, normal.x, normal.y, normal.z); }
    n.needsUpdate = true;
    return geometry;
  }
  function tint(geometry, strength = 1, offset = 0) {
    const p = geometry.attributes.position, values = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const u = T.MathUtils.clamp(((p.getX(i) - p.getZ(i)) / SQRT2 + 1.8 + offset) / 3.6, 0, 1);
      // Violet and cobalt carry the broad surfaces; magenta stays on the very
      // narrow left edge instead of turning the complete object pastel pink.
      const color = u < .16 ? colors.accent.clone().lerp(colors.violet, u / .16) : colors.violet.clone().lerp(colors.blue, (u - .16) / .84);
      color.multiplyScalar(strength).toArray(values, i * 3);
    }
    geometry.setAttribute('color', new T.BufferAttribute(values, 3));
    return geometry;
  }
  function slab(w, d, height, h, depth, y, materials = [porcelain, porcelainSide], gradient = false, radius = .22, bevel = .045) {
    const shape = rounded(w, d, radius);
    const geometry = own(new T.ExtrudeGeometry(shape, { depth: height, steps: 1, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 5, curveSegments: 24 }));
    geometry.rotateX(-Math.PI / 2); polish(geometry); if (gradient) tint(geometry);
    const mesh = new T.Mesh(geometry, materials); mesh.position.copy(point(h, depth, y));
    mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
    return { mesh, shape, top: y + height + bevel, w, d };
  }
  function lineCurve(points, radius = .3) {
    const curve = new T.CurvePath(); let current = points[0];
    for (let i = 1; i < points.length - 1; i++) {
      const before = points[i - 1], corner = points[i], after = points[i + 1];
      const r = Math.min(radius, before.distanceTo(corner) * .35, after.distanceTo(corner) * .35);
      const entry = corner.clone().add(before.clone().sub(corner).normalize().multiplyScalar(r));
      const exit = corner.clone().add(after.clone().sub(corner).normalize().multiplyScalar(r));
      curve.add(new T.LineCurve3(current, entry)); curve.add(new T.QuadraticBezierCurve3(entry, corner, exit)); current = exit;
    }
    curve.add(new T.LineCurve3(current, points[points.length - 1]));
    return curve;
  }
  function tube(curve, radius, material, segments = 100) {
    const mesh = new T.Mesh(own(new T.TubeGeometry(curve, segments, radius, 7, false)), material); root.add(mesh); return mesh;
  }
  function plateOutline(w, d, h, depth, y, material, radius = .014) {
    const points = rounded(w, d, .30).getPoints(96).map(p => point(h, depth, y).add(new T.Vector3(p.x, 0, -p.y)));
    const curve = new T.CatmullRomCurve3(points, true, 'centripetal');
    const mesh = new T.Mesh(own(new T.TubeGeometry(curve, 130, radius, 5, true)), material); root.add(mesh); return mesh;
  }

  const radialCanvas = document.createElement('canvas'); radialCanvas.width = radialCanvas.height = 128;
  const rc = radialCanvas.getContext('2d'), radial = rc.createRadialGradient(64, 64, 1, 64, 64, 64);
  radial.addColorStop(0, 'rgba(255,255,255,1)'); radial.addColorStop(.22, 'rgba(255,255,255,.72)'); radial.addColorStop(.6, 'rgba(255,255,255,.20)'); radial.addColorStop(1, 'rgba(255,255,255,0)');
  rc.fillStyle = radial; rc.fillRect(0, 0, 128, 128);
  const radialTexture = own(new T.CanvasTexture(radialCanvas)); radialTexture.colorSpace = T.SRGBColorSpace;
  function contact(h, d, size, opacity = .17) {
    const material = own(new T.MeshBasicMaterial({ map: radialTexture, color: 0x7152a6, transparent: true, opacity, depthWrite: false }));
    const mesh = new T.Mesh(own(new T.PlaneGeometry(size, size)), material);
    mesh.rotation.x = -Math.PI / 2; mesh.position.copy(point(h, d, .008)); root.add(mesh);
  }
  const shadowFloor = new T.Mesh(own(new T.PlaneGeometry(38, 38)), own(new T.ShadowMaterial({ color: 0x6f548e, opacity: .14, depthWrite: false })));
  shadowFloor.rotation.x = -Math.PI / 2; shadowFloor.receiveShadow = true; shadowFloor.position.y = .004; root.add(shadowFloor);

  const outlineMaterial = own(new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .90, toneMapped: false }));
  const wireMaterial = own(new T.MeshPhysicalMaterial({ color: 0xe7dff2, roughness: .36, metalness: .03, emissive: 0xede2f8, emissiveIntensity: .10, envMapIntensity: .18 }));
  const wireUnderMaterial = own(new T.MeshBasicMaterial({ color: 0xad9acb, transparent: true, opacity: .55 }));
  function circuit(coords, active = false) {
    const curve = lineCurve(coords.map(p => point(...p)), .48);
    const under = tube(curve, active ? .045 : .037, wireUnderMaterial); under.position.y -= .026;
    tube(curve, active ? .025 : .021, wireMaterial);
    return curve;
  }

  // The quieter, rounded circuit routes preserve the reference's airy layout.
  circuit([[.28, -5.8], [-.9, -5.1], [-2.7, -4.1], [-2.8, -3.25], [-1.45, -1.5, .25]]);
  circuit([[-7.75, -.2], [-6.1, 1.1], [-5.25, .75], [-4.2, 1.45], [-2.2, .9, .20]]);
  circuit([[7.1, 1.8], [5.6, -.2], [4.5, -.4], [2.25, .35, .24]]);
  circuit([[6.9, 2.15], [5.4, 3.5], [4.2, 2.9], [3.1, 3.45], [1.8, 2.0, .24]]);
  circuit([[.8, 6.55], [1.6, 5.65], [1.05, 4.85], [1.65, 4.15], [1.2, 2.05, .24]]);
  circuit([[-6.0, 4.1], [-4.5, 5.65], [-3.0, 5.55], [-.6, 2.1, .24]]);

  const paths = [
    circuit([[-4.45, -3.18, .25], [-3.2, -2.35, .20], [-1.55, -1.10, .27]], true),
    circuit([[4.20, -2.95, .25], [3.10, -2.25, .20], [1.60, -1.08, .27]], true),
    circuit([[-5.90, 3.75, .25], [-4.85, 4.10, .18], [-1.18, 1.45, .50]], true),
    circuit([[6.15, 5.95, .24], [4.5, 4.25, .18], [1.25, 1.42, .50]], true)
  ];
  // A thin colored trace lives inside the white line, rather than blooming the
  // whole scene and losing the porcelain tile detail against the light hero.
  paths.forEach((path, i) => {
    const trace = tube(path, .014, own(new T.MeshBasicMaterial({ color: i === 1 ? 0x8766d9 : 0xc36bb6, transparent: true, opacity: .86, toneMapped: false })));
    trace.position.y = .029;
  });

  contact(0, .15, 7.2, .17);
  slab(4.35, 4.05, .29, 0, .10, .055, [porcelain, porcelainSide], false, .43, .065);
  slab(3.04, 2.90, .20, 0, 0, .42, [gradientMaterial, gradientSide], true, .26, .055);
  slab(2.88, 2.73, .20, 0, 0, .665, [porcelain, porcelainSide], false, .25, .05);
  slab(2.68, 2.57, .19, 0, 0, .91, [gradientMaterial, gradientSide], true, .24, .05);
  const capPulse = { value: 0 };
  const capMaterial = own(gradientMaterial.clone());
  capMaterial.vertexColors = false;
  capMaterial.color.set(0x08090f);
  const capSide = own(gradientSide.clone());
  capSide.vertexColors = false;
  capSide.color.set(0x101019);
  capMaterial.onBeforeCompile = shader => {
    shader.uniforms.automationPulse = capPulse;
    shader.fragmentShader = 'uniform float automationPulse;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 1.0 + automationPulse * .35;');
  };
  capMaterial.customProgramCacheKey = () => 'automation-cap-v3';
  const cap = slab(2.50, 2.40, .24, 0, 0, 1.145, [capMaterial, capSide], true, .23, .045);
  const rimMaterial = own(new T.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: .95, toneMapped: false }));
  const rim = plateOutline(2.50, 2.40, 0, 0, cap.top + .008, rimMaterial, .090);
  // Recolor the existing rim with the wordmark O's magenta/violet/blue spectrum.
  // The top slab and border path retain their original shape and dimensions.
  const rimPositions = rim.geometry.attributes.position;
  const rimColors = new Float32Array(rimPositions.count * 3);
  const brandStops = ['#2864ee', '#873bec', '#d91db8', '#873bec', '#2864ee'].map(color => new T.Color(color));
  for (let i = 0; i < rimPositions.count; i++) {
    const x = rimPositions.getX(i), z = rimPositions.getZ(i);
    const angle = (Math.atan2(x + z, x - z) / (Math.PI * 2) + 1) % 1;
    const stop = angle * 4, index = Math.floor(stop);
    brandStops[index].clone().lerp(brandStops[index + 1], stop - index).toArray(rimColors, i * 3);
  }
  rim.geometry.setAttribute('color', new T.BufferAttribute(rimColors, 3));

  function glyph(shape, group, thickness = .035) {
    const geometry = own(new T.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelSize: .008, bevelThickness: .009, bevelSegments: 3, curveSegments: 36 }));
    geometry.rotateX(-Math.PI / 2); polish(geometry);
    const mesh = new T.Mesh(geometry, [glyphMaterial, glyphSide]); mesh.castShadow = true; group.add(mesh); return mesh;
  }
  function polygon(points) { const shape = new T.Shape(); points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y)); shape.closePath(); return shape; }
  function circle(x, y, radius) { const s = new T.Shape(); s.absarc(x, y, radius, 0, Math.PI * 2, false); return s; }
  function icon(kind, group) {
    if (kind === 'person') {
      glyph(circle(0, .24, .23), group);
      const body = new T.Shape(); body.moveTo(-.39, -.37); body.bezierCurveTo(-.37, .01, .37, .01, .39, -.37); body.quadraticCurveTo(0, -.47, -.39, -.37); glyph(body, group);
    } else if (kind === 'gear') {
      const gear = new T.Shape();
      for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2, r = i % 6 < 3 ? .48 : .385; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? gear.lineTo(x, y) : gear.moveTo(x, y); }
      gear.closePath(); const hole = new T.Path(); hole.absarc(0, 0, .23, 0, Math.PI * 2, true); gear.holes.push(hole); glyph(gear, group);
    } else if (kind === 'chart') {
      for (let i = 0; i < 3; i++) { const h = [.36, .66, .48][i]; const bar = rounded(.19, h, .015); const mesh = glyph(bar, group); mesh.position.set(-.30 + i * .30, 0, .30 - h / 2); }
    } else if (kind === 'hierarchy') {
      for (const [x, y, w, h] of [[0, .32, .28, .22], [-.38, -.32, .25, .22], [0, -.32, .25, .22], [.38, -.32, .25, .22]]) { const mesh = glyph(rounded(w, h, .025), group); mesh.position.set(x, 0, -y); }
      glyph(polygon([[-.025, .21], [.025, .21], [.025, .015], [.405, .015], [.405, -.225], [.355, -.225], [.355, -.035], [.025, -.035], [.025, -.225], [-.025, -.225], [-.025, -.035], [-.355, -.035], [-.355, -.225], [-.405, -.225], [-.405, .015], [-.025, .015]]), group, .018);
    } else if (kind === 'check') {
      glyph(polygon([[-.45, -.02], [-.12, -.32], [.48, .33], [.36, .44], [-.13, -.10], [-.33, .10]]), group);
    } else if (kind === 'pie') {
      const main = new T.Shape(); main.moveTo(0, 0); main.absarc(0, 0, .47, Math.PI / 2, Math.PI * 2, false); main.lineTo(0, 0); glyph(main, group);
      const quarter = new T.Shape(); quarter.moveTo(.045, .045); quarter.lineTo(.49, .045); quarter.absarc(.045, .045, .445, 0, Math.PI / 2, false); quarter.lineTo(.045, .045); glyph(quarter, group);
    }
  }
  const tileGlows = [];
  function tile(h, d, kind, tintSide = false) {
    contact(h, d + .16, 3.7, .15);
    const side = own(porcelainSide.clone()); side.color.set(tintSide ? 0xc6d5ff : 0xddcefa);
    const top = own(porcelain.clone());
    const plate = slab(1.88, 1.76, .25, h, d, .105, [top, side], false, .25, .045);
    plateOutline(2.30, 2.20, h, d, .045, outlineMaterial);
    const group = new T.Group(); group.position.copy(point(h, d, plate.top + .025)); group.rotation.y = Math.PI / 4; root.add(group); icon(kind, group);
    const halo = new T.Mesh(own(new T.PlaneGeometry(3.8, 3.8)), own(new T.MeshBasicMaterial({ map: radialTexture, color: tintSide ? 0x9aaff0 : 0xbfa0eb, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })));
    halo.rotation.x = -Math.PI / 2; halo.position.copy(point(h, d, plate.top + .012)); root.add(halo);
    tileGlows.push({ top, side, halo: halo.material, kind });
  }
  tile(-5.27, -3.76, 'person');
  tile(.28, -6.10, 'gear');
  tile(4.83, -3.47, 'chart', true);
  tile(7.44, 1.82, 'hierarchy', true);
  tile(1.12, 7.10, 'check');
  tile(-6.95, 4.33, 'pie');
  contact(-8.05, -.26, 1.9, .15);
  slab(.90, .86, .19, -8.05, -.26, .07, [gradientMaterial, gradientSide], true, .13, .035);
  contact(6.32, 6.30, 2.0, .14);
  const cyanTop = own(new T.MeshPhysicalMaterial({ color: 0x4c83e8, metalness: .10, roughness: .39, clearcoat: .30, envMapIntensity: .16 }));
  const cyanSide = own(new T.MeshPhysicalMaterial({ color: 0x345ab5, metalness: .12, roughness: .40, clearcoat: .25, envMapIntensity: .13 }));
  slab(1.00, .94, .20, 6.32, 6.30, .075, [cyanTop, cyanSide], false, .15, .04);
  contact(-8.44, -3.65, 3.2, .19);
  const sphereGeometry = own(new T.SphereGeometry(.79, 64, 40)); tint(sphereGeometry, .90, -.12);
  const sphereMaterial = own(new T.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, metalness: .05, roughness: .58, clearcoat: .10, clearcoatRoughness: .5, envMapIntensity: .08 }));
  const sphere = new T.Mesh(sphereGeometry, sphereMaterial); sphere.position.copy(point(-8.44, -3.65, .81)); sphere.receiveShadow = true; root.add(sphere);

  // Small fixed junction disks on the quiet routes.
  const junctionGeometry = own(new T.CylinderGeometry(.13, .13, .045, 32));
  for (const [h, d] of [[-.70, -5.05], [6.0, 2.25], [.82, 6.35]]) {
    const mesh = new T.Mesh(junctionGeometry, porcelain); mesh.position.copy(point(h, d, .18)); root.add(mesh);
  }

  const packetGeometry = own(new T.CylinderGeometry(.135, .135, .055, 32));
  const ringGeometry = own(new T.TorusGeometry(.134, .017, 8, 32)); ringGeometry.rotateX(Math.PI / 2);
  const packets = [];
  function packet(path, color, index, secondary = false) {
    const group = new T.Group(); root.add(group);
    const material = own(new T.MeshPhysicalMaterial({ color: 0xfffaff, emissive: color, emissiveIntensity: .24, roughness: .26, metalness: .04, clearcoat: .7, envMapIntensity: .3, transparent: true }));
    group.add(new T.Mesh(packetGeometry, material));
    const edge = own(new T.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: .78 }));
    const ring = new T.Mesh(ringGeometry, edge); ring.position.y = .018; group.add(ring);
    const haloMaterial = own(new T.SpriteMaterial({ map: radialTexture, color, transparent: true, opacity: .32, depthWrite: false, toneMapped: false }));
    const halo = new T.Sprite(haloMaterial); halo.scale.set(.80, .80, .80); halo.position.y = -.012; group.add(halo);
    packets.push({ group, material, edge, haloMaterial, path, index, secondary });
  }
  paths.forEach((path, i) => { packet(path, i === 1 ? 0x96b8ff : 0xe575d6, i); if (i > 1) packet(path, 0x69c9fa, i, true); });

  const wavePoints = [[-.34, 0], [-.14, 0], [-.075, .09], [-.022, -.10], [.037, .28], [.10, -.08], [.16, 0], [.34, 0]].map(([x, y]) => new T.Vector3(x, y, 0));
  const waveCurve = new T.CatmullRomCurve3(wavePoints, false, 'centripetal', .05);
  const waveGeometry = own(new T.TubeGeometry(waveCurve, 80, .015, 6, false));
  const waves = paths.map((path, index) => {
    const group = new T.Group(); root.add(group);
    const material = own(new T.MeshBasicMaterial({ color: 0xdd65d0, transparent: true, opacity: .95, toneMapped: false }));
    group.add(new T.Mesh(waveGeometry, material));
    return { path, group, material, index };
  });
  const direction = new T.Vector3(), up = new T.Vector3(0, 1, 0), across = new T.Vector3(), orientation = new T.Matrix4();

  // Sparse glints are local details, never a full-scene glow pass.
  const glints = [];
  const glintMaterial = own(new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
  const glintShape = polygon([[0, .16], [.022, .028], [.16, 0], [.022, -.022], [0, -.16], [-.022, -.022], [-.16, 0], [-.022, .028]]);
  const glintGeometry = own(new T.ShapeGeometry(glintShape));
  for (let i = 0; i < 8; i++) {
    const material = own(glintMaterial.clone());
    const mesh = new T.Mesh(glintGeometry, material); mesh.quaternion.copy(camera.quaternion);
    mesh.position.copy(point(-5.5 + (i * 2.11) % 11, -3.1 + (i * 3.17) % 8, .30));
    root.add(mesh); glints.push(material);
  }

  let disposed = false;
  function resize() {
    if (disposed) return;
    const { width, height } = mount.getBoundingClientRect(); if (!width || !height) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(width, height, false);
    const aspect = width / height, viewHeight = Math.max(12.4, 20.3 / aspect);
    camera.left = -viewHeight * aspect / 2; camera.right = viewHeight * aspect / 2;
    camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2; camera.updateProjectionMatrix();
  }
  function render(elapsed) {
    if (disposed) return;
    const t = ((elapsed % 12) + 12) % 12;
    capPulse.value = gate(t, 2.70, 4.35, .45);
    rimMaterial.opacity = .95 + .05 * capPulse.value;
    const endpoint = gate(t, 6.60, 9.25, .65);
    tileGlows.forEach(({ top, side, halo, kind }) => {
      const amount = ['person', 'chart', 'pie'].includes(kind) ? endpoint : .12 * endpoint;
      top.emissive.setRGB(.30 * amount, .18 * amount, .34 * amount);
      side.emissive.setRGB(.17 * amount, .07 * amount, .29 * amount);
      halo.opacity = .21 * amount;
    });
    cyanTop.emissive.setRGB(.08 * endpoint, .35 * endpoint, .43 * endpoint);
    packets.forEach(({ group, path, index, secondary, material, edge, haloMaterial }) => {
      let u, opacity;
      if (index < 2) {
        const phase = (t + index * .06) % 12;
        if (phase < 1.50) { u = .10 + .86 * smooth(phase / 1.50); opacity = 1 - smooth((phase - 1.34) / .16); }
        else if (phase < 4.10) { u = .98; opacity = 0; }
        else if (phase < 5.65) { u = .98 - .96 * smooth((phase - 4.10) / 1.55); opacity = gate(phase, 4.08, 5.48, .15); }
        else if (phase < 10.50) { u = .02; opacity = 0; }
        else { u = .02 + .08 * smooth((phase - 10.50) / 1.50); opacity = smooth((phase - 11.70) / .30); }
      } else {
        const phase = ((t + (index - 2) * .11 + (secondary ? 2.9 : 0)) % 4) / 4;
        u = phase < .22 ? .48 * (1 - smooth(phase / .22)) : smooth((phase - .22) / .78);
        opacity = secondary ? gate(t, 2.58, 9.70, .30) : 1;
      }
      group.position.copy(path.getPointAt(T.MathUtils.clamp(u, .01, .99))); group.position.y += .065;
      group.visible = opacity > .005; material.opacity = opacity; edge.opacity = .8 * opacity; haloMaterial.opacity = .30 * opacity;
    });
    waves.forEach(({ path, group, material, index }) => {
      let u = .5, opacity = 0, cyan = false;
      if (index < 2) {
        const phase = t >= 5.60 && t <= 8.05 ? (t - 5.60) / 2.45 : (t - 1.30) / 1.65;
        u = phase; opacity = smooth(phase / .08) * (1 - smooth((phase - .91) / .09));
      } else {
        const phase = ((t - 1.45 + (index - 2) * .21 + 12) % 3.80) / 3.80;
        u = phase; opacity = gate(t, 1.48, 10.40, .25) * smooth(phase / .08) * (1 - smooth((phase - .92) / .08)); cyan = phase < .48;
      }
      group.visible = opacity > .005;
      if (!group.visible) return;
      const clamped = T.MathUtils.clamp(u, .015, .985);
      group.position.copy(path.getPointAt(clamped)); group.position.y += .04;
      direction.copy(path.getTangentAt(clamped)); direction.y = 0; direction.normalize();
      across.crossVectors(direction, up).normalize(); orientation.makeBasis(direction, up, across); group.quaternion.setFromRotationMatrix(orientation);
      material.color.set(cyan ? 0x71c6ef : 0xd85dc6); material.opacity = .90 * opacity;
    });
    glints.forEach((material, i) => { material.opacity = .65 * Math.max(0, Math.sin(t * Math.PI / 3 + i * 2.31)) ** 18; });
    renderer.render(scene, camera);
  }
  function dispose() {
    if (disposed) return; disposed = true;
    resources.forEach(resource => resource.dispose()); key.shadow.dispose(); environment.dispose(); renderer.dispose(); canvas.remove();
  }
  resize();
  return { canvas, resize, render, dispose };
}
