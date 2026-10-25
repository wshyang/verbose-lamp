import { useCallback, useRef, useState } from 'react';
import { downloadSvgAsPng, downloadSvgElement, toSafeFileStem } from './export';

/** Downloads of the rendered preview, named after the caption. PNG failures are reported, never thrown. */
export function useQrExport(caption: string) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [isExporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const downloadSvg = useCallback(() => {
    if (!svgRef.current) return;
    downloadSvgElement(svgRef.current, toSafeFileStem(caption));
  }, [caption]);

  const downloadPng = useCallback(async () => {
    if (!svgRef.current || isExporting) return;
    setExporting(true);
    setExportError(null);
    try {
      await downloadSvgAsPng(svgRef.current, toSafeFileStem(caption));
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'The PNG could not be made.');
    } finally {
      setExporting(false);
    }
  }, [caption, isExporting]);

  return { svgRef, isExporting, exportError, downloadSvg, downloadPng };
}
