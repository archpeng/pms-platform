import { createHash } from 'node:crypto';
import type {
  Actor,
  HousekeepingTask,
  OccupancyStatus,
  CleaningStatus,
  MaintenanceTicket,
  OperationRequest,
  ProjectionOutboxEntry,
  ReservationDraftWorkflowRef,
  ReservationGroupDraftWorkflowRef,
  ReservationReadModel,
  SaleStatus,
} from '@pms-platform/contracts';
import type {
  PmsLocalSandboxStore,
  ProjectionDispatchMarkOptions,
  ProjectionDispatchWorkItem,
} from './localSandbox.js';

export const pmsProjectionDispatchEnabledEnvName = 'PMS_PLATFORM_PROJECTION_DISPATCH_ENABLED';
export const pmsProjectionDispatchAdapterBaseUrlEnvName = 'PMS_PLATFORM_ADAPTER_PMS_BASE_URL';
export const pmsProjectionDispatchAdapterTokenEnvName = 'PMS_PLATFORM_ADAPTER_PMS_BASE_TOKEN';
export const pmsProjectionDispatchIntervalMsEnvName = 'PMS_PLATFORM_PROJECTION_DISPATCH_INTERVAL_MS';
export const pmsProjectionDispatchBatchSizeEnvName = 'PMS_PLATFORM_PROJECTION_DISPATCH_BATCH_SIZE';
export const pmsProjectionDispatchTimeoutMsEnvName = 'PMS_PLATFORM_PROJECTION_DISPATCH_TIMEOUT_MS';
export const pmsProjectionDispatchMaxAttemptsEnvName = 'PMS_PLATFORM_PROJECTION_DISPATCH_MAX_ATTEMPTS';

const pmsBaseProjectionSchemaVersion = 'pms-dashboard-mvp-v1';

export interface PmsProjectionDispatcherOptions {
  readonly store: PmsLocalSandboxStore;
  readonly adapterBaseUrl: string;
  readonly adapterToken: string;
  readonly intervalMs?: number;
  readonly batchSize?: number;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => string;
}

export interface PmsProjectionDispatchOnceSummary {
  readonly attempted: number;
  readonly delivered: number;
  readonly retryable: number;
  readonly failed: number;
  readonly skipped: number;
}

export interface StartedPmsProjectionDispatcher {
  stop(): Promise<void>;
}

type AdapterPmsBaseRequest =
  | { readonly operation: 'pms_base_upsert_room_projection'; readonly roomNumber: string; readonly fields: JsonRecord }
  | { readonly operation: 'pms_base_upsert_reservation_projection'; readonly reservationCode: string; readonly fields: JsonRecord }
  | { readonly operation: 'pms_base_upsert_housekeeping_task_projection'; readonly taskId: string; readonly fields: JsonRecord }
  | { readonly operation: 'pms_base_upsert_maintenance_ticket_projection'; readonly ticketId: string; readonly fields: JsonRecord }
  | { readonly operation: 'pms_base_upsert_operation_request'; readonly clientToken: string; readonly fields: JsonRecord };

type JsonRecord = Record<string, unknown>;

