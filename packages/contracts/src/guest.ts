// CRM MVP v1 — guest profile read model + booking source + consent contracts.
// Per the plan pack `crm-mvp-v1-2026-05-30`: pms-platform returns RAW rows only.
// Aggregation (visitCount / firstSeen / lastStay) lives in product-gateway's join, NOT here.

export const bookingSourceKinds = ['direct', 'phone', 'wechat', 'ota_other', 'walk_in'] as const;
export type BookingSource = (typeof bookingSourceKinds)[number];

export const consentMarketingStates = ['granted', 'revoked', 'unset'] as const;
export type ConsentMarketingState = (typeof consentMarketingStates)[number];

// Raw guest row + linked reservations. Masked contact strings only (raw never leaves PMS write path).
export interface GuestRecord {
  readonly guestId: string;
  readonly displayName: string;
  readonly phoneMasked?: string;
  readonly emailMasked?: string;
  readonly consentMarketing: ConsentMarketingState;
  readonly consentMarketingSetAt?: string;
}

export interface GuestReservationRow {
  readonly reservationCode: string;
  readonly propertyId: string;
  readonly roomNumber?: string;
  readonly roomType?: string;
  readonly arrivalDate: string;
  readonly departureDate: string;
  readonly status: string;
  readonly bookingSource?: BookingSource;
}

export interface GuestProfileReadModel {
  readonly schemaVersion: 'pms-guest-profile-v1';
  readonly generatedAt: string;
  readonly summaryStatus: 'fresh' | 'stale' | 'unavailable';
  readonly guest: GuestRecord | undefined;
  readonly reservations: readonly GuestReservationRow[];
}

export function isBookingSource(value: unknown): value is BookingSource {
  return typeof value === 'string' && (bookingSourceKinds as readonly string[]).includes(value);
}

export function isConsentMarketingState(value: unknown): value is ConsentMarketingState {
  return typeof value === 'string' && (consentMarketingStates as readonly string[]).includes(value);
}
