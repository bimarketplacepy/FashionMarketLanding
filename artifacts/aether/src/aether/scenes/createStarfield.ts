import * as THREE from 'three';

export interface StarfieldHandle {
  group: THREE.Group;
  update(time: number, scrollProgress: number): void;
  dispose(): void;
}

interface Options {
  dustCount?: number;
  heroCount?: number;
  beaconCount?: number;
  nebulaCount?: number;
  /**
   * When true, the hero and beacon star layers write to the depth
   * buffer. This lets opaque foreground geometry (e.g. Aurora ribbons
   * with depthWrite:false) appear behind closer stars while still
   * occluding farther ones — useful for selling depth in scenes where
   * the stars share space with translucent volumes. Defaults to false,
   * which preserves the original always-on-top additive sky used by
   * the other scenes.
   */
  depthWriteForeground?: boolean;
}

export function createStarfield(opts: Options = {}): StarfieldHandle {
  const dustCount = opts.dustCount ?? 18000;
  const heroCount = opts.heroCount ?? 400;
  const beaconCount = opts.beaconCount ?? 12;
  const nebulaCount = opts.nebulaCount ?? 4;
  const depthWriteForeground = opts.depthWriteForeground === true;

  const group = new THREE.Group();

  // Sub-groups so we can apply per-layer parallax independently.
  const dustGroup = new THREE.Group();
  const heroGroup = new THREE.Group();
  const beaconGroup = new THREE.Group();
  const nebulaGroup = new THREE.Group();
  group.add(nebulaGroup, dustGroup, heroGroup, beaconGroup);

  const disposables: { dispose(): void }[] = [];

  // Helper: uniform point on sphere of given radius.
  const onSphere = (r: number, target: THREE.Vector3) => {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    target.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi)
    );
    return target;
  };

  // ───── LAYER A: BACKGROUND DUST ─────
  {
    const positions = new Float32Array(dustCount * 3);
    const sizes = new Float32Array(dustCount);
    const colors = new Float32Array(dustCount * 3);
    const phases = new Float32Array(dustCount);
    const periods = new Float32Array(dustCount);
    const warm = new THREE.Color(0xfffaf0);
    const cool = new THREE.Color(0xc8d8ff);
    const tmp = new THREE.Vector3();
    for (let i = 0; i < dustCount; i++) {
      onSphere(200, tmp);
      positions[i * 3 + 0] = tmp.x;
      positions[i * 3 + 1] = tmp.y;
      positions[i * 3 + 2] = tmp.z;
      sizes[i] = 0.4 + Math.random() * 0.8;
      const mix = Math.random();
      const c = warm.clone().lerp(cool, mix);
      colors[i * 3 + 0] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      phases[i] = Math.random() * Math.PI * 2;
      periods[i] = 4 + Math.random() * 4; // 4–8s
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('aPeriod', new THREE.BufferAttribute(periods, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute vec3 aColor;
        attribute float aPhase;
        attribute float aPeriod;
        uniform float uTime;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vTwink;
        void main(){
          vColor = aColor;
          float w = sin(uTime * (6.2831853 / aPeriod) + aPhase) * 0.5 + 0.5; // 0..1
          vTwink = mix(0.6, 1.0, w);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPixelRatio;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vTwink;
        void main(){
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor * vTwink, a);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    dustGroup.add(points);
    disposables.push(geo, mat);
  }

  // ───── LAYER B: HERO STARS ─────
  let heroMat: THREE.ShaderMaterial;
  {
    const positions = new Float32Array(heroCount * 3);
    const sizes = new Float32Array(heroCount);
    const colors = new Float32Array(heroCount * 3);
    const phases = new Float32Array(heroCount);
    const periods = new Float32Array(heroCount);
    const warm = new THREE.Color(0xfff5e8);
    const blue = new THREE.Color(0x88aaff);
    const gold = new THREE.Color(0xffd88a);
    const tmp = new THREE.Vector3();
    for (let i = 0; i < heroCount; i++) {
      onSphere(180, tmp);
      positions[i * 3 + 0] = tmp.x;
      positions[i * 3 + 1] = tmp.y;
      positions[i * 3 + 2] = tmp.z;
      sizes[i] = 3 + Math.random() * 3;
      const roll = Math.random();
      let c: THREE.Color;
      if (roll < 0.15) c = blue.clone();
      else if (roll < 0.25) c = gold.clone();
      else c = warm.clone();
      colors[i * 3 + 0] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      phases[i] = Math.random() * Math.PI * 2;
      periods[i] = 3 + Math.random() * 3; // 3–6s
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('aPeriod', new THREE.BufferAttribute(periods, 1));
    heroMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute vec3 aColor;
        attribute float aPhase;
        attribute float aPeriod;
        uniform float uTime;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vTwink;
        void main(){
          vColor = aColor;
          float w = sin(uTime * (6.2831853 / aPeriod) + aPhase) * 0.5 + 0.5;
          vTwink = mix(0.4, 1.0, w);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPixelRatio;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vTwink;
        void main(){
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float core = smoothstep(0.5, 0.0, d);
          // softer halo falloff: core + extended glow
          float halo = pow(core, 1.6);
          float a = halo;
          gl_FragColor = vec4(vColor * vTwink * (0.6 + 0.4 * halo), a);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: depthWriteForeground,
      fog: false
    });
    const points = new THREE.Points(geo, heroMat);
    points.frustumCulled = false;
    heroGroup.add(points);
    disposables.push(geo, heroMat);
  }

  // ───── LAYER C: BRIGHT BEACONS (with cross flare) ─────
  {
    const positions = new Float32Array(beaconCount * 3);
    const sizes = new Float32Array(beaconCount);
    const phases = new Float32Array(beaconCount);
    const periods = new Float32Array(beaconCount);
    const tmp = new THREE.Vector3();
    for (let i = 0; i < beaconCount; i++) {
      onSphere(150, tmp);
      positions[i * 3 + 0] = tmp.x;
      positions[i * 3 + 1] = tmp.y;
      positions[i * 3 + 2] = tmp.z;
      sizes[i] = 8 + Math.random() * 6;
      phases[i] = Math.random() * Math.PI * 2;
      periods[i] = 5 + Math.random() * 3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('aPeriod', new THREE.BufferAttribute(periods, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aPhase;
        attribute float aPeriod;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vPulse;
        void main(){
          float w = sin(uTime * (6.2831853 / aPeriod) + aPhase) * 0.5 + 0.5;
          vPulse = mix(0.7, 1.0, w);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          // Sprite big enough to fit the ~30px cross arms beyond the core disk.
          gl_PointSize = (aSize + 60.0) * uPixelRatio;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vPulse;
        void main(){
          vec2 uv = gl_PointCoord - 0.5;            // -0.5..0.5
          float d = length(uv);

          // Core soft disk (small).
          float coreR = 0.12;
          float disk = smoothstep(coreR, 0.0, d);

          // Cross flare: thin horizontal + vertical rays extending to edge.
          // Use fwidth so the perpendicular falloff is ~1 pixel regardless of
          // sprite size, killing aliasing on the smaller beacons.
          float halfThick = 0.012;
          float fwY = max(fwidth(uv.y), 0.0005);
          float fwX = max(fwidth(uv.x), 0.0005);
          float rayH = (1.0 - smoothstep(halfThick - fwY, halfThick + fwY, abs(uv.y)))
                       * smoothstep(0.5, coreR, abs(uv.x));
          float rayV = (1.0 - smoothstep(halfThick - fwX, halfThick + fwX, abs(uv.x)))
                       * smoothstep(0.5, coreR, abs(uv.y));
          float cross = (rayH + rayV) * 0.25; // alpha 0.25 at brightest

          vec3 col = vec3(1.0, 0.97, 0.92);
          float a = (disk + cross) * vPulse;
          if (a < 0.001) discard;
          gl_FragColor = vec4(col, a);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: depthWriteForeground,
      fog: false
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    beaconGroup.add(points);
    disposables.push(geo, mat);
  }

  // ───── NEBULA HAZE ─────
  const nebulaColors = [0x6048a8, 0x2840a0, 0xa04020, 0x208080];
  const nebulaMeshes: THREE.Mesh[] = [];
  {
    const tmp = new THREE.Vector3();
    for (let i = 0; i < nebulaCount; i++) {
      const color = new THREE.Color(nebulaColors[i % nebulaColors.length]);
      const geom = new THREE.PlaneGeometry(80, 80);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: color }, uAlpha: { value: 0.04 + Math.random() * 0.04 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main(){
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uAlpha;
          varying vec2 vUv;
          void main(){
            float d = distance(vUv, vec2(0.5));
            float a = smoothstep(0.5, 0.0, d) * uAlpha;
            gl_FragColor = vec4(uColor, a);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geom, mat);
      onSphere(220, tmp);
      mesh.position.copy(tmp);
      mesh.lookAt(0, 0, 0);
      mesh.userData.spin = (Math.random() - 0.5) * 0.005;
      nebulaGroup.add(mesh);
      nebulaMeshes.push(mesh);
      disposables.push(geom, mat);
    }
  }

  // Cache base rotations so parallax stays additive across frames.
  const dustBase = dustGroup.rotation.y;
  const heroBase = heroGroup.rotation.y;
  const beaconBase = beaconGroup.rotation.y;

  const update = (time: number, scrollProgress: number) => {
    // Update shader times for layers that need it.
    for (const child of dustGroup.children) {
      if ((child as THREE.Points).material) {
        const m = (child as THREE.Points).material as THREE.ShaderMaterial;
        if (m.uniforms?.uTime) m.uniforms.uTime.value = time;
      }
    }
    for (const child of heroGroup.children) {
      if ((child as THREE.Points).material) {
        const m = (child as THREE.Points).material as THREE.ShaderMaterial;
        if (m.uniforms?.uTime) m.uniforms.uTime.value = time;
      }
    }
    for (const child of beaconGroup.children) {
      if ((child as THREE.Points).material) {
        const m = (child as THREE.Points).material as THREE.ShaderMaterial;
        if (m.uniforms?.uTime) m.uniforms.uTime.value = time;
      }
    }
    // Parallax: subtle per-layer rotation driven by scroll progress.
    dustGroup.rotation.y = dustBase + scrollProgress * 0.01;
    heroGroup.rotation.y = heroBase + scrollProgress * 0.035;
    beaconGroup.rotation.y = beaconBase + scrollProgress * 0.08;
    // Drift the nebulae very gently for parallax + organic motion.
    for (const m of nebulaMeshes) {
      m.rotation.z += m.userData.spin as number;
    }
  };

  const dispose = () => {
    for (const d of disposables) d.dispose();
  };

  return { group, update, dispose };
}
