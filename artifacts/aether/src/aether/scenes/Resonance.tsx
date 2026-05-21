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

interface ResonanceProps {
  canvasId: string;
}

// Standing-wave cymatics: a flat tilted plane displaced by the sum of
// five sine waves emanating from fixed source points. Constructive /
// destructive interference produces a slowly evolving mandala-like
// pattern. Single draw call for the surface (256x256 segments =
// 65,536 vertices) plus the shared starfield — the lightest scene in
// the deck.

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  varying float vDisplacement;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // 5 wave source points: four corners + a centre source for radial
    // symmetry that mixes with the corner interference.
    vec2 sources[5];
    sources[0] = vec2(-6.0, -6.0);
    sources[1] = vec2( 6.0, -6.0);
    sources[2] = vec2(-6.0,  6.0);
    sources[3] = vec2( 6.0,  6.0);
    sources[4] = vec2( 0.0,  0.0);

    // Spatial frequencies (rationally related so the pattern stays
    // organised rather than turning into noise).
    float freqs[5];
    freqs[0] = 1.8;
    freqs[1] = 2.4;
    freqs[2] = 3.1;
    freqs[3] = 2.7;
    freqs[4] = 1.5;

    float timeShift = uTime * 0.15;

    float totalDisplacement = 0.0;
    for (int i = 0; i < 5; i++) {
      vec2 sourceToPoint = pos.xy - sources[i];
      float dist = length(sourceToPoint);
      float waveValue = sin(dist * freqs[i] + timeShift * (1.0 + float(i) * 0.3));
      // Distance attenuation: peaks decay away from each source, so
      // the interference field has a natural energy gradient rather
      // than a uniform amplitude across the plane.
      waveValue *= 1.0 / (1.0 + dist * 0.15);
      totalDisplacement += waveValue;
    }

    totalDisplacement *= 0.35;

    pos.z += totalDisplacement;
    vDisplacement = totalDisplacement;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying float vDisplacement;
  varying vec2 vUv;
  uniform float uTime;

  void main() {
    // Normalise the signed displacement into 0..1 for the colour ramp.
    float t = (vDisplacement + 0.7) / 1.4;
    t = clamp(t, 0.0, 1.0);

    vec3 colTrough = vec3(0.15, 0.05, 0.40); // deep violet
    vec3 colMid    = vec3(0.05, 0.40, 0.65); // teal-blue
    vec3 colPeak   = vec3(0.95, 0.75, 0.45); // warm gold

    vec3 colour;
    if (t < 0.5) {
      colour = mix(colTrough, colMid, t * 2.0);
    } else {
      colour = mix(colMid, colPeak, (t - 0.5) * 2.0);
    }

    // Displacement-isoline contour bands: turns the smooth gradient
    // into a topographic readout so the geometry stays legible on
    // flat-lit areas the directional light misses.
    float contour = abs(fract(vDisplacement * 4.0) - 0.5) * 2.0;
    contour = smoothstep(0.85, 1.0, contour);
    colour = mix(colour, colour * 1.4, contour * 0.3);

    // Soft warm boost on the highest peaks — sweetener that the bloom
    // pass amplifies into a hint of glow on the gold crests only.
    float peakGlow = smoothstep(0.7, 1.0, t);
    colour += vec3(0.4, 0.3, 0.15) * peakGlow * 0.5;

    gl_FragColor = vec4(colour, 1.0);
  }
`;

export default function Resonance({ canvasId }: ResonanceProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const section = mount.closest('section') as HTMLElement | null;

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    // ───────────────── SCENE / RENDERER ─────────────────
    const scene = new THREE.Scene();
    // Pure black, no fog. The cymatics surface is the entire interest;
    // any haze just muddies the standing-wave colour gradient.
    scene.background = new THREE.Color(0x000000);
    scene.fog = null;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(0, 6, 10);
    camera.lookAt(0, 0, 0);
    fitCameraHorizontal(camera, width / height, 50);

    // Let Three.js own its WebGL2 context — pre-allocating one and
    // passing it in double-counts against the browser's per-page
    // context cap, starving sibling scenes.
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
    // Bloom adds a soft glow only to the warm peaks (threshold 0.8
    // keeps the violet troughs and teal mids clean).
    // Args: (resolution, strength, radius, threshold)
    const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.22, 0.4, 0.8);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const disposables: Array<{ dispose: () => void }> = [];

    // ───────────────── SHARED STARFIELD ─────────────────
    const starfield = createStarfield();
    scene.add(starfield.group);

    // ───────────────── RESONANCE SURFACE ─────────────────
    const surfaceGeom = new THREE.PlaneGeometry(14, 14, 256, 256);
    const surfaceMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      side: THREE.DoubleSide,
      transparent: false,
      depthWrite: true
    });
    const surface = new THREE.Mesh(surfaceGeom, surfaceMat);
    // -75° on X tilts the plane toward the camera off horizontal for a
    // dramatic three-quarter view of the standing-wave pattern.
    surface.rotation.x = THREE.MathUtils.degToRad(-75);
    scene.add(surface);
    disposables.push(surfaceGeom, surfaceMat);

    // ───────────────── LIGHTING ─────────────────
    // Minimal. The custom shader does all the colour work; lights are
    // pure sweetener so the wave peaks catch a hint of physical
    // highlight that bloom can lift.
    const ambient = new THREE.AmbientLight(0xfafafa, 0.3);
    const directional = new THREE.DirectionalLight(0xfafafa, 0.6);
    directional.position.set(5, 10, 5);
    directional.target.position.set(0, 0, 0);
    scene.add(ambient, directional, directional.target);

    // ───────────────── SCROLL CAMERA (3-point path) ─────────────────
    const camState = { x: 0, y: 6, z: 10 };
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
        // Matches the surrounding sections' runway so the pin releases
        // cleanly before Wormhole's top reaches the viewport top.
        end: '+=100%',
        scrub: 0.15,
        onUpdate: (self) => {
          // Slow orbital descent: above-and-back → orbit right and
          // descend → low across the surface. lookAt origin throughout.
          const [x, y, z] = lerp3(
            self.progress,
            [0, 6, 10],
            [4, 4, 8],
            [0, 2, 7]
          );
          camState.x = x;
          camState.y = y;
          camState.z = z;
        }
      });
    }

    // ───────────────── RAF (paused while off-screen) ─────────────────
    const timer = new Timer();
    timer.connect(document);
    let rafId = 0;
    let running = false;

    const tick = () => {
      if (!running) return;
      rafId = requestAnimationFrame(tick);
      timer.update();
      const t = timer.getElapsed();
      surfaceMat.uniforms.uTime.value = t;
      // Starfield expects a normalised scroll progress for parallax;
      // pass the section's local scroll progress (or 0 before the
      // trigger exists).
      starfield.update(t, scrollTrigger ? scrollTrigger.progress : 0);
      camera.position.set(camState.x, camState.y, camState.z);
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
      fitCameraHorizontal(camera, w / h, 50);
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
      scene.remove(starfield.group);
      scene.remove(surface);
      scene.remove(ambient, directional, directional.target);
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
