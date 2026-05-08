import {
type MaintenanceDoneCommand,
type MaintenanceTicket,
type ReportMaintenanceCommand,
type RestoreSellableCommand
} from '@pms-platform/contracts';
import {
createMaintenanceTicket,
roomStateFromAggregate
} from '../model.js';
import { type CorePorts } from '../ports.js';
import {
type PmsCommandResult
} from '../results.js';
import { executeRoomCommand,findMaintenanceTicket,maintenanceRequiresStopSell,normalizeMaintenanceSeverity } from './roomCommandExecutor.js';
export function reportMaintenance(command: ReportMaintenanceCommand, ports: CorePorts): PmsCommandResult {
  return executeRoomCommand(command, ports, {
    nextStatus: (room) => ({
      ...roomStateFromAggregate(room).status,
      sale: maintenanceRequiresStopSell(command) ? 'outOfOrder' : room.saleStatus,
    }),
    dryRunExtras: (room) => ({
      maintenanceTicket: {
        roomId: room.roomId,
        status: 'open',
        severity: normalizeMaintenanceSeverity(command.severity),
        reason: command.note || command.meta.reason,
        stopSellRequested: maintenanceRequiresStopSell(command),
        correlationId: command.meta.correlationId,
      },
      events: ['MaintenanceReported'],
    }),
    confirm: ({ command, room, previousStatus, nextStatus, idSuffix }) => {
      const ticket = createMaintenanceTicket({
        ticketId: `ticket-maintenance-${idSuffix}`,
        roomId: room.roomId,
        status: 'open',
        severity: normalizeMaintenanceSeverity(command.severity),
        reason: command.note || command.meta.reason,
        stopSellRequested: maintenanceRequiresStopSell(command),
        correlationId: command.meta.correlationId,
        createdAt: command.meta.requestedAt,
      });
      return {
        maintenanceTicket: ticket,
        events: [
          {
            eventId: `event-maintenance-reported-${idSuffix}`,
            type: 'MaintenanceReported' as const,
            aggregateId: ticket.ticketId,
            roomId: room.roomId,
            previousStatus,
            nextStatus,
            ticket,
            occurredAt: command.meta.requestedAt,
            correlationId: command.meta.correlationId,
            idempotencyKey: command.meta.idempotencyKey,
            actor: { ...command.meta.actor },
          },
        ],
      };
    },
  });
}

export function maintenanceDone(command: MaintenanceDoneCommand, ports: CorePorts): PmsCommandResult {
  return executeRoomCommand(command, ports, {
    validate: (room) => {
      const ticket = findMaintenanceTicket(ports, room.roomId, command.ticketId);
      return ticket
        ? []
        : [{
            code: 'MAINTENANCE_TICKET_NOT_FOUND' as const,
            message: 'Open maintenance ticket was not found.',
            field: 'ticketId',
          }];
    },
    nextStatus: (room) => roomStateFromAggregate(room).status,
    dryRunExtras: (room) => {
      const ticket = findMaintenanceTicket(ports, room.roomId, command.ticketId);
      return {
        maintenanceTicket: ticket
          ? {
              ...ticket,
              status: 'resolved',
              resolvedAt: command.meta.requestedAt,
            }
          : undefined,
        events: ['MaintenanceCompleted'],
      };
    },
    confirm: ({ command, room, previousStatus, nextStatus, idSuffix }) => {
      const existingTicket = findMaintenanceTicket(ports, room.roomId, command.ticketId);
      if (!existingTicket) {
        throw new Error('Invariant violation: maintenance ticket must exist after validation succeeds.');
      }
      const ticket: MaintenanceTicket = {
        ...existingTicket,
        status: 'resolved',
        resolvedAt: command.meta.requestedAt,
      };
      return {
        maintenanceTicket: ticket,
        events: [
          {
            eventId: `event-maintenance-completed-${idSuffix}`,
            type: 'MaintenanceCompleted' as const,
            aggregateId: ticket.ticketId,
            roomId: room.roomId,
            previousStatus,
            nextStatus,
            ticket,
            occurredAt: command.meta.requestedAt,
            correlationId: command.meta.correlationId,
            idempotencyKey: command.meta.idempotencyKey,
            actor: { ...command.meta.actor },
          },
        ],
      };
    },
  });
}

export function restoreSellable(command: RestoreSellableCommand, ports: CorePorts): PmsCommandResult {
  return executeRoomCommand(command, ports, {
    validate: (room) => room.saleStatus === 'sellable'
      ? [{
          code: 'ROOM_ALREADY_SELLABLE' as const,
          message: 'Room is already sellable.',
          field: 'room.saleStatus',
        }]
      : [],
    nextStatus: (room) => ({
      ...roomStateFromAggregate(room).status,
      sale: 'sellable',
    }),
    dryRunExtras: () => ({
      events: ['RoomSellabilityRestored'],
    }),
    confirm: ({ command, room, previousStatus, nextStatus, idSuffix }) => ({
      events: [
        {
          eventId: `event-room-sellability-restored-${idSuffix}`,
          type: 'RoomSellabilityRestored' as const,
          aggregateId: room.roomId,
          roomId: room.roomId,
          previousStatus,
          nextStatus,
          occurredAt: command.meta.requestedAt,
          correlationId: command.meta.correlationId,
          idempotencyKey: command.meta.idempotencyKey,
          actor: { ...command.meta.actor },
        },
      ],
    }),
  });
}
