import React from 'react';

export default function Outro() {
  return (
    <section className="h-[100vh] flex flex-col items-center justify-center relative bg-black">
      <div className="font-display italic text-[#fafafa] text-center max-w-[720px] px-8" style={{ fontSize: 'clamp(1.125rem, 3vw, 3rem)' }}>
        Six phenomena. One scroll. Rendered live in your browser.
      </div>
      
      <div className="mt-[64px] font-display text-[#fafafa] text-center px-8" style={{ fontSize: 'clamp(1rem, 1.4vw, 1.4rem)' }}>
        Built with Three.js, GSAP, Tone.js, and Lenis.
      </div>

      <a href="#" className="mt-[32px] font-mono text-[11px] text-[#fafafa] opacity-50 hover:opacity-100 transition-opacity tracking-[0.3em] uppercase">
        REMIX THIS BUILD →
      </a>

      <div className="absolute bottom-[40px] left-1/2 -translate-x-1/2 font-mono text-[11px] text-[#fafafa] opacity-40 tracking-[0.3em] uppercase">
        AETHER · CRAFTED 2026
      </div>
    </section>
  );
}