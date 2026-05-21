import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Ashima Arts classic 3D simplex noise (public domain, MIT).
// Trimmed to what we need: snoise(vec3).
const SIMPLEX3D = /* glsl */ `
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v){
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
  vec4 p = permute( permute( permute(
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
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

interface AuroraProps {
  canvasId: string;
}

export default function Aurora({ canvasId }: AuroraProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const section = mount.closest('section') as HTMLElement | null;

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000511, 0.02);

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(0, 0, 12);
    camera.lookAt(0, 4, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
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
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.45, 0.55, 0.5);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // ───────────────── STARFIELD ─────────────────
    const STAR_COUNT = 6000;
    const starPositions = new Float32Array(STAR_COUNT * 3);
    const starSizes = new Float32Array(STAR_COUNT);
    const starPhases = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = 200;
      starPositions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
      starSizes[i] = 0.5 + Math.random() * 1.5;
      starPhases[i] = Math.random() * Math.PI * 2;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhases, 1));

    const starMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uTint: { value: new THREE.Color(0xd8e8ff) }
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aPhase;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vTwinkle;
        void main() {
          // Darker overall, capped at 0.6.
          vTwinkle = 0.30 + 0.30 * sin(uTime * 1.4 + aPhase);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPixelRatio;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTint;
        varying float vTwinkle;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(uTint * vTwinkle, a);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // ───────────────── BACKGROUND VOLUMETRIC GLOW ─────────────────
    const glowMaterials: THREE.Material[] = [];
    const glowGeoms: THREE.BufferGeometry[] = [];
    const glowMeshes: THREE.Mesh[] = [];
    const tealTint = new THREE.Color(0x22d4a8);
    const violetTint = new THREE.Color(0xb478ff);
    for (let i = 0; i < 5; i++) {
      const tint = i % 2 === 0 ? tealTint : violetTint;
      const geom = new THREE.PlaneGeometry(20, 20);
      const mat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          { uTint: { value: tint } }
        ]),
        vertexShader: /* glsl */ `
          #include <fog_pars_vertex>
          varying vec2 vUv;
          void main(){
            vUv = uv;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            #include <fog_vertex>
          }
        `,
        fragmentShader: /* glsl */ `
          #include <fog_pars_fragment>
          uniform vec3 uTint;
          varying vec2 vUv;
          void main(){
            float d = distance(vUv, vec2(0.5));
            float a = smoothstep(0.5, 0.0, d) * 0.1;
            vec3 col = uTint;
            #ifdef USE_FOG
              float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
              a *= (1.0 - fogFactor);
            #endif
            gl_FragColor = vec4(col, a);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: true
      });
      mat.uniforms.uTint.value = tint;
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 24,
        2 + Math.random() * 4,
        -10 + Math.random() * 6
      );
      mesh.userData.driftSeed = Math.random() * 100;
      mesh.userData.driftSpeed = 0.05 + Math.random() * 0.05;
      mesh.userData.baseX = mesh.position.x;
      scene.add(mesh);
      glowMaterials.push(mat);
      glowGeoms.push(geom);
      glowMeshes.push(mesh);
    }

    // ───────────────── AURORA RIBBONS ─────────────────
    const RIBBON_COUNT = 12;
    const ribbonGeoms: THREE.BufferGeometry[] = [];
    const ribbonMats: THREE.ShaderMaterial[] = [];
    const ribbonMeshes: THREE.Mesh[] = [];

    for (let i = 0; i < RIBBON_COUNT; i++) {
      const geom = new THREE.PlaneGeometry(4, 14, 32, 128);
      const seed = Math.random() * 100;
      const bendDir = Math.random() < 0.5 ? -1 : 1;

      const mat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            uTime: { value: 0 },
            uSeed: { value: seed },
            uBendDir: { value: bendDir }
          }
        ]),
        vertexShader: SIMPLEX3D + /* glsl */ `
          #include <fog_pars_vertex>
          uniform float uTime;
          uniform float uSeed;
          uniform float uBendDir;
          varying vec2 vUv;
          varying float vYNorm;

          void main(){
            vUv = uv;
            // Local y goes from -7 to +7 (height 14). Normalise top->1, bottom->0.
            float yNorm = (position.y + 7.0) / 14.0;
            vYNorm = yNorm;

            // Weight: max influence at top, near zero at bottom.
            // Bottom (y local -7) is "ribbon bottom" → barely moves (0.2 max).
            // Top of ribbon → up to ~2.5 units displacement.
            float w = pow(yNorm, 1.7);
            float maxDisp = mix(0.2, 2.5, w);

            // Curl-ish: sample two simplex octaves on x and z.
            vec3 p1 = vec3(position.x * 0.4, position.y * 0.4 + uTime * 0.3, uSeed);
            vec3 p2 = vec3(position.x * 1.6, position.y * 1.6 - uTime * 0.5, uSeed + 13.7);
            float nX = snoise(p1) * 0.7 + snoise(p2) * 0.3;
            float nZ = snoise(p1 + vec3(7.3)) * 0.7 + snoise(p2 + vec3(7.3)) * 0.3;

            vec3 displaced = position;
            displaced.x += nX * maxDisp + uBendDir * w * 0.6;
            displaced.z += nZ * maxDisp * 0.6;

            vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
            gl_Position = projectionMatrix * mv;
            #include <fog_vertex>
          }
        `,
        fragmentShader: SIMPLEX3D + /* glsl */ `
          #include <fog_pars_fragment>
          uniform float uTime;
          uniform float uSeed;
          varying vec2 vUv;
          varying float vYNorm;

          // Smooth band helper: returns 1 inside [a,b] with soft edges.
          float band(float x, float a, float b, float feather) {
            return smoothstep(a - feather, a + feather, x) *
                   (1.0 - smoothstep(b - feather, b + feather, x));
          }

          void main(){
            float y = vYNorm; // 0 bottom → 1 top
            float x = vUv.x;  // 0 left → 1 right

            // Edge fade (horizontal soft curtain edges).
            float edge = smoothstep(0.0, 0.1, x) * (1.0 - smoothstep(0.9, 1.0, x));

            // Colours.
            vec3 green  = vec3(0.102, 0.549, 0.306); // #1a8c4e
            vec3 teal   = vec3(0.133, 0.831, 0.659); // #22d4a8
            vec3 pink   = vec3(0.706, 0.471, 1.000); // #b478ff
            vec3 violet = vec3(0.353, 0.227, 1.000); // #5a3aff

            // Vertical alpha: black at bottom, fades to transparent at very top.
            float aAlpha = smoothstep(0.0, 0.15, y) * (1.0 - smoothstep(0.92, 1.00, y));

            // Build the colour by piecewise blending.
            vec3 col = vec3(0.0);
            // 0.15→0.4 green fades in
            col += green  * smoothstep(0.15, 0.40, y) * (1.0 - smoothstep(0.40, 0.70, y));
            // 0.4→0.7 teal (peak)
            col += teal   * smoothstep(0.40, 0.55, y) * (1.0 - smoothstep(0.70, 0.85, y));
            // 0.7→0.92 violet-pink
            col += pink   * smoothstep(0.70, 0.85, y) * (1.0 - smoothstep(0.92, 0.98, y));
            // 0.92→1.0 deep violet
            col += violet * smoothstep(0.92, 0.96, y);

            // Bright bands flowing DOWN: sample low-freq noise on y shifted by +time*0.4.
            // (downward motion ⇒ shift coordinate upward over time)
            float bandNoise = snoise(vec3(uSeed * 0.31, y * 4.0 + uTime * 0.4, 0.0));
            float bandBoost = 0.6 + 0.8 * smoothstep(0.0, 1.0, bandNoise * 0.5 + 0.5);

            col *= bandBoost;

            float alpha = aAlpha * edge;
            #ifdef USE_FOG
              float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
              alpha *= (1.0 - fogFactor);
            #endif
            if (alpha < 0.001) discard;

            gl_FragColor = vec4(col, alpha);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(
        (Math.random() * 2 - 1) * 16,
        4,
        -8 + Math.random() * 10
      );
      mesh.rotation.y = THREE.MathUtils.degToRad((Math.random() * 2 - 1) * 15);
      scene.add(mesh);

      ribbonGeoms.push(geom);
      ribbonMats.push(mat);
      ribbonMeshes.push(mesh);
    }

    // ───────────────── SCROLL-DRIVEN CAMERA ─────────────────
    const camState = { z: 12, y: 0, lookY: 4 };
    let scrollTrigger: ScrollTrigger | null = null;
    if (section) {
      scrollTrigger = ScrollTrigger.create({
        trigger: section,
        pin: true,
        start: 'top top',
        end: '+=100%',
        scrub: true,
        onUpdate: (self) => {
          const p = self.progress;
          camState.z = 12 + (2 - 12) * p;
          camState.y = 0 + (3 - 0) * p;
          camState.lookY = 4 + (7 - 4) * p;
        }
      });
    }

    // ───────────────── RAF (paused when offscreen) ─────────────────
    const clock = new THREE.Clock();
    let rafId = 0;
    let running = false;
    const tick = () => {
      if (!running) return;
      rafId = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      (starMat.uniforms.uTime.value as number) = t;
      for (const m of ribbonMats) {
        (m.uniforms.uTime.value as number) = t;
      }
      // Drift background glow sprites horizontally.
      for (const g of glowMeshes) {
        const seed = g.userData.driftSeed as number;
        const speed = g.userData.driftSpeed as number;
        const baseX = g.userData.baseX as number;
        g.position.x = baseX + Math.sin(t * speed + seed) * 1.5;
      }
      camera.position.set(0, camState.y, camState.z);
      camera.lookAt(0, camState.lookY, 0);
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

    // ───────────────── RESIZE ─────────────────
    const onResize = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      stopLoop();
      window.removeEventListener('resize', onResize);
      if (io) io.disconnect();
      if (scrollTrigger) scrollTrigger.kill();
      starGeo.dispose();
      starMat.dispose();
      for (const g of ribbonGeoms) g.dispose();
      for (const m of ribbonMats) m.dispose();
      for (const g of glowGeoms) g.dispose();
      for (const m of glowMaterials) m.dispose();
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} id={canvasId} className="absolute inset-0 bg-black" />;
}
