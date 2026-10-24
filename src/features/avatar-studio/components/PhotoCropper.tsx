import { Check, X } from 'lucide-react';
import { GildedPortraitCanvas } from '@/features/gilded-portrait';
import type { RgbaImage, SquareBox } from '@/shared/lib/raster';
import { Button } from '@/shared/ui';
import { useCropper } from '../hooks/useCropper';
import { ACTION } from './studioUi';

interface PhotoCropperProps {
  readonly photo: RgbaImage;
  readonly initial: SquareBox;
  readonly onConfirm: (box: SquareBox) => void;
  readonly onCancel: () => void;
}

/** Draggable, resizable gold square over the photo (ported from the reference cropper). */
export function PhotoCropper({ photo, initial, onConfirm, onCancel }: PhotoCropperProps) {
  const cropper = useCropper(photo, initial);
  return (
    <div className="flex flex-col gap-3">
      <div
        ref={cropper.frameRef}
        className="relative mx-auto w-full max-w-[420px] touch-none select-none overflow-hidden border border-[#d4af37]/30"
        style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
        onPointerMove={cropper.onPointerMove}
        onPointerUp={cropper.onPointerUp}
        onPointerCancel={cropper.onPointerUp}
      >
        <GildedPortraitCanvas image={photo} label="Photo to frame" isShimmering={false} testId="avatar-studio__crop-photo" />
        <div
          role="group"
          tabIndex={0}
          aria-label="Avatar framing square. Drag to move, drag the corner to resize, or use the arrow keys and plus or minus."
          className="absolute cursor-move border-2 border-[#f8e29b] shadow-[0_0_0_9999px_rgba(5,4,6,0.62)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fff6dc]"
          style={cropper.squareStyle}
          onPointerDown={cropper.onMoveStart}
          onKeyDown={cropper.onKeyDown}
          data-testid="avatar-studio__crop-square"
        >
          <span aria-hidden="true" className="pointer-events-none absolute inset-[18%] rounded-full border border-dashed border-[#f8e29b]/45" />
          <span
            aria-hidden="true"
            className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize border border-[#2a1a06] bg-[#f8e29b]"
            onPointerDown={cropper.onResizeStart}
            data-testid="avatar-studio__crop-handle"
          />
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          type="button"
          onClick={() => onConfirm(cropper.box)}
          variant="selected"
          size="compact"
          className={`${ACTION} border-[#f8e29b]/70 bg-[#d4af37]/20 text-[#fff6dc] hover:bg-[#d4af37]/35`}
          data-testid="avatar-studio__crop-confirm"
        >
          <Check className="h-3.5 w-3.5" />
          Use this framing
        </Button>
        <Button
          type="button"
          onClick={onCancel}
          variant="panel"
          size="compact"
          className={`${ACTION} border-[#d4af37]/30 text-[#d4af37]/85 hover:border-[#f8e29b]`}
          data-testid="avatar-studio__crop-cancel"
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
