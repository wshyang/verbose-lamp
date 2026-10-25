import { useCallback, useRef } from 'react';
import { downloadSvgAsPng, downloadSvgElement, toSafeFileStem } from '@/shared/lib/svgExport';

export const LATTICE_EXPORT_STEM = 'deco-lattice';
const PNG_SIZE = 1600;

/**
 * Export the rendered lattice frame as SVG or PNG through the shared helpers
 * (ADDENDUM-021 §3.5.4). The ref goes on `DecoLatticeFrame`; nothing is
 * serialised until the user asks for it.
 */
export function useLatticeExport(stem: string = LATTICE_EXPORT_STEM) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fileStem = toSafeFileStem(stem, LATTICE_EXPORT_STEM);

  const exportSvg = useCallback(() => {
    if (svgRef.current) downloadSvgElement(svgRef.current, fileStem);
  }, [fileStem]);

  const exportPng = useCallback(() => {
    if (!svgRef.current) return Promise.resolve();
    return downloadSvgAsPng(svgRef.current, fileStem, PNG_SIZE);
  }, [fileStem]);

  return { svgRef, fileStem, exportSvg, exportPng };
}
