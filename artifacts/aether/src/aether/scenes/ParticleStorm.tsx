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

const PARTICLE_COUNT = 150_000;
const SPHERE_R = 8;

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

  float oscillation = sin(t * 1.5) * 1.0 + 1.6;
  vec3 currentPos = basePos + curl * oscillation;

  vVelocity = length(curl);
  vDistFromCentre = length(basePos);

  vec4 mvPosition = modelViewMatrix * vec4(currentPos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  gl_PointSize = (1.6 + aSeed * 1.4) * uPixelRatio * (280.0 / -mvPosition.z);
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

  vec3 colSlow = vec3(0.42, 0.18, 0.75);
  vec3 colMid  = vec3(0.18, 0.82, 1.00);
  vec3 colFast = vec3(1.00, 0.82, 0.38);

  float v = clamp(vVelocity / 3.0, 0.0, 1.0);
  vec3 colour;
  if (v < 0.5) {
    colour = mix(colSlow, colMid, v * 2.0);
  } else {
    colour = mix(colMid, colFast, (v - 0.5) * 2.0);
  }

  colour = min(colour, vec3(0.85));

  float distFalloff = 1.0 - smoothstep(6.0, 9.0, vDistFromCentre);

  gl_FragColor = vec4(colour, alpha * 0.08 * distFalloff);
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

    // Force a WebGL2 context (default WebGLRenderer may fall back).
    const glCanvas = document.createElement('canvas');
    const gl2 = glCanvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    }) as WebGL2RenderingContext | null;
    if (!gl2) {
      // eslint-disable-next-line no-console
      console.error('Particle Storm: WebGL2 unavailable; aborting scene setup.');
      return;
    }
    const renderer = new THREE.WebGLRenderer({
      canvas: glCanvas,
      context: gl2,
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
    // Conservative bloom: with 150k additive particles, headroom is tight.
    const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.2, 0.4, 0.75);
    composer.addPass(bloom);
    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    // ───────────────── PARTICLE BUFFER ─────────────────
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const seeds = new Float32Array(PARTICLE_COUNT);
    const phases = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Uniform-volume sphere sampling: r = R * cbrt(u).
      const u = Math.random();
      const v = Math.random();
      const w = Math.random();
      const r = SPHERE_R * Math.cbrt(u);
      const theta = 2 * Math.PI * v;
      const phi = Math.acos(2 * w - 1);
      const sinPhi = Math.sin(phi);
      positions[i * 3 + 0] = r * sinPhi * Math.cos(theta);
      positions[i * 3 + 1] = r * sinPhi * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
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
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(geometry, material);
    particles.frustumCulled = false;
    scene.add(particles);

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
