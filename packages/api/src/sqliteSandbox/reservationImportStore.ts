import { type ReservationReadModel } from '@pms-platform/contracts';
import { type RoomAggregate } from '@pms-platform/core';
import {
  type PmsSandboxReadback,
  type PmsSandboxReservationImportRecord,
} from '../localSandbox/model.js';
import { SqliteSandboxReservationPersistenceStore } from './reservationPersistenceStore.js';

export abstract class SqliteSandboxReservationImportStore extends SqliteSandboxReservationPersistenceStore {
  abstract readback(roomId?: string): PmsSandboxReadback;

  reset(
    seedRooms: readonly RoomAggregate[] = this.seedRooms,
    seedReservations: readonly PmsSandboxReservationImportRecord[] = this
      .seedReservations,
  ): PmsSandboxReadback {
    this.runInTransaction(() => {
      this.clearBusinessTables();
      this.seedCatalogFromRooms(seedRooms);
      for (const room of seedRooms) {
        this.saveRoom(room);
      }
      this.importReservations(seedReservations);
    });
    return this.readback();
  }

  importReservations(
    reservations: readonly PmsSandboxReservationImportRecord[],
  ) {
    return this.runInTransaction(() => {
      const imported: ReservationReadModel[] = [];
      for (const reservation of reservations) {
        imported.push(this.saveReservationImportRecord(reservation));
      }
      return {
        importedCount: imported.length,
        reservations: imported,
      };
    });
  }
}
