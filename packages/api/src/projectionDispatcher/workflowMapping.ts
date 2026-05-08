import type {
  Actor,
  ProjectionOutboxEntry,
  ReservationDraftWorkflowRef,
  ReservationGroupDraftWorkflowRef,
} from '@pms-platform/contracts';
import type { ProjectionDispatchWorkItem } from '../localSandbox/model.js';
import { stableHash } from './jsonUtils.js';
import type { JsonRecord } from './types.js';

export function reservationWorkflowPayloadSummary(
  draft: ReservationDraftWorkflowRef | ReservationGroupDraftWorkflowRef,
  rooms: readonly NonNullable<
    ProjectionDispatchWorkItem['selectedRooms']
  >[number][],
): JsonRecord {
  const slots = draft.slots ?? {};
  const roomById = new Map(rooms.map((room) => [room.roomId, room]));
  const selections =
    draft.workflowType === 'reservationGroup'
      ? (draft.slots?.selections ?? []).map((selection) => {
          const room = roomById.get(selection.roomId);
          return {
            roomId: selection.roomId,
            roomNumber: room?.roomNumber,
            roomTypeId: selection.roomTypeId ?? room?.roomTypeId,
            roomType: selection.roomType ?? room?.roomType,
            selectedCandidateRefHash: stableHash(
              selection.selectedCandidateRef,
            ),
          };
        })
      : [
          {
            roomId: draft.slots?.roomId,
            roomNumber: rooms[0]?.roomNumber,
            roomTypeId: draft.slots?.roomTypeId ?? rooms[0]?.roomTypeId,
            roomType: draft.slots?.roomTypeKeyword ?? rooms[0]?.roomType,
            selectedCandidateRefHash: draft.slots?.selectedCandidateRef
              ? stableHash(draft.slots.selectedCandidateRef)
              : undefined,
          },
        ];
  return {
    workflowType: draft.workflowType,
    draftRef: draft.workflowType === 'reservation' ? draft.draftRef : undefined,
    groupDraftRef:
      draft.workflowType === 'reservationGroup'
        ? draft.groupDraftRef
        : undefined,
    guestDisplayName: slots.guestDisplayName,
    arrivalDate: slots.arrivalDate,
    departureDate: slots.departureDate,
    quantity:
      draft.workflowType === 'reservationGroup' ? draft.slots?.quantity : 1,
    selections,
    quoteStatus: draft.quote?.status,
    pricingUnsupported: draft.quote?.status === 'pricingUnsupported',
    selectionCount: selections.length,
  };
}

export function reservationWorkflowResultSummary(
  entry: ProjectionOutboxEntry,
  audit: ProjectionDispatchWorkItem['audit'],
  draft: ReservationDraftWorkflowRef | ReservationGroupDraftWorkflowRef,
  generatedAt: string,
): JsonRecord {
  return {
    outboxEntryId: entry.outboxEntryId,
    sourceType: entry.sourceType,
    auditAction: audit?.action,
    pendingActionStatus: draft.pendingAction?.status,
    mutationStatus: draft.pendingAction?.mutationStatus,
    quotePricingUnsupported: draft.quote?.status === 'pricingUnsupported',
    generatedAt,
    pendingActionRefHash: draft.pendingAction?.pendingActionRef
      ? stableHash(draft.pendingAction.pendingActionRef)
      : undefined,
    cardPayloadRefHash: draft.pendingAction?.cardPayloadRef
      ? stableHash(draft.pendingAction.cardPayloadRef)
      : undefined,
  };
}

export function roomNumberForReservationWorkflow(
  draft: ReservationDraftWorkflowRef | ReservationGroupDraftWorkflowRef,
  rooms: readonly NonNullable<
    ProjectionDispatchWorkItem['selectedRooms']
  >[number][],
): string {
  if (rooms.length > 0) return rooms.map((room) => room.roomNumber).join(',');
  if (draft.workflowType === 'reservationGroup') {
    return (
      (draft.slots?.selections ?? [])
        .map((selection) => selection.roomId)
        .join(',') || 'N/A'
    );
  }
  return draft.slots?.roomId ?? 'N/A';
}

export function reservationWorkflowOperationStatus(action: string): string {
  if (action === 'pendingActionConfirmed') return '已完成';
  if (action === 'pendingActionCancelled' || action === 'cancelled')
    return '已取消';
  if (action === 'pendingActionExpired' || action === 'expired')
    return '已过期';
  if (action === 'prepared' || action === 'pendingActionStatusRead')
    return '待确认';
  if (action === 'rejected') return '失败';
  return '处理中';
}

export function actorFromAuditPayload(payload: unknown): Partial<Actor> {
  if (!payload || typeof payload !== 'object') return {};
  const request = (payload as JsonRecord).request;
  const actor =
    request && typeof request === 'object'
      ? (request as JsonRecord).actor
      : undefined;
  if (!actor || typeof actor !== 'object') return {};
  const actorRecord = actor as JsonRecord;
  return {
    ...(typeof actorRecord.id === 'string' ? { id: actorRecord.id } : {}),
    ...(typeof actorRecord.displayName === 'string'
      ? { displayName: actorRecord.displayName }
      : {}),
  };
}
