import type { AnnouncementView } from '@psd/contracts';
import { apiGet, apiPost } from './client.js';

/** ADR-074 — the superadmin side of announcements. The participant side rides `/api/me/alerts`. */

export function listAnnouncements(): Promise<{ announcements: AnnouncementView[] }> {
  return apiGet('/api/admin/announcements');
}

export function createAnnouncement(body: string): Promise<{ announcement: AnnouncementView }> {
  return apiPost('/api/admin/announcements', { body });
}

export function retractAnnouncement(id: string): Promise<{ announcement: AnnouncementView }> {
  return apiPost(`/api/admin/announcements/${encodeURIComponent(id)}/retract`, {});
}
