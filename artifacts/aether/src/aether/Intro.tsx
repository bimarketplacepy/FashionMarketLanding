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
    <section
      className="h-[100vh] flex flex-col items-center justify-between py-[64px] relative"
      style={{
        color: '#2b211e',
        background:
          'radial-gradient(1100px 700px at 85% -10%, rgba(110, 43, 53, 0.07), transparent 62%), radial-gradient(900px 720px at -5% 95%, rgba(110, 43, 53, 0.05), transparent 58%), #f6f1e8',
      }}
    >
      <div
        ref={eyebrowRef}
        className="font-mono text-[11px] opacity-50 tracking-[0.3em] uppercase opacity-0"
      >
        MODA · NUEVA TEMPORADA
      </div>

      <div className="flex flex-col items-center justify-center flex-1">
        <h1
          ref={titleRef}
          className="font-display leading-[0.95] text-center flex flex-col items-center"
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
          className="font-display italic opacity-0 text-center mt-[0.4em]"
          style={{ fontSize: 'clamp(0.875rem, 2.5vw, 2.5rem)', color: '#6e2b35' }}
        >
          By Marketplace
        </div>
      </div>

      <div ref={bottomRef} className="flex flex-col items-center opacity-0">
        <div ref={arrowRef} className="opacity-60 text-lg mb-2">↓</div>
        <div className="font-mono text-[11px] opacity-60 tracking-[0.3em] uppercase">
          DESCUBRIR
        </div>
      </div>
    </section>
  );
}