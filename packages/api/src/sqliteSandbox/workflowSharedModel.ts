import { type ReservationDraftEvidenceRef } from '@pms-platform/contracts';
import {
  pmsPendingActionCancelOperation,
  pmsPendingActionConfirmOperation,
  pmsPendingActionStatusOperation,
  type PendingActionCallbackApiRequest,
} from '../index.js';

import { stableRefHash } from './ids.js';

export function mergeEvidenceRefs(
  existing: readonly ReservationDraftEvidenceRef[],
  next: readonly ReservationDraftEvidenceRef[],
): readonly ReservationDraftEvidenceRef[] {
  const byKey = new Map<string, ReservationDraftEvidenceRef>();
  for (const ref of [...existing, ...next]) {
    byKey.set(`${ref.source}:${ref.refId}`, ref);
  }
  return Array.from(byKey.values());
}

export function pendingActionFallbackOperation(
  request: PendingActionCallbackApiRequest,
):
  | typeof pmsPendingActionStatusOperation
  | typeof pmsPendingActionConfirmOperation
  | typeof pmsPendingActionCancelOperation {
  return (
    request.operation ??
    ('reason' in request
      ? pmsPendingActionCancelOperation
      : pmsPendingActionStatusOperation)
  );
}

export function redactedPendingActionAuditPayload(
  request: PendingActionCallbackApiRequest,
): Record<string, unknown> {
  return {
    operation: request.operation ?? pendingActionFallbackOperation(request),
    pendingActionRef: request.pendingActionRef,
    cardPayloadRef: request.cardPayloadRef,
    actor: { type: request.actor.type, id: stableRefHash(request.actor.id) },
    scope: {
      propertyId: request.scope.propertyId,
      channel: request.scope.channel,
      ...(request.scope.tenantIdHash
        ? { tenantIdHash: request.scope.tenantIdHash }
        : {}),
      ...(request.scope.chatIdHash
        ? { chatIdHash: request.scope.chatIdHash }
        : {}),
      ...(request.scope.userIdHash
        ? { userIdHash: request.scope.userIdHash }
        : {}),
    },
    correlationId: request.correlationId,
    requestedAt: request.requestedAt,
    clientTokenHash: stableRefHash(request.clientToken),
    requestFingerprint: request.requestFingerprint,
  };
}
