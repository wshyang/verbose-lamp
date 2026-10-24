import { createHash } from 'node:crypto';
import {
  GALLERY_PHOTOS_PER_UPLOADER,
  GALLERY_RAW_MAX_BYTES,
  GALLERY_RENDITION_MAX_BYTES,
  galleryCaptionSchema,
  galleryFilenameSchema,
  messages,
} from '@psd/contracts';
import { countPhotosByParticipant, findPhotoBySha1 } from '../db/entities/index.js';
import type { NewGalleryPhoto } from '../db/entities/index.js';
import { badRequest, conflict } from '../lib/http.js';
import {
  rawMimeFor,
  sniffImage,
  type ImageKind,
  type StoredRendition,
} from '../lib/galleryStore.js';
import { asClusterCode } from '../views/participants.js';
import type { Actor, AppContext } from '../lib/session.js';

/**
 * Reading an upload off the wire, and refusing everything that is not one (ADR-047).
 *
 * Multipart is parsed by Hono's own `c.req.formData()` — never a hand-rolled boundary parser.
 *
 * Both renditions are required rather than derived here. The phone already decoded the photo to
 * put it on a canvas, so it shrinks and re-encodes both sizes itself: the server needs no
 * `sharp`, no native dependency and nothing alpine cannot run. It also means what leaves the
 * phone is ~250 kB of WebP instead of 3–12 MB of camera JPEG, which is the difference between a
 * working uplink and a melted one — and canvas re-encoding strips EXIF, so the same step that
 * saves bandwidth is also the GPS scrub.
 */

/**
 * What `FormData.get()` hands back. Spelled out structurally rather than as the DOM's
 * `FormDataEntryValue`, which this tsconfig's lib does not carry — and only the two members
 * actually used are needed: a string field, or something with bytes.
 */
type FormEntry = string | { arrayBuffer: () => Promise<ArrayBuffer> } | null;

type Uploader = Pick<
  NewGalleryPhoto,
  | 'uploaderType'
  | 'participantId'
  | 'facilitatorId'
  | 'uploaderLabelSnapshot'
  | 'clusterCodeSnapshot'
>;

export interface UploadedPhoto {
  kind: ImageKind;
  renditions: StoredRendition[];
  metadata: NewGalleryPhoto;
}

function uploaderFrom(actor: Actor): Uploader {
  if (actor.type === 'participant') {
    return {
      uploaderType: 'participant',
      participantId: actor.participant.id,
      facilitatorId: null,
      uploaderLabelSnapshot: actor.participant.nickname,
      clusterCodeSnapshot: asClusterCode(actor.participant.clusterCode),
    };
  }
  if (actor.type === 'facilitator') {
    return {
      uploaderType: 'facilitator',
      participantId: null,
      facilitatorId: actor.facilitator.id,
      uploaderLabelSnapshot: actor.facilitator.username,
      clusterCodeSnapshot: null,
    };
  }
  // A superadmin moderates rather than contributes; the route guard refuses them before here.
  throw badRequest(messages.forbidden);
}

async function bytesOf(value: FormEntry, field: string, maxBytes: number): Promise<Uint8Array> {
  if (value === null || typeof value === 'string') {
    throw badRequest(messages.galleryPhotoMissing, field);
  }
  const bytes = new Uint8Array(await value.arrayBuffer());
  // The cap is checked per part on the server: the client shrink is an optimisation, and an
  // optimisation is never a guarantee.
  if (bytes.byteLength > maxBytes) {
    throw badRequest(
      field === 'raw' ? messages.galleryRawTooLarge : messages.galleryPhotoTooLarge,
      field,
    );
  }
  if (bytes.byteLength === 0) throw badRequest(messages.galleryPhotoMissing, field);
  return bytes;
}

/**
 * ADR-050 — the duplicate guard's key, computed HERE from the bytes actually received.
 *
 * SHA-1 rather than SHA-256 because this is a same-file check, not a security boundary: nobody is
 * defended against by it, and a collision would merely mean one photo declined. It is also what
 * was asked for.
 */
function sha1Of(bytes: Uint8Array): string {
  return createHash('sha1').update(bytes).digest('hex');
}

function positiveInt(raw: FormEntry, field: string): number {
  const parsed = Number(typeof raw === 'string' ? raw : Number.NaN);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw badRequest(messages.galleryPhotoNotAnImage, field);
  }
  return parsed;
}

async function guardQuota(c: AppContext, actor: Actor): Promise<void> {
  if (actor.type !== 'participant') return;
  const mine = await countPhotosByParticipant(c.get('db'), actor.participant.id);
  if (mine >= GALLERY_PHOTOS_PER_UPLOADER) throw conflict(messages.galleryQuotaReached);
}

export async function readUpload(c: AppContext, actor: Actor): Promise<UploadedPhoto> {
  const form = await c.req.formData().catch(() => null);
  if (!form) throw badRequest(messages.galleryPhotoMissing, 'full');

  const full = await bytesOf(form.get('full'), 'full', GALLERY_RENDITION_MAX_BYTES);
  const thumb = await bytesOf(form.get('thumb'), 'thumb', GALLERY_RENDITION_MAX_BYTES);
  // The untouched original, for Corporate's archive. Whatever the camera produced — HEIC included —
  // arrives here unaltered, which is the whole point of archiving it.
  const raw = await bytesOf(form.get('raw'), 'raw', GALLERY_RAW_MAX_BYTES);

  // Sniffed, not trusted: a declared content type is caller-controlled, and both SERVED renditions
  // must really be images before either is written where they will be handed back as one. The raw
  // original is deliberately NOT sniffed against that list — it may legitimately be a HEIC or any
  // other camera format, and it is never served to a browser.
  const kind = sniffImage(full);
  if (!kind || !sniffImage(thumb)) throw badRequest(messages.galleryPhotoNotAnImage, 'full');

  const caption = galleryCaptionSchema.safeParse(form.get('caption') ?? '');
  if (!caption.success) throw badRequest(messages.galleryCaptionTooLong, 'caption');

  const filename = galleryFilenameSchema.safeParse(form.get('filename') ?? '');
  if (!filename.success) throw badRequest(messages.galleryFilenameMissing, 'filename');

  // Dedupe before the quota, so a participant who re-picks the same photo is told what actually
  // happened rather than being told they are out of room.
  const sha1Raw = sha1Of(raw);
  if (await findPhotoBySha1(c.get('db'), sha1Raw)) {
    throw conflict(messages.galleryDuplicate, 'raw');
  }

  await guardQuota(c, actor);

  return {
    kind,
    renditions: [
      { rendition: 'full', bytes: full },
      { rendition: 'thumb', bytes: thumb },
      // Stored, never served: only the superadmin export route can reach it.
      { rendition: 'raw', bytes: raw, mime: rawMimeFor(filename.data) },
    ],
    metadata: {
      ...uploaderFrom(actor),
      caption: caption.data,
      originalFilename: filename.data,
      sha1Raw,
      rawByteSize: raw.byteLength,
      /*
       * ADR-052 — the client says whether it had to re-encode. It is a claim, not a fact the server
       * can verify, and it is recorded as provenance rather than trusted as a guarantee: nothing is
       * authorised by it, and the worst a wrong value does is mislabel one archive entry. A client
       * that stays silent is assumed to have sent the original, which is the honest default because
       * that is what every client before ADR-052 did.
       */
      rawIsOriginal: form.get('rawIsOriginal') !== 'false',
      width: positiveInt(form.get('width'), 'width'),
      height: positiveInt(form.get('height'), 'height'),
      bytes: full.byteLength + thumb.byteLength,
    },
  };
}
