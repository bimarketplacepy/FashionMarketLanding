import { useEffect } from 'react';
import Lenis from '@studio-freight/lenis';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function useLenis() {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
      touchMultiplier: 2,
    });

    // Bridge Lenis → ScrollTrigger. Without this, ScrollTrigger reads
    // the native scroll position (which Lenis hijacks), so pins fire at
    // the wrong moments and animations look jittery.
    lenis.on('scroll', ScrollTrigger.update);

    // Drive Lenis from GSAP's ticker so it shares a single rAF with the
    // animation engine. Keep a stable reference so the cleanup actually
    // removes the same function we added (a fresh arrow would not match).
    const raf = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    // Each scene creates its own ScrollTrigger inside a lazily-mounted
    // useEffect. ScrollTrigger auto-refreshes on creation, but a one-off
    // refresh after the first paint settles any layout work the
    // measurements were taken against (font load, image, etc.).
    const initialRefresh = window.setTimeout(() => {
      ScrollTrigger.refresh();
    }, 0);

    // Window resize: recompute pin positions so the journey length
    // (start/end offsets) stays correct at any viewport size.
    const onResize = () => ScrollTrigger.refresh();
    window.addEventListener('resize', onResize);

    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener('resize', onResize);
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, []);
}
