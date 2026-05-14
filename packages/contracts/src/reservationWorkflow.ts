export const reservationDraftCreateOperationName = 'pms.reservation.draft.create';
export const reservationDraftUpdateOperationName = 'pms.reservation.draft.update';
export const reservationQuoteOperationName = 'pms.reservation.quote';
export const reservationPrepareConfirmOperationName = 'pms.reservation.prepare_confirm';
export const reservationDraftCancelOperationName = 'pms.reservation.draft.cancel';
export const reservationGroupDraftCreateOperationName = 'pms.reservation.group_draft.create';
export const reservationGroupDraftUpdateOperationName = 'pms.reservation.group_draft.update';
export const reservationGroupQuoteOperationName = 'pms.reservation.group_quote';
export const reservationGroupPrepareConfirmOperationName = 'pms.reservation.group_prepare_confirm';
export const reservationGroupDraftCancelOperationName = 'pms.reservation.group_draft.cancel';
export const reservationCancelPrepareOperationName = 'pms.reservation_cancel.prepare';
export const pendingActionStatusOperationName = 'pms.pending_action.status';
export const pendingActionConfirmOperationName = 'pms.pending_action.confirm';
export const pendingActionCancelOperationName = 'pms.pending_action.cancel';

export const reservationDraftWorkflowOperations = [
  reservationDraftCreateOperationName,
  reservationDraftUpdateOperationName,
  reservationQuoteOperationName,
  reservationPrepareConfirmOperationName,
  reservationDraftCancelOperationName,
] as const;

export const reservationGroupDraftWorkflowOperations = [
  reservationGroupDraftCreateOperationName,
  reservationGroupDraftUpdateOperationName,
  reservationGroupQuoteOperationName,
  reservationGroupPrepareConfirmOperationName,
  reservationGroupDraftCancelOperationName,
] as const;

export const pendingActionCallbackOperations = [
  pendingActionStatusOperationName,
  pendingActionConfirmOperationName,
  pendingActionCancelOperationName,
] as const;

export type ReservationDraftWorkflowOperation = typeof reservationDraftWorkflowOperations[number];
export type ReservationGroupDraftWorkflowOperation = typeof reservationGroupDraftWorkflowOperations[number];
export type ReservationCancelWorkflowOperation = typeof reservationCancelPrepareOperationName;
export type PendingActionCallbackOperation = typeof pendingActionCallbackOperations[number];
export type ReservationDraftStatus = 'collectingSlots' | 'quoteReady' | 'awaitingConfirmation' | 'cancelled' | 'expired';
export type ReservationDraftMissingSlot = 'guest' | 'stayDates' | 'roomType' | 'candidateSelection';
export type ReservationDraftEvidenceSource = 'availabilitySearch' | 'userTurn' | 'platformReadModel' | 'system';

export interface ReservationDraftEvidenceRef {
  readonly source: ReservationDraftEvidenceSource;
  readonly refId: string;
  readonly generatedAt?: string;
}

export interface ReservationDraftSlots {
  readonly guestDisplayName?: string;
  readonly arrivalDate?: string;
  readonly departureDate?: string;
  readonly roomTypeId?: string;
  readonly roomTypeKeyword?: string;
  readonly roomId?: string;
  readonly selectedCandidateRef?: string;
  readonly adults?: number;
  readonly children?: number;
  readonly note?: string;
}

export interface ReservationDraftAuditRef {
  readonly auditId: string;
  readonly action: 'created' | 'updated' | 'quoted' | 'prepared' | 'cancelled' | 'expired' | 'replayed' | 'rejected' | 'pendingActionStatusRead' | 'pendingActionConfirmed' | 'pendingActionCancelled' | 'pendingActionExpired' | 'reservationCancelPrepared' | 'reservationCancelStatusRead' | 'reservationCancelConfirmed' | 'reservationCancelCancelled' | 'reservationCancelExpired';
  readonly occurredAt: string;
}

export interface ReservationDraftQuoteRef {
  readonly quoteRef: string;
  readonly status: 'pricingUnsupported';
  readonly generatedAt: string;
  readonly capabilityGap: {
    readonly code: 'RESERVATION_QUOTE_PRICING_UNSUPPORTED';
    readonly owner: 'pms-platform';
    readonly message: string;
  };
}

export type PendingActionStatus = 'awaitingConfirmation' | 'confirmed' | 'cancelled' | 'expired';
export type PendingActionMutationStatus = 'none' | 'deferred' | 'committed';

export interface PendingActionScopeRef {
  readonly propertyId: string;
  readonly channel: 'typed_card' | 'test';
  readonly tenantIdHash?: string;
  readonly chatIdHash?: string;
  readonly userIdHash?: string;
}

export interface ReservationDraftPendingActionRef {
  readonly pendingActionRef: string;
  readonly cardPayloadRef: string;
  readonly quoteRef: string;
  readonly generatedAt: string;
  readonly updatedAt: string;
  readonly expiresAt?: string;
  readonly status: PendingActionStatus;
  readonly confirmationMode: 'typedCardOnly';
  readonly mutationStatus: PendingActionMutationStatus;
}

