import {
pmsSandboxStateVersion,
type PmsSandboxReadback
} from '../localSandbox.js';
import {
cloneValue,
requestModeFromRecord,
requestOperationFromRecord
} from './model.js';
import { SqliteSandboxOperationRequestStore } from './operationRequestStore.js';
import { deriveProjectionOutboxEntries } from './projectionOutbox.js';

export abstract class SqliteSandboxReadbackStore extends SqliteSandboxOperationRequestStore {
  readback(roomId?: string): PmsSandboxReadback {
    const horizon = this.rebuildInventory({ roomId });
    const properties = this.listProperties();
    const roomTypes = this.listRoomTypes();
    const rooms = roomId ? this.getRoomsByRoomId(roomId) : this.listRooms();
    const roomIds = new Set(rooms.map((room) => room.roomId));
    const reservations = roomId ? this.listReservationsByRoomIds(roomIds) : this.listReservations();
    const reservationAllocations = roomId ? this.listReservationAllocationsByRoomIds(roomIds) : this.listReservationAllocations();
    const stays = roomId ? this.listStaysByRoomIds(roomIds) : this.listStays();
    const housekeepingTasks = roomId ? this.listHousekeepingTasksByRoomIds(roomIds) : this.listHousekeepingTasks();
    const maintenanceTickets = roomId ? this.listMaintenanceTicketsByRoomIds(roomIds) : this.listMaintenanceTickets();
    const reservationDrafts = this.listReservationDrafts();
    const reservationGroupDrafts = this.listReservationGroupDrafts();
    const reservationDraftAudits = this.listReservationDraftAudits();
    const reservationGroupDraftAudits = this.listReservationGroupDraftAudits();
    const operationRequests = roomId ? this.listOperationRequestsByRoomIds(roomIds) : this.listOperationRequestRecords();
    const audits = roomId ? this.listAuditsByRoomIds(roomIds) : this.listAudits();
    const domainEvents = roomId ? this.listDomainEventsByRoomIds(roomIds) : this.listDomainEvents();
    const idempotencyRecords = this.listApiIdempotencyRecords().map((record) => ({
      operation: requestOperationFromRecord(record),
      mode: requestModeFromRecord(record),
      idempotencyKey: record.idempotencyKey,
      requestFingerprint: record.requestFingerprint,
      ok: record.response.ok,
    }));
    const projectionOutbox = deriveProjectionOutboxEntries({
      domainEvents,
      reservations,
      reservationDraftAudits,
      reservationGroupDraftAudits,
      operationRequests,
      idempotencyRecords,
      generatedAt: this.now(),
    });

    return {
      ok: true,
      service: 'pms-platform',
      stateVersion: pmsSandboxStateVersion,
      generatedAt: this.now(),
      storage: this.storage,
      filter: roomId ? { roomId } : {},
      properties: cloneValue(properties),
      roomTypes: cloneValue(roomTypes),
      rooms: cloneValue(rooms),
      reservations: cloneValue(reservations),
      reservationAllocations: cloneValue(reservationAllocations),
      stays: cloneValue(stays),
      inventoryBlocks: cloneValue(horizon.blocks),
      inventoryDayRooms: cloneValue(horizon.dayRooms),
      inventoryIntervalProjection: cloneValue(horizon.intervals),
      inventorySummaryDayType: cloneValue(horizon.summaries),
      reservationDrafts: cloneValue(reservationDrafts),
      reservationGroupDrafts: cloneValue(reservationGroupDrafts),
      reservationDraftAudits: cloneValue(reservationDraftAudits),
      reservationGroupDraftAudits: cloneValue(reservationGroupDraftAudits),
      operationRequests: cloneValue(operationRequests),
      housekeepingTasks: cloneValue(housekeepingTasks),
      maintenanceTickets: cloneValue(maintenanceTickets),
      audits: cloneValue(audits),
      domainEvents: cloneValue(domainEvents),
      projectionOutbox: cloneValue(projectionOutbox),
      idempotencyRecords: cloneValue(idempotencyRecords),
    };
  }
}
