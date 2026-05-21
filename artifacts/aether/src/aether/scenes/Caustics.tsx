import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Timer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { fitCameraHorizontal } from './cameraFit';

gsap.registerPlugin(ScrollTrigger);

interface CausticsProps {
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

export default function Caustics({ canvasId }: CausticsProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const section = mount.closest('section') as HTMLElement | null;

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    // ───────────────── SCENE ─────────────────
    const scene = new THREE.Scene();
    const waterColour = new THREE.Color(0x02363f);
    scene.background = waterColour;
    scene.fog = new THREE.FogExp2(0x02363f, 0.04);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
    camera.position.set(0, 2, 8);
    camera.lookAt(0, -2, 0);
    fitCameraHorizontal(camera, width / height, 55);

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
    composer.addPass(new RenderPass(scene, camera));
    // Bloom rebalance: higher threshold + lower strength so the whole
    // seabed caustic web stays legible, not just the bright peaks. The
    // previous settings turned the centre of the seabed (where the
    // camera lookAt focuses, so caustics are densest under perspective)
    // into a wash that swallowed surrounding detail.
    // Args: (resolution, strength, radius, threshold)
    const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.12, 0.3, 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const disposables: Array<{ dispose: () => void }> = [];

    // ───────────────── SEABED (CAUSTIC PROJECTION) ─────────────────
    const seabedGeom = new THREE.PlaneGeometry(60, 60, 128, 128);
    const seabedMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0 } }
      ]),
      vertexShader: SIMPLEX3D + /* glsl */ `
        #include <fog_pars_vertex>
        uniform float uTime;
        varying vec2 vUv;
        void main(){
          vUv = uv;
          // Low-amplitude dune undulation.
          float dune = snoise(vec3(position.x * 0.08, position.y * 0.08, uTime * 0.05)) * 0.25;
          vec3 displaced = position;
          displaced.z += dune;
          vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        uniform float uTime;
        varying vec2 vUv;

        // Cheap 2D hash → 2D point in [0,1]^2. Used to place voronoi seeds
        // deterministically per integer cell.
        vec2 hash2(vec2 p) {
          p = vec2(dot(p, vec2(127.1, 311.7)),
                   dot(p, vec2(269.5, 183.3)));
          return fract(sin(p) * 43758.5453);
        }

        // Voronoi-difference caustic: returns the gap between the first
        // and second nearest animated seeds. That gap is small along cell
        // boundaries (giving thin bright lines) and large in cell
        // interiors (giving darker patches) — exactly the topology of
        // real water caustics. 'offset' is added to the hash input so we
        // can take a second uncorrelated layer at a different scale.
        float voronoiCaustic(vec2 uv, float time, float offset) {
          vec2 i = floor(uv);
          vec2 f = fract(uv);

          float minDist1 = 1.0;
          float minDist2 = 1.0;

          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec2 neighbour = vec2(float(x), float(y));
              vec2 point = hash2(i + neighbour + offset);
              // Animate each seed around its rest position.
              point = 0.5 + 0.5 * sin(time + 6.2831 * point);
              vec2 diff = neighbour + point - f;
              float dist = length(diff);
              if (dist < minDist1) {
                minDist2 = minDist1;
                minDist1 = dist;
              } else if (dist < minDist2) {
                minDist2 = dist;
              }
            }
          }

          float caustic = minDist2 - minDist1;
          // Sharpen: pow<1 lifts midtones into bright lines, smoothstep
          // crushes the remaining darks so only the edges glow.
          caustic = pow(caustic, 0.4);
          caustic = smoothstep(0.0, 0.8, caustic);
          return caustic;
        }

        void main(){
          float time = uTime * 0.3;

          // Layer 1: large cells with slow organic drift.
          vec2 uv1 = vUv * 6.0;
          uv1 += vec2(sin(time * 0.3), cos(time * 0.2)) * 0.3;
          float caustic1 = voronoiCaustic(uv1, time, 0.0);

          // Layer 2: smaller cells, panning at a different speed,
          // hash-offset so it doesn't track layer 1.
          vec2 uv2 = vUv * 12.0 + vec2(time * 0.2);
          float caustic2 = voronoiCaustic(uv2, time, 50.0);

          float finalCaustic = caustic1 * 0.7 + caustic2 * 0.4;
          finalCaustic = clamp(finalCaustic, 0.0, 1.5);

          // Base darkened from #1a4f5a → #102e36 so caustic web stands
          // out against deeper shadow and gives bloom less to grab.
          vec3 baseColour    = vec3(0.063, 0.180, 0.212); // #102e36, deeper teal
          vec3 causticColour = vec3(0.847, 0.973, 1.000); // #d8f8ff, pale cyan-white
          // Caustic multiplier 1.8 → 0.9: cyan lines stay clearly visible
          // without approaching pure white under bloom.
          vec3 col = baseColour + causticColour * finalCaustic * 0.9;

          #ifdef USE_FOG
            float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
            col = mix(col, fogColor, fogFactor);
          #endif

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      fog: true
    });
    const seabed = new THREE.Mesh(seabedGeom, seabedMat);
    seabed.position.y = -5;
    seabed.rotation.x = -Math.PI / 2;
    scene.add(seabed);
    disposables.push(seabedGeom, seabedMat);

    // ───────────────── WATER SURFACE (UNDERSIDE) ─────────────────
    const waterGeom = new THREE.PlaneGeometry(80, 80, 64, 64);
    const waterMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0 } }
      ]),
      vertexShader: SIMPLEX3D + /* glsl */ `
        #include <fog_pars_vertex>
        uniform float uTime;
        varying vec2 vUv;
        varying float vRipple;
        void main(){
          vUv = uv;
          // Multi-octave ripples scrolling at different speeds.
          float n1 = snoise(vec3(position.x * 0.18, position.y * 0.18, uTime * 0.6));
          float n2 = snoise(vec3(position.x * 0.42 + 7.0, position.y * 0.42, uTime * 0.9));
          float n3 = snoise(vec3(position.x * 0.95, position.y * 0.95 - 3.0, uTime * 1.4));
          float ripple = n1 * 0.6 + n2 * 0.3 + n3 * 0.15;
          vRipple = ripple;
          vec3 displaced = position;
          // Plane is rotated to face downward; local +Z becomes world -Y.
          displaced.z += ripple * 0.15;
          vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        varying float vRipple;
        void main(){
          // Water underside base darkened #8be0f0 → #5a96a8 and highlight
          // intensity dropped 40% (1.0 → 0.6) so the ceiling shimmer
          // contributes less to the central bloom wash.
          vec3 baseColour      = vec3(0.353, 0.588, 0.659); // #5a96a8
          vec3 highlightColour = vec3(0.600, 0.600, 0.600);
          float highlight = smoothstep(0.4, 0.9, vRipple);
          vec3 col = mix(baseColour, highlightColour, highlight);
          float alpha = 0.85;
          #ifdef USE_FOG
            float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
            col = mix(col, fogColor, fogFactor);
            alpha *= (1.0 - fogFactor * 0.5);
          #endif
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      fog: true
    });
    const water = new THREE.Mesh(waterGeom, waterMat);
    water.position.y = 5;
    water.rotation.x = Math.PI / 2;
    scene.add(water);
    disposables.push(waterGeom, waterMat);

    // ───────────────── GOD RAYS ─────────────────
    const GOD_RAY_COUNT = 10;
    interface GodRay {
      mesh: THREE.Mesh;
      mat: THREE.ShaderMaterial;
      geom: THREE.BufferGeometry;
      baseX: number;
      swaySpeed: number;
      swayPhase: number;
    }
    const godRays: GodRay[] = [];
    for (let i = 0; i < GOD_RAY_COUNT; i++) {
      const geom = new THREE.CylinderGeometry(0.05, 0.8, 12, 12, 1, true);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(0xc8f0ff) } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying vec3 vViewDir;
          varying vec3 vNormalView;
          void main(){
            vUv = uv;
            // Compute view-space normal and view direction so the fragment
            // can do a fresnel-style fade (brightest where the surface
            // normal faces the camera, transparent at grazing silhouette).
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vNormalView = normalize(normalMatrix * normal);
            vViewDir = normalize(-mvPosition.xyz);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          varying vec2 vUv;
          varying vec3 vViewDir;
          varying vec3 vNormalView;
          void main(){
            // vUv.y goes 0 (bottom) .. 1 (top) along cylinder length.
            // Dimmed 60% (top 0.15→0.06, bottom 0.02→0.008): the god rays
            // were the dominant bloom source. They now read as subtle
            // shafts rather than dominant beams.
            float topToBottom = mix(0.008, 0.06, vUv.y);
            // Radial alpha: on an open cylinder, "centre to edge" is the
            // view-facing dot product, not UV.x (which is azimuth).
            // Squared for a slightly softer falloff.
            float facing = abs(dot(normalize(vNormalView), normalize(vViewDir)));
            float radial = facing * facing;
            float a = topToBottom * radial;
            gl_FragColor = vec4(uColor, a);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geom, mat);
      const baseX = -15 + Math.random() * 30;
      const baseZ = -15 + Math.random() * 20;
      mesh.position.set(baseX, 0, baseZ);
      scene.add(mesh);
      godRays.push({
        mesh,
        mat,
        geom,
        baseX,
        swaySpeed: 6 + Math.random() * 4,
        swayPhase: Math.random() * Math.PI * 2
      });
      disposables.push(geom, mat);
    }

    // ───────────────── PLANKTON ─────────────────
    const PARTICLE_COUNT = 5000;
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const drift = new Float32Array(PARTICLE_COUNT); // upward speed per particle
    const seeds = new Float32Array(PARTICLE_COUNT); // for sway + twinkle
    const sizes = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3 + 0] = -20 + Math.random() * 40;
      positions[i * 3 + 1] = -4 + Math.random() * 8;
      positions[i * 3 + 2] = -15 + Math.random() * 20;
      drift[i] = 0.05 + Math.random() * 0.15;
      seeds[i] = Math.random() * 1000;
      sizes[i] = 1.5 + Math.random() * 1.5;
    }
    const particleGeom = new THREE.BufferGeometry();
    particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeom.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    particleGeom.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    const particleMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
        }
      ]),
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        uniform float uTime;
        uniform float uPixelRatio;
        attribute float aSeed;
        attribute float aSize;
        varying float vTwinkle;
        void main(){
          vec3 p = position;
          // Horizontal sinusoidal sway (modulates rendered X, not stored).
          p.x += sin(uTime * 0.6 + aSeed) * 0.25;
          p.z += cos(uTime * 0.5 + aSeed * 0.7) * 0.25;
          vTwinkle = 0.6 + 0.4 * sin(uTime * 2.0 + aSeed * 3.1);
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aSize * uPixelRatio;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        varying float vTwinkle;
        void main(){
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float a = smoothstep(0.5, 0.0, d) * vTwinkle;
          vec3 col = vec3(0.85, 0.95, 1.0);
          #ifdef USE_FOG
            float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
            a *= (1.0 - fogFactor);
          #endif
          if (a < 0.001) discard;
          gl_FragColor = vec4(col, a);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true
    });
    const particles = new THREE.Points(particleGeom, particleMat);
    particles.frustumCulled = false;
    scene.add(particles);
    disposables.push(particleGeom, particleMat);

    // ───────────────── SCROLL-DRIVEN CAMERA ─────────────────
    const camState = { z: 8, y: 2, lookY: -2 };
    let scrollTrigger: ScrollTrigger | null = null;
    if (section) {
      scrollTrigger = ScrollTrigger.create({
        trigger: section,
        pin: true,
        pinSpacing: true,
        start: 'top top',
        // Longer pin so the camera completes its descent into the
        // seabed before Particle Storm's top enters the viewport.
        end: '+=150%',
        scrub: 0.5,
        onUpdate: (self) => {
          const p = self.progress;
          camState.z = 8 + (4 - 8) * p;
          camState.y = 2 + (1.2 - 2) * p;
          camState.lookY = -2 + (-4 - -2) * p;
        }
      });
    }

    // ───────────────── RAF (paused when offscreen) ─────────────────
    const timer = new Timer();
    timer.connect(document);
    let rafId = 0;
    let running = false;
    let lastT = 0;

    const tick = () => {
      if (!running) return;
      rafId = requestAnimationFrame(tick);
      timer.update();
      const t = timer.getElapsed();
      const dt = Math.min(0.1, t - lastT);
      lastT = t;

      seabedMat.uniforms.uTime.value = t;
      waterMat.uniforms.uTime.value = t;
      particleMat.uniforms.uTime.value = t;

      // God ray sway.
      for (const r of godRays) {
        r.mesh.position.x =
          r.baseX + Math.sin((t / r.swaySpeed) * Math.PI * 2 + r.swayPhase) * 0.3;
      }

      // Plankton drift upward; wrap from +5 → -5.
      const pos = particleGeom.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const yi = i * 3 + 1;
        arr[yi] += drift[i] * dt;
        if (arr[yi] > 5) arr[yi] = -5;
      }
      pos.needsUpdate = true;

      camera.position.set(0, camState.y, camState.z);
      camera.lookAt(0, camState.lookY, 0);
      composer.render();
    };

    const startLoop = () => {
      if (running) return;
      running = true;
      timer.reset();
      lastT = timer.getElapsed();
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
      fitCameraHorizontal(camera, w / h, 55);
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      stopLoop();
      window.removeEventListener('resize', onResize);
      if (io) io.disconnect();
      if (scrollTrigger) scrollTrigger.kill();
      for (const d of disposables) d.dispose();
      timer.dispose();
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} id={canvasId} className="absolute inset-0" />;
}
