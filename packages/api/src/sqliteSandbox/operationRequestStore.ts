import {
isOperationRequestSource,
isOperationRequestStatus,
isSupportedOperationRequestAction,
type OperationRequest
} from '@pms-platform/contracts';
import {
pmsOperationRequestCreateOperation,
pmsOperationRequestGetOperation,
pmsOperationRequestListOperation,
pmsOperationRequestUpdateOperation,
type OperationRequestCreateApiRequest,
type OperationRequestCreateApiResponse,
type OperationRequestGetApiRequest,
type OperationRequestGetApiResponse,
type OperationRequestListApiRequest,
type OperationRequestListApiResponse,
type OperationRequestUpdateApiRequest,
type OperationRequestUpdateApiResponse
} from '../index.js';
import {
OperationRequestRow,
cloneValue,
nonEmptyString,
operationRequestCreateErrorResponse,
operationRequestFromRow,
operationRequestIdFromClientToken,
operationRequestListLimit,
operationRequestUpdateErrorResponse,
optionalString,
stableJsonStringify
} from './model.js';
import { SqliteSandboxWorkflowStore } from './workflowStore.js';

export abstract class SqliteSandboxOperationRequestStore extends SqliteSandboxWorkflowStore {
  createOperationRequest(request: OperationRequestCreateApiRequest): OperationRequestCreateApiResponse {
    return this.runInTransaction(() => this.createOperationRequestRecord(request));
  }

  getOperationRequest(request: OperationRequestGetApiRequest): OperationRequestGetApiResponse {
    return {
      ok: true,
      operation: pmsOperationRequestGetOperation,
      request: cloneValue(this.findOperationRequest(request)),
    };
  }

  listOperationRequests(request: OperationRequestListApiRequest = {}): OperationRequestListApiResponse {
    const status = typeof request.status === 'string' && isOperationRequestStatus(request.status) ? request.status : undefined;
    const roomId = optionalString(request.roomId);
    const limit = operationRequestListLimit(request.limit);
    const matching = this.listOperationRequestRecords()
      .filter((entry) => !status || entry.status === status)
      .filter((entry) => !roomId || entry.roomId === roomId);
    const requests = matching.slice(0, limit);
    return {
      ok: true,
      operation: pmsOperationRequestListOperation,
      requests: cloneValue(requests),
      count: matching.length,
      truncated: matching.length > requests.length,
      updatedAt: optionalString(request.requestedAt) ?? this.now(),
      filter: {
        ...(status ? { status } : {}),
        ...(roomId ? { roomId } : {}),
        limit,
      },
    };
  }

  updateOperationRequest(request: OperationRequestUpdateApiRequest): OperationRequestUpdateApiResponse {
    return this.runInTransaction(() => this.updateOperationRequestRecord(request));
  }

  protected createOperationRequestRecord(request: OperationRequestCreateApiRequest): OperationRequestCreateApiResponse {
    const payloadJson = stableJsonStringify(request.payload ?? {});
    const existing = this.getOperationRequestByClientToken(request.clientToken);

    if (!isSupportedOperationRequestAction(request.action)) {
      return operationRequestCreateErrorResponse(
        'OPERATION_REQUEST_UNSUPPORTED_ACTION',
        `Unsupported operation request action: ${request.action}`,
        'action',
      );
    }

    if (!isOperationRequestSource(request.source)) {
      return operationRequestCreateErrorResponse(
        'OPERATION_REQUEST_UNSUPPORTED_SOURCE',
        `Unsupported operation request source: ${request.source}`,
        'source',
      );
    }

    if (existing && (existing.requestFingerprint !== request.requestFingerprint || existing.payloadJson !== payloadJson)) {
      return operationRequestCreateErrorResponse(
        'OPERATION_REQUEST_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT',
        'The operation request client token was reused with a different request fingerprint or payload.',
        'requestFingerprint',
      );
    }

    if (existing) {
      return {
        ok: true,
        operation: pmsOperationRequestCreateOperation,
        idempotencyStatus: 'replayed',
        request: cloneValue(existing),
      };
    }

    const createdAt = nonEmptyString(request.requestedAt, this.now());
    const operationRequest: OperationRequest = {
      operationRequestId: operationRequestIdFromClientToken(request.clientToken),
      propertyId: nonEmptyString(request.propertyId, 'property-unknown'),
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      source: request.source,
      action: request.action,
      status: 'queued',
      roomId: optionalString(request.roomId),
      roomNumber: optionalString(request.roomNumber),
      reservationId: optionalString(request.reservationId),
      payloadJson,
      createdAt,
      updatedAt: createdAt,
    };
    this.saveOperationRequest(operationRequest);

    return {
      ok: true,
      operation: pmsOperationRequestCreateOperation,
      idempotencyStatus: 'created',
      request: cloneValue(operationRequest),
    };
  }

