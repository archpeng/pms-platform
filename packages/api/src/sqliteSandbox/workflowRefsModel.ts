import {
  type ReservationDraftAuditRef,
  type ReservationDraftWorkflowRef,
  type ReservationGroupDraftAuditRef,
  type ReservationGroupDraftWorkflowRef,
} from '@pms-platform/contracts';

import { reservationDraftRef, reservationGroupDraftRef } from './ids.js';
import { cloneValue } from './json.js';
import {
  type StoredReservationDraft,
  type StoredReservationGroupDraft,
} from './rows.js';

export function reservationDraftRefFromStored(
  draft: StoredReservationDraft,
  auditRefs: readonly ReservationDraftAuditRef[] = [],
  options: { includeDraftId?: boolean } = {},
): ReservationDraftWorkflowRef {
  return {
    workflowType: 'reservation',
    draftRef: reservationDraftRef(draft.draftId),
    ...(options.includeDraftId ? { draftId: draft.draftId } : {}),
    status: draft.status,
    slots: cloneValue(draft.slots),
    missingSlots: cloneValue(draft.missingSlots),
    evidenceRefs: cloneValue(draft.evidenceRefs),
    expiresAt: draft.expiresAt,
    ...(draft.quote ? { quote: cloneValue(draft.quote) } : {}),
    ...(draft.pendingAction
      ? { pendingAction: cloneValue(draft.pendingAction) }
      : {}),
    ...(auditRefs.length > 0 ? { auditRefs: cloneValue(auditRefs) } : {}),
  };
}

export function reservationGroupDraftRefFromStored(
  draft: StoredReservationGroupDraft,
  auditRefs: readonly ReservationGroupDraftAuditRef[] = [],
  options: { includeGroupDraftId?: boolean } = {},
): ReservationGroupDraftWorkflowRef {
  return {
    workflowType: 'reservationGroup',
    groupDraftRef: reservationGroupDraftRef(draft.groupDraftId),
    ...(options.includeGroupDraftId
      ? { groupDraftId: draft.groupDraftId }
      : {}),
    status: draft.status,
    slots: cloneValue(draft.slots),
    missingSlots: cloneValue(draft.missingSlots),
    evidenceRefs: cloneValue(draft.evidenceRefs),
    expiresAt: draft.expiresAt,
    ...(draft.quote ? { quote: cloneValue(draft.quote) } : {}),
    ...(draft.pendingAction
      ? { pendingAction: cloneValue(draft.pendingAction) }
      : {}),
    ...(auditRefs.length > 0 ? { auditRefs: cloneValue(auditRefs) } : {}),
  };
}
