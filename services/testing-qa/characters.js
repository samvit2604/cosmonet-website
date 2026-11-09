// Shallow, native vector geometry follows the two people in the QA reference.
// Source-pixel coordinates make the silhouettes easy to align with the panel.
export function addTestingCharacters({ T, root, own, point, scale = 100 }) {
  const at = point || ((x, y, z = 0) => new T.Vector3((x - 850) / scale, (390 - y) / scale, z));
  const palette = {
    navy: '#1e255f', darkNavy: '#141c4d', hair: '#14234e', blue: '#1758f4',
    skin: '#f7b49d', skinShadow: '#ee9c8d', pink: '#f14a9d', pinkShadow: '#d62c86'
  };
  const materialCache = new Map();
  const basic = color => {
    if (!materialCache.has(color)) materialCache.set(color, own(new T.MeshBasicMaterial({ color, toneMapped: false })));
    return materialCache.get(color);
  };

  function path(commands) {
    const p = new T.Shape();
    const coords = (x, y) => { const v = at(x, y); return [v.x, v.y]; };
    for (const [op, ...v] of commands) {
      if (op === 'M') p.moveTo(...coords(v[0], v[1]));
      else if (op === 'L') p.lineTo(...coords(v[0], v[1]));
      else if (op === 'Q') p.quadraticCurveTo(...coords(v[0], v[1]), ...coords(v[2], v[3]));
      else if (op === 'C') p.bezierCurveTo(...coords(v[0], v[1]), ...coords(v[2], v[3]), ...coords(v[4], v[5]));
      else if (op === 'Z') p.closePath();
    }
    return p;
  }

  function fill(commands, color, z, { depth = .025, shade = true, bevel = .003 } = {}) {
    const geometry = own(new T.ExtrudeGeometry(path(commands), {
      depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel,
      bevelSegments: 2, curveSegments: 24, steps: 1
    }));
    let face = basic(color);
    if (shade) {
      geometry.computeBoundingBox();
      const positions = geometry.attributes.position, box = geometry.boundingBox;
      const values = new Float32Array(positions.count * 3), base = new T.Color(color);
      const height = Math.max(box.max.y - box.min.y, .001);
      for (let i = 0; i < positions.count; i++) {
        const u = (positions.getY(i) - box.min.y) / height;
        base.clone().multiplyScalar(.91 + .12 * u).toArray(values, i * 3);
      }
      geometry.setAttribute('color', new T.BufferAttribute(values, 3));
      face = own(new T.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false }));
    }
    const sideColor = new T.Color(color).multiplyScalar(.75);
    const mesh = new T.Mesh(geometry, [face, own(new T.MeshBasicMaterial({ color: sideColor, toneMapped: false }))]);
    mesh.position.z = z;
    root.add(mesh);
    return mesh;
  }

  function stroke(commands, color, z, width = .008) {
    const points = path(commands).getPoints(32).map(p => new T.Vector3(p.x, p.y, z));
    if (points.length < 2) return;
    const curve = new T.CatmullRomCurve3(points, false, 'centripetal');
    const mesh = new T.Mesh(own(new T.TubeGeometry(curve, Math.max(12, points.length), width, 5, false)), basic(color));
    root.add(mesh);
    return mesh;
  }

  // The cube is shaded as three separate native faces, preserving the original
  // illustration's gentle perspective without introducing a heavy floor plane.
  fill([
    ['M',1084,558],['L',1152,564],['L',1152,662],['L',1090,664],
    ['Q',1081,664,1081,655],['L',1081,568],['Q',1081,560,1084,558],['Z']
  ], '#b6c5fc', .46, { depth: .035 });
  fill([
    ['M',1150,564],['L',1194,553],['Q',1201,554,1201,562],['L',1201,637],
    ['Q',1201,646,1193,650],['L',1152,663],['Z']
  ], '#7389f4', .468, { depth: .03 });
  fill([
    ['M',1084,557],['L',1168,550],['Q',1185,549,1197,553],['Q',1201,556,1194,558],
    ['L',1152,569],['Q',1149,571,1143,570],['L',1086,563],['Q',1079,561,1084,557],['Z']
  ], '#c4d0ff', .505, { depth: .022 });

  // Standing tester: tailored trousers and small, flat shoes.
  fill([
    ['M',458,464],['L',492,467],['L',488,520],['L',469,639],['L',442,639],
    ['L',449,554],['Z']
  ], palette.navy, .60);
  fill([
    ['M',486,466],['L',525,466],['L',529,538],['L',530,640],['L',505,642],
    ['L',496,564],['L',483,515],['Z']
  ], '#20245f', .615);
  stroke([['M',486,479],['Q',490,508,494,529]], '#111d50', .65, .006);
  fill([
    ['M',444,637],['L',460,640],['L',474,648],['L',486,652],['Q',492,657,487,661],
    ['L',445,662],['Q',439,660,442,649],['Z']
  ], '#11183e', .65, { shade: false });
  fill([
    ['M',507,639],['L',524,640],['L',538,649],['L',550,653],['Q',557,657,553,661],
    ['L',509,662],['Q',505,661,506,651],['Z']
  ], '#11183e', .665, { shade: false });

  fill([
    ['M',500,338],['L',515,341],['L',513,363],['L',492,361],['L',497,345],['Z']
  ], palette.skinShadow, .66);
  fill([
    ['M',495,359],['C',478,359,467,371,462,391],['C',457,411,457,444,458,467],
    ['Q',489,471,524,467],['L',521,428],['C',522,414,530,402,526,389],
    ['C',522,375,514,364,505,361],['Z']
  ], palette.blue, .69);
  stroke([['M',508,406],['Q',510,433,522,451]], '#1546c9', .735, .006);
  fill([
    ['M',504,320],['C',511,316,521,316,525,322],['L',525,329],['L',530,335],
    ['Q',530,338,526,338],['L',525,345],['Q',522,351,515,351],['L',505,348],
    ['L',497,335],['Z']
  ], palette.skin, .72);
  fill([
    ['M',493,347],['C',483,343,480,332,485,324],['C',482,317,488,311,496,313],
    ['C',499,305,509,304,516,309],['C',524,302,534,305,531,314],
    ['C',530,323,518,324,514,324],['L',513,332],['Q',507,326,506,333],
    ['C',502,337,508,342,505,346],['Q',501,351,493,347],['Z']
  ], palette.hair, .755, { shade: false });

  // The arm is made from reusable extruded pieces so the hand can follow the
  // scanning glass without allocating or rebuilding geometry on animation frames.
  const armShape = new T.Shape();
  armShape.moveTo(-.1, -.4); armShape.quadraticCurveTo(-.1, -.5, 0, -.5);
  armShape.quadraticCurveTo(.1, -.5, .1, -.4); armShape.lineTo(.1, .4);
  armShape.quadraticCurveTo(.1, .5, 0, .5); armShape.quadraticCurveTo(-.1, .5, -.1, .4); armShape.closePath();
  const armGeometry = own(new T.ExtrudeGeometry(armShape, { depth: .025, bevelEnabled: false, curveSegments: 12 }));
  const armMaterial = basic(palette.blue);
  const upperArm = new T.Mesh(armGeometry, armMaterial), forearm = new T.Mesh(armGeometry, armMaterial);
  root.add(upperArm, forearm);
  const elbow = new T.Mesh(own(new T.CircleGeometry(.105, 24)), armMaterial); root.add(elbow);
  const hand = fill([
    ['M',594,443],['L',602,439],['Q',607,438,612,443],['L',619,441],
    ['L',627,447],['Q',630,451,625,454],['L',621,455],['L',619,462],
    ['Q',618,468,612,466],['L',603,463],['L',592,458],['Z']
  ], palette.skin, .96, { depth: .022 });
  const handFold = stroke([['M',611,444],['L',620,450],['Q',623,452,625,452]], '#e69587', .99, .0045);

  // Seated developer: the hair contour sits behind the head and magenta blouse.
  fill([
    ['M',1091,380],['C',1101,371,1118,372,1129,379],['C',1138,386,1138,398,1144,410],
    ['C',1149,419,1164,411,1174,418],['C',1185,425,1178,438,1190,444],
    ['C',1203,452,1204,469,1192,479],['C',1181,489,1163,489,1153,475],
    ['L',1126,447],['L',1094,408],['Z']
  ], palette.hair, .61, { shade: false });

  // The farther leg is partially hidden by the forward thigh and seat.
  fill([
    ['M',1094,516],['C',1065,510,1042,516,1031,535],['L',989,622],['L',1010,629],
    ['L',1055,558],['L',1118,558],['C',1141,556,1151,537,1138,520],['Z']
  ], '#171f55', .66);
  fill([
    ['M',1105,513],['L',1152,518],['C',1162,533,1155,550,1144,555],
    ['C',1125,561,1087,557,1065,557],['L',1072,623],['L',1048,629],
    ['L',1033,550],['C',1028,528,1048,515,1064,514],['Z']
  ], palette.navy, .71);
  stroke([['M',1060,521],['C',1044,528,1040,540,1044,558],['L',1055,610]], '#333878', .752, .006);

  fill([
    ['M',991,622],['L',1010,628],['L',1005,648],['L',975,656],['L',969,649],
    ['L',984,640],['Z']
  ], palette.skin, .75, { depth: .02 });
  fill([
    ['M',1049,627],['L',1071,623],['L',1068,649],['L',1042,660],['L',1037,653],
    ['L',1049,640],['Z']
  ], palette.skin, .77, { depth: .02 });
  fill([
    ['M',972,649],['L',987,647],['L',1003,643],['L',1005,660],
    ['Q',987,665,964,662],['Q',956,661,961,656],['Z']
  ], '#11183e', .79, { shade: false });
  fill([
    ['M',1040,652],['L',1054,648],['L',1068,642],['L',1075,649],['L',1073,663],
    ['L',1069,660],['Q',1047,670,1036,666],['Q',1030,664,1035,660],['Z']
  ], '#11183e', .81, { shade: false });

  fill([
    ['M',1107,415],['L',1123,417],['L',1126,436],['Q',1115,445,1104,436],
    ['L',1108,429],['Z']
  ], palette.skinShadow, .72);
  fill([
    ['M',1097,385],['C',1091,388,1091,398,1092,404],['L',1089,410],
    ['L',1094,413],['Q',1095,422,1105,425],['Q',1116,428,1124,417],
    ['L',1130,400],['C',1126,387,1111,381,1097,385],['Z']
  ], palette.skin, .75);
  fill([
    ['M',1096,384],['C',1100,376,1118,375,1128,383],['C',1134,388,1134,400,1131,411],
    ['L',1123,420],['Q',1128,405,1118,402],['C',1106,400,1101,393,1097,386],['Z']
  ], palette.hair, .785, { shade: false });
  fill([
    ['M',1111,431],['C',1095,431,1084,448,1082,466],['L',1079,493],
    ['Q',1083,507,1101,510],['L',1152,517],['C',1168,515,1175,505,1170,490],
    ['L',1163,464],['C',1158,449,1145,438,1127,434],['Q',1117,443,1111,431],['Z']
  ], palette.pink, .79);
  stroke([['M',1094,453],['Q',1085,474,1090,488]], '#b82478', .832, .007);
  stroke([['M',1137,466],['L',1147,488],['L',1111,496]], '#a52b77', .835, .007);
  stroke([['M',1154,516],['L',1100,508]], '#cb338b', .834, .005);

  // The hand is visible just beyond the laptop edge, as in the reference.
  fill([
    ['M',1081,497],['L',1089,491],['Q',1096,491,1101,495],['L',1107,497],
    ['L',1114,503],['L',1107,507],['L',1080,507],['Z']
  ], palette.skin, .965, { depth: .017 });

  // Thin, lightly extruded laptop with a navy outline and a small oval mark.
  fill([
    ['M',1009,508],['L',1102,510],['L',1114,515],['Q',1115,518,1108,518],
    ['L',1021,517],['L',1008,513],['Z']
  ], '#c0c9f7', 1.005, { depth: .025, shade: false });
  stroke([['M',1021,517],['L',1109,518]], '#5662a6', 1.04, .006);
  const screen = [
    ['M',994,455],['L',1053,455],['Q',1058,455,1060,461],['L',1078,510],
    ['L',1014,511],['Q',1009,511,1007,506],['L',991,462],['Q',989,456,994,455],['Z']
  ];
  fill(screen, '#b9c5ff', 1.035, { depth: .025, shade: true });
  stroke(screen, '#20275f', 1.068, .008);
  const logo = new T.Mesh(own(new T.CircleGeometry(.05, 28)), basic('#242d77'));
  logo.position.copy(at(1031, 485, 1.075)); logo.scale.y = 1.25; logo.rotation.z = .25; root.add(logo);

  function segment(mesh, fromX, fromY, toX, toY, width, z) {
    const a = at(fromX, fromY), b = at(toX, toY);
    mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, z);
    mesh.rotation.z = Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
    mesh.scale.set(width / 20, a.distanceTo(b) + .04, 1);
  }
  let lastX = NaN, lastY = NaN;
  function update({ handX = 620, handY = 452 } = {}) {
    if (handX === lastX && handY === lastY) return;
    lastX = handX; lastY = handY;
    const dx = handX - 620, dy = handY - 452;
    const elbowX = 534 + dx * .22, elbowY = 442 + dy * .38;
    const wristX = 594 + dx, wristY = 452 + dy;
    segment(upperArm, 513, 392, elbowX, elbowY, 21, .765);
    segment(forearm, elbowX, elbowY, wristX, wristY, 17, .79);
    elbow.position.copy(at(elbowX, elbowY, .82));
    hand.position.x = dx / scale; hand.position.y = -dy / scale;
    handFold.position.x = dx / scale; handFold.position.y = -dy / scale;
  }
  function render(_time, pose) {
    if (!pose) return update();
    if (Number.isFinite(pose.handX) && Number.isFinite(pose.handY)) return update(pose);
    const rotation = pose.rotation || 0, dx = -127, dy = 73;
    update({ handX: (pose.x ?? 747) + dx * Math.cos(rotation) + dy * Math.sin(rotation), handY: (pose.y ?? 379) - dx * Math.sin(rotation) + dy * Math.cos(rotation) });
  }
  update();
  return { update, render };
}