  protected updateOperationRequestRecord(request: OperationRequestUpdateApiRequest): OperationRequestUpdateApiResponse {
    const existing = this.findOperationRequest(request);
    if (!existing) {
      return operationRequestUpdateErrorResponse(
        'OPERATION_REQUEST_NOT_FOUND',
        'Operation request was not found.',
        request.operationRequestId ? 'operationRequestId' : 'clientToken',
      );
    }

    if (request.status !== undefined && !isOperationRequestStatus(request.status)) {
      return operationRequestUpdateErrorResponse(
        'OPERATION_REQUEST_INVALID_STATUS',
        `Unsupported operation request status: ${request.status}`,
        'status',
      );
    }

    const updated: OperationRequest = {
      ...existing,
      status: request.status ?? existing.status,
      resultJson: request.result === undefined ? existing.resultJson : request.result === null ? undefined : stableJsonStringify(request.result),
      updatedAt: nonEmptyString(request.updatedAt, this.now()),
    };
    this.saveOperationRequest(updated);

    return {
      ok: true,
      operation: pmsOperationRequestUpdateOperation,
      request: cloneValue(updated),
    };
  }

  protected findOperationRequest(request: OperationRequestGetApiRequest | OperationRequestUpdateApiRequest): OperationRequest | undefined {
    if (request.operationRequestId) {
      return this.getOperationRequestById(request.operationRequestId);
    }
    if (request.clientToken) {
      return this.getOperationRequestByClientToken(request.clientToken);
    }
    return undefined;
  }

  protected getOperationRequestById(operationRequestId: string): OperationRequest | undefined {
    const row = this.db.prepare('SELECT * FROM operation_requests WHERE operation_request_id = ?').get(operationRequestId) as OperationRequestRow | undefined;
    return row ? operationRequestFromRow(row) : undefined;
  }

  protected getOperationRequestByClientToken(clientToken: string): OperationRequest | undefined {
    const row = this.db.prepare('SELECT * FROM operation_requests WHERE client_token = ?').get(clientToken) as OperationRequestRow | undefined;
    return row ? operationRequestFromRow(row) : undefined;
  }

  protected listOperationRequestRecords(): OperationRequest[] {
    const rows = this.db
      .prepare('SELECT * FROM operation_requests ORDER BY created_at, operation_request_id')
      .all() as unknown as OperationRequestRow[];
    return rows.map(operationRequestFromRow);
  }

  protected listOperationRequestsByRoomIds(roomIds: ReadonlySet<string>): OperationRequest[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listOperationRequestRecords().filter((request) => request.roomId ? roomIds.has(request.roomId) : false);
  }

  protected saveOperationRequest(request: OperationRequest): void {
    this.db
      .prepare(
        `
          INSERT INTO operation_requests (
            operation_request_id, property_id, client_token, request_fingerprint, source, action, status,
            room_id, room_number, reservation_id, payload_json, result_json, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(operation_request_id) DO UPDATE SET
            property_id = excluded.property_id,
            client_token = excluded.client_token,
            request_fingerprint = excluded.request_fingerprint,
            source = excluded.source,
            action = excluded.action,
            status = excluded.status,
            room_id = excluded.room_id,
            room_number = excluded.room_number,
            reservation_id = excluded.reservation_id,
            payload_json = excluded.payload_json,
            result_json = excluded.result_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        request.operationRequestId,
        request.propertyId,
        request.clientToken,
        request.requestFingerprint,
        request.source,
        request.action,
        request.status,
        request.roomId ?? null,
        request.roomNumber ?? null,
        request.reservationId ?? null,
        request.payloadJson,
        request.resultJson ?? null,
        request.createdAt,
        request.updatedAt,
      );
  }
}
