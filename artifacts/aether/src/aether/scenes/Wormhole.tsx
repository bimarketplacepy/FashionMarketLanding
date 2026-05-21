import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { createStarfield } from './createStarfield';

gsap.registerPlugin(ScrollTrigger);

interface WormholeProps {
  canvasId: string;
}

// Ashima/Stefan Gustavson 2D simplex noise (GLSL).
const SIMPLEX2D = /* glsl */ `
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x){ return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0))
                          + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;

// Shared palette helper used by tunnel + portal ring.
const PALETTE_GLSL = /* glsl */ `
vec3 wormholePalette(float h){
  vec3 colA = vec3(0.6, 0.2, 0.95);  // violet
  vec3 colB = vec3(0.2, 0.85, 1.0);  // cyan
  vec3 colC = vec3(1.0, 0.4, 0.7);   // magenta-pink
  vec3 colD = vec3(1.0, 0.85, 0.4);  // warm gold
  h = fract(h);
  if (h < 0.25) return mix(colA, colB, h * 4.0);
  if (h < 0.5)  return mix(colB, colC, (h - 0.25) * 4.0);
  if (h < 0.75) return mix(colC, colD, (h - 0.5) * 4.0);
  return mix(colD, colA, (h - 0.75) * 4.0);
}
`;

// Patch a starfield ShaderMaterial so its final colour is scaled by a
// shared `uGlobalOpacity` uniform — lets us fade the stars out as the
// camera enters the portal without touching the shared starfield module.
function patchStarMaterialForFade(mat: THREE.ShaderMaterial, uOpacity: { value: number }) {
  mat.uniforms.uGlobalOpacity = uOpacity;
  if (!/uGlobalOpacity/.test(mat.fragmentShader)) {
    mat.fragmentShader = mat.fragmentShader.replace(
      'void main(',
      'uniform float uGlobalOpacity;\nvoid main('
    );
    // Inject the fade right before the closing brace of main().
    const lastBrace = mat.fragmentShader.lastIndexOf('}');
    if (lastBrace !== -1) {
      mat.fragmentShader =
        mat.fragmentShader.slice(0, lastBrace) +
        '  gl_FragColor.rgb *= uGlobalOpacity;\n' +
        '  gl_FragColor.a   *= uGlobalOpacity;\n' +
        mat.fragmentShader.slice(lastBrace);
    }
    mat.needsUpdate = true;
  }
}

export default function Wormhole({ canvasId }: WormholeProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const section = mount.closest('section') as HTMLElement | null;

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    // ───────────────── SCENE / RENDERER ─────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 400);
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, -10);

    // Force a WebGL2 context (renderer would otherwise be free to fall
    // back to WebGL1 on certain environments).
    const glCanvas = document.createElement('canvas');
    const gl2 = glCanvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    }) as WebGL2RenderingContext | null;
    const renderer = new THREE.WebGLRenderer({
      canvas: glCanvas,
      context: gl2 ?? undefined,
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
    const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.55, 0.5, 0.55);
    composer.addPass(bloom);
    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    const disposables: Array<{ dispose: () => void }> = [];

    // ───────────────── STARFIELD (with fade) ─────────────────
    const starfield = createStarfield();
    const uStarOpacity = { value: 1.0 };
    starfield.group.traverse((obj) => {
      const anyObj = obj as THREE.Mesh | THREE.Points;
      const mat = (anyObj as { material?: THREE.Material | THREE.Material[] }).material;
      if (mat && (mat as THREE.ShaderMaterial).isShaderMaterial) {
        patchStarMaterialForFade(mat as THREE.ShaderMaterial, uStarOpacity);
      } else if (Array.isArray(mat)) {
        for (const m of mat) {
          if ((m as THREE.ShaderMaterial).isShaderMaterial) {
            patchStarMaterialForFade(m as THREE.ShaderMaterial, uStarOpacity);
          }
        }
      }
    });
    scene.add(starfield.group);
    disposables.push(starfield);

    // ───────────────── TUNNEL ─────────────────
    const tunnelGeo = new THREE.CylinderGeometry(4, 4, 80, 64, 1, true);
    const tunnelMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader:
        SIMPLEX2D +
        PALETTE_GLSL +
        /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        void main(){
          vec2 uv = vUv;
          float time = uTime;

          // Scroll the pattern along the tunnel length toward the camera.
          uv.y -= time * 0.4;

          float streaks = 0.0;
          streaks += abs(snoise(vec2(uv.x * 12.0, uv.y * 2.0))) * 0.6;
          streaks += abs(snoise(vec2(uv.x * 24.0, uv.y * 4.0 + 100.0))) * 0.3;
          streaks += abs(snoise(vec2(uv.x * 6.0,  uv.y * 1.0 + 200.0))) * 0.4;
          streaks = pow(streaks, 1.5);

          float hue = vUv.x + time * 0.05;
          vec3 palette = wormholePalette(hue);

          // Brighten the visible mid-section of the tunnel, darken the
          // vanishing point and the wall behind the camera.
          float depthFade = 1.0 - abs(vUv.y * 2.0 - 1.0);
          depthFade = smoothstep(0.0, 0.6, depthFade);

          vec3 colour = palette * streaks * 1.4 * depthFade;
          colour = min(colour, vec3(0.85));
          gl_FragColor = vec4(colour, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: true,
      transparent: false
    });
    const tunnel = new THREE.Mesh(tunnelGeo, tunnelMat);
    // Cylinder is built along its local Y axis. Rotate so its axis lies
    // along world Z, then centre it so it spans z = 2 .. z = -78.
    tunnel.rotation.x = Math.PI / 2;
    tunnel.position.set(0, 0, -38);
    scene.add(tunnel);
    disposables.push(tunnelGeo, tunnelMat);

    // ───────────────── PORTAL RING ─────────────────
    const ringGeo = new THREE.TorusGeometry(3.2, 0.18, 32, 128);
    const ringMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying float vAngle;
        void main(){
          // uv.x sweeps around the torus tube circumference; we want the
          // angle around the major ring instead — derive from position.
          vAngle = atan(position.y, position.x);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader:
        PALETTE_GLSL +
        /* glsl */ `
        uniform float uTime;
        varying float vAngle;
        void main(){
          // Rainbow rotates once every 4 seconds.
          float hue = vAngle / 6.2831853 + uTime * 0.25;
          vec3 palette = wormholePalette(hue);
          // Pulse: 0.85..1.15 over 2.5s.
          float pulse = 1.0 + 0.15 * sin(uTime * (6.2831853 / 2.5));
          // Let the emissive multiplier push above 1 so bloom (threshold
          // 0.55) actually catches the ring; cap well above 1 so the 1.6×
          // pulse remains meaningful but cannot fully blow out.
          vec3 colour = palette * 1.6 * pulse;
          colour = min(colour, vec3(1.6));
          gl_FragColor = vec4(colour, 1.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, 0, 2);
    scene.add(ring);
    disposables.push(ringGeo, ringMat);

    // ───────────────── ENTRANCE GLOW ─────────────────
    const glowGeo = new THREE.PlaneGeometry(8, 8);
    const glowMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        void main(){
          float d = distance(vUv, vec2(0.5));
          float pulse = 1.0 + 0.15 * sin(uTime * (6.2831853 / 2.5));
          float a = smoothstep(0.5, 0.0, d) * 0.6 * pulse;
          gl_FragColor = vec4(vec3(1.0), a);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(0, 0, 1.8);
    scene.add(glow);
    disposables.push(glowGeo, glowMat);

    // ───────────────── STREAKING PARTICLES ─────────────────
    const STREAK_COUNT = 12_000;
    const streakPos = new Float32Array(STREAK_COUNT * 3);
    const streakSpeed = new Float32Array(STREAK_COUNT);
    const streakSize = new Float32Array(STREAK_COUNT);
    for (let i = 0; i < STREAK_COUNT; i++) {
      const r = 1.5 + Math.random() * 2.3; // 1.5 .. 3.8
      const theta = Math.random() * Math.PI * 2;
      streakPos[i * 3 + 0] = r * Math.cos(theta);
      streakPos[i * 3 + 1] = r * Math.sin(theta);
      streakPos[i * 3 + 2] = -75 + Math.random() * 80; // -75 .. 5
      streakSpeed[i] = 0.5 + Math.random();
      streakSize[i] = 2 + Math.random() * 3;
    }
    const streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
    streakGeo.setAttribute('aSpeed', new THREE.BufferAttribute(streakSpeed, 1));
    streakGeo.setAttribute('aSize', new THREE.BufferAttribute(streakSize, 1));
    const streakMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uInside: { value: 0 }
      },
      vertexShader: /* glsl */ `
        attribute float aSpeed;
        attribute float aSize;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vZNorm;
        void main(){
          vec3 p = position;
          // Scroll toward camera (z increases); wrap once we pass z=+5.
          float travel = uTime * aSpeed * 6.0;
          float zRange = 80.0;
          float z = mod((p.z + 75.0) + travel, zRange) - 75.0;
          p.z = z;
          vZNorm = (z + 75.0) / 80.0; // 0 at far end, 1 near camera.
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aSize * uPixelRatio * (40.0 / max(-mvPosition.z, 0.1));
        }
      `,
      fragmentShader:
        PALETTE_GLSL +
        /* glsl */ `
        uniform float uInside;
        varying float vZNorm;
        void main(){
          vec2 uv = gl_PointCoord - 0.5;
          // Elongated streak shape: squash X so the sprite reads as a
          // vertical motion-blur smear rather than a circular puff.
          vec2 stretched = vec2(uv.x * 3.5, uv.y);
          float d = length(stretched);
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.0, d);
          // Mostly warm white, with a slight rainbow tint based on z.
          vec3 tint = wormholePalette(vZNorm * 0.8);
          vec3 colour = mix(vec3(1.0, 0.96, 0.9), tint, 0.35);
          colour = min(colour, vec3(0.9));
          float a = alpha * 0.4 * uInside;
          if (a < 0.001) discard;
          gl_FragColor = vec4(colour, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const streaks = new THREE.Points(streakGeo, streakMat);
    streaks.frustumCulled = false;
    scene.add(streaks);
    disposables.push(streakGeo, streakMat);

    // ───────────────── SCROLL CAMERA ─────────────────
    // 0..25%  : z 20 → 8   (linear, slow approach)
    // 25..60% : z 8  → 0   (easeIn, accelerating through the throat)
    // 60..100%: z 0  → -50 (linear, flying through the tunnel)
    const camState = { z: 20 };
    const computeZ = (p: number): number => {
      if (p <= 0.25) {
        const k = p / 0.25;
        return 20 + (8 - 20) * k;
      }
      if (p <= 0.6) {
        const k = (p - 0.25) / 0.35;
        const eased = k * k; // ease-in (quadratic)
        return 8 + (0 - 8) * eased;
      }
      const k = (p - 0.6) / 0.4;
      return 0 + (-50 - 0) * k;
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
          camState.z = computeZ(self.progress);
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

      tunnelMat.uniforms.uTime.value = t;
      ringMat.uniforms.uTime.value = t;
      glowMat.uniforms.uTime.value = t;
      streakMat.uniforms.uTime.value = t;

      // Starfield fades out as the camera approaches/enters the portal
      // (visible at z>=8, fully hidden by z<=0).
      uStarOpacity.value = THREE.MathUtils.clamp((camState.z - 0.0) / 8.0, 0, 1);
      // Streaking particles fade in as we enter the tunnel.
      streakMat.uniforms.uInside.value = THREE.MathUtils.clamp(1.0 - camState.z / 4.0, 0, 1);

      starfield.update(t, 0);

      camera.position.set(0, 0, camState.z);
      camera.lookAt(0, 0, -10);
      // Subtle Z-axis roll for a cinematic wobble.
      camera.rotation.z = Math.sin(t * 0.3) * 0.05;

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
      streakMat.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
    };
    window.addEventListener('resize', onResize);

    return () => {
      stopLoop();
      window.removeEventListener('resize', onResize);
      if (io) io.disconnect();
      if (scrollTrigger) scrollTrigger.kill();
      for (const d of disposables) d.dispose();
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