export interface ReservationCancelPendingActionRef {
  readonly pendingActionRef: string;
  readonly cardPayloadRef: string;
  readonly reservationId: string;
  readonly reservationCode: string;
  readonly generatedAt: string;
  readonly updatedAt: string;
  readonly expiresAt?: string;
  readonly status: PendingActionStatus;
  readonly confirmationMode: 'typedCardOnly';
  readonly mutationStatus: PendingActionMutationStatus;
}

export interface PendingActionReadModel {
  readonly pendingActionRef: string;
  readonly workflowType: 'reservation' | 'reservationGroup' | 'reservationCancel';
  readonly quoteRef?: string;
  readonly reservationId?: string;
  readonly reservationCode?: string;
  readonly cardPayloadRef: string;
  readonly status: PendingActionStatus;
  readonly confirmationMode: 'typedCardOnly';
  readonly mutationStatus: PendingActionMutationStatus;
  readonly generatedAt: string;
  readonly updatedAt: string;
  readonly expiresAt?: string;
  readonly auditRefs?: readonly ReservationDraftAuditRef[];
}

export type PendingActionCallbackIdempotencyStatus = 'statusRead' | 'confirmed' | 'cancelled' | 'replayed';

export interface ReservationDraftWorkflowRef {
  readonly workflowType: 'reservation';
  readonly draftRef?: string;
  readonly draftId?: string;
  readonly status: ReservationDraftStatus;
  readonly slots?: ReservationDraftSlots;
  readonly missingSlots: readonly ReservationDraftMissingSlot[];
  readonly evidenceRefs: readonly ReservationDraftEvidenceRef[];
  readonly expiresAt?: string;
  readonly quote?: ReservationDraftQuoteRef;
  readonly pendingAction?: ReservationDraftPendingActionRef;
  readonly auditRefs?: readonly ReservationDraftAuditRef[];
}

export interface ReservationDraftWorkflowSafeGap {
  readonly code: 'RESERVATION_DRAFT_WORKFLOW_NOT_IMPLEMENTED' | 'RESERVATION_QUOTE_PRICING_UNSUPPORTED';
  readonly owner: 'pms-platform';
  readonly mutationStatus: 'none';
  readonly message: string;
}

export type ReservationGroupDraftStatus = ReservationDraftStatus;
export type ReservationGroupDraftMissingSlot = 'guest' | 'stayDates' | 'quantity' | 'roomSelections';
export type ReservationGroupDraftEvidenceRef = ReservationDraftEvidenceRef;
export type ReservationGroupDraftAuditRef = ReservationDraftAuditRef;

export interface ReservationGroupRoomSelection {
  readonly roomId: string;
  readonly selectedCandidateRef: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
}

export interface ReservationGroupDraftSlots {
  readonly guestDisplayName?: string;
  readonly arrivalDate?: string;
  readonly departureDate?: string;
  readonly roomTypeId?: string;
  readonly roomTypeKeyword?: string;
  readonly quantity?: number;
  readonly selections?: readonly ReservationGroupRoomSelection[];
  readonly adults?: number;
  readonly children?: number;
  readonly note?: string;
}

export interface ReservationGroupDraftQuoteRef {
  readonly quoteRef: string;
  readonly status: 'pricingUnsupported';
  readonly generatedAt: string;
  readonly capabilityGap: {
    readonly code: 'RESERVATION_GROUP_QUOTE_PRICING_UNSUPPORTED';
    readonly owner: 'pms-platform';
    readonly message: string;
  };
}

export interface ReservationGroupDraftPendingActionRef extends ReservationDraftPendingActionRef {
  readonly selectionCount: number;
}

export interface ReservationGroupDraftWorkflowRef {
  readonly workflowType: 'reservationGroup';
  readonly groupDraftRef?: string;
  readonly groupDraftId?: string;
  readonly status: ReservationGroupDraftStatus;
  readonly slots?: ReservationGroupDraftSlots;
  readonly missingSlots: readonly ReservationGroupDraftMissingSlot[];
  readonly evidenceRefs: readonly ReservationGroupDraftEvidenceRef[];
  readonly expiresAt?: string;
  readonly quote?: ReservationGroupDraftQuoteRef;
  readonly pendingAction?: ReservationGroupDraftPendingActionRef;
  readonly auditRefs?: readonly ReservationGroupDraftAuditRef[];
}

export interface ReservationGroupDraftWorkflowSafeGap {
  readonly code: 'RESERVATION_GROUP_DRAFT_WORKFLOW_NOT_IMPLEMENTED' | 'RESERVATION_GROUP_QUOTE_PRICING_UNSUPPORTED';
  readonly owner: 'pms-platform';
  readonly mutationStatus: 'none';
  readonly message: string;
}
