import {
  getPmsCapabilityManifest,
  pmsAvailabilitySearchOperation,
  pmsCapabilityManifestOperation,
  pmsCheckInOperation,
  pmsCheckOutOperation,
  pmsDashboardOperation,
  pmsGetRoomOperation,
  pmsHotelProfileOperation,
  pmsHousekeepingDoneOperation,
  pmsHousekeepingInspectionOperation,
  pmsHousekeepingReworkOperation,
  pmsInventoryIntervalsOperation,
  pmsInventorySummaryOperation,
  pmsMaintenanceDoneOperation,
  pmsOperationRequestCreateOperation,
  pmsOperationRequestGetOperation,
  pmsOperationRequestListOperation,
  pmsOperationRequestUpdateOperation,
  pmsPendingActionCancelOperation,
  pmsPendingActionConfirmOperation,
  pmsPendingActionStatusOperation,
  pmsReportMaintenanceOperation,
  pmsReservationDraftCancelOperation,
  pmsReservationDraftCreateOperation,
  pmsReservationDraftUpdateOperation,
  pmsReservationGetOperation,
  pmsReservationGroupDraftCancelOperation,
  pmsReservationGroupDraftCreateOperation,
  pmsReservationGroupDraftUpdateOperation,
  pmsReservationGroupPrepareConfirmOperation,
  pmsReservationGroupQuoteOperation,
  pmsReservationPrepareConfirmOperation,
  pmsReservationQuoteOperation,
  pmsRestoreSellableOperation,
  pmsRoomReservationContextOperation,
  pmsRoomTypeCatalogOperation,
  pmsTodayArrivalsOperation,
  pmsTodayDeparturesOperation,
} from '../index.js';
import { writeJson } from './httpJson.js';
import type { PmsLocalRouteContext } from './httpRouteTypes.js';
import type { resolveAuth } from './httpAuth.js';

export function handleHealthRoute(context: PmsLocalRouteContext, auth: ReturnType<typeof resolveAuth>): boolean {
  const { request,response,url,options } = context;
  if (request.method !== 'GET' || url.pathname !== '/health') return false;
  writeJson(response, 200, {
    ok: true,
    service: 'pms-platform',
    boundary: 'pms-checkout-local-sandbox',
    operation: pmsCheckOutOperation,
    operations: [
      pmsCheckInOperation,
      pmsCheckOutOperation,
      pmsHousekeepingDoneOperation,
      pmsHousekeepingInspectionOperation,
      pmsHousekeepingReworkOperation,
      pmsReportMaintenanceOperation,
      pmsMaintenanceDoneOperation,
      pmsRestoreSellableOperation,
      pmsGetRoomOperation,
      pmsDashboardOperation,
      pmsHotelProfileOperation,
      pmsRoomTypeCatalogOperation,
      pmsReservationGetOperation,
      pmsTodayArrivalsOperation,
      pmsTodayDeparturesOperation,
      pmsRoomReservationContextOperation,
      pmsInventoryIntervalsOperation,
      pmsInventorySummaryOperation,
      pmsAvailabilitySearchOperation,
      pmsReservationDraftCreateOperation,
      pmsReservationDraftUpdateOperation,
      pmsReservationQuoteOperation,
      pmsReservationPrepareConfirmOperation,
      pmsReservationDraftCancelOperation,
      pmsReservationGroupDraftCreateOperation,
      pmsReservationGroupDraftUpdateOperation,
      pmsReservationGroupQuoteOperation,
      pmsReservationGroupPrepareConfirmOperation,
      pmsReservationGroupDraftCancelOperation,
      pmsOperationRequestCreateOperation,
      pmsOperationRequestGetOperation,
      pmsOperationRequestListOperation,
      pmsOperationRequestUpdateOperation,
      pmsPendingActionStatusOperation,
      pmsPendingActionConfirmOperation,
      pmsPendingActionCancelOperation,
      pmsCapabilityManifestOperation,
    ],
    storage: options.store.storage,
    auth: {
      type: 'bearer-token',
      envName: auth.envName,
      configured: Boolean(auth.token),
      required: auth.required,
    },
    ...(options.projectionDispatcher ? { projectionDispatcher: options.projectionDispatcher } : {}),
  });
  return true;
}

export function handleCapabilityManifestRoute(context: PmsLocalRouteContext): boolean {
  const { request,response,url } = context;
  if (request.method !== 'GET' || url.pathname !== '/v1/pms/capabilities/manifest') return false;
  writeJson(response, 200, {
    ok: true,
    operation: pmsCapabilityManifestOperation,
    manifest: getPmsCapabilityManifest(),
  });
  return true;
}
