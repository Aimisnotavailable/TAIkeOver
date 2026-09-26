import { render } from 'preact';
import { useState } from 'preact/hooks';
import { Game, Launch } from './ui/app';
import './styles.css';

export function Root() {
  const [started, setStarted] = useState(false);
  if (!started) return <Launch onBegin={() => setStarted(true)} />;
  return <Game />;
}

const root = document.getElementById('app');
if (root === null) throw new Error('missing #app');
render(<Root />, root);
