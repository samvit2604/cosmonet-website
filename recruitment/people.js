import * as THREE from '/assets/vendor/three.module.min.js';

// Shared, smooth primitives keep the small illustrated cast inexpensive to draw.
const ball = new THREE.SphereGeometry(1, 24, 18);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 20);
const up = new THREE.Vector3(0, 1, 0);

function material(color, roughness = .62) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: .015 });
}

function mesh(parent, geometry, surface, x = 0, y = 0, z = 0) {
  const item = new THREE.Mesh(geometry, surface);
  item.position.set(x, y, z);
  item.castShadow = true;
  item.receiveShadow = true;
  parent.add(item);
  return item;
}

function oval(parent, surface, x, y, z, sx, sy, sz) {
  const item = mesh(parent, ball, surface, x, y, z);
  item.scale.set(sx, sy, sz);
  return item;
}

function link(parent, surface, a, b, radius, radiusEnd = radius) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const direction = end.clone().sub(start);
  const item = mesh(parent, new THREE.CylinderGeometry(radiusEnd, radius, direction.length(), 20), surface);
  item.position.copy(start).add(end).multiplyScalar(.5);
  item.quaternion.setFromUnitVectors(up, direction.normalize());
  return item;
}

function panel(parent, surface, points, z) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
  shape.closePath();
  return mesh(parent, new THREE.ShapeGeometry(shape), surface, 0, 0, z);
}

function roundBox(w, h, d, r = .025) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const geometry = new THREE.ExtrudeGeometry(s, {
    depth: d, bevelEnabled: true, bevelSize: .008, bevelThickness: .008,
    bevelSegments: 2, curveSegments: 8,
  });
  geometry.translate(0, 0, -d / 2);
  return geometry;
}

