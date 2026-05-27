import {
pmsHousekeepingDoneOperation,
pmsHousekeepingInspectionOperation,
pmsHousekeepingReworkOperation,
pmsMaintenanceDoneOperation,
pmsReportMaintenanceOperation,
pmsReservationAdjustOperation,
pmsReservationCancelPrepareOperation,
pmsReservationCreateOperation,
pmsReservationDraftCancelOperation,
pmsReservationDraftCreateOperation,
pmsReservationDraftUpdateOperation,
pmsReservationGroupDraftCancelOperation,
pmsReservationGroupDraftCreateOperation,
pmsReservationGroupDraftUpdateOperation,
pmsReservationGroupPrepareBookingOperation,
pmsReservationGroupPrepareConfirmOperation,
pmsReservationGroupQuoteOperation,
pmsReservationPrepareBookingOperation,
pmsReservationPrepareConfirmOperation,
pmsReservationQuoteOperation,
pmsRestoreSellableOperation,
type PmsExtendedCommandApiRequest,
type ReservationAdjustWorkflowApiRequest,
type ReservationCancelWorkflowApiRequest,
type ReservationCreateWorkflowApiRequest,
type ReservationDraftWorkflowApiRequest,
type ReservationGroupDraftWorkflowApiRequest,
} from '../index.js';

export function reservationDraftOperationForPath(pathname: string): ReservationDraftWorkflowApiRequest['operation'] | undefined {
  if (pathname === '/v1/pms/reservation-drafts/create') return pmsReservationDraftCreateOperation;
  if (pathname === '/v1/pms/reservation-drafts/update') return pmsReservationDraftUpdateOperation;
  if (pathname === '/v1/pms/reservation-drafts/quote') return pmsReservationQuoteOperation;
  if (pathname === '/v1/pms/reservation-drafts/prepare-confirm') return pmsReservationPrepareConfirmOperation;
  if (pathname === '/v1/pms/reservation-drafts/cancel') return pmsReservationDraftCancelOperation;
  return undefined;
}

export function reservationGroupDraftOperationForPath(pathname: string): ReservationGroupDraftWorkflowApiRequest['operation'] | undefined {
  if (pathname === '/v1/pms/reservation-group-drafts/create') return pmsReservationGroupDraftCreateOperation;
  if (pathname === '/v1/pms/reservation-group-drafts/update') return pmsReservationGroupDraftUpdateOperation;
  if (pathname === '/v1/pms/reservation-group-drafts/quote') return pmsReservationGroupQuoteOperation;
  if (pathname === '/v1/pms/reservation-group-drafts/prepare-confirm') return pmsReservationGroupPrepareConfirmOperation;
  if (pathname === '/v1/pms/reservation-group-drafts/cancel') return pmsReservationGroupDraftCancelOperation;
  return undefined;
}

export function reservationCancelOperationForPath(pathname: string): ReservationCancelWorkflowApiRequest['operation'] | undefined {
  if (pathname === '/v1/pms/reservations/cancel/prepare') return pmsReservationCancelPrepareOperation;
  return undefined;
}

export function reservationAdjustOperationForPath(pathname: string): ReservationAdjustWorkflowApiRequest['operation'] | undefined {
  if (pathname === '/v1/pms/reservations/adjust') return pmsReservationAdjustOperation;
  return undefined;
}

export function reservationCreateOperationForPath(pathname: string): ReservationCreateWorkflowApiRequest['operation'] | undefined {
  if (pathname === '/v1/pms/reservations/create') return pmsReservationCreateOperation;
  if (pathname === '/v1/pms/reservations/prepare-booking') return pmsReservationPrepareBookingOperation;
  if (pathname === '/v1/pms/reservation-groups/prepare-booking') return pmsReservationGroupPrepareBookingOperation;
  return undefined;
}

export function extendedCommandOperationForPath(pathname: string): PmsExtendedCommandApiRequest['operation'] | undefined {
  if (pathname === '/v1/pms/housekeeping/done') return pmsHousekeepingDoneOperation;
  if (pathname === '/v1/pms/housekeeping/inspection') return pmsHousekeepingInspectionOperation;
  if (pathname === '/v1/pms/housekeeping/rework') return pmsHousekeepingReworkOperation;
  if (pathname === '/v1/pms/maintenance/report') return pmsReportMaintenanceOperation;
  if (pathname === '/v1/pms/maintenance/done') return pmsMaintenanceDoneOperation;
  if (pathname === '/v1/pms/maintenance/restore-sellable') return pmsRestoreSellableOperation;
  return undefined;
}

export function businessDateDiff(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 1;
  return Math.ceil((end - start) / 86_400_000);
}
