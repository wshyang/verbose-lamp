import { useEffect } from 'react';
import { CameraSwitchButton } from '../shared/CameraSwitchButton.js';
import { useSelfieCamera, type SelfieFaceBox } from '../../lib/hooks/useSelfieCamera.js';

/**
 * ADR-042 — the selfie viewfinder. The front camera fills the stage, mirrored the way
 * every phone's selfie preview is; the live face boundary (where the browser ships a
 * FaceDetector) is drawn INSIDE the mirrored frame, so the box follows the face with
 * no coordinate flipping. Without a detector — iOS Safari, ADR-041 — a fixed oval
 * guide stands in, and the captured frame walks the same ladder either way.
 *
 * The capture itself is un-mirrored: the sprite should show the participant the way
 * others see them, which is also what the conversion pipeline was proven on.
 */
export function SelfieCapture(props: {
  onCapture: (photo: Blob) => void;
  onCancel: () => void;
}) {
  const camera = useSelfieCamera();
  const { start } = camera;
  useEffect(() => start(), [start]);

  const take = async () => {
    const photo = await camera.capture();
    if (photo === null) return;
    camera.stop();
    props.onCapture(photo);
  };

  return (
    <div className="gb-selfie" data-testid="avatar-studio__selfie">
      <div className="gb-selfie__stage">
        <video
          ref={camera.videoRef}
          className="gb-selfie__video"
          muted
          playsInline
          data-testid="avatar-studio__selfie-video"
        />
        {camera.faceBox !== null ? (
          <div
            className="gb-selfie__face"
            style={boxStyle(camera.faceBox)}
            data-testid="avatar-studio__selfie-face"
          />
        ) : null}
        {!camera.hasDetector && camera.isActive ? (
          <div className="gb-selfie__guide" data-testid="avatar-studio__selfie-guide" />
        ) : null}
      </div>
      <canvas ref={camera.canvasRef} style={{ display: 'none' }} />
      <span className="gb-hint" data-testid="avatar-studio__selfie-hint">
        {camera.hasDetector
          ? 'The box is following your face — take the photo when it sits right.'
          : 'Line your face up in the oval, then take the photo.'}
      </span>
      {camera.error !== null ? (
        <span className="gb-inline-error" role="alert" data-testid="avatar-studio__selfie-error">
          {camera.error}
        </span>
      ) : null}
      <div className="gb-row gb-row--wrap">
        <button
          type="button"
          className="gb-button gb-button--small"
          data-testid="avatar-studio__selfie-capture"
          disabled={!camera.isActive}
          onClick={() => void take()}
        >
          Take the photo
        </button>
        <CameraSwitchButton
          label={camera.cameraLabel}
          onSwitch={camera.switchCamera}
          className="gb-button gb-button--small gb-button--secondary"
          testId="avatar-studio__selfie-switch"
        />
        <button
          type="button"
          className="gb-button gb-button--small gb-button--secondary"
          data-testid="avatar-studio__selfie-cancel"
          onClick={() => {
            camera.stop();
            props.onCancel();
          }}
        >
          Never mind
        </button>
      </div>
    </div>
  );
}

/** The face box, as percentages of the stage, so it scales with the preview. */
function boxStyle(box: SelfieFaceBox): React.CSSProperties {
  return {
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.width * 100}%`,
    height: `${box.height * 100}%`,
  };
}