export async function dispatchProjectionOutboxOnce(options: PmsProjectionDispatcherOptions): Promise<PmsProjectionDispatchOnceSummary> {
  const store = requireProjectionDispatchStore(options.store);
  const now = options.now ?? (() => new Date().toISOString());
  const attemptedAt = now();
  const items = store.listProjectionDispatchWork({ now: attemptedAt, limit: options.batchSize ?? 25 });
  const summary = { attempted: 0, delivered: 0, retryable: 0, failed: 0, skipped: 0 };

  for (const item of items) {
    const attemptNumber = item.ledger.attemptCount + 1;
    try {
      const adapterRequest = mapProjectionDispatchWorkItem(item, attemptedAt);
      if (!adapterRequest) {
        store.markProjectionDispatchSkipped(markOptions(item, attemptedAt, 'projection_kind_skipped'));
        summary.skipped += 1;
        continue;
      }

      summary.attempted += 1;
      const response = await postAdapterProjection(options, adapterRequest);
      const markBase = markOptions(item, attemptedAt, undefined, adapterRequest.operation, response.statusCode);
      if (response.ok) {
        store.markProjectionDispatchDelivered(markBase);
        summary.delivered += 1;
        continue;
      }

      const redactedError = `adapter_http_${response.statusCode}:${sanitizeError(response.message)}`;
      if (response.retryable && attemptNumber < (options.maxAttempts ?? 5)) {
        store.markProjectionDispatchRetryable({
          ...markBase,
          redactedError,
          nextAttemptAt: retryAt(attemptedAt, attemptNumber),
        });
        summary.retryable += 1;
      } else {
        store.markProjectionDispatchFailed({ ...markBase, redactedError });
        summary.failed += 1;
      }
    } catch (error) {
      const redactedError = sanitizeError(error instanceof Error ? error.message : String(error));
      const markBase = markOptions(item, attemptedAt, redactedError);
      if (attemptNumber < (options.maxAttempts ?? 5) && isRetryableDispatchError(error)) {
        store.markProjectionDispatchRetryable({
          ...markBase,
          nextAttemptAt: retryAt(attemptedAt, attemptNumber),
        });
        summary.retryable += 1;
      } else if (isSkippedDispatchError(error)) {
        store.markProjectionDispatchSkipped(markBase);
        summary.skipped += 1;
      } else {
        store.markProjectionDispatchFailed(markBase);
        summary.failed += 1;
      }
    }
  }

  return summary;
}

export function startProjectionDispatcher(options: PmsProjectionDispatcherOptions): StartedPmsProjectionDispatcher {
  let stopped = false;
  let running: Promise<void> | undefined;
  const intervalMs = Math.max(250, options.intervalMs ?? 5000);

  const tick = () => {
    if (stopped || running) return;
    running = dispatchProjectionOutboxOnce(options)
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        running = undefined;
      });
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await running;
    },
  };
}

export function mapProjectionDispatchWorkItem(item: ProjectionDispatchWorkItem, generatedAt: string): AdapterPmsBaseRequest | undefined {
  if (item.entry.projectionKind === 'dryRunReadback') return undefined;
  if (item.entry.projectionKind === 'reservationWorkflow') return mapReservationWorkflow(item, generatedAt);
  if (item.entry.projectionKind === 'reservation' && item.reservation) return mapReservation(item.reservation);
  if (item.entry.projectionKind === 'operationRequestStatus' && item.operationRequest) return mapOperationRequest(item.operationRequest);
  if (item.entry.projectionKind === 'roomLedger' && item.room) return mapRoomLedger(item, generatedAt);
  if (item.entry.projectionKind === 'housekeepingTask' && item.housekeepingTask) return mapHousekeepingTask(item.housekeepingTask, item.room);
  if (item.entry.projectionKind === 'maintenanceTicket' && item.maintenanceTicket) return mapMaintenanceTicket(item.maintenanceTicket, item.room);
  throw new ProjectionDispatchPermanentError(`projection_mapping_missing:${item.entry.projectionKind}:${item.entry.sourceType}`);
}

