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

// Ashima/Stefan Gustavson 3D simplex noise (GLSL).
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

export default function ParticleStorm({ canvasId }: ParticleStormProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const section = mount.closest('section') as HTMLElement | null;

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    // ───────────────── SCENE ─────────────────
    const scene = new THREE.Scene();
    const bgColour = new THREE.Color(0x04081a);
    scene.background = bgColour;
    scene.fog = new THREE.FogExp2(0x04081a, 0.025);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
    camera.position.set(0, 2, 15);
    camera.lookAt(0, 0, 0);

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
    // UnrealBloomPass(resolution, strength, radius, threshold)
    const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.4, 0.4, 0.6);
    composer.addPass(bloom);
    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    const disposables: Array<{ dispose: () => void }> = [];

    // ───────────────── AMBIENT GLOW SPRITES ─────────────────
    interface Glow {
      mesh: THREE.Mesh;
      baseX: number;
      driftSpeed: number;
      driftPhase: number;
    }
    const glows: Glow[] = [];
    const glowTints = [
      { color: new THREE.Color(0x6a2dc0), alpha: 0.08 }, // violet
      { color: new THREE.Color(0x2dd0ff), alpha: 0.05 }, // cyan
      { color: new THREE.Color(0xffd060), alpha: 0.04 }  // gold
    ];
    for (let i = 0; i < 3; i++) {
      const { color, alpha } = glowTints[i];
      const geom = new THREE.PlaneGeometry(30, 30);
      const mat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            uColor: { value: color.clone() },
            uAlpha: { value: alpha }
          }
        ]),
        vertexShader: /* glsl */ `
          #include <fog_pars_vertex>
          varying vec2 vUv;
          void main(){
            vUv = uv;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
          }
        `,
        fragmentShader: /* glsl */ `
          #include <fog_pars_fragment>
          uniform vec3 uColor;
          uniform float uAlpha;
          varying vec2 vUv;
          void main(){
            float d = distance(vUv, vec2(0.5));
            float a = smoothstep(0.5, 0.0, d) * uAlpha;
            #ifdef USE_FOG
              float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
              a *= (1.0 - fogFactor);
            #endif
            gl_FragColor = vec4(uColor, a);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: true
      });
      const baseX = (i - 1) * 6 + (Math.random() - 0.5) * 2;
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(baseX, (Math.random() - 0.5) * 3, -8 - Math.random() * 4);
      scene.add(mesh);
      glows.push({
        mesh,
        baseX,
        driftSpeed: 0.04 + Math.random() * 0.04,
        driftPhase: Math.random() * Math.PI * 2
      });
      disposables.push(geom, mat);
    }

    // ───────────────── PARTICLE FIELD (200k) ─────────────────
    const PARTICLE_COUNT = 200_000;
    const SPHERE_R = 8;

    const aPosition = new Float32Array(PARTICLE_COUNT * 3);
    const aSeed = new Float32Array(PARTICLE_COUNT);
    const aPhase = new Float32Array(PARTICLE_COUNT);
    const aSpeed = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Uniform sphere volume sampling: r = R * cbrt(u).
      const u = Math.random();
      const v = Math.random();
      const w = Math.random();
      const r = SPHERE_R * Math.cbrt(u);
      const theta = 2 * Math.PI * v;
      const phi = Math.acos(2 * w - 1);
      const sinPhi = Math.sin(phi);
      aPosition[i * 3 + 0] = r * sinPhi * Math.cos(theta);
      aPosition[i * 3 + 1] = r * sinPhi * Math.sin(theta);
      aPosition[i * 3 + 2] = r * Math.cos(phi);
      aSeed[i] = Math.random();
      aPhase[i] = Math.random() * Math.PI * 2;
      aSpeed[i] = 0.7 + Math.random() * 0.6;
    }

    const particleGeom = new THREE.BufferGeometry();
    particleGeom.setAttribute('aPosition', new THREE.BufferAttribute(aPosition, 3));
    particleGeom.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
    particleGeom.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1));
    particleGeom.setAttribute('aSpeed', new THREE.BufferAttribute(aSpeed, 1));
    // Three.js requires a `position` attribute for frustum-culling bounding
    // sphere computation; alias aPosition so we don't duplicate the buffer.
    particleGeom.setAttribute('position', new THREE.BufferAttribute(aPosition, 3));
    particleGeom.computeBoundingSphere();

    const particleMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
        }
      ]),
      vertexShader: SIMPLEX3D + /* glsl */ `
        #include <fog_pars_vertex>
        uniform float uTime;
        uniform float uPixelRatio;
        attribute vec3 aPosition;
        attribute float aSeed;
        attribute float aPhase;
        attribute float aSpeed;
        varying float vVelocity;
        varying float vDistFromCentre;
        void main(){
          vec3 basePos = aPosition;
          float t = uTime * 0.25 * aSpeed + aPhase;

          vec3 noisePos = basePos * 0.18 + vec3(t * 0.4, t * 0.3, t * 0.2);

          float eps = 0.1;
          vec3 dx = vec3(eps, 0.0, 0.0);
          vec3 dy = vec3(0.0, eps, 0.0);
          vec3 dz = vec3(0.0, 0.0, eps);

          float a1 = snoise(noisePos + dy) - snoise(noisePos - dy);
          float a2 = snoise(noisePos + dz) - snoise(noisePos - dz);
          float b1 = snoise(noisePos + dz + vec3(31.4)) - snoise(noisePos - dz + vec3(31.4));
          float b2 = snoise(noisePos + dx + vec3(31.4)) - snoise(noisePos - dx + vec3(31.4));
          float c1 = snoise(noisePos + dx + vec3(62.8)) - snoise(noisePos - dx + vec3(62.8));
          float c2 = snoise(noisePos + dy + vec3(62.8)) - snoise(noisePos - dy + vec3(62.8));

          vec3 curl = vec3(a1 - a2, b1 - b2, c1 - c2) / (2.0 * eps);

          float oscillation = sin(t * 1.5) * 1.2 + 1.8;
          vec3 currentPos = basePos + curl * oscillation;

          vVelocity = length(curl);
          vDistFromCentre = length(basePos);

          vec4 mvPosition = modelViewMatrix * vec4(currentPos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = (1.8 + aSeed * 1.4) * uPixelRatio * (300.0 / -mvPosition.z);
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        varying float vVelocity;
        varying float vDistFromCentre;
        void main(){
          vec2 uv = gl_PointCoord - 0.5;
          float dist = length(uv);
          if (dist > 0.5) discard;
          float alpha = smoothstep(0.5, 0.0, dist);

          vec3 colSlow = vec3(0.42, 0.18, 0.75); // violet
          vec3 colMid  = vec3(0.18, 0.82, 1.00); // cyan
          vec3 colFast = vec3(1.00, 0.82, 0.38); // gold

          float v = clamp(vVelocity / 3.0, 0.0, 1.0);
          vec3 colour;
          if (v < 0.5) {
            colour = mix(colSlow, colMid, v * 2.0);
          } else {
            colour = mix(colMid, colFast, (v - 0.5) * 2.0);
          }

          float distFalloff = 1.0 - smoothstep(6.0, 9.0, vDistFromCentre);
          float a = alpha * 0.7 * distFalloff;
          #ifdef USE_FOG
            float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
            a *= (1.0 - fogFactor);
          #endif
          if (a < 0.001) discard;
          gl_FragColor = vec4(colour, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true
    });

    const particles = new THREE.Points(particleGeom, particleMat);
    // Curl displacement extends the swarm well beyond the source sphere;
    // disable frustum culling so it never pops out at the edges.
    particles.frustumCulled = false;
    scene.add(particles);
    disposables.push(particleGeom, particleMat);

    // ───────────────── SCROLL-DRIVEN CAMERA (3-point path) ─────────────────
    const camState = { x: 0, y: 2, z: 15 };
    const lerp3 = (
      p: number,
      a: [number, number, number],
      b: [number, number, number],
      c: [number, number, number]
    ) => {
      if (p <= 0.5) {
        const k = p / 0.5;
        return [
          a[0] + (b[0] - a[0]) * k,
          a[1] + (b[1] - a[1]) * k,
          a[2] + (b[2] - a[2]) * k
        ] as const;
      }
      const k = (p - 0.5) / 0.5;
      return [
        b[0] + (c[0] - b[0]) * k,
        b[1] + (c[1] - b[1]) * k,
        b[2] + (c[2] - b[2]) * k
      ] as const;
    };
    let scrollTrigger: ScrollTrigger | null = null;
    if (section) {
      scrollTrigger = ScrollTrigger.create({
        trigger: section,
        pin: true,
        start: 'top top',
        end: '+=100%',
        scrub: true,
        onUpdate: (self) => {
          const [x, y, z] = lerp3(self.progress, [0, 2, 15], [8, 0, 10], [0, -3, 6]);
          camState.x = x;
          camState.y = y;
          camState.z = z;
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

      particleMat.uniforms.uTime.value = t;

      // Slow horizontal drift on the ambient glows.
      for (const g of glows) {
        g.mesh.position.x =
          g.baseX + Math.sin(t * g.driftSpeed * Math.PI * 2 + g.driftPhase) * 1.5;
      }

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
      particleMat.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
    };
    window.addEventListener('resize', onResize);

    return () => {
      stopLoop();
      window.removeEventListener('resize', onResize);
      if (io) io.disconnect();
      if (scrollTrigger) scrollTrigger.kill();
      for (const d of disposables) d.dispose();
      // EffectComposer.dispose() does not propagate fully to each pass's
      // internal render targets/materials, so dispose passes explicitly.
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
