import { useEffect } from 'react';
import Lenis from '@studio-freight/lenis';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function useLenis() {
  useEffect(() => {
    const lenis = new Lenis({
      // Shorter smoothing window keeps pin handoffs tight: longer values
      // let the scroll position drift past the pin's start/end edges
      // before ScrollTrigger registers, which made transitions feel
      // mushy. 0.8s with cubic ease-out is the sweet spot — smooth but
      // tight enough that scrub feels directly tied to wheel input.
      duration: 0.8,
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

    // Each scene creates its own ScrollTrigger inside its mount effect
    // (all six are eagerly imported and mount synchronously on first
    // commit, so all pin spacers register up-front). ScrollTrigger auto-
    // refreshes on creation; this one-off refresh runs in the next
    // macrotask to settle any layout work the per-trigger measurements
    // raced against (font load, image, etc.) and serves as the single
    // coordinated post-mount refresh point for the page.
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