function mapReservation(reservation: ReservationReadModel): AdapterPmsBaseRequest {
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

function mapReservationWorkflow(item: ProjectionDispatchWorkItem, generatedAt: string): AdapterPmsBaseRequest {
  const workflow = item.reservationWorkflow;
  const audit = item.audit;
  if (!workflow || !audit) {
    throw new ProjectionDispatchPermanentError('reservation_workflow_context_missing');
  }

  const isGroup = workflow.workflowType === 'reservationGroup';
  const draft = isGroup ? workflow.groupDraft : workflow.draft;
  if (!draft) {
    throw new ProjectionDispatchPermanentError('reservation_workflow_draft_missing');
  }

  const actor = actorFromAuditPayload(audit.payload);
  const selectedRooms = item.selectedRooms ?? [];
  const roomNumber = roomNumberForReservationWorkflow(draft, selectedRooms);
  const summary = reservationWorkflowPayloadSummary(draft, selectedRooms);
  const result = reservationWorkflowResultSummary(item.entry, audit, draft, generatedAt);
  const workflowRef = isGroup ? workflow.groupDraft?.groupDraftRef : workflow.draft?.draftRef;

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
      reason: reasonFromJson(request.payloadJson) ?? `operation request ${request.status}`,
      requestedAt: request.createdAt,
      payloadJSON: request.payloadJson,
      resultJSON: request.resultJson ?? null,
      schemaVersion: pmsBaseProjectionSchemaVersion,
    },
  };
}

function mapRoomLedger(item: ProjectionDispatchWorkItem, generatedAt: string): AdapterPmsBaseRequest {
  const room = item.room;
  if (!room) throw new ProjectionDispatchPermanentError('room_projection_context_missing');
  const event = item.domainEvent;
  const operator = event?.actor.displayName ?? event?.actor.id ?? 'pms-platform';
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
      housekeepingTaskStatus: item.housekeepingTask ? housekeepingTaskStatusLabel(item.housekeepingTask.status) : null,
      maintenanceNote: item.maintenanceTicket?.reason ?? null,
      lastOperator: operator,
      lastReason: event ? `domain event ${event.type}` : 'projection dispatch',
      lastUpdatedAt: event?.occurredAt ?? generatedAt,
      schemaVersion: pmsBaseProjectionSchemaVersion,
    },
  };
}

