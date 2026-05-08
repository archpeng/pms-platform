import {
  type InventoryBlock,
  type MaintenanceTicket,
} from '@pms-platform/contracts';
import {
  InventoryBlockRow,
  inventoryBlockFromRow,
  normalizeBusinessDate,
} from './model.js';
import { SqliteSandboxReservationStore } from './reservationStore.js';

export abstract class SqliteSandboxInventoryBlockStore extends SqliteSandboxReservationStore {
  protected listInventoryBlocks(roomId?: string): InventoryBlock[] {
    const rows = roomId
      ? (this.db
          .prepare(
            'SELECT * FROM inventory_blocks WHERE room_id = ? ORDER BY start_date, block_id',
          )
          .all(roomId) as unknown as InventoryBlockRow[])
      : (this.db
          .prepare(
            'SELECT * FROM inventory_blocks ORDER BY start_date, block_id',
          )
          .all() as unknown as InventoryBlockRow[]);
    return rows.map(inventoryBlockFromRow);
  }

  protected getInventoryBlockBySource(
    sourceType: InventoryBlock['sourceType'],
    sourceId: string,
    roomId: string,
    blockType: InventoryBlock['blockType'],
  ): InventoryBlock | undefined {
    const row = this.db
      .prepare(
        'SELECT * FROM inventory_blocks WHERE source_type = ? AND source_id = ? AND room_id = ? AND block_type = ?',
      )
      .get(sourceType, sourceId, roomId, blockType) as
      | InventoryBlockRow
      | undefined;
    return row ? inventoryBlockFromRow(row) : undefined;
  }

  protected upsertInventoryBlock(block: InventoryBlock): void {
    this.db
      .prepare(
        `
          INSERT INTO inventory_blocks (
            block_id, property_id, room_id, room_type_id, block_type, start_date, end_date, status,
            source_type, source_id, reason, created_at, updated_at, closed_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_type, source_id, room_id, block_type) DO UPDATE SET
            property_id = excluded.property_id,
            room_type_id = excluded.room_type_id,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            status = excluded.status,
            reason = excluded.reason,
            updated_at = excluded.updated_at,
            closed_at = excluded.closed_at
        `,
      )
      .run(
        block.blockId,
        block.propertyId,
        block.roomId,
        block.roomTypeId ?? null,
        block.blockType,
        block.startDate,
        block.endDate ?? null,
        block.status,
        block.sourceType,
        block.sourceId,
        block.reason,
        block.createdAt,
        block.updatedAt,
        block.closedAt ?? null,
      );
    this.inventoryDirty = true;
  }

  protected upsertMaintenanceInventoryBlock(ticket: MaintenanceTicket): void {
    if (!ticket.stopSellRequested) {
      return;
    }
    const existing = this.getInventoryBlockBySource(
      'maintenance_ticket',
      ticket.ticketId,
      ticket.roomId,
      'repair',
    );
    if (existing?.status === 'closed') {
      return;
    }
    const room = this.getRoom(ticket.roomId);
    const timestamp = this.now();
    this.upsertInventoryBlock({
      blockId: existing?.blockId ?? `block-${ticket.ticketId}`,
      propertyId: room?.propertyId ?? 'property-small-hotel',
      roomId: ticket.roomId,
      ...(room?.roomTypeId ? { roomTypeId: room.roomTypeId } : {}),
      blockType: 'repair',
      startDate: normalizeBusinessDate(ticket.createdAt),
      status: 'active',
      sourceType: 'maintenance_ticket',
      sourceId: ticket.ticketId,
      reason: ticket.reason,
      createdAt: existing?.createdAt ?? ticket.createdAt,
      updatedAt: timestamp,
    });
  }

  protected closeActiveStopSellBlocks(roomId: string, timestamp: string): void {
    const closeDate = normalizeBusinessDate(timestamp);
    const result = this.db
      .prepare(
        `
          UPDATE inventory_blocks
          SET status = 'closed', end_date = ?, closed_at = ?, updated_at = ?
          WHERE room_id = ? AND status = 'active' AND block_type = 'repair' AND source_type = 'maintenance_ticket'
        `,
      )
      .run(closeDate, timestamp, timestamp, roomId);
    if (result.changes > 0) {
      this.inventoryDirty = true;
    }
  }
}
