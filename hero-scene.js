import * as THREE from '/assets/vendor/three.module.min.js';

// An original, self-contained scene. All geometry and textures are made locally.
const hero = document.querySelector('.cosmo-hero');
const mount = hero?.querySelector('[data-hero-scene]');

if (hero && mount && !mount.querySelector('canvas')) {
  const motionButton = hero.querySelector('[data-hero-motion]');
  const motionLabel = motionButton?.querySelector('[data-motion-label]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('tabindex', '-1');

  const fallback = () => {
    hero.classList.remove('scene-ready');
    hero.classList.add('scene-fallback');
    hero.dataset.sceneState = 'fallback';
    hero.dataset.sceneMotion = 'fallback';
    if (motionButton) motionButton.hidden = true;
  };

  try {
    const context = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    if (!context) {
      fallback();
    } else {
      initializeScene(context);
    }
  } catch {
    fallback();
  }

  function initializeScene(context) {
    const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true });
    renderer.setClearColor(0x080910, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.append(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-4, 4, 3.4, -3.4, 0.1, 50);
    const cameraTarget = new THREE.Vector3(0, 0.7, 0.35);
    const baseCamera = new THREE.Vector3(7.7, 6.7, 10.6);
    camera.position.copy(baseCamera);
    camera.lookAt(cameraTarget);

    // Broad studio light sources create the long highlights of brushed metal.
    const environmentCanvas = document.createElement('canvas');
    environmentCanvas.width = 1024;
    environmentCanvas.height = 512;
    const environmentContext = environmentCanvas.getContext('2d');
    const environmentBase = environmentContext.createLinearGradient(0, 0, 0, 512);
    environmentBase.addColorStop(0, '#b1b9e4');
    environmentBase.addColorStop(0.3, '#3b3c65');
    environmentBase.addColorStop(0.54, '#121226');
    environmentBase.addColorStop(1, '#05050c');
    environmentContext.fillStyle = environmentBase;
    environmentContext.fillRect(0, 0, 1024, 512);
    const lightPanel = (x, y, width, height, color) => {
      environmentContext.shadowBlur = 24;
      environmentContext.shadowColor = color;
      environmentContext.fillStyle = color;
      environmentContext.fillRect(x, y, width, height);
    };
    lightPanel(70, 100, 240, 85, '#e5e8ff');
    lightPanel(500, 40, 85, 210, '#c7baff');
    lightPanel(800, 125, 140, 70, '#7ca7ff');
    lightPanel(370, 235, 40, 110, '#87518f');
    environmentContext.shadowBlur = 0;
    let environment;
    function rebuildEnvironment() {
      // Render targets lose their pixels with the WebGL context; the retained
      // canvas is the CPU source from which the studio reflections can recover.
      const environmentTexture = new THREE.CanvasTexture(environmentCanvas);
      environmentTexture.mapping = THREE.EquirectangularReflectionMapping;
      environmentTexture.colorSpace = THREE.SRGBColorSpace;
      const pmrem = new THREE.PMREMGenerator(renderer);
      const previousEnvironment = environment;
      environment = pmrem.fromEquirectangular(environmentTexture);
      scene.environment = environment.texture;
      previousEnvironment?.dispose();
      environmentTexture.dispose();
      pmrem.dispose();
    }
    rebuildEnvironment();

    scene.add(new THREE.HemisphereLight(0xe0e3f5, 0x181224, 1.1));
    const keyLight = new THREE.DirectionalLight(0xeff0ff, 4.2);
    keyLight.position.set(-3, 8, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = keyLight.shadow.camera.bottom = -8;
    keyLight.shadow.camera.right = keyLight.shadow.camera.top = 8;
    keyLight.shadow.normalBias = 0.035;
    keyLight.shadow.bias = -0.0001;
    keyLight.shadow.radius = 3;
    scene.add(keyLight);
    const blueLight = new THREE.PointLight(0x6c91ff, 22, 14, 2);
    blueLight.position.set(3.5, 0.5, 4);
    scene.add(blueLight);
    const roseLight = new THREE.PointLight(0xd15db8, 10, 12, 2);
    roseLight.position.set(-3.5, -1.2, 3);
    scene.add(roseLight);

    const violetLight = new THREE.PointLight(0x9764eb, 12, 10, 2);
    violetLight.position.set(2.7, 2.8, 0.2);
    scene.add(violetLight);

    // A diagonal machined conveyor carries software, AI and banking through the O.
    const deckMaterial = new THREE.MeshStandardMaterial({
      color: 0x2e3753, metalness: 0.82, roughness: 0.32, envMapIntensity: 0.85,
    });
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x151b2d, metalness: 0.85, roughness: 0.32, envMapIntensity: 0.7,
    });
    const chrome = new THREE.MeshPhysicalMaterial({
      color: 0x8e9ab8, metalness: 1, roughness: 0.2, envMapIntensity: 1.3,
    });
    const platform = new THREE.Group();
    scene.add(platform);
    function roundedBlock(width, height, depth, radius = 0.08, bevel = 0.04) {
      const geometry = new THREE.ExtrudeGeometry(roundedRectangle(width - bevel * 2, height - bevel * 2, radius), {
        depth: depth - bevel * 2, bevelEnabled: true, bevelSegments: 5,
        bevelSize: bevel, bevelThickness: bevel, curveSegments: 8, steps: 1,
      });
      geometry.translate(0, 0, -depth / 2 + bevel);
      return geometry;
    }
    function addMesh(geometry, material, x, y, z, parent = platform) {
      const object = new THREE.Mesh(geometry, material);
      object.position.set(x, y, z);
      parent.add(object);
      return object;
    }
    addMesh(roundedBlock(4.2, 0.28, 12.5), darkMetal, 0, -0.05, 0);
    const tileGeometry = new THREE.BoxGeometry(3.96, 0.08, 2.03);
    for (let panel = 0; panel < 6; panel++) {
      const tile = addMesh(tileGeometry, deckMaterial, 0, 0.13, -5.14 + panel * 2.06);
      tile.receiveShadow = true;
    }
    const guideGeometry = new THREE.BoxGeometry(0.045, 0.05, 12.4);
    addMesh(guideGeometry, chrome, -2.02, 0.21, 0);
    addMesh(guideGeometry, chrome, 2.02, 0.21, 0);
    const railGeometry = new THREE.BoxGeometry(0.02, 0.02, 12.3);
    addMesh(railGeometry, new THREE.MeshBasicMaterial({ color: 0x597bc4 }), -2.075, 0.12, 0);
    addMesh(railGeometry, new THREE.MeshBasicMaterial({ color: 0x8962c9 }), 2.075, 0.12, 0);
    const perforations = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.023, 0.023, 0.008, 8), darkMetal, 72);
    const matrix = new THREE.Matrix4();
    let hole = 0;
    for (let panel = 0; panel < 6; panel++) for (const side of [-1, 1]) for (let offset = 0; offset < 6; offset++) {
      matrix.makeTranslation(side * (1.59 + (offset % 2) * 0.16), 0.173, -5.78 + panel * 2.06 + Math.floor(offset / 2) * 0.56);
      perforations.setMatrixAt(hole++, matrix);
    }
    platform.add(perforations);

    // The brand O remains stationary as the modules pass through its opening.
    const sculpture = new THREE.Group();
    sculpture.position.set(0, 1.85, -0.15);
    scene.add(sculpture);
    const outerRadius = 2.0;
    const innerRadius = 1.7;
    // A gently crowned face reflects the softboxes; rounded cuts keep the edge precise.
    const profile = new THREE.Path();
    profile.moveTo(innerRadius + 0.055, -0.11);
    profile.lineTo(outerRadius - 0.055, -0.11);
    profile.quadraticCurveTo(outerRadius, -0.11, outerRadius, -0.055);
    profile.lineTo(outerRadius, 0.055);
    profile.quadraticCurveTo(outerRadius, 0.11, outerRadius - 0.055, 0.11);
    profile.quadraticCurveTo((outerRadius + innerRadius) / 2, 0.17, innerRadius + 0.055, 0.11);
    profile.quadraticCurveTo(innerRadius, 0.11, innerRadius, 0.055);
    profile.lineTo(innerRadius, -0.055);
    profile.quadraticCurveTo(innerRadius, -0.11, innerRadius + 0.055, -0.11);
    const geometry = new THREE.LatheGeometry(profile.getPoints(12), 192);
    geometry.rotateX(Math.PI / 2);

    const gradientStops = [
      { at: 0, color: new THREE.Color(0x3e61d2) },
      { at: 0.25, color: new THREE.Color(0xb52b8a) },
      { at: 0.5, color: new THREE.Color(0xbd3296) },
      { at: 0.75, color: new THREE.Color(0x7241c9) },
      { at: 1, color: new THREE.Color(0x3e61d2) },
    ];
    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const color = new THREE.Color();
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const angle = (Math.atan2(positions.getY(vertex), positions.getX(vertex)) + Math.PI * 2) % (Math.PI * 2);
      const fraction = angle / (Math.PI * 2);
      const segment = Math.min(Math.floor(fraction * 4), 3);
      const from = gradientStops[segment];
      const to = gradientStops[segment + 1];
      color.copy(from.color).lerp(to.color, (fraction - from.at) / (to.at - from.at));
      color.toArray(colors, vertex * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const faceMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, vertexColors: true, metalness: 0.48,
      roughness: 0.23, clearcoat: 1, clearcoatRoughness: 0.1,
      envMapIntensity: 1.8,
    });
    const ring = new THREE.Mesh(geometry, faceMaterial);
    ring.castShadow = true;
    ring.receiveShadow = true;
    sculpture.add(ring);

    // Very fine polished cuts catch the studio light along the front bevels.
    const edgeMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x98a1be, metalness: 1, roughness: 0.16,
      envMapIntensity: 1.5, clearcoat: 0.8,
    });
    for (const radius of [outerRadius, innerRadius]) {
      const edge = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.006, 8, 192), edgeMaterial);
      edge.position.z = 0.055;
      sculpture.add(edge);
    }

    const gatewayGlass = new THREE.Mesh(new THREE.CircleGeometry(innerRadius - 0.03, 80), new THREE.MeshPhysicalMaterial({
      color: 0x8198ee, transparent: true, opacity: 0.055, roughness: 0.12,
      metalness: 0.05, emissive: 0x525bc5, emissiveIntensity: 0.2,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    gatewayGlass.renderOrder = 3;
    sculpture.add(gatewayGlass);
    const scan = new THREE.Mesh(new THREE.PlaneGeometry(innerRadius * 2, 0.018), new THREE.MeshBasicMaterial({
      color: 0xa3baff, transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    scan.position.z = 0.03;
    scan.renderOrder = 4;
    sculpture.add(scan);

    // Three rounded metal modules: bright etched service icons, never robot faces.
    function roundedRectangle(width, height, radius) {
      radius = Math.min(radius, width / 2, height / 2);
      const left = -width / 2, bottom = -height / 2;
      const shape = new THREE.Shape();
      shape.moveTo(left + radius, bottom);
      shape.lineTo(left + width - radius, bottom);
      shape.quadraticCurveTo(left + width, bottom, left + width, bottom + radius);
      shape.lineTo(left + width, bottom + height - radius);
      shape.quadraticCurveTo(left + width, bottom + height, left + width - radius, bottom + height);
      shape.lineTo(left + radius, bottom + height);
      shape.quadraticCurveTo(left, bottom + height, left, bottom + height - radius);
      shape.lineTo(left, bottom + radius);
      shape.quadraticCurveTo(left, bottom, left + radius, bottom);
      return shape;
    }

    function iconTexture(type) {
      const surface = document.createElement('canvas');
      surface.width = surface.height = 256;
      const drawing = surface.getContext('2d');
      drawing.fillStyle = '#111722';
      drawing.fillRect(0, 0, 256, 256);
      drawing.strokeStyle = '#d4d9e9';
      drawing.fillStyle = '#d4d9e9';
      drawing.lineWidth = 6;
      drawing.lineCap = 'round';
      drawing.lineJoin = 'round';
      drawing.beginPath();
      if (type === 0) {
        drawing.moveTo(91, 88); drawing.lineTo(53, 128); drawing.lineTo(91, 168);
        drawing.moveTo(165, 88); drawing.lineTo(203, 128); drawing.lineTo(165, 168);
        drawing.moveTo(143, 77); drawing.lineTo(113, 179);
        drawing.stroke();
      } else if (type === 1) {
        const nodes = [[128, 64], [67, 110], [91, 181], [165, 181], [189, 110]];
        drawing.lineWidth = 3;
        for (const [x, y] of nodes) { drawing.moveTo(x, y); drawing.lineTo(128, 128); }
        drawing.stroke();
        for (const [x, y] of [...nodes, [128, 128]]) {
          drawing.beginPath(); drawing.arc(x, y, x === 128 && y === 128 ? 13 : 8, 0, Math.PI * 2); drawing.fill();
        }
      } else {
        drawing.moveTo(59, 95); drawing.lineTo(128, 62); drawing.lineTo(197, 95); drawing.lineTo(59, 95);
        for (const x of [82, 128, 174]) { drawing.moveTo(x, 113); drawing.lineTo(x, 171); }
        drawing.moveTo(64, 190); drawing.lineTo(192, 190);
        drawing.stroke();
      }
      const texture = new THREE.CanvasTexture(surface);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
      return texture;
    }

    const moduleGeometry = new THREE.ExtrudeGeometry(roundedRectangle(0.73, 0.73, 0.095), {
      depth: 0.57, bevelEnabled: true, bevelSegments: 5,
      bevelSize: 0.06, bevelThickness: 0.06, curveSegments: 10, steps: 1,
    });
    moduleGeometry.translate(0, 0, -0.285);
    const moduleMetal = new THREE.MeshPhysicalMaterial({
      color: 0x8590a6, metalness: 0.86, roughness: 0.28,
      clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: 1.2,
    });
    const moduleRim = new THREE.MeshStandardMaterial({
      color: 0x343b50, metalness: 0.75, roughness: 0.26,
    });
    const modules = [];
    for (let index = 0; index < 3; index++) {
      const group = new THREE.Group();
      group.scale.setScalar(1.7);
      const body = new THREE.Mesh(moduleGeometry, moduleMetal);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);
      const rimMaterial = moduleRim.clone();
      rimMaterial.emissive.setHex(0x6089ef);
      rimMaterial.emissiveIntensity = 0.4;
      const rim = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectangle(0.69, 0.69, 0.105)), rimMaterial);
      rim.position.z = 0.349;
      group.add(rim);
      const iconGeometry = new THREE.ShapeGeometry(roundedRectangle(0.61, 0.61, 0.075));
      const vertices = iconGeometry.attributes.position;
      const uvs = iconGeometry.attributes.uv;
      for (let vertex = 0; vertex < vertices.count; vertex++) uvs.setXY(vertex, vertices.getX(vertex) / 0.61 + 0.5, vertices.getY(vertex) / 0.61 + 0.5);
      const texture = iconTexture(index);
      const iconMaterial = new THREE.MeshPhysicalMaterial({
        map: texture, emissiveMap: texture, emissive: 0x7c9aef, emissiveIntensity: 0.35,
        metalness: 0.15, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12,
      });
      const icon = new THREE.Mesh(iconGeometry, iconMaterial);
      icon.position.z = 0.352;
      group.add(icon);
      scene.add(group);
      modules.push({ group, rimMaterial, iconMaterial, index });
    }
    const beforeColor = new THREE.Color(0x6089ef);
    const afterColor = new THREE.Color(0xb376ef);
    const bankingColor = new THREE.Color(0xd96bbd);
    const activeColor = new THREE.Color();

    let elapsed = 0;
    let frameId = 0;
    let previousTime = 0;
    let previousRender = 0;
    let inViewport = true;
    let contextLost = false;
    let paused = motionButton?.getAttribute('aria-pressed') === 'true';
    let pointerX = 0;
    let pointerY = 0;

    function updateScene() {
      // A fixed circular gateway, a full diagonal conveyor loop and restrained light travel.
      for (const { group, rimMaterial, iconMaterial, index } of modules) {
        const z = ((elapsed * 0.6 + 8.5 - index * 4 + 12) % 12) - 5.5;
        group.position.set(0, 1.05 + Math.sin(elapsed * 1.1 + index) * 0.012, z);
        group.rotation.set(0, Math.sin(elapsed * 0.45 + index) * 0.035, 0);
        const connected = THREE.MathUtils.smoothstep(z, -0.45, 0.25);
        activeColor.copy(beforeColor).lerp(index === 2 ? bankingColor : afterColor, connected);
        rimMaterial.emissive.copy(activeColor);
        rimMaterial.emissiveIntensity = 0.4 + connected * 0.15;
        iconMaterial.emissive.copy(activeColor);
        iconMaterial.emissiveIntensity = 0.35 + connected * 0.2;
      }
      const scanOffset = Math.sin(elapsed * 0.8) * 1.3;
      scan.position.y = scanOffset;
      scan.scale.x = Math.sqrt(innerRadius * innerRadius - scanOffset * scanOffset) / innerRadius;
      blueLight.position.set(-2.2 + Math.sin(elapsed * 0.18) * 0.5, 3.4, -1.5);
      roseLight.position.set(-2, 1.6 + Math.sin(elapsed * 0.18) * 0.25, 4);
      camera.position.x += (baseCamera.x + pointerX * 0.14 - camera.position.x) * 0.035;
      camera.position.y += (baseCamera.y - pointerY * 0.09 - camera.position.y) * 0.035;
      camera.lookAt(cameraTarget);
    }

    function render() {
      updateScene();
      renderer.render(scene, camera);
    }

    function shouldAnimate() {
      return !paused && !reducedMotion.matches && !document.hidden && inViewport && !contextLost;
    }

    function frame(time) {
      if (!shouldAnimate()) { frameId = 0; return; }
      frameId = requestAnimationFrame(frame);
      if (previousTime) elapsed += Math.min((time - previousTime) / 1000, 0.06);
      previousTime = time;
      if (time - previousRender < 1000 / 30) return;
      previousRender = time;
      render();
    }

    function synchronizeMotion() {
      if (motionButton) {
        motionButton.hidden = reducedMotion.matches || contextLost;
        motionButton.setAttribute('aria-pressed', String(paused));
        motionButton.setAttribute('aria-label', paused ? 'Resume hero animation' : 'Pause hero animation');
        if (motionLabel) motionLabel.textContent = paused ? 'Resume animation' : 'Pause animation';
      }
      hero.dataset.sceneMotion = contextLost ? 'fallback' : reducedMotion.matches ? 'static' : shouldAnimate() ? 'playing' : 'paused';
      if (shouldAnimate() && !frameId) {
        previousTime = 0;
        frameId = requestAnimationFrame(frame);
      } else if (!shouldAnimate() && frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
        previousTime = 0;
      }
    }

    function resize() {
      const { width, height } = mount.getBoundingClientRect();
      if (!width || !height || contextLost) return;
      const mobile = window.innerWidth <= 700;
      const aspect = width / height;
      const viewHeight = mobile ? Math.max(8.1, 8.3 / aspect) : Math.max(7.8, 8.2 / aspect);
      camera.left = -viewHeight * aspect / 2;
      camera.right = viewHeight * aspect / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      baseCamera.set(mobile ? 7.8 : 7.7, mobile ? 8.1 : 6.7, mobile ? 11.8 : 10.6);
      camera.position.copy(baseCamera);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5));
      renderer.setSize(Math.round(width), Math.round(height), false);
      render();
    }

    motionButton?.addEventListener('click', () => {
      paused = !paused;
      synchronizeMotion();
    });
    document.addEventListener('visibilitychange', synchronizeMotion);
    reducedMotion.addEventListener('change', () => { render(); synchronizeMotion(); });
    const observer = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting;
      synchronizeMotion();
    }, { rootMargin: '80px' });
    observer.observe(hero);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    hero.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse' || reducedMotion.matches) return;
      const rectangle = hero.getBoundingClientRect();
      pointerX = (event.clientX - rectangle.left) / rectangle.width - 0.5;
      pointerY = (event.clientY - rectangle.top) / rectangle.height - 0.5;
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { pointerX = 0; pointerY = 0; });
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      contextLost = true;
      synchronizeMotion();
      fallback();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      contextLost = false;
      rebuildEnvironment();
      resize();
      hero.classList.remove('scene-fallback');
      hero.classList.add('scene-ready');
      hero.dataset.sceneState = 'ready';
      synchronizeMotion();
    });

    resize();
    hero.classList.remove('scene-fallback');
    hero.classList.add('scene-ready');
    hero.dataset.sceneState = 'ready';
    synchronizeMotion();
  }
}
