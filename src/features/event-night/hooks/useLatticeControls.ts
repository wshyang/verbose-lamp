import { useCallback, useState } from 'react';
import { DEFAULT_SEED } from '@/shared/lib/random';

const SEED_REROLL_RANGE = 1e6;
const DEFAULT_DENSITY = 0.7;
const DEFAULT_LEVEL = 4;

/** Live controls for the title medallion's Deco Lattice. */
export function useLatticeControls() {
  const [latticeSeed, setLatticeSeed] = useState(DEFAULT_SEED);
  const [latticeDensity, setLatticeDensity] = useState(DEFAULT_DENSITY);
  const [latticeLevel, setLatticeLevel] = useState(DEFAULT_LEVEL);
  const rerollLattice = useCallback(() => setLatticeSeed(Math.floor(Math.random() * SEED_REROLL_RANGE)), []);
  return {
    latticeSeed, latticeDensity, setLatticeDensity, latticeLevel, setLatticeLevel, rerollLattice,
  };
}
