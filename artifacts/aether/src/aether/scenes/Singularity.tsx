import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface SingularityProps {
  canvasId: string;
}

export default function Singularity({ canvasId }: SingularityProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const section = mount.closest('section') as HTMLElement | null;

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(0, 2.5, 10);
    camera.lookAt(0, 0, 0);

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
    const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.55, 0.45, 0.7);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // ───────────────── STARFIELD ─────────────────
    const STAR_COUNT = 8000;
    const starPositions = new Float32Array(STAR_COUNT * 3);
    const starSizes = new Float32Array(STAR_COUNT);
    const starColors = new Float32Array(STAR_COUNT * 3);
    const starPhases = new Float32Array(STAR_COUNT);
    const warm = new THREE.Color(0xfffaf0);
    const cool = new THREE.Color(0xe8f0ff);
    for (let i = 0; i < STAR_COUNT; i++) {
      // uniform on sphere
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = 200;
      starPositions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
      starSizes[i] = 0.5 + Math.random() * 1.5;
      const mix = Math.random();
      const c = warm.clone().lerp(cool, mix);
      starColors[i * 3 + 0] = c.r;
      starColors[i * 3 + 1] = c.g;
      starColors[i * 3 + 2] = c.b;
      starPhases[i] = Math.random() * Math.PI * 2;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1));
    starGeo.setAttribute('aColor', new THREE.BufferAttribute(starColors, 3));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhases, 1));

    const starMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute vec3 aColor;
        attribute float aPhase;
        uniform float uTime;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vTwinkle;
        void main() {
          vColor = aColor;
          vTwinkle = 0.65 + 0.35 * sin(uTime * 1.4 + aPhase);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPixelRatio;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vTwinkle;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor * vTwinkle, a);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // ───────────────── EVENT HORIZON ─────────────────
    const horizon = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 64, 64),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    scene.add(horizon);

    // ───────────────── PHOTON RING ─────────────────
    const photonRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.02, 32, 256),
      new THREE.MeshBasicMaterial({ color: 0xffb877 })
    );
    photonRing.rotation.x = Math.PI / 2;
    photonRing.rotation.y = 0.12;
    scene.add(photonRing);

    // ───────────────── ACCRETION DISK ─────────────────
    const DISK_COUNT = 50000;
    const diskPositions = new Float32Array(DISK_COUNT * 3); // base positions unused; kept for BufferGeometry validity
    const diskRadius = new Float32Array(DISK_COUNT);
    const diskAngle = new Float32Array(DISK_COUNT);
    const diskYOff = new Float32Array(DISK_COUNT);
    const diskSize = new Float32Array(DISK_COUNT);
    for (let i = 0; i < DISK_COUNT; i++) {
      // sqrt distribution so we don't pile up at the inner edge
      const t = Math.random();
      const r = Math.sqrt(t) * (5.0 - 1.4) + 1.4;
      const a = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 0.05 * (0.4 + (r - 1.4) / (5.0 - 1.4));
      diskRadius[i] = r;
      diskAngle[i] = a;
      diskYOff[i] = y;
      diskSize[i] = 1.0 + Math.random() * 1.2;
      diskPositions[i * 3 + 0] = 0;
      diskPositions[i * 3 + 1] = 0;
      diskPositions[i * 3 + 2] = 0;
    }
    const diskGeo = new THREE.BufferGeometry();
    diskGeo.setAttribute('position', new THREE.BufferAttribute(diskPositions, 3));
    diskGeo.setAttribute('aRadius', new THREE.BufferAttribute(diskRadius, 1));
    diskGeo.setAttribute('aAngle', new THREE.BufferAttribute(diskAngle, 1));
    diskGeo.setAttribute('aYOff', new THREE.BufferAttribute(diskYOff, 1));
    diskGeo.setAttribute('aSize', new THREE.BufferAttribute(diskSize, 1));

    const diskMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
      },
      vertexShader: /* glsl */ `
        attribute float aRadius;
        attribute float aAngle;
        attribute float aYOff;
        attribute float aSize;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vRadius;
        void main() {
          vRadius = aRadius;
          // Keplerian: omega ~ 1 / r^(3/2). Scale to taste.
          float omega = 0.85 / pow(aRadius, 1.5);
          float a = aAngle + uTime * omega;
          vec3 pos = vec3(cos(a) * aRadius, aYOff, sin(a) * aRadius);
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mv;
          float dist = -mv.z;
          gl_PointSize = aSize * uPixelRatio * (60.0 / max(dist, 0.1)) * 0.35;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vRadius;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if (d > 0.5) discard;
          float soft = smoothstep(0.5, 0.0, d);

          vec3 hot   = vec3(1.000, 0.973, 0.882); // #fff8e1
          vec3 mid   = vec3(1.000, 0.659, 0.188); // #ffa830
          vec3 outer = vec3(0.816, 0.267, 0.125); // #d04420

          vec3 col;
          if (vRadius < 1.8) {
            col = mix(hot, mid, smoothstep(1.4, 1.8, vRadius));
          } else if (vRadius < 3.0) {
            col = mid;
          } else {
            col = mix(mid, outer, smoothstep(3.0, 5.0, vRadius));
          }

          float edgeFade = 1.0 - smoothstep(4.5, 5.0, vRadius);
          float alpha = soft * edgeFade;
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const disk = new THREE.Points(diskGeo, diskMat);
    disk.rotation.x = THREE.MathUtils.degToRad(18);
    scene.add(disk);

    // ───────────────── INNER GLOW HALO ─────────────────
    const GLOW_COUNT = 5000;
    const glowPositions = new Float32Array(GLOW_COUNT * 3);
    const glowRadius = new Float32Array(GLOW_COUNT);
    const glowAngle = new Float32Array(GLOW_COUNT);
    const glowYOff = new Float32Array(GLOW_COUNT);
    for (let i = 0; i < GLOW_COUNT; i++) {
      const r = 1.4 + Math.random() * 0.3;
      const a = Math.random() * Math.PI * 2;
      glowRadius[i] = r;
      glowAngle[i] = a;
      glowYOff[i] = (Math.random() - 0.5) * 0.03;
      glowPositions[i * 3 + 0] = 0;
      glowPositions[i * 3 + 1] = 0;
      glowPositions[i * 3 + 2] = 0;
    }
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3));
    glowGeo.setAttribute('aRadius', new THREE.BufferAttribute(glowRadius, 1));
    glowGeo.setAttribute('aAngle', new THREE.BufferAttribute(glowAngle, 1));
    glowGeo.setAttribute('aYOff', new THREE.BufferAttribute(glowYOff, 1));

    const glowMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
      },
      vertexShader: /* glsl */ `
        attribute float aRadius;
        attribute float aAngle;
        attribute float aYOff;
        uniform float uTime;
        uniform float uPixelRatio;
        void main() {
          float omega = 0.85 / pow(aRadius, 1.5);
          float a = aAngle + uTime * omega;
          vec3 pos = vec3(cos(a) * aRadius, aYOff, sin(a) * aRadius);
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mv;
          float dist = -mv.z;
          gl_PointSize = uPixelRatio * (90.0 / max(dist, 0.1)) * 0.45;
        }
      `,
      fragmentShader: /* glsl */ `
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if (d > 0.5) discard;
          float soft = smoothstep(0.5, 0.0, d);
          vec3 col = mix(vec3(1.0, 1.0, 0.85), vec3(1.0, 0.95, 0.7), 0.5);
          gl_FragColor = vec4(col, soft * 0.55);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const glow = new THREE.Points(glowGeo, glowMat);
    glow.rotation.x = THREE.MathUtils.degToRad(18);
    scene.add(glow);

    // ───────────────── SCROLL-DRIVEN CAMERA ─────────────────
    const camState = { z: 10, y: 2.5 };
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
          camState.z = 10 + (4.2 - 10) * p;
          camState.y = 2.5 + (0.8 - 2.5) * p;
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
      (diskMat.uniforms.uTime.value as number) = t;
      (glowMat.uniforms.uTime.value as number) = t;
      // Photon ring pulse: 1.0 → 1.03 over 4s
      const pulse = 1.0 + 0.015 + 0.015 * Math.sin((t / 4) * Math.PI * 2);
      photonRing.scale.setScalar(pulse);
      // Camera scrub
      camera.position.x = 0;
      camera.position.y = camState.y;
      camera.position.z = camState.z;
      camera.lookAt(0, 0, 0);
      composer.render();
    };
    const startLoop = () => {
      if (running) return;
      running = true;
      clock.getDelta(); // discard accumulated delta after pause
      rafId = requestAnimationFrame(tick);
    };
    const stopLoop = () => {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    };

    // ───────────────── VISIBILITY (truly pause RAF when offscreen) ─────────────────
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
      diskGeo.dispose();
      diskMat.dispose();
      glowGeo.dispose();
      glowMat.dispose();
      horizon.geometry.dispose();
      (horizon.material as THREE.Material).dispose();
      photonRing.geometry.dispose();
      (photonRing.material as THREE.Material).dispose();
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} id={canvasId} className="absolute inset-0 bg-black" />;
}
