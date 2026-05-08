import type { JsonRecord } from './types.js';

export function operatorFromJson(raw: string): string | undefined {
  const payload = safeJson(raw);
  const actor =
    payload && typeof payload.actor === 'object'
      ? (payload.actor as JsonRecord)
      : undefined;
  return typeof actor?.displayName === 'string'
    ? actor.displayName
    : typeof actor?.id === 'string'
      ? actor.id
      : undefined;
}

export function reasonFromJson(raw: string): string | undefined {
  const payload = safeJson(raw);
  return typeof payload?.reason === 'string' ? payload.reason : undefined;
}

export function safeJson(raw: string): JsonRecord | undefined {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as JsonRecord)
      : undefined;
  } catch {
    return undefined;
  }
}