/** A two-unit, +Z-facing illustrated professional, with independently posed arms. */
export function createPerson({
  shirt = '#873bec', trousers = '#24203f', skin = '#eeb19b', hair = '#211939',
  female = false, jacket = false, pose = 'standing', accessory = null, skirt = false,
} = {}) {
  const person = new THREE.Group();
  const cloth = material(shirt), pants = material(trousers), complexion = material(skin, .7);
  const hairSurface = material(hair, .48), shoes = material('#252039', .46);
  const ivory = material('#f8f4ff'), seam = material(new THREE.Color(shirt).multiplyScalar(.82));
  const lapel = material(new THREE.Color(shirt).lerp(new THREE.Color('#e5d9ff'), .2));
  const seated = pose === 'seated', hipY = seated ? .85 : 1.01;
  const legSurface = skirt ? complexion : pants;

  // The torso's varying elliptical section gives a tailored waist and soft shoulders.
  const profile = female
    ? [[.14, 0], [.19, .035], [.20, .10], [.155, .23], [.19, .36], [.215, .47], [.19, .53], [.095, .59]]
    : [[.17, 0], [.19, .035], [.19, .17], [.205, .34], [.235, .46], [.205, .52], [.09, .59]];
  const torso = mesh(person, new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 32), cloth, 0, hipY, 0);
  torso.scale.z = .62;
  oval(person, complexion, 0, hipY + .61, 0, .071, .09, .067);

  // Collar and jacket opening remain clean silhouettes at hero-screen scale.
  if (jacket) {
    panel(person, ivory, [[-.098, hipY + .55], [.098, hipY + .55], [.055, hipY + .06], [-.055, hipY + .06]], .128);
    panel(person, lapel, [[-.18, hipY + .49], [-.088, hipY + .57], [-.012, hipY + .26], [-.13, hipY + .37]], .145);
    panel(person, lapel, [[.18, hipY + .49], [.088, hipY + .57], [.012, hipY + .26], [.13, hipY + .37]], .145);
    oval(person, seam, .047, hipY + .17, .139, .013, .013, .006);
    oval(person, seam, .047, hipY + .10, .136, .013, .013, .006);
  } else {
    panel(person, ivory, [[-.092, hipY + .55], [0, hipY + .51], [-.056, hipY + .435], [-.13, hipY + .50]], .127);
    panel(person, ivory, [[.092, hipY + .55], [0, hipY + .51], [.056, hipY + .435], [.13, hipY + .50]], .127);
    if (!female && accessory === 'briefcase') {
      panel(person, pants, [[0, hipY + .51], [.034, hipY + .47], [.024, hipY + .45], [.047, hipY + .17], [0, hipY + .11], [-.039, hipY + .17], [-.017, hipY + .45], [-.03, hipY + .47]], .141);
    }
  }

  const head = new THREE.Group(); head.position.set(0, hipY + .83, .007); person.add(head);
  oval(head, complexion, 0, 0, 0, .145, .183, .137);
  oval(head, complexion, -.145, -.009, -.008, .033, .052, .028);
  oval(head, complexion, .145, -.009, -.008, .033, .052, .028);
  oval(head, complexion, 0, -.006, .135, .031, .035, .042);

  if (female) {
    // Swept cap, side locks and a curved fall/ponytail rather than a spherical wig.
    oval(head, hairSurface, 0, .063, -.032, .16, .16, .142);
    oval(head, hairSurface, -.105, -.045, -.065, .072, .17, .11);
    oval(head, hairSurface, .111, -.002, -.075, .062, .13, .10);
    const fringe = oval(head, hairSurface, -.057, .111, .086, .113, .06, .069);
    fringe.rotation.z = .38;
    if (seated) {
      oval(head, hairSurface, .015, -.12, -.168, .085, .14, .074).rotation.x = -.35;
      oval(head, hairSurface, .038, -.26, -.19, .075, .13, .065).rotation.z = -.24;
    } else {
      oval(head, hairSurface, -.035, -.18, -.11, .14, .18, .09).rotation.z = -.18;
      oval(head, hairSurface, -.09, -.30, -.085, .11, .105, .075);
    }
  } else {
    oval(head, hairSurface, 0, .096, -.025, .16, .113, .138);
    oval(head, hairSurface, -.115, .028, -.07, .047, .101, .078);
    oval(head, hairSurface, .127, .025, -.065, .038, .091, .067);
    const sweep = oval(head, hairSurface, -.032, .146, .045, .135, .065, .092);
    sweep.rotation.z = -.17;
    oval(head, hairSurface, -.112, .102, .065, .055, .06, .065).rotation.z = .4;
    oval(head, hairSurface, .073, .149, -.025, .085, .056, .085).rotation.z = .22;
  }

  // Feet have flattened soles and a forward toe; all poses keep them on y=0.
  for (const sign of [-1, 1]) {
    const x = sign * .105;
    const shoeZ = seated ? .45 : .055;
    if (seated) {
      link(person, pants, [x, hipY + .015, -.015], [x * 1.12, .75, .405], .087, .078);
      oval(person, pants, x * 1.12, .75, .405, .082, .082, .083);
      link(person, pants, [x * 1.12, .75, .405], [x * 1.12, .115, .41], .076, .063);
    } else {
      link(person, legSurface, [x, hipY + .01, 0], [x * 1.08, .54, .012], .10, .083);
      oval(person, legSurface, x * 1.08, .54, .012, .079, .083, .075);
      link(person, legSurface, [x * 1.08, .54, .012], [x * 1.11, .105, .01], .076, .059);
    }
    oval(person, shoes, x * 1.1, .065, shoeZ, female ? .071 : .079, .053, female ? .128 : .143);
    const sole = mesh(person, roundBox(female ? .137 : .15, female ? .235 : .26, .027, .012), shoes, x * 1.1, .022, shoeZ + .007);
    sole.rotation.x = -Math.PI / 2;
  }
  oval(person, pants, 0, hipY + .015, -.005, .181, .11, .119);
  if (skirt && !seated) {
    const hem = mesh(person, new THREE.LatheGeometry([[.24, .57], [.239, .59], [.195, 1.01]].map(([r, y]) => new THREE.Vector2(r, y)), 32), pants);
    hem.scale.z = .68;
  }

  function makeArm(sign) {
    const shoulder = new THREE.Group(); shoulder.position.set(sign * .216, hipY + .465, .005); person.add(shoulder);
    oval(shoulder, cloth, 0, -.025, 0, .085, .092, .087);
    mesh(shoulder, new THREE.CylinderGeometry(.075, .059, .27, 20), cloth, 0, -.151, 0);
    const elbow = new THREE.Group(); elbow.position.y = -.285; shoulder.add(elbow);
    oval(elbow, cloth, 0, 0, 0, .059, .063, .061);
    mesh(elbow, new THREE.CylinderGeometry(.059, .043, .245, 20), cloth, 0, -.122, 0);
    const cuff = mesh(elbow, cylinder, ivory, 0, -.239, 0); cuff.scale.set(.045, .023, .046);
    const hand = oval(elbow, complexion, 0, -.290, .006, .046, .067, .037);
    oval(elbow, complexion, -sign * .036, -.271, .022, .025, .037, .022);
    shoulder.rotation.z = sign * .065;
    return { shoulder, elbow, hand };
  }
  const left = makeArm(-1), right = makeArm(1);
  if (pose === 'holding') {
    left.shoulder.rotation.set(-.35, 0, .27); right.shoulder.rotation.set(-.35, 0, -.27);
    left.elbow.rotation.x = -.79; right.elbow.rotation.x = -.79;
    const resume = new THREE.Group(); resume.position.set(0, hipY + .14, .353); resume.rotation.set(-.13, -.08, -.06); person.add(resume);
    mesh(resume, roundBox(.235, .34, .015, .012), accessory === 'folder' ? material('#6853c7') : ivory);
    const purple = material('#9562df'), pink = material('#d91db8'), lines = material('#bdb1db');
    if (accessory !== 'folder') {
    mesh(resume, new THREE.CircleGeometry(.037, 24), purple, -.058, .095, .017);
    oval(resume, ivory, -.058, .103, .02, .010, .011, .003);
    oval(resume, ivory, -.058, .080, .02, .018, .013, .003);
    mesh(resume, new THREE.PlaneGeometry(.085, .013), pink, .032, .11, .019);
    for (let i = 0; i < 4; i++) mesh(resume, new THREE.PlaneGeometry(.15 - (i % 2) * .028, .011), lines, 0, .021 - i * .037, .019);
    }
    person.userData.resume = resume;
  } else if (pose === 'magnifier') {
    right.shoulder.rotation.set(-1.16, 0, -.10); right.elbow.rotation.x = -.70;
    left.shoulder.rotation.set(-.23, 0, .065); left.elbow.rotation.x = -.27;
  } else if (seated) {
    left.shoulder.rotation.set(-1.24, 0, .10); right.shoulder.rotation.set(-1.24, 0, -.10);
    left.elbow.rotation.x = -.47; right.elbow.rotation.x = -.47;
    head.rotation.x = .10;
  }

  if (accessory === 'briefcase') {
    const bag = new THREE.Group(); bag.position.set(-.29, hipY - .38, .06); bag.rotation.y = -.06; person.add(bag);
    mesh(bag, roundBox(.35, .28, .10, .022), pants);
    const handle = mesh(bag, new THREE.TorusGeometry(.058, .012, 8, 20, Math.PI), shoes, 0, .145, 0);
    handle.rotation.z = 0;
    mesh(bag, new THREE.BoxGeometry(.37, .027, .108), shoes, 0, .035, .004);
    mesh(bag, new THREE.BoxGeometry(.037, .047, .008), lapel, 0, .017, .061);
  }

  person.userData.leftArm = left.shoulder;
  person.userData.rightArm = right.shoulder;
  person.userData.leftForearm = left.elbow;
  person.userData.rightForearm = right.elbow;
  person.userData.leftHand = left.hand;
  person.userData.rightHand = right.hand;
  person.userData.head = head;
  person.userData.restPose = {
    leftArm: left.shoulder.rotation.clone(), rightArm: right.shoulder.rotation.clone(),
    leftForearm: left.elbow.rotation.clone(), rightForearm: right.elbow.rotation.clone(),
    head: head.rotation.clone(),
  };
  return person;
}