function mapHousekeepingTask(task: HousekeepingTask, room: ProjectionDispatchWorkItem['room']): AdapterPmsBaseRequest {
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

function mapMaintenanceTicket(ticket: MaintenanceTicket, room: ProjectionDispatchWorkItem['room']): AdapterPmsBaseRequest {
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

async function postAdapterProjection(options: PmsProjectionDispatcherOptions, payload: AdapterPmsBaseRequest): Promise<{ ok: boolean; retryable: boolean; statusCode: number; message: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(250, options.timeoutMs ?? 5000));
  try {
    const response = await fetchImpl(`${trimTrailingSlash(options.adapterBaseUrl)}/providers/pms-base`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.adapterToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({})) as JsonRecord;
    const code = typeof body.code === 'number' ? body.code : undefined;
    return {
      ok: response.ok && code === 0,
      retryable: response.status >= 500 || response.status === 429,
      statusCode: response.status,
      message: typeof body.message === 'string' ? body.message : `code:${code ?? 'missing'}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function requireProjectionDispatchStore(store: PmsLocalSandboxStore): Required<Pick<PmsLocalSandboxStore, 'listProjectionDispatchWork' | 'markProjectionDispatchDelivered' | 'markProjectionDispatchRetryable' | 'markProjectionDispatchFailed' | 'markProjectionDispatchSkipped'>> {
  if (
    !store.listProjectionDispatchWork ||
    !store.markProjectionDispatchDelivered ||
    !store.markProjectionDispatchRetryable ||
    !store.markProjectionDispatchFailed ||
    !store.markProjectionDispatchSkipped
  ) {
    throw new Error('projection_dispatch_store_methods_missing');
  }
  return store as Required<Pick<PmsLocalSandboxStore, 'listProjectionDispatchWork' | 'markProjectionDispatchDelivered' | 'markProjectionDispatchRetryable' | 'markProjectionDispatchFailed' | 'markProjectionDispatchSkipped'>>;
}

function markOptions(
  item: ProjectionDispatchWorkItem,
  attemptedAt: string,
  redactedError?: string,
  adapterOperation?: string,
  adapterStatusCode?: number,
): ProjectionDispatchMarkOptions {
  return {
    outboxEntryId: item.entry.outboxEntryId,
    attemptedAt,
    ...(adapterOperation ? { adapterOperation } : {}),
    ...(adapterStatusCode !== undefined ? { adapterStatusCode } : {}),
    ...(redactedError ? { redactedError } : {}),
  };
}

function retryAt(attemptedAt: string, attemptNumber: number): string {
  const delayMs = Math.min(60_000, 1000 * 2 ** Math.max(0, attemptNumber - 1));
  return new Date(new Date(attemptedAt).getTime() + delayMs).toISOString();
}

function reservationWorkflowPayloadSummary(
  draft: ReservationDraftWorkflowRef | ReservationGroupDraftWorkflowRef,
  rooms: readonly NonNullable<ProjectionDispatchWorkItem['selectedRooms']>[number][],
): JsonRecord {
  const slots = draft.slots ?? {};
  const roomById = new Map(rooms.map((room) => [room.roomId, room]));
  const selections = draft.workflowType === 'reservationGroup'
    ? (draft.slots?.selections ?? []).map((selection) => {
        const room = roomById.get(selection.roomId);
        return {
          roomId: selection.roomId,
          roomNumber: room?.roomNumber,
          roomTypeId: selection.roomTypeId ?? room?.roomTypeId,
          roomType: selection.roomType ?? room?.roomType,
          selectedCandidateRefHash: stableHash(selection.selectedCandidateRef),
        };
      })
    : [{
        roomId: draft.slots?.roomId,
        roomNumber: rooms[0]?.roomNumber,
        roomTypeId: draft.slots?.roomTypeId ?? rooms[0]?.roomTypeId,
        roomType: draft.slots?.roomTypeKeyword ?? rooms[0]?.roomType,
        selectedCandidateRefHash: draft.slots?.selectedCandidateRef ? stableHash(draft.slots.selectedCandidateRef) : undefined,
      }];
  return {
    workflowType: draft.workflowType,
    draftRef: draft.workflowType === 'reservation' ? draft.draftRef : undefined,
    groupDraftRef: draft.workflowType === 'reservationGroup' ? draft.groupDraftRef : undefined,
    guestDisplayName: slots.guestDisplayName,
    arrivalDate: slots.arrivalDate,
    departureDate: slots.departureDate,
    quantity: draft.workflowType === 'reservationGroup' ? draft.slots?.quantity : 1,
    selections,
    quoteStatus: draft.quote?.status,
    pricingUnsupported: draft.quote?.status === 'pricingUnsupported',
    selectionCount: selections.length,
  };
}

function reservationWorkflowResultSummary(
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
    pendingActionRefHash: draft.pendingAction?.pendingActionRef ? stableHash(draft.pendingAction.pendingActionRef) : undefined,
    cardPayloadRefHash: draft.pendingAction?.cardPayloadRef ? stableHash(draft.pendingAction.cardPayloadRef) : undefined,
  };
}

function roomNumberForReservationWorkflow(draft: ReservationDraftWorkflowRef | ReservationGroupDraftWorkflowRef, rooms: readonly NonNullable<ProjectionDispatchWorkItem['selectedRooms']>[number][]): string {
  if (rooms.length > 0) return rooms.map((room) => room.roomNumber).join(',');
  if (draft.workflowType === 'reservationGroup') {
    return (draft.slots?.selections ?? []).map((selection) => selection.roomId).join(',') || 'N/A';
  }
  return draft.slots?.roomId ?? 'N/A';
}

function reservationWorkflowOperationStatus(action: string): string {
  if (action === 'pendingActionConfirmed') return '已完成';
  if (action === 'pendingActionCancelled' || action === 'cancelled') return '已取消';
  if (action === 'pendingActionExpired' || action === 'expired') return '已过期';
  if (action === 'prepared' || action === 'pendingActionStatusRead') return '待确认';
  if (action === 'rejected') return '失败';
  return '处理中';
}

function reservationStatusLabel(status: ReservationReadModel['status']): string {
  switch (status) {
    case 'booked':
      return 'Booked';
    case 'checkedIn':
      return 'Checked In';
    case 'checkedOut':
      return 'Checked Out';
    case 'cancelled':
      return 'Cancelled';
  }
}

function operationRequestStatusLabel(status: OperationRequest['status']): string {
  if (status === 'awaitingConfirmation') return '待确认';
  if (status === 'processing') return '处理中';
  if (status === 'completed') return '已完成';
  if (status === 'failed' || status === 'rejected') return '失败';
  if (status === 'needsManualReview') return '需人工复核';
  if (status === 'expired') return '已过期';
  if (status === 'cancelled') return '已取消';
  if (status === 'duplicateIgnored') return '重复忽略';
  return '待处理';
}

function occupancyStatusLabel(status: OccupancyStatus): string {
  if (status === 'occupied') return '在住';
  if (status === 'dueOut') return '预离';
  return '空房';
}

function cleaningStatusLabel(status: CleaningStatus): string {
  if (status === 'dirty') return '脏房';
  if (status === 'cleaning') return '清洁中';
  if (status === 'inspection') return '待查';
  if (status === 'rework') return '返工';
  return '干净';
}

function sellableStatusLabel(status: SaleStatus): string {
  if (status === 'outOfOrder') return '停售维修';
  if (status === 'outOfService') return '停售保留';
  return '可售';
}

function housekeepingTaskStatusLabel(status: HousekeepingTask['status']): string {
  if (status === 'inProgress') return '处理中';
  if (status === 'inspection') return '待查';
  if (status === 'rework') return '返工';
  if (status === 'done') return '已完成';
  if (status === 'cancelled') return '已取消';
  return '待处理';
}

function maintenanceTicketStatusLabel(status: MaintenanceTicket['status']): string {
  if (status === 'inProgress') return '处理中';
  if (status === 'resolved') return '已完成';
  return '待处理';
}

function actorFromAuditPayload(payload: unknown): Partial<Actor> {
  if (!payload || typeof payload !== 'object') return {};
  const request = (payload as JsonRecord).request;
  const actor = request && typeof request === 'object' ? (request as JsonRecord).actor : undefined;
  if (!actor || typeof actor !== 'object') return {};
  const actorRecord = actor as JsonRecord;
  return {
    ...(typeof actorRecord.id === 'string' ? { id: actorRecord.id } : {}),
    ...(typeof actorRecord.displayName === 'string' ? { displayName: actorRecord.displayName } : {}),
  };
}

function operatorFromJson(raw: string): string | undefined {
  const payload = safeJson(raw);
  const actor = payload && typeof payload.actor === 'object' ? payload.actor as JsonRecord : undefined;
  return typeof actor?.displayName === 'string' ? actor.displayName : typeof actor?.id === 'string' ? actor.id : undefined;
}

function reasonFromJson(raw: string): string | undefined {
  const payload = safeJson(raw);
  return typeof payload?.reason === 'string' ? payload.reason : undefined;
}

function safeJson(raw: string): JsonRecord | undefined {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonRecord : undefined;
  } catch {
    return undefined;
  }
}

function isRetryableDispatchError(error: unknown): boolean {
  return !(error instanceof ProjectionDispatchPermanentError) && !(error instanceof ProjectionDispatchSkippedError);
}

function isSkippedDispatchError(error: unknown): boolean {
  return error instanceof ProjectionDispatchSkippedError;
}

function sanitizeError(value: string): string {
  return value
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/pending-action-ref-[A-Za-z0-9_-]+/g, 'pending-action-ref-[redacted]')
    .replace(/card-payload-ref-[A-Za-z0-9_-]+/g, 'card-payload-ref-[redacted]')
    .slice(0, 240);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function stableHash(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(toStableJsonValue(value));
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

class ProjectionDispatchPermanentError extends Error {}
class ProjectionDispatchSkippedError extends Error {}
