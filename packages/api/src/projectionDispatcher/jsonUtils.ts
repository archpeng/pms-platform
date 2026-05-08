import { createHash } from 'node:crypto';
import type { JsonRecord } from './types.js';

export function sanitizeError(value: string): string {
  return value
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(
      /pending-action-ref-[A-Za-z0-9_-]+/g,
      'pending-action-ref-[redacted]',
    )
    .replace(/card-payload-ref-[A-Za-z0-9_-]+/g, 'card-payload-ref-[redacted]')
    .slice(0, 240);
}

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function stableHash(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(toStableJsonValue(value));
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

function toStableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toStableJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, toStableJsonValue(entryValue)]),
    );
  }
  return value ?? null;
}
