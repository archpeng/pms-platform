import type { PmsCommandType } from './commandMeta.js';

export type ReservationWorkflowOperationRequestAction =
  | 'RESERVATION_WORKFLOW'
  | 'RESERVATION_GROUP_WORKFLOW';

export const supportedOperationRequestActions = [
  'CHECK_IN',
  'CHECK_OUT',
  'HOUSEKEEPING_DONE',
  'HOUSEKEEPING_INSPECTION',
  'HOUSEKEEPING_REWORK',
  'REPORT_MAINTENANCE',
  'MAINTENANCE_DONE',
  'RESTORE_SELLABLE',
] as const satisfies readonly PmsCommandType[];

export const supportedReservationWorkflowOperationRequestActions = [
  'RESERVATION_WORKFLOW',
  'RESERVATION_GROUP_WORKFLOW',
] as const satisfies readonly ReservationWorkflowOperationRequestAction[];

export type OperationRequestAction =
  | typeof supportedOperationRequestActions[number]
  | typeof supportedReservationWorkflowOperationRequestActions[number];
export type OperationRequestSource = 'external_form' | 'conversation' | 'api' | 'test';
export type OperationRequestStatus =
  | 'queued'
  | 'dryRunRequested'
  | 'awaitingConfirmation'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'needsManualReview'
  | 'expired'
  | 'cancelled'
  | 'duplicateIgnored'
  | 'rejected';

export const operationRequestSources: readonly OperationRequestSource[] = ['external_form', 'conversation', 'api', 'test'];
export const operationRequestStatuses: readonly OperationRequestStatus[] = [
  'queued',
  'dryRunRequested',
  'awaitingConfirmation',
  'processing',
  'completed',
  'failed',
  'needsManualReview',
  'expired',
  'cancelled',
  'duplicateIgnored',
  'rejected',
];

export interface OperationRequest {
  readonly operationRequestId: string;
  readonly propertyId: string;
  readonly clientToken: string;
  readonly requestFingerprint: string;
  readonly source: OperationRequestSource;
  readonly action: OperationRequestAction;
  readonly status: OperationRequestStatus;
  readonly roomId?: string;
  readonly roomNumber?: string;
  readonly reservationId?: string;
  readonly payloadJson: string;
  readonly resultJson?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function isSupportedOperationRequestAction(value: string): value is OperationRequestAction {
  return (
    (supportedOperationRequestActions as readonly string[]).includes(value) ||
    (supportedReservationWorkflowOperationRequestActions as readonly string[]).includes(value)
  );
}

export function isOperationRequestSource(value: string): value is OperationRequestSource {
  return (operationRequestSources as readonly string[]).includes(value);
}

export function isOperationRequestStatus(value: string): value is OperationRequestStatus {
  return (operationRequestStatuses as readonly string[]).includes(value);
}
