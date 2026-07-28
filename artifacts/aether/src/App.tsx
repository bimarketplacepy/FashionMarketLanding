import React from 'react';
import { useLenis } from './aether/useLenis';
import Intro from './aether/Intro';
import { FashionMarket } from './fashion/FashionMarket.jsx';

export default function App() {
  useLenis();

  return <FashionMarket intro={<Intro />} />;
}
