import type {
  HousekeepingTask,
  MaintenanceTicket,
  OperationRequest,
  ReservationReadModel,
} from '@pms-platform/contracts';
import type { ProjectionDispatchWorkItem } from '../localSandbox/model.js';
import { ProjectionDispatchPermanentError } from './errors.js';
import { stableHash, stableJsonStringify } from './jsonUtils.js';
import {
  cleaningStatusLabel,
  housekeepingTaskStatusLabel,
  maintenanceTicketStatusLabel,
  occupancyStatusLabel,
  operationRequestStatusLabel,
  reservationStatusLabel,
  sellableStatusLabel,
} from './labels.js';
import { operatorFromJson, reasonFromJson } from './payloadJson.js';
import {
  pmsBaseProjectionSchemaVersion,
  type AdapterPmsBaseRequest,
} from './types.js';
import {
  actorFromAuditPayload,
  reservationWorkflowOperationStatus,
  reservationWorkflowPayloadSummary,
  reservationWorkflowResultSummary,
  roomNumberForReservationWorkflow,
} from './workflowMapping.js';

export function mapProjectionDispatchWorkItem(
  item: ProjectionDispatchWorkItem,
  generatedAt: string,
): AdapterPmsBaseRequest | undefined {
  if (item.entry.projectionKind === 'dryRunReadback') return undefined;
  if (item.entry.projectionKind === 'reservationWorkflow')
    return mapReservationWorkflow(item, generatedAt);
  if (item.entry.projectionKind === 'reservation' && item.reservation)
    return mapReservation(item.reservation);
  if (
    item.entry.projectionKind === 'operationRequestStatus' &&
    item.operationRequest
  )
    return mapOperationRequest(item.operationRequest);
  if (item.entry.projectionKind === 'roomLedger' && item.room)
    return mapRoomLedger(item, generatedAt);
  if (item.entry.projectionKind === 'housekeepingTask' && item.housekeepingTask)
    return mapHousekeepingTask(item.housekeepingTask, item.room);
  if (
    item.entry.projectionKind === 'maintenanceTicket' &&
    item.maintenanceTicket
  )
    return mapMaintenanceTicket(item.maintenanceTicket, item.room);
  throw new ProjectionDispatchPermanentError(
    `projection_mapping_missing:${item.entry.projectionKind}:${item.entry.sourceType}`,
  );
}

function mapReservation(
  reservation: ReservationReadModel,
): AdapterPmsBaseRequest {
  return {
    operation: 'pms_base_upsert_reservation_projection',
    reservationCode: reservation.reservationCode,
    fields: {
      backendId: reservation.reservationId,
      reservationCode: reservation.reservationCode,
      roomNumber: reservation.roomNumber ?? reservation.roomId ?? 'N/A',
      guestLabel: reservation.guestDisplayName,
      arrivalDate: reservation.arrivalDate,
      departureDate: reservation.departureDate,
      status: reservationStatusLabel(reservation.status),
      schemaVersion: pmsBaseProjectionSchemaVersion,
    },
  };
}

function mapReservationWorkflow(
  item: ProjectionDispatchWorkItem,
  generatedAt: string,
): AdapterPmsBaseRequest {
  const workflow = item.reservationWorkflow;
  const audit = item.audit;
  if (!workflow || !audit) {
    throw new ProjectionDispatchPermanentError(
      'reservation_workflow_context_missing',
    );
  }

  const isGroup = workflow.workflowType === 'reservationGroup';
  const draft = isGroup ? workflow.groupDraft : workflow.draft;
  if (!draft) {
    throw new ProjectionDispatchPermanentError(
      'reservation_workflow_draft_missing',
    );
  }

  const actor = actorFromAuditPayload(audit.payload);
  const selectedRooms = item.selectedRooms ?? [];
  const roomNumber = roomNumberForReservationWorkflow(draft, selectedRooms);
  const summary = reservationWorkflowPayloadSummary(draft, selectedRooms);
  const result = reservationWorkflowResultSummary(
    item.entry,
    audit,
    draft,
    generatedAt,
  );
  const workflowRef = isGroup
    ? workflow.groupDraft?.groupDraftRef
    : workflow.draft?.draftRef;

  return {
    operation: 'pms_base_upsert_operation_request',
    clientToken: `reservation-workflow:${isGroup ? 'reservationGroup' : 'reservation'}:${workflowRef ?? stableHash(workflow.clientToken)}`,
    fields: {
      action: isGroup ? 'RESERVATION_GROUP_WORKFLOW' : 'RESERVATION_WORKFLOW',
      status: reservationWorkflowOperationStatus(audit.action),
      roomNumber,
      operator: actor.displayName ?? actor.id ?? 'pms-platform',
      reason: `${isGroup ? 'reservationGroup' : 'reservation'} workflow ${audit.action}`,
      requestedAt: audit.occurredAt,
      payloadJSON: stableJsonStringify(summary),
      resultJSON: stableJsonStringify(result),
      schemaVersion: pmsBaseProjectionSchemaVersion,
    },
  };
}

