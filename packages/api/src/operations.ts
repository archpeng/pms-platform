import {
  pendingActionCancelOperationName,
  pendingActionConfirmOperationName,
  pendingActionStatusOperationName,
  reservationCancelPrepareOperationName,
  reservationDraftCancelOperationName,
  reservationDraftCreateOperationName,
  reservationDraftUpdateOperationName,
  reservationGroupDraftCancelOperationName,
  reservationGroupDraftCreateOperationName,
  reservationGroupDraftUpdateOperationName,
  reservationGroupPrepareConfirmOperationName,
  reservationGroupQuoteOperationName,
  reservationPrepareConfirmOperationName,
  reservationQuoteOperationName,
  type PendingActionCallbackOperation,
  type ReservationCancelWorkflowOperation,
  type ReservationDraftWorkflowOperation,
  type ReservationGroupDraftWorkflowOperation,
} from '@pms-platform/contracts';

export const apiPackageName = '@pms-platform/api';
export const pmsCheckInOperation = 'pms_check_in';
export const pmsCheckOutOperation = 'pms_check_out';
export const pmsHousekeepingDoneOperation = 'pms_housekeeping_done';
export const pmsHousekeepingInspectionOperation = 'pms_housekeeping_inspection';
export const pmsHousekeepingReworkOperation = 'pms_housekeeping_rework';
export const pmsReportMaintenanceOperation = 'pms_report_maintenance';
export const pmsMaintenanceDoneOperation = 'pms_maintenance_done';
export const pmsRestoreSellableOperation = 'pms_restore_sellable';
export const pmsGetRoomOperation = 'pms_get_room';
export const pmsDashboardOperation = 'pms_dashboard';
export const pmsReservationGetOperation = 'pms_reservation_get';
export const pmsTodayArrivalsOperation = 'pms_today_arrivals';
export const pmsTodayDeparturesOperation = 'pms_today_departures';
export const pmsRoomReservationContextOperation = 'pms_room_reservation_context';
export const pmsInventoryIntervalsOperation = 'pms_inventory_intervals';
export const pmsInventorySummaryOperation = 'pms_inventory_summary';
export const pmsAvailabilitySearchOperation = 'pms_availability_search';
export const pmsHotelProfileOperation = 'pms_hotel_profile';
export const pmsRoomTypeCatalogOperation = 'pms_room_type_catalog';
export const pmsReservationDraftCreateOperation = reservationDraftCreateOperationName;
export const pmsReservationDraftUpdateOperation = reservationDraftUpdateOperationName;
export const pmsReservationQuoteOperation = reservationQuoteOperationName;
export const pmsReservationPrepareConfirmOperation = reservationPrepareConfirmOperationName;
export const pmsReservationDraftCancelOperation = reservationDraftCancelOperationName;
export const pmsReservationGroupDraftCreateOperation = reservationGroupDraftCreateOperationName;
export const pmsReservationGroupDraftUpdateOperation = reservationGroupDraftUpdateOperationName;
export const pmsReservationGroupQuoteOperation = reservationGroupQuoteOperationName;
export const pmsReservationGroupPrepareConfirmOperation = reservationGroupPrepareConfirmOperationName;
export const pmsReservationGroupDraftCancelOperation = reservationGroupDraftCancelOperationName;
export const pmsReservationCancelPrepareOperation = reservationCancelPrepareOperationName;
export const pmsPendingActionStatusOperation = pendingActionStatusOperationName;
export const pmsPendingActionConfirmOperation = pendingActionConfirmOperationName;
export const pmsPendingActionCancelOperation = pendingActionCancelOperationName;
export const pmsOperationRequestCreateOperation = 'pms_operation_request_create';
export const pmsOperationRequestGetOperation = 'pms_operation_request_get';
export const pmsOperationRequestListOperation = 'pms_operation_request_list';
export const pmsOperationRequestUpdateOperation = 'pms_operation_request_update';
export const pmsCapabilityManifestOperation = 'pms_capabilities_manifest';

export type PmsCommandOperation =
  | typeof pmsCheckInOperation
  | typeof pmsCheckOutOperation
  | typeof pmsHousekeepingDoneOperation
  | typeof pmsHousekeepingInspectionOperation
  | typeof pmsHousekeepingReworkOperation
  | typeof pmsReportMaintenanceOperation
  | typeof pmsMaintenanceDoneOperation
  | typeof pmsRestoreSellableOperation;

export type PmsReadModelOperation =
  | typeof pmsGetRoomOperation
  | typeof pmsDashboardOperation
  | typeof pmsReservationGetOperation
  | typeof pmsTodayArrivalsOperation
  | typeof pmsTodayDeparturesOperation
  | typeof pmsRoomReservationContextOperation
  | typeof pmsInventoryIntervalsOperation
  | typeof pmsInventorySummaryOperation
  | typeof pmsAvailabilitySearchOperation
  | typeof pmsHotelProfileOperation
  | typeof pmsRoomTypeCatalogOperation;

export type PmsApiMode = 'dryRun' | 'confirm';
export type CheckOutApiMode = PmsApiMode;
export type PmsReservationDraftWorkflowOperation = ReservationDraftWorkflowOperation;
export type PmsReservationGroupDraftWorkflowOperation = ReservationGroupDraftWorkflowOperation;
export type PmsReservationCancelWorkflowOperation = ReservationCancelWorkflowOperation;
export type PmsPendingActionOperation = PendingActionCallbackOperation;
export type PmsOperationRequestOperation =
  | typeof pmsOperationRequestCreateOperation
  | typeof pmsOperationRequestGetOperation
  | typeof pmsOperationRequestListOperation
  | typeof pmsOperationRequestUpdateOperation;
