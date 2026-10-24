import React from 'react';
import { Frame, RotateCcw, X } from 'lucide-react';
import { isSignatureGenome } from '../../webgl/frame';
import { buildFrameReadoutRows } from '../../data/frameGenomeUi';
import { isSignatureSetting } from '../../data/frameIntricacy';
import type { FrameStyleController } from '../../hooks/useFrameStyle';
import { ScreenBorderPanel } from './ScreenBorderPanel';
import { TitleFramePanel } from './TitleFramePanel';

interface FrameStudioModalProps {
  open: boolean;
  controller: FrameStyleController;
  onClose: () => void;
}

export const FrameStudioModal: React.FC<FrameStudioModalProps> = ({ open, controller, onClose }) => {
  if (!open) return null;

  const { style, stats, edge, resetAll } = controller;
  const isOriginal =
    style.family === 'sequence' && isSignatureGenome(style.genome) && isSignatureSetting(style.intricacy);
  const readoutRows = buildFrameReadoutRows(stats);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onClick={onClose}
      data-testid="frame-studio__backdrop"
    >
      <div
        className="relative w-full max-w-2xl bg-[#09070c]/95 border border-[#d4af37]/50 shadow-[0_0_80px_rgba(212,175,55,0.22)] max-h-[92vh] overflow-y-auto deco-scroll"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="frame-studio-title"
      >
        <span className="pointer-events-none absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-[#f8e29b]/70" />
        <span className="pointer-events-none absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-[#f8e29b]/70" />
        <span className="pointer-events-none absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-[#f8e29b]/70" />
        <span className="pointer-events-none absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-[#f8e29b]/70" />

        <div className="flex items-start justify-between border-b border-[#d4af37]/25 px-6 pt-5 pb-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-[#d4af37]">
              <Frame className="w-3.5 h-3.5" />
              <span>Frame Studio</span>
            </div>
            <h2 id="frame-studio-title" className="mt-1 text-lg font-deco tracking-[0.14em] text-[#fff4d4]">
              THE GOLDEN FRAMEWORK
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#d4af37]/80 hover:text-[#fff4d4] border border-[#d4af37]/30 hover:border-[#f8e29b] transition-colors cursor-pointer"
            aria-label="Close Frame Studio"
            data-testid="frame-studio__close-button"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-7">
          <TitleFramePanel controller={controller} />
          <div className="border-t border-[#d4af37]/25" />
          <ScreenBorderPanel
            enabled={edge.enabled}
            weight={edge.weight}
            railCount={edge.railCount}
            onEnabledChange={controller.setEdgeEnabled}
            onWeightChange={controller.setEdgeWeight}
          />

          <div
            className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4 border-y border-[#d4af37]/20 py-3"
            data-testid="frame-studio__readout"
          >
            {readoutRows.map((row) => (
              <div key={row.label}>
                <div className="text-[9px] tracking-[0.18em] uppercase text-[#d4af37]/70">{row.label}</div>
                <div className="text-sm font-mono text-[#f5e7c6]">{row.value}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            {isOriginal && !edge.enabled ? (
              <span
                className="text-[10px] tracking-[0.18em] uppercase text-[#f8e29b]"
                data-testid="frame-studio__original-badge"
              >
                Original · exact
              </span>
            ) : (
              <button
                onClick={resetAll}
                className="inline-flex items-center gap-1.5 text-[11px] tracking-[0.16em] uppercase text-[#d4af37] hover:text-[#fff4d4] transition-colors cursor-pointer"
                data-testid="frame-studio__reset-all-button"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to original
              </button>
            )}
            <button
              onClick={onClose}
              className="px-5 py-2 bg-gradient-to-r from-[#b88924] via-[#f0cf7b] to-[#b88924] text-[#09070c] text-[11px] font-semibold tracking-[0.2em] uppercase hover:brightness-110 transition-all cursor-pointer"
              data-testid="frame-studio__done-button"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