function mapOperationRequest(request: OperationRequest): AdapterPmsBaseRequest {
  return {
    operation: 'pms_base_upsert_operation_request',
    clientToken: request.clientToken,
    fields: {
      action: request.action,
      status: operationRequestStatusLabel(request.status),
      roomNumber: request.roomNumber ?? request.roomId ?? 'N/A',
      operator: operatorFromJson(request.payloadJson) ?? 'pms-platform',
      reason:
        reasonFromJson(request.payloadJson) ??
        `operation request ${request.status}`,
      requestedAt: request.createdAt,
      payloadJSON: request.payloadJson,
      resultJSON: request.resultJson ?? null,
      schemaVersion: pmsBaseProjectionSchemaVersion,
    },
  };
}

function mapRoomLedger(
  item: ProjectionDispatchWorkItem,
  generatedAt: string,
): AdapterPmsBaseRequest {
  const room = item.room;
  if (!room)
    throw new ProjectionDispatchPermanentError(
      'room_projection_context_missing',
    );
  const event = item.domainEvent;
  const operator =
    event?.actor.displayName ?? event?.actor.id ?? 'pms-platform';
  return {
    operation: 'pms_base_upsert_room_projection',
    roomNumber: room.roomNumber,
    fields: {
      backendId: `room:${room.roomId}`,
      roomNumber: room.roomNumber,
      roomType: room.roomType ?? room.roomTypeId ?? '房型待补全',
      occupancyStatus: occupancyStatusLabel(room.occupancyStatus),
      cleaningStatus: cleaningStatusLabel(room.cleaningStatus),
      sellableStatus: sellableStatusLabel(room.saleStatus),
      roomCode: `${room.roomNumber}:${occupancyStatusLabel(room.occupancyStatus)}:${cleaningStatusLabel(room.cleaningStatus)}:${sellableStatusLabel(room.saleStatus)}`,
      housekeepingTaskStatus: item.housekeepingTask
        ? housekeepingTaskStatusLabel(item.housekeepingTask.status)
        : null,
      maintenanceNote: item.maintenanceTicket?.reason ?? null,
      lastOperator: operator,
      lastReason: event ? `domain event ${event.type}` : 'projection dispatch',
      lastUpdatedAt: event?.occurredAt ?? generatedAt,
      schemaVersion: pmsBaseProjectionSchemaVersion,
    },
  };
}

function mapHousekeepingTask(
  task: HousekeepingTask,
  room: ProjectionDispatchWorkItem['room'],
): AdapterPmsBaseRequest {
  return {
    operation: 'pms_base_upsert_housekeeping_task_projection',
    taskId: task.taskId,
    fields: {
      backendId: `housekeeping:${task.taskId}`,
      taskId: task.taskId,
      roomNumber: room?.roomNumber ?? task.roomId,
      kind: task.kind,
      status: housekeepingTaskStatusLabel(task.status),
      reason: task.reason,
      correlationId: task.correlationId,
      createdAt: task.createdAt,
      completedAt: task.completedAt ?? null,
      schemaVersion: pmsBaseProjectionSchemaVersion,
    },
  };
}

function mapMaintenanceTicket(
  ticket: MaintenanceTicket,
  room: ProjectionDispatchWorkItem['room'],
): AdapterPmsBaseRequest {
  return {
    operation: 'pms_base_upsert_maintenance_ticket_projection',
    ticketId: ticket.ticketId,
    fields: {
      backendId: `maintenance:${ticket.ticketId}`,
      ticketId: ticket.ticketId,
      roomNumber: room?.roomNumber ?? ticket.roomId,
      status: maintenanceTicketStatusLabel(ticket.status),
      severity: ticket.severity,
      stopSellRequested: ticket.stopSellRequested ? '是' : '否',
      reason: ticket.reason,
      correlationId: ticket.correlationId,
      createdAt: ticket.createdAt,
      resolvedAt: ticket.resolvedAt ?? null,
      schemaVersion: pmsBaseProjectionSchemaVersion,
    },
  };
}
