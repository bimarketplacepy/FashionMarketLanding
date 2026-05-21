import React from 'react';
import { useLenis } from './aether/useLenis';
import Intro from './aether/Intro';
import Outro from './aether/Outro';
import PhenomenonSection from './aether/PhenomenonSection';
import ProgressIndicator from './aether/ProgressIndicator';
import AudioController from './aether/audio/AudioController';
import { phenomena } from './aether/phenomena';

export default function App() {
  useLenis();

  return (
    <main className="bg-black min-h-[100dvh] text-[#fafafa] relative font-display selection:bg-[#b8a0ff] selection:text-black">
      <Intro />
      {phenomena.map((phenomenon, index) => (
        <PhenomenonSection 
          key={phenomenon.id} 
          phenomenon={phenomenon} 
          index={index + 1} 
        />
      ))}
      <Outro />
      <ProgressIndicator />
      <AudioController />
    </main>
  );
}