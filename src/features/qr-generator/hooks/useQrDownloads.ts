import { useCallback, type MutableRefObject } from 'react';
import { downloadSvgAsPng, downloadSvgElement, toSafeFileStem } from '../export';

interface QrDownloadSources {
  svgRef: MutableRefObject<SVGSVGElement | null>;
  caption: string;
  isExporting: boolean;
  setExporting: (exporting: boolean) => void;
}

/**
 * The two export paths: the SVG as drawn, and a PNG rasterised from that same
 * element. The PNG path holds an export flag so a double click cannot rasterise
 * twice, and clears it in a `finally` so a failure cannot wedge the button.
 */
export function useQrDownloads({ svgRef, caption, isExporting, setExporting }: QrDownloadSources) {
  const downloadSvg = useCallback(() => {
    if (!svgRef.current) return;
    downloadSvgElement(svgRef.current, toSafeFileStem(caption));
  }, [caption, svgRef]);

  const downloadPng = useCallback(async () => {
    if (!svgRef.current || isExporting) return;
    setExporting(true);
    try {
      await downloadSvgAsPng(svgRef.current, toSafeFileStem(caption));
    } finally {
      setExporting(false);
    }
  }, [caption, isExporting, setExporting, svgRef]);

  return { downloadSvg, downloadPng };
}
