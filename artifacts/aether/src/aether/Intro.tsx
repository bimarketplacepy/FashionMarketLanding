import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

export default function Intro() {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLDivElement>(null);
  const eyebrowRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tl = gsap.timeline();

    if (titleRef.current) {
      const letters = titleRef.current.querySelectorAll('.letter');
      tl.fromTo(letters, 
        { filter: 'blur(20px)', opacity: 0 },
        { 
          filter: 'blur(0px)', 
          opacity: 1, 
          duration: 1.2,
          stagger: 0.06,
          ease: 'power3.out'
        }
      );
    }

    tl.fromTo(subtitleRef.current,
      { opacity: 0, y: 10 },
      { opacity: 0.7, y: 0, duration: 0.8, ease: 'power2.out' },
      '-=0.4'
    );

    tl.fromTo([eyebrowRef.current, bottomRef.current],
      { opacity: 0 },
      { opacity: 1, duration: 0.8, ease: 'power2.out' },
      '-=0.4'
    );

    if (arrowRef.current) {
      gsap.to(arrowRef.current, {
        y: 8,
        duration: 1.2,
        repeat: -1,
        yoyo: true,
        ease: 'power1.inOut'
      });
    }

  }, []);

  const titleWords = ["FASHION", "MARKET"];

  return (
    <section className="h-[100vh] flex flex-col items-center justify-between py-[64px] bg-black relative">
      <div
        ref={eyebrowRef}
        className="font-mono text-[11px] text-[#fafafa] opacity-50 tracking-[0.3em] uppercase opacity-0"
      >
        MODA · NUEVA TEMPORADA
      </div>

      <div className="flex flex-col items-center justify-center flex-1">
        <h1
          ref={titleRef}
          className="font-display text-[#fafafa] leading-[0.95] text-center flex flex-col items-center"
          style={{ fontSize: 'clamp(3rem, 15vw, 15rem)' }}
        >
          {titleWords.map((word, w) => (
            <span key={w} className="block whitespace-nowrap">
              {word.split('').map((char, i) => (
                <span key={i} className="letter inline-block opacity-0 blur-[20px]">{char}</span>
              ))}
            </span>
          ))}
        </h1>
        <div
          ref={subtitleRef}
          className="font-display italic text-[#fafafa] opacity-0 text-center mt-[0.4em]"
          style={{ fontSize: 'clamp(0.875rem, 2.5vw, 2.5rem)' }}
        >
          By Marketplace
        </div>
      </div>

      <div ref={bottomRef} className="flex flex-col items-center opacity-0">
        <div ref={arrowRef} className="text-[#fafafa] opacity-60 text-lg mb-2">↓</div>
        <div className="font-mono text-[11px] text-[#fafafa] opacity-60 tracking-[0.3em] uppercase">
          DESCUBRIR
        </div>
      </div>
    </section>
  );
}