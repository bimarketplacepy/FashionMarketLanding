import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface ParticleStormProps {
  canvasId: string;
}

const PARTICLE_COUNT = 80_000;
// Maximum radius any sample can land at. Gaussian draws are scaled by 4.0
// then clamped to this magnitude so the swarm has a soft edge instead of
// the hard sphere shell of uniform-volume sampling.
const MAX_RADIUS = 12;

const VERTEX_SHADER = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
attribute float aSeed;
attribute float aPhase;

varying float vVelocity;
varying float vDistFromCentre;

// Inline 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT).
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

void main() {
  vec3 basePos = position;
  float t = uTime * 0.25 + aPhase;

  vec3 noisePos = basePos * 0.18 + vec3(t * 0.4);

  float eps = 0.15;
  float a1 = snoise(noisePos + vec3(0.0, eps, 0.0)) - snoise(noisePos - vec3(0.0, eps, 0.0));
  float a2 = snoise(noisePos + vec3(0.0, 0.0, eps)) - snoise(noisePos - vec3(0.0, 0.0, eps));
  float b1 = snoise(noisePos + vec3(0.0, 0.0, eps) + vec3(31.4)) - snoise(noisePos - vec3(0.0, 0.0, eps) + vec3(31.4));
  float b2 = snoise(noisePos + vec3(eps, 0.0, 0.0) + vec3(31.4)) - snoise(noisePos - vec3(eps, 0.0, 0.0) + vec3(31.4));
  float c1 = snoise(noisePos + vec3(eps, 0.0, 0.0) + vec3(62.8)) - snoise(noisePos - vec3(eps, 0.0, 0.0) + vec3(62.8));
  float c2 = snoise(noisePos + vec3(0.0, eps, 0.0) + vec3(62.8)) - snoise(noisePos - vec3(0.0, eps, 0.0) + vec3(62.8));

  vec3 curl = vec3(a1 - a2, b1 - b2, c1 - c2) / (2.0 * eps);

  float oscillation = sin(t * 1.5) * 1.4 + 2.0;
  vec3 currentPos = basePos + curl * oscillation;

  vVelocity = length(curl);
  vDistFromCentre = length(basePos);

  vec4 mvPosition = modelViewMatrix * vec4(currentPos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  gl_PointSize = (3.5 + aSeed * 3.0) * uPixelRatio * (300.0 / -mvPosition.z);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
varying float vVelocity;
varying float vDistFromCentre;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float dist = length(uv);
  if (dist > 0.5) discard;
  float alpha = smoothstep(0.5, 0.0, dist);

  vec3 colSlow = vec3(0.65, 0.35, 0.95);   // brighter violet
  vec3 colMid  = vec3(0.35, 0.92, 1.00);   // brighter cyan
  vec3 colFast = vec3(1.00, 0.92, 0.55);   // brighter gold

  float v = clamp(vVelocity / 3.0, 0.0, 1.0);
  vec3 colour;
  if (v < 0.5) {
    colour = mix(colSlow, colMid, v * 2.0);
  } else {
    colour = mix(colMid, colFast, (v - 0.5) * 2.0);
  }

  // Distance falloff scaled to the new MAX_RADIUS = 12 envelope.
  float distFalloff = 1.0 - smoothstep(9.0, 12.0, vDistFromCentre);

  gl_FragColor = vec4(colour, alpha * 0.85 * distFalloff);
}
`;

export default function ParticleStorm({ canvasId }: ParticleStormProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const section = mount.closest('section') as HTMLElement | null;

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    // ───────────────── SCENE / RENDERER ─────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04081a);
    scene.fog = new THREE.FogExp2(0x04081a, 0.025);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
    camera.position.set(0, 2, 15);
    camera.lookAt(0, 0, 0);

    // Let Three.js create and manage its own WebGL2 context. Manually
    // pre-allocating a context AND constructing the renderer with it
    // double-counts against the browser's per-page WebGL context cap
    // (~8-16), starving sibling scenes and leaving their canvases blank.
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    composer.setSize(width, height);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    // Bloom almost off here: particle visibility depends on contrast
    // against pure black, which any meaningful bloom washes out. At
    // these settings only the very brightest gold particles get a faint
    // sparkle and the background stays inky black.
    // Args: (resolution, strength, radius, threshold).
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.1,  // strength
      0.3,  // radius
      0.95  // threshold
    );
    composer.addPass(bloom);
    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    // ───────────────── PARTICLE BUFFER ─────────────────
    // Box-Muller transform: turns two uniforms in (0,1] into one standard
    // normal sample. Three independent normals give an isotropic 3D
    // gaussian — density concentrated at the centre, soft edges, no hard
    // sphere shell. We scale by 4.0 and clamp magnitude to MAX_RADIUS so
    // the swarm has a deterministic outer bound for the distance falloff.
    const gaussian = (): number => {
      let u = Math.random();
      // Math.random() can return 0 but never 1, so log(0) is the only edge
      // case to guard against.
      while (u === 0) u = Math.random();
      const v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };

    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const seeds = new Float32Array(PARTICLE_COUNT);
    const phases = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      let x = gaussian() * 4.0;
      let y = gaussian() * 4.0;
      let z = gaussian() * 4.0;
      const mag = Math.sqrt(x * x + y * y + z * z);
      if (mag > MAX_RADIUS) {
        const k = MAX_RADIUS / mag;
        x *= k;
        y *= k;
        z *= k;
      }
      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      seeds[i] = Math.random();
      phases[i] = Math.random() * Math.PI * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    // Bounding sphere from base positions; curl pushes particles slightly
    // outside this so disable frustum culling on the Points object.
    geometry.computeBoundingSphere();

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      // depthWrite still false: the points are alpha-blended and would
      // otherwise occlude each other in arbitrary draw order.
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    const particles = new THREE.Points(geometry, material);
    particles.frustumCulled = false;
    scene.add(particles);

    // ───────────────── ATMOSPHERIC HAZE SPRITES ─────────────────
    // Three large soft coloured planes drifting behind the swarm. They
    // add a sense of depth and tint the deep background without competing
    // with the particles for legibility. Per-sprite alpha 0.10–0.15.
    const hazeMeshes: THREE.Mesh[] = [];
    const hazeGeoms: THREE.BufferGeometry[] = [];
    const hazeMats: THREE.Material[] = [];
    const hazePalette = [
      { color: 0x6c4cff, alpha: 0.12 }, // violet
      { color: 0x4cd0ff, alpha: 0.10 }, // cyan
      { color: 0xffd47a, alpha: 0.14 }  // warm gold
    ];
    for (let i = 0; i < hazePalette.length; i++) {
      const spec = hazePalette[i];
      const geom = new THREE.PlaneGeometry(26, 26);
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(spec.color) },
          uAlpha: { value: spec.alpha }
        },
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
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geom, mat);
      // Park each haze sprite well behind the swarm so it never crosses
      // the camera path (camera ends at z = 7).
      mesh.position.set(
        (Math.random() * 2 - 1) * 6,
        (Math.random() * 2 - 1) * 4,
        -12 - Math.random() * 6
      );
      scene.add(mesh);
      hazeMeshes.push(mesh);
      hazeGeoms.push(geom);
      hazeMats.push(mat);
    }

    // Verification log requested by spec — confirms buffer was built.
    // eslint-disable-next-line no-console
    console.log(`Particle Storm: ${PARTICLE_COUNT} particles loaded`);

    // ───────────────── SCROLL CAMERA (3-point path) ─────────────────
    const camState = { x: 0, y: 2, z: 15 };
    const lerp3 = (
      p: number,
      a: [number, number, number],
      b: [number, number, number],
      c: [number, number, number]
    ): [number, number, number] => {
      if (p <= 0.5) {
        const k = p / 0.5;
        return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
      }
      const k = (p - 0.5) / 0.5;
      return [b[0] + (c[0] - b[0]) * k, b[1] + (c[1] - b[1]) * k, b[2] + (c[2] - b[2]) * k];
    };

    let scrollTrigger: ScrollTrigger | null = null;
    if (section) {
      scrollTrigger = ScrollTrigger.create({
        trigger: section,
        pin: true,
        pinSpacing: true,
        start: 'top top',
        // Extra scroll runway gives the camera dolly through the swarm
        // room to breathe AND ensures the pin releases cleanly before
        // Wormhole's top enters the viewport.
        end: '+=150%',
        scrub: 0.5,
        onUpdate: (self) => {
          // Simplified scroll-driven dolly straight along the swarm's
          // central axis: starts wide, ends inside the cloud.
          const [x, y, z] = lerp3(
            self.progress,
            [0, 2, 15],
            [0, 1, 11],
            [0, -1, 7]
          );
          camState.x = x;
          camState.y = y;
          camState.z = z;
        }
      });
    }

    // ───────────────── RAF ─────────────────
    const clock = new THREE.Clock();
    let rafId = 0;
    let running = false;

    const tick = () => {
      if (!running) return;
      rafId = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      material.uniforms.uTime.value = t;
      camera.position.set(camState.x, camState.y, camState.z);
      camera.lookAt(0, 0, 0);
      composer.render();
    };

    const startLoop = () => {
      if (running) return;
      running = true;
      clock.getDelta();
      rafId = requestAnimationFrame(tick);
    };
    const stopLoop = () => {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    };

    const io = section
      ? new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (e.isIntersecting) startLoop();
              else stopLoop();
            }
          },
          { threshold: 0 }
        )
      : null;
    if (io && section) io.observe(section);
    else startLoop();

    const onResize = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
      material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
    };
    window.addEventListener('resize', onResize);

    return () => {
      stopLoop();
      window.removeEventListener('resize', onResize);
      if (io) io.disconnect();
      if (scrollTrigger) scrollTrigger.kill();
      geometry.dispose();
      material.dispose();
      for (const m of hazeMeshes) scene.remove(m);
      for (const g of hazeGeoms) g.dispose();
      for (const m of hazeMats) m.dispose();
      renderPass.dispose?.();
      bloom.dispose?.();
      outputPass.dispose?.();
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} id={canvasId} className="absolute inset-0" />;
}
