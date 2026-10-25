import type { AvatarSample } from '../types';

/** Fetches a built-in sample portrait and wraps it as a `File`, as a picker would. */
export async function fetchSampleFile(sample: AvatarSample): Promise<File> {
  const blob = await (await fetch(sample.src)).blob();
  return new File([blob], `${sample.name}.jpg`, { type: blob.type || 'image/jpeg' });
}
