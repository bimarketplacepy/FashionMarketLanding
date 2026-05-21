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
    const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.45, 0.5, 0.7);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // ───────────────── SHARED STARFIELD ─────────────────
    const starfield = createStarfield();
    scene.add(starfield.group);

    // ───────────────── LIGHTING ─────────────────
    const ambient = new THREE.AmbientLight(0xfff4e8, 0.15);
    scene.add(ambient);

    const lightA = new THREE.PointLight(0x40e0ff, 5, 0, 2);
    const lightB = new THREE.PointLight(0xff40c0, 5, 0, 2);
    const lightC = new THREE.PointLight(0xffc060, 4, 0, 2);
    scene.add(lightA, lightB, lightC);

    // ───────────────── CRYSTAL CLUSTER ─────────────────
    const cluster = new THREE.Group();
    scene.add(cluster);

    const crystals: CrystalRecord[] = [];
    const tmp = new THREE.Vector3();

    const makeCrystal = (
      scaleTarget: number,
      position: THREE.Vector3,
      growthThreshold: number,
      palettePick: number
    ) => {
      const geom = new THREE.OctahedronGeometry(1, 0);
      const emissive = new THREE.Color(PALETTE[palettePick % PALETTE.length]);
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0xf4ecff,
        roughness: 0.05,
        metalness: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.0,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        emissive,
        emissiveIntensity: 0.4
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

    // TIER 1 — HERO
    makeCrystal(1.6, new THREE.Vector3(0, 0, 0), 0.0, 0);

    // TIER 2 — INNER RING (6)
    for (let i = 0; i < 6; i++) {
      const r = 1.8 + Math.random() * 0.6;
      onSphere(r, tmp);
      const scale = 0.8 + Math.random() * 0.3;
      const threshold = 0.05 + (i / 5) * 0.15;
      makeCrystal(scale, tmp.clone(), threshold, i + 1);
    }

    // TIER 3 — MID CLOUD (20), slight equatorial bias
    for (let i = 0; i < 20; i++) {
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
      makeCrystal(scale, pos, threshold, i + 7);
    }

    // TIER 4 — OUTER DUST (50)
    for (let i = 0; i < 50; i++) {
      const r = 4.2 + Math.random() * 2.3;
      onSphere(r, tmp);
      const scale = 0.15 + Math.random() * 0.2;
      const threshold = 0.55 + Math.random() * 0.4;
      makeCrystal(scale, tmp.clone(), threshold, i + 27);
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
        start: 'top top',
        end: '+=100%',
        scrub: true,
        onUpdate: (self) => {
          const p = self.progress;
          camState.progress = p;
          camState.z = 9 + (5.5 - 9) * p;
          camState.y = 1.5 + (0.5 - 1.5) * p;
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
        c.mat.opacity = 0.85 * e;
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
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} id={canvasId} className="absolute inset-0 bg-black" />;
}
