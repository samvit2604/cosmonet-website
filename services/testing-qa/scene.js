import * as T from '/assets/vendor/three.module.min.js';
import { addTestingCharacters } from './characters.js?v=1';

// Native vector silhouettes are extruded and layered in a shallow 3D stage.
// Source-pixel coordinates preserve the reference's unusually tilted window.
export function createTestingScene(mount) {
  const canvas = document.createElement('canvas'); canvas.dataset.testingCanvas = '';
  const context = canvas.getContext('webgl2', { alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  if (!context) throw new Error('WebGL unavailable');
  const renderer = new T.WebGLRenderer({ canvas, context, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NoToneMapping; mount.append(canvas);
  const scene = new T.Scene(), root = new T.Group(); scene.add(root);
  const camera = new T.OrthographicCamera(-5, 5, 4, -4, .1, 60);
  camera.position.set(0, 0, 20); camera.lookAt(0, 0, 0);
  scene.add(new T.HemisphereLight(0xffffff, 0xb9b4d5, 1.5));
  const key = new T.DirectionalLight(0xffffff, 2.0); key.position.set(-4, 8, 12); scene.add(key);
  const resources = new Set(), own = value => { resources.add(value); return value; };
  const point = (x, y, z = 0) => new T.Vector3((x - 850) / 100, (390 - y) / 100, z);
  const smooth = value => { const x = T.MathUtils.clamp(value, 0, 1); return x * x * (3 - 2 * x); };
  const gate = (t, a, b, feather = .2) => smooth((t - a) / feather) * (1 - smooth((t - b) / feather));
  const palette = { navy: 0x242665, ink: 0x20234f, blue: 0x2454ed, cobalt: 0x3158ef, violet: 0x7d35d7, pink: 0xe544a8, lavender: 0xcac5f8, pale: 0xe4e2fb, white: 0xffffff };
  const materials = new Map();
  function material(color, opacity = 1) {
    const id = `${color}:${opacity}`;
    if (!materials.has(id)) materials.set(id, own(new T.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false })));
    return materials.get(id);
  }
  function shape(commands) {
    const s = new T.Shape();
    for (const row of commands) {
      const [type, ...n] = row;
      if (type === 'M' || type === 'L') { const p = point(n[0], n[1]); type === 'M' ? s.moveTo(p.x, p.y) : s.lineTo(p.x, p.y); }
      if (type === 'Q') { const a = point(n[0], n[1]), b = point(n[2], n[3]); s.quadraticCurveTo(a.x, a.y, b.x, b.y); }
      if (type === 'C') { const a = point(n[0], n[1]), b = point(n[2], n[3]), c = point(n[4], n[5]); s.bezierCurveTo(a.x, a.y, b.x, b.y, c.x, c.y); }
      if (type === 'Z') s.closePath();
    }
    return s;
  }
  function polygon(points) { return shape(points.map(([x, y], i) => [i ? 'L' : 'M', x, y]).concat([['Z']])); }
  function ellipse(x, y, rx, ry = rx) { const s = new T.Shape(), p = point(x, y); s.absellipse(p.x, p.y, rx / 100, ry / 100, 0, Math.PI * 2, false); return s; }
  function rounded(x, y, w, h, r = 10, sx = 0, sy = 0) {
    const s = new T.Shape();
    const p = (u, v) => point(x + u + sx * v, y + v + sy * u);
    const move = (u, v) => { const a = p(u, v); s.moveTo(a.x, a.y); };
    const line = (u, v) => { const a = p(u, v); s.lineTo(a.x, a.y); };
    const quad = (u, v, a, b) => { const c = p(u, v), d = p(a, b); s.quadraticCurveTo(c.x, c.y, d.x, d.y); };
    r = Math.min(r, w / 2, h / 2);
    move(r, 0); line(w - r, 0); quad(w, 0, w, r); line(w, h - r); quad(w, h, w - r, h);
    line(r, h); quad(0, h, 0, h - r); line(0, r); quad(0, 0, r, 0); s.closePath(); return s;
  }
  function fill(s, color, z, depth = .035, side = null) {
    const geometry = own(new T.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: .009, bevelThickness: .008, bevelSegments: 2, curveSegments: 30 }));
    const mesh = new T.Mesh(geometry, [material(color), material(side ?? color)]); mesh.position.z = z; root.add(mesh); return mesh;
  }
  function outline(s, color, z, width = 1.6, opacity = 1) {
    const points = s.getPoints(100).map(v => new T.Vector3(v.x, v.y, z));
    if (points[points.length - 1].distanceToSquared(points[0]) > .0000001) points.push(points[0].clone());
    const mesh = new T.Mesh(own(new T.TubeGeometry(new T.CatmullRomCurve3(points, false, 'centripetal'), 180, width / 200, 6, false)), material(color, opacity)); root.add(mesh); return mesh;
  }
  function stroke(points, color, z, width = 4, curved = false, opacity = 1) {
    const values = points.map(([x, y]) => point(x, y, z));
    const curve = curved ? new T.CatmullRomCurve3(values, false, 'centripetal') : new T.CurvePath();
    if (!curved) for (let i = 1; i < values.length; i++) curve.add(new T.LineCurve3(values[i - 1], values[i]));
    const mesh = new T.Mesh(own(new T.TubeGeometry(curve, curved ? 64 : Math.max(1, points.length - 1) * 10, width / 200, 8, false)), material(color, opacity)); root.add(mesh);
    for (const p of [values[0], values[values.length - 1]]) { const cap = new T.Mesh(own(new T.SphereGeometry(width / 200, 12, 8)), material(color, opacity)); cap.position.copy(p); root.add(cap); }
    return mesh;
  }
  function ringShape(x, y, radius, inner) {
    const s = ellipse(x, y, radius), p = point(x, y), hole = new T.Path(); hole.absarc(p.x, p.y, inner / 100, 0, Math.PI * 2, true); s.holes.push(hole); return s;
  }
  function pivot(px, py, meshes) {
    const group = new T.Group(); group.position.copy(point(px, py)); root.add(group); meshes.forEach(mesh => group.attach(mesh)); return group;
  }

  const radialCanvas = document.createElement('canvas'); radialCanvas.width = radialCanvas.height = 256;
  const rc = radialCanvas.getContext('2d'), rg = rc.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(.22, 'rgba(255,255,255,.75)'); rg.addColorStop(.6, 'rgba(255,255,255,.22)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  rc.fillStyle = rg; rc.fillRect(0, 0, 256, 256);
  const radial = own(new T.CanvasTexture(radialCanvas)); radial.colorSpace = T.SRGBColorSpace;
  function glow(px, py, size, color, z, opacity = 0) {
    const mat = own(new T.SpriteMaterial({ map: radial, color, opacity, transparent: true, depthWrite: false, toneMapped: false }));
    const sprite = new T.Sprite(mat); sprite.scale.set(size / 100, size / 100, 1); sprite.position.copy(point(px, py, z)); root.add(sprite); return sprite;
  }
  // Local contact shadow keeps the illustration grounded while the hero paper
  // remains visible around it; none of the source's background waves is baked in.
  const shadow = new T.Mesh(own(new T.PlaneGeometry(9.15, .78)), own(new T.MeshBasicMaterial({ map: radial, color: 0xaaa0df, opacity: .26, transparent: true, depthWrite: false, toneMapped: false })));
  shadow.position.copy(point(811, 654, -.55)); root.add(shadow);

  function gear(px, py, radius, inner, teeth, color, z) {
    const center = point(px, py), s = new T.Shape();
    for (let i = 0; i < teeth * 4; i++) {
      const angle = i / (teeth * 4) * Math.PI * 2, r = (i % 4 < 2 ? radius : radius * .79) / 100;
      const x = center.x + Math.cos(angle) * r, y = center.y + Math.sin(angle) * r; i ? s.lineTo(x, y) : s.moveTo(x, y);
    }
    s.closePath(); const hole = new T.Path(); hole.absarc(center.x, center.y, inner / 100, 0, Math.PI * 2, true); s.holes.push(hole);
    const mesh = fill(s, color, z, .075, color === palette.violet ? 0x6230b5 : 0x8897df);
    return pivot(px, py, [mesh]);
  }
  const topGear = gear(605, 179, 76, 36, 9, palette.violet, -.15);
  const lowerGear = gear(891, 612, 39, 18, 10, 0x9daaf0, .10);

  // Back plates and the full cobalt browser edge give the front window depth.
  fill(rounded(864, 112, 223, 415, 28, -.13, -.16), 0xb9b0fb, -.30, .06, 0xa899f1);
  fill(rounded(614, 198, 444, 406, 19, -.17, -.10), 0xa79bf5, -.12, .07, 0x8d82df);
  const browser = shape([['M', 642, 178], ['L', 1032, 120], ['Q', 1065, 114, 1064, 148], ['L', 1016, 541], ['Q', 1012, 566, 990, 568], ['L', 568, 577], ['Q', 547, 575, 550, 552], ['L', 606, 212], ['Q', 612, 183, 642, 178], ['Z']]);
  fill(browser, palette.blue, -.03, .13, 0x173ac0);
  const whiteFrame = shape([['M', 627, 223], ['L', 1048, 164], ['L', 1003, 525], ['Q', 1000, 549, 981, 550], ['L', 563, 560], ['Q', 543, 560, 548, 539], ['L', 601, 246], ['Q', 605, 226, 627, 223], ['Z']]);
  fill(whiteFrame, 0xffffff, .13, .10, 0xeeeefa); outline(whiteFrame, palette.ink, .247, 1.5);
  [636, 659, 683].forEach((x, i) => fill(ellipse(x, 201 - i * 3, 6.3), 0xffffff, .22, .025, 0xd5ddff));

  const codePane = shape([['M', 635, 244], ['L', 817, 217], ['Q', 835, 214, 832, 232], ['L', 791, 504], ['Q', 790, 518, 776, 519], ['L', 586, 526], ['Q', 571, 527, 574, 512], ['L', 617, 260], ['Q', 620, 247, 635, 244], ['Z']]);
  fill(codePane, palette.navy, .28, .075, 0x171b50);
  const pane = rounded(851, 214, 177, 304, 15, -.16, -.12); fill(pane, 0xdeddf9, .27, .04, 0xd4d1ee);

  // Code lines follow the pane's shallow tilt instead of forming a straight UI.
  const codeLines = [
    [637, 262, 658, 259, 0xf5f4ff], [654, 274, 674, 271, 0xc08af4], [685, 267, 714, 263, 0xe69cdd], [729, 262, 789, 254, 0xffffff],
    [666, 289, 702, 284, 0xe7dcff], [712, 282, 747, 277, 0xbe73e2], [662, 302, 697, 298, 0xfaf5ff], [644, 321, 655, 319, 0x8d63df],
    [662, 317, 679, 314, 0xba85ec], [626, 339, 641, 337, 0x8a64dd], [621, 358, 650, 354, 0xad79ea], [621, 375, 650, 372, 0xc894f3],
    [615, 394, 629, 392, 0xc07fea], [615, 410, 618, 408, 0x966de0], [624, 422, 657, 419, 0xd391e4], [616, 441, 634, 439, 0xa580e0],
    [612, 461, 631, 459, 0xe5d7ff], [641, 464, 670, 461, 0xb18ae8], [687, 462, 719, 459, 0xca91e9], [625, 483, 701, 477, 0xffffff], [616, 500, 615, 495, 0x9e7be3]
  ];
  codeLines.forEach(([x1, y1, x2, y2, color]) => stroke([[x1, y1], [x2, y2]], color, .40, 4.8));
  const codeGlint = glow(674, 267, 40, 0xf0a1e8, .45);

  fill(rounded(849, 238, 176, 50, 12, -.12, -.10), 0xffffff, .33, .045, 0xf0efff);
  const track = rounded(859, 252, 154, 18, 9, 0, -.10); fill(track, 0xe6ddf4, .40, .025);
  const violetProgress = fill(rounded(859, 252, 154, 18, 9, 0, -.10), palette.violet, .432, .02);
  const violetProgressMaterials = violetProgress.material.map(mat => own(mat.clone()));
  violetProgress.material = violetProgressMaterials;
  violetProgressMaterials.forEach(mat => { mat.transparent = true; mat.depthWrite = false; });
  const progress = fill(rounded(859, 252, 154, 18, 9), palette.pink, .435, .02);
  const progressPivot = pivot(859, 260, [progress]);
  progressPivot.rotation.z = Math.atan(.10);
  fill(rounded(839, 313, 170, 96, 11, -.14, -.11), 0xffffff, .34, .035, 0xeeeefa);
  function smallTick(x, y, color = palette.blue) {
    const box = rounded(x, y, 26, 26, 4, -.10, -.10); fill(box, color, .40, .03);
    stroke([[x + 5, y + 12], [x + 10, y + 17], [x + 21, y + 5]], 0xffffff, .455, 3.6);
  }
  smallTick(871, 326); smallTick(863, 366, 0x8d78e9);
  stroke([[909, 328], [992, 320]], 0x4d67cc, .43, 3.6); stroke([[905, 342], [966, 336]], 0xb6bced, .43, 3.4);
  stroke([[901, 369], [985, 362]], 0x4d67cc, .43, 3.6); stroke([[898, 384], [954, 379]], 0xb6bced, .43, 3.4);
  fill(rounded(830, 429, 145, 83, 10, -.14, -.075), 0xffffff, .34, .035, 0xcccdf0);
  const bars = [];
  for (let i = 0; i < 4; i++) {
    const x = 849 + i * 28, y = 496 - i * 3;
    const bar = fill(rounded(x, y - 100, 18, 100, 1, -.12, 0), i === 2 ? palette.pink : i === 3 ? 0x9b3ed2 : 0x7837d8, .435, .035, 0x5d2cbd);
    bars.push(pivot(x, y, [bar]));
  }

  // Two floating approval cards; their own skew is independent of the window.
  const approval = rounded(665, 506, 170, 101, 13, -.15, -.06);
  const approvalBack = fill(approval, 0xd9d5f4, .46, .04); approvalBack.position.x += .04; approvalBack.position.y -= .04;
  fill(approval, 0xffffff, .53, .055, 0xdddaf4); outline(approval, palette.ink, .596, 1.7);
  fill(ellipse(699, 550, 28), palette.violet, .61, .05, 0x6530c3);
  const approvalTint = fill(ellipse(694, 541, 22), palette.pink, .666, .004); approvalTint.material = material(palette.pink, .40);
  stroke([[687, 550], [696, 558], [712, 541]], 0xffffff, .69, 5.6);
  stroke([[746, 533], [805, 530]], 0x596bd2, .63, 3.7); stroke([[743, 550], [804, 547]], 0x9aa7e9, .63, 3.5); stroke([[741, 566], [778, 564]], 0xb6bbed, .63, 3.5);

  const checklist = rounded(1013, 127, 143, 150, 15, -.12, -.12);
  const checklistBack = fill(checklist, 0xcfc9f3, .46, .05); checklistBack.position.x += .05; checklistBack.position.y -= .05;
  fill(checklist, 0xffffff, .60, .06, 0xd9d9f3); outline(checklist, palette.ink, .673, 1.8);
  function upperBox(x, y, checked) {
    const s = rounded(x, y, 27, 27, 3, -.10, -.10); fill(s, checked ? 0x4936d0 : 0xffffff, .69, .025); outline(s, 0x2b258b, .72, 1.6);
    if (checked) stroke([[x + 5, y + 12], [x + 11, y + 18], [x + 22, y + 5]], 0xffffff, .75, 3.5);
  }
  [[1029, 147], [1025, 187], [1020, 227]].forEach(([x, y], i) => upperBox(x, y, i < 2));
  for (let i = 0; i < 3; i++) {
    stroke([[1068 - 4 * i, 147 + 40 * i], [1134 - 4 * i, 140 + 40 * i]], 0x3152ba, .73, 3.1);
    stroke([[1067 - 4 * i, 159 + 40 * i], [1110 - 4 * i, 154 + 40 * i]], 0xa4afe7, .73, 3.0);
  }
  const bigTickParts = [];
  const beforeBigTick = new Set(root.children);
  stroke([[1078, 163], [1091, 174], [1138, 126]], 0x1d376f, .82, 6.5);
  root.children.forEach(mesh => { if (!beforeBigTick.has(mesh)) bigTickParts.push(mesh); });
  const bigTick = pivot(1103, 150, bigTickParts);

  const textCanvas = document.createElement('canvas'); textCanvas.width = 512; textCanvas.height = 160;
  const textContext = textCanvas.getContext('2d'); textContext.fillStyle = '#7140c5'; textContext.font = 'italic 800 118px Arial'; textContext.fillText('100%', 8, 125);
  const textTexture = own(new T.CanvasTexture(textCanvas)); textTexture.colorSpace = T.SRGBColorSpace;
  const completionText = new T.Mesh(own(new T.PlaneGeometry(1.36, .425)), own(new T.MeshBasicMaterial({ map: textTexture, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })));
  completionText.position.copy(point(749, 149, .47)); completionText.rotation.z = .14; root.add(completionText);

  // The warning is a local native triangle, with a brief red diagnostic halo.
  const warning = new T.Group(); root.add(warning);
  const warningParts = [];
  const warningShape = shape([['M', 1174, 280], ['Q', 1179, 275, 1184, 282], ['L', 1221, 338], ['Q', 1226, 346, 1216, 347], ['L', 1142, 347], ['Q', 1133, 346, 1139, 337], ['L', 1174, 280], ['Z']]);
  const warningFill = fill(warningShape, 0xffffff, .55, .025); warningParts.push(warningFill); warningParts.push(outline(warningShape, 0xe44b9d, .585, 5.8));
  const beforeWarning = new Set(root.children);
  stroke([[1179, 301], [1179, 320]], 0xe44b9d, .62, 7); fill(ellipse(1179, 333, 4.2), 0xe44b9d, .62, .012);
  root.children.forEach(mesh => { if (!beforeWarning.has(mesh)) warningParts.push(mesh); });
  warningParts.forEach(mesh => { mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => own(m.clone())) : own(mesh.material.clone()); warning.attach(mesh); });
  const warningGlow = glow(1179, 317, 130, 0xff3773, .49);
  const warningBurstShape = new T.Shape();
  for (let i = 0; i < 32; i++) {
    const angle = i / 32 * Math.PI * 2, radius = i % 2 ? 44 : 66;
    const p = point(1179 + Math.cos(angle) * radius, 317 + Math.sin(angle) * radius);
    i ? warningBurstShape.lineTo(p.x, p.y) : warningBurstShape.moveTo(p.x, p.y);
  }
  warningBurstShape.closePath();
  const warningBurst = new T.Mesh(own(new T.ShapeGeometry(warningBurstShape)), own(new T.MeshBasicMaterial({ color: 0xff537c, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })));
  warningBurst.position.z = .495; root.add(warningBurst);

  // The glass scans across the code while the bug remains on the code pane.
  const lensParts = [];
  const captureLens = callback => { const before = new Set(root.children); callback(); root.children.forEach(mesh => { if (!before.has(mesh)) lensParts.push(mesh); }); };
  captureLens(() => {
    stroke([[548, 495], [618, 451]], 0x252f88, .85, 23);
    stroke([[615, 450], [670, 413]], 0xffffff, .87, 15);
    stroke([[620, 447], [668, 414]], 0xe6e8fb, .895, 7);
  });
  const lensHandleCount = lensParts.length;
  captureLens(() => {
    fill(ringShape(747, 379, 86, 70), 0x202976, .94, .10, 0x202569);
    const glass = new T.Mesh(own(new T.CircleGeometry(.70, 96)), own(new T.MeshBasicMaterial({ color: 0xadb8ff, transparent: true, opacity: .035, depthWrite: false, toneMapped: false })));
    glass.position.copy(point(747, 379, 1.05)); root.add(glass);
    fill(ringShape(747, 379, 82, 70), 0xffffff, 1.08, .07, 0xc9d0fa);
    outline(ellipse(747, 379, 82), 0xffffff, 1.165, 1.1);
  });
  const bugGroupParts = [];
  const captureBug = callback => { const before = new Set(root.children); callback(); root.children.forEach(mesh => { if (!before.has(mesh)) bugGroupParts.push(mesh); }); };
  captureBug(() => {
    fill(ellipse(748, 382, 27, 32), palette.pink, 1.16, .03, 0xce368f);
    const head = shape([['M', 728, 359], ['C', 728, 337, 769, 336, 770, 359], ['Z']]); fill(head, palette.pink, 1.16, .025);
    stroke([[725, 363], [772, 363]], palette.navy, 1.205, 2.1);
    stroke([[750, 364], [740, 412]], palette.navy, 1.205, 2.2);
    stroke([[738, 343], [733, 335]], palette.pink, 1.19, 3.6); stroke([[757, 342], [766, 333]], palette.pink, 1.19, 3.6);
    for (const points of [ [[726, 368], [715, 361], [714, 349]], [[723, 380], [710, 381], [706, 390]], [[725, 395], [714, 403], [713, 413]], [[773, 365], [785, 360], [789, 348]], [[775, 380], [787, 382], [789, 392]], [[771, 397], [782, 405], [782, 414]] ]) stroke(points, palette.pink, 1.19, 3.8, true);
  });
  const bug = pivot(748, 378, bugGroupParts); bug.position.z = -.55;
  const bugGlow = glow(748, 378, 98, 0xff50bb, .70);
  const lensHalo = glow(747, 379, 233, 0xeb57d7, .91); lensParts.push(lensHalo);
  const ringPulse = new T.Mesh(own(new T.RingGeometry(.92, .945, 96)), own(new T.MeshBasicMaterial({ color: 0xea5bdb, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide, toneMapped: false })));
  ringPulse.position.copy(point(747, 379, 1.18)); root.add(ringPulse); lensParts.push(ringPulse);
  const lensFrame = pivot(747, 379, lensParts.splice(lensHandleCount));
  lensParts.push(lensFrame);
  const lens = pivot(747, 379, lensParts);
  const characters = addTestingCharacters({ T, root, own, point, scale: 100 });

  // Lens centers, ellipse radii and orientation measured from the reference.
  // The last sweep reaches its highest point at 7.25s and is still returning
  // at the supplied clip's final frame (7.875s).
  const lensKeys = [
    [0, 745.97, 373.98, 74.42, 60.59, 40.75],
    [1, 745.95, 370.30, 74.40, 60.73, 40.67],
    [1.25, 744.52, 357.68, 74.42, 60.56, 43.08],
    [1.5, 743.33, 351.06, 74.63, 60.38, 44.50],
    [1.75, 745.49, 358.55, 74.55, 60.57, 42.61],
    [2, 745.00, 356.36, 74.55, 60.67, 43.26],
    [2.25, 745.65, 365.50, 74.45, 60.65, 41.80],
    [2.5, 745.95, 373.00, 74.42, 60.65, 40.75],
    [3, 745.91, 370.07, 74.44, 60.78, 41.33],
    [4, 745.97, 373.98, 74.42, 60.59, 40.75],
    [6.5, 745.99, 373.81, 74.47, 60.69, 40.34],
    [6.625, 745.76, 370.78, 74.39, 60.53, 40.97],
    [6.75, 743.39, 358.12, 74.46, 60.28, 42.98],
    [6.875, 737.69, 338.45, 74.42, 59.45, 47.57],
    [7, 729.34, 318.72, 74.70, 58.48, 53.54],
    [7.125, 719.01, 301.88, 75.13, 56.01, 59.11],
    [7.25, 711.01, 292.23, 75.31, 53.90, 61.89],
    [7.375, 713.03, 296.16, 75.34, 53.81, 61.25],
    [7.5, 723.67, 312.17, 75.07, 56.16, 56.15],
    [7.625, 734.36, 330.99, 75.18, 57.95, 49.56],
    [7.75, 741.17, 346.76, 74.86, 59.68, 45.50],
    [7.875, 743.77, 355.30, 74.87, 60.10, 43.83],
    [8.25, 745.97, 373.98, 74.42, 60.59, 40.75],
    [12, 745.97, 373.98, 74.42, 60.59, 40.75]
  ];
  const lensPose = new Float64Array(5);
  function sampleLens(t) {
    let i = 0;
    while (i < lensKeys.length - 2 && t > lensKeys[i + 1][0]) i++;
    const a = lensKeys[i], b = lensKeys[i + 1];
    const before = lensKeys[Math.max(0, i - 1)], after = lensKeys[Math.min(lensKeys.length - 1, i + 2)];
    const span = b[0] - a[0], u = T.MathUtils.clamp((t - a[0]) / span, 0, 1);
    const u2 = u * u, u3 = u2 * u;
    for (let j = 1; j <= 5; j++) {
      const m0 = (b[j] - before[j]) / (b[0] - before[0]);
      const m1 = (after[j] - a[j]) / (after[0] - a[0]);
      lensPose[j - 1] = (2 * u3 - 3 * u2 + 1) * a[j] + (u3 - 2 * u2 + u) * span * m0 + (-2 * u3 + 3 * u2) * b[j] + (u3 - u2) * span * m1;
    }
    return lensPose;
  }
  function ellipseMatrix(matrix, major, minor, degrees) {
    const angle = degrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    matrix.set(c * major / 70, -s * minor / 70, 0, 0, s * major / 70, c * minor / 70, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    return matrix;
  }
  const initialLensMatrix = ellipseMatrix(new T.Matrix4(), 74.42, 60.59, 40.75);
  const inverseInitialLens = initialLensMatrix.clone().invert();
  const currentLensMatrix = new T.Matrix4();
  lensFrame.matrixAutoUpdate = false;
  lensFrame.matrix.copy(initialLensMatrix);
  lens.matrixAutoUpdate = false;
  const grip = new T.Vector3(), originalGrip = new T.Vector3((620 - 747) / 100, (379 - 452) / 100, .90);

  let disposed = false;
  function resize() {
    if (disposed) return;
    const { width, height } = mount.getBoundingClientRect(); if (!width || !height) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(width, height, false);
    const aspect = width / height, viewHeight = Math.max(6.85, 9.45 / aspect);
    camera.left = -viewHeight * aspect / 2; camera.right = viewHeight * aspect / 2;
    camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2; camera.updateProjectionMatrix();
  }
  function render(elapsed) {
    if (disposed) return;
    const t = ((elapsed % 12) + 12) % 12;
    const reset = 1 - smooth((t - 9.7) / 2.3);
    const pose = sampleLens(t);
    ellipseMatrix(currentLensMatrix, pose[2], pose[3], pose[4]).multiply(inverseInitialLens);
    currentLensMatrix.setPosition(point(pose[0], pose[1]));
    lens.matrix.copy(currentLensMatrix); lens.matrixWorldNeedsUpdate = true;
    grip.copy(originalGrip).applyMatrix4(currentLensMatrix);
    characters.update?.({ handX: grip.x * 100 + 850, handY: 390 - grip.y * 100 });
    // Whole tooth increments over twelve seconds also match at the loop seam.
    topGear.rotation.z = t * Math.PI / 27; lowerGear.rotation.z = -t * Math.PI / 20;
    const bugEnergy = gate(t, 1.96, 2.43, .13);
    bugGlow.material.opacity = .62 * bugEnergy;
    bug.scale.setScalar(1 + .04 * bugEnergy);
    const ringEnergy = gate(t, 2.58, 3.07, .13);
    lensHalo.material.opacity = .34 * ringEnergy; ringPulse.material.opacity = .55 * ringEnergy;
    ringPulse.scale.setScalar(1 + .12 * smooth((t - 2.58) / .62));
    codeGlint.material.opacity = .32 * Math.max(0, Math.sin(t * Math.PI / 2)) ** 12;
    const progressAmount = T.MathUtils.lerp(.46 + .51 * smooth((t - .4) / 1.7), .70 * smooth((t - 4.7) / 3.0), smooth((t - 4.0) / .35));
    progressPivot.scale.x = .46 + (progressAmount - .46) * reset;
    violetProgressMaterials.forEach(mat => { mat.opacity = smooth((t - 4.0) / .28) * reset; });
    const chart = smooth((t - 2.66) / .60) * reset;
    bars.forEach((group, i) => { group.scale.y = ([22, 33, 42, 58][i] + ([29, 48, 69, 96][i] - [22, 33, 42, 58][i]) * chart) / 100; });
    const success = smooth((t - 4.60) / .28) * reset;
    bigTick.visible = success > .01; bigTick.scale.setScalar(.85 + .15 * success);
    completionText.material.opacity = smooth((t - 5.4) / .20) * reset;
    const warningOpacity = 1 - smooth((t - 3.40) / .30) + smooth((t - 6.28) / .24);
    warningParts.forEach(mesh => { const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; list.forEach(mat => { mat.transparent = true; mat.opacity = T.MathUtils.clamp(warningOpacity, 0, 1); }); });
    const warningPulse = gate(t, 6.66, 7.18, .16);
    warningGlow.material.opacity = .26 * warningPulse;
    warningBurst.material.opacity = .24 * warningPulse;
    renderer.render(scene, camera);
  }
  function dispose() {
    if (disposed) return; disposed = true;
    characters.dispose?.(); resources.forEach(resource => resource.dispose()); renderer.dispose(); canvas.remove();
  }
  resize();
  return { canvas, resize, render, dispose };
}
