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
import { createStarfield } from './createStarfield';

gsap.registerPlugin(ScrollTrigger);

interface CrystallineProps {
  canvasId: string;
}

interface CrystalRecord {
  mesh: THREE.Mesh;
  mat: THREE.MeshPhysicalMaterial;
  geom: THREE.BufferGeometry;
  targetScale: number;
  growthThreshold: number;
}

const PALETTE = [
  0xffd0e8, // pale pink
  0xc8f0ff, // pale cyan
  0xfff0c8, // pale gold
  0xd8c8ff, // pale violet
  0xc8ffe0  // pale mint
];

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

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

export default function Crystalline({ canvasId }: CrystallineProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const section = mount.closest('section') as HTMLElement | null;

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 1.5, 9);
    camera.lookAt(0, 0, 0);
    fitCameraHorizontal(camera, width / height, 45);

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
    // Biggest bloom reduction in the deck: the crystals self-illuminate
    // via emissive AND were getting bloomed, doubling the wash. With
    // emissiveIntensity also cut sharply below, the crystals now read
    // as reflective rather than glowing, and individual facets stay
    // countable. Args: (resolution, strength, radius, threshold).
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.25, // strength
      0.35, // radius
      0.9   // threshold
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // ───────────────── PROCEDURAL ENVIRONMENT MAP ─────────────────
    // Without an environment map MeshPhysicalMaterial cannot reflect
    // anything, so the crystals read as flat coloured cardboard. We build
    // a tiny throwaway scene — a large inward-facing sphere with a
    // gradient + three warm spots — and PMREM-pre-filter it into an
    // env map. All materials in the visible scene pick it up via
    // scene.environment.
    const pmremGen = new THREE.PMREMGenerator(renderer);
    pmremGen.compileEquirectangularShader();
    const envScene = new THREE.Scene();
    const envSphereGeom = new THREE.SphereGeometry(50, 32, 32);
    const envSphereMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTopColor:    { value: new THREE.Color(0xd8c8ff) }, // pale violet
        uBottomColor: { value: new THREE.Color(0x081230) }, // deep blue
        uHotColor:    { value: new THREE.Color(0xffb070) }, // warm orange
        // Three normalised hot spots, deterministically placed (varied
        // azimuth + elevation) so the reflections look intentional
        // rather than randomly clustered.
        uHotA: { value: new THREE.Vector3( 0.85,  0.20,  0.50).normalize() },
        uHotB: { value: new THREE.Vector3(-0.70,  0.40, -0.60).normalize() },
        uHotC: { value: new THREE.Vector3( 0.10, -0.80,  0.60).normalize() }
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTopColor;
        uniform vec3 uBottomColor;
        uniform vec3 uHotColor;
        uniform vec3 uHotA;
        uniform vec3 uHotB;
        uniform vec3 uHotC;
        varying vec3 vDir;
        void main(){
          float t = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 base = mix(uBottomColor, uTopColor, t);
          float hot =
            pow(max(dot(vDir, uHotA), 0.0), 16.0) +
            pow(max(dot(vDir, uHotB), 0.0), 16.0) +
            pow(max(dot(vDir, uHotC), 0.0), 16.0);
          vec3 col = base + uHotColor * hot * 0.8;
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    const envSphere = new THREE.Mesh(envSphereGeom, envSphereMat);
    envScene.add(envSphere);
    const envRT = pmremGen.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    // The source sphere and the PMREM helper aren't needed once the
    // env map texture is generated.
    envSphereGeom.dispose();
    envSphereMat.dispose();
    pmremGen.dispose();

    // ───────────────── SHARED STARFIELD ─────────────────
    const starfield = createStarfield();
    scene.add(starfield.group);

    // ───────────────── LIGHTING ─────────────────
    // Lower ambient so the directional rim + coloured point lights
    // shape the crystals with stronger contrast.
    const ambient = new THREE.AmbientLight(0xfff4e8, 0.08);
    scene.add(ambient);

    const lightA = new THREE.PointLight(0x40e0ff, 12, 0, 2);
    const lightB = new THREE.PointLight(0xff40c0, 12, 0, 2);
    const lightC = new THREE.PointLight(0xffc060, 10, 0, 2);
    scene.add(lightA, lightB, lightC);

    // Key rim light: defines crystal edges from above-and-behind so the
    // cluster reads as a solid form against the black background.
    const rim = new THREE.DirectionalLight(0xfff8f0, 0.6);
    rim.position.set(5, 8, -5);
    scene.add(rim);

    // ───────────────── CRYSTAL CLUSTER ─────────────────
    const cluster = new THREE.Group();
    scene.add(cluster);

    const crystals: CrystalRecord[] = [];
    const tmp = new THREE.Vector3();

    const makeCrystal = (
      scaleTarget: number,
      position: THREE.Vector3,
      growthThreshold: number,
      palettePick: number,
      // Transmission (light passing through glass) is comparatively
      // expensive — Three.js renders an extra transmission pass per
      // frame for any material with transmission > 0. We restrict it
      // to the hero + inner ring (7 crystals) to keep frame time
      // healthy, while still landing the "real glass" read on the
      // crystals the eye lingers on.
      hasTransmission: boolean
    ) => {
      const geom = new THREE.OctahedronGeometry(1, 0);
      const emissive = new THREE.Color(PALETTE[palettePick % PALETTE.length]);
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0xf4ecff,
        roughness: 0.0,
        metalness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.0,
        transmission: hasTransmission ? 0.4 : 0.0,
        thickness: hasTransmission ? 0.5 : 0.0,
        ior: 2.4,
        transparent: true,
        opacity: 0, // animated up by the grow-in loop
        side: THREE.DoubleSide,
        depthWrite: false,
        envMapIntensity: 1.5,
        emissive,
        // Crystals should reflect, not glow. Sharply reduced from 1.2 so
        // the per-crystal chromatic emissive tint reads as subtle
        // thin-film rim colour rather than a self-illuminating wash that
        // doubles up with bloom.
        emissiveIntensity: 0.25
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.copy(position);
      mesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      mesh.scale.setScalar(0.001);
      cluster.add(mesh);
      crystals.push({ mesh, mat, geom, targetScale: scaleTarget, growthThreshold });
    };

    // TIER 1 — HERO (transmission on)
    makeCrystal(1.6, new THREE.Vector3(0, 0, 0), 0.0, 0, true);

    // TIER 2 — INNER RING (6, transmission on)
    for (let i = 0; i < 6; i++) {
      const r = 1.8 + Math.random() * 0.6;
      onSphere(r, tmp);
      const scale = 0.8 + Math.random() * 0.3;
      const threshold = 0.05 + (i / 5) * 0.15;
      makeCrystal(scale, tmp.clone(), threshold, i + 1, true);
    }

    // TIER 3 — MID CLOUD (15, no transmission), slight equatorial bias
    for (let i = 0; i < 15; i++) {
      const r = 2.8 + Math.random() * 1.2;
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      // Compress phi toward equator: pull cos(phi) toward 0 with a slight bias.
      const cosPhi = (2 * v - 1) * 0.7;
      const phi = Math.acos(THREE.MathUtils.clamp(cosPhi, -1, 1));
      const pos = new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
      const scale = 0.4 + Math.random() * 0.3;
      const threshold = 0.20 + Math.random() * 0.35;
      makeCrystal(scale, pos, threshold, i + 7, false);
    }

    // TIER 4 — OUTER DUST (28, no transmission)
    for (let i = 0; i < 28; i++) {
      const r = 4.2 + Math.random() * 2.3;
      onSphere(r, tmp);
      const scale = 0.15 + Math.random() * 0.2;
      const threshold = 0.55 + Math.random() * 0.4;
      makeCrystal(scale, tmp.clone(), threshold, i + 22, false);
    }

    // ───────────────── ATMOSPHERIC GLOW SPRITES ─────────────────
    const glowMeshes: THREE.Mesh[] = [];
    const glowGeoms: THREE.BufferGeometry[] = [];
    const glowMats: THREE.Material[] = [];
    const glowPalette = [0xffd0e8, 0xc8f0ff, 0xd8c8ff];
    for (let i = 0; i < 3; i++) {
      const color = new THREE.Color(glowPalette[i]);
      const geom = new THREE.PlaneGeometry(14, 14);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: color } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main(){
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          varying vec2 vUv;
          void main(){
            float d = distance(vUv, vec2(0.5));
            float a = smoothstep(0.5, 0.0, d) * 0.06;
            gl_FragColor = vec4(uColor, a);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(
        (Math.random() * 2 - 1) * 4,
        (Math.random() * 2 - 1) * 3,
        -5 - Math.random() * 5
      );
      scene.add(mesh);
      glowMeshes.push(mesh);
      glowGeoms.push(geom);
      glowMats.push(mat);
    }

    // ───────────────── SCROLL-DRIVEN CAMERA ─────────────────
    const camState = { z: 9, y: 1.5, progress: 0 };
    let scrollTrigger: ScrollTrigger | null = null;
    if (section) {
      scrollTrigger = ScrollTrigger.create({
        trigger: section,
        pin: true,
        pinSpacing: true,
        start: 'top top',
        // Crystalline needs extra scroll runway so the grow-in stages of
        // the outer crystal dust complete AND the pin releases cleanly
        // before Caustics' top reaches the viewport top.
        end: '+=120%',
        scrub: 0.15,
        onUpdate: (self) => {
          const p = self.progress;
          camState.progress = p;
          camState.z = 9 + (5.5 - 9) * p;
          camState.y = 1.5 + (0.5 - 1.5) * p;
        }
      });
    }

    // ───────────────── RAF (paused when offscreen) ─────────────────
    const timer = new Timer();
    timer.connect(document);
    let rafId = 0;
    let running = false;
    const tick = () => {
      if (!running) return;
      rafId = requestAnimationFrame(tick);
      timer.update();
      const t = timer.getElapsed();

      starfield.update(t, camState.progress);

      // Orbit the coloured lights independently of scroll.
      // Light A: horizontal circle, radius 8, period 12s.
      const aAng = (t / 12) * Math.PI * 2;
      lightA.position.set(Math.cos(aAng) * 8, 0, Math.sin(aAng) * 8);
      // Light B: vertical circle, radius 8, period 10s.
      const bAng = (t / 10) * Math.PI * 2;
      lightB.position.set(0, Math.cos(bAng) * 8, Math.sin(bAng) * 8);
      // Light C: diagonal circle, radius 9, period 14s.
      const cAng = (t / 14) * Math.PI * 2;
      const cs = Math.cos(cAng) * 9;
      const ss = Math.sin(cAng) * 9;
      lightC.position.set(cs * 0.707, ss, cs * 0.707);

      // Growth animation per crystal. Crystals whose threshold is 0 are
      // visible from the start (hero crystal); they skip the grow-in ramp.
      for (const c of crystals) {
        let e: number;
        if (c.growthThreshold <= 0) {
          e = 1;
        } else {
          const start = c.growthThreshold;
          const end = start + 0.05;
          const k = THREE.MathUtils.clamp(
            (camState.progress - start) / (end - start),
            0,
            1
          );
          e = easeOutCubic(k);
        }
        const s = Math.max(0.0001, c.targetScale * e);
        c.mesh.scale.setScalar(s);
        // FIX 3: settled opacity 0.9 (was 0.85). Multiplied by the
        // grow-in ramp so newly appearing crystals fade in cleanly.
        c.mat.opacity = 0.9 * e;
      }

      // Cluster rotation: period 30s on Y.
      cluster.rotation.y = (t / 30) * Math.PI * 2;

      camera.position.set(0, camState.y, camState.z);
      camera.lookAt(0, 0, 0);
      composer.render();
    };
    const startLoop = () => {
      if (running) return;
      running = true;
      timer.reset();
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
      fitCameraHorizontal(camera, w / h, 45);
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      stopLoop();
      window.removeEventListener('resize', onResize);
      if (io) io.disconnect();
      if (scrollTrigger) scrollTrigger.kill();
      starfield.dispose();
      for (const c of crystals) {
        c.geom.dispose();
        c.mat.dispose();
      }
      for (const g of glowGeoms) g.dispose();
      for (const m of glowMats) m.dispose();
      // Release the PMREM-generated environment map.
      scene.environment = null;
      envRT.dispose();
      timer.dispose();
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} id={canvasId} className="absolute inset-0 bg-black" />;
}
