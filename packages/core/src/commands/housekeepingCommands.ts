import {
type HousekeepingDoneCommand,
type HousekeepingInspectionCommand,
type HousekeepingMarkDirtyCommand,
type HousekeepingReworkCommand
} from '@pms-platform/contracts';
import {
createHousekeepingTask,
roomStateFromAggregate
} from '../model.js';
import { type CorePorts } from '../ports.js';
import {
type PmsCommandResult
} from '../results.js';
import { completeHousekeepingTask,executeRoomCommand,findActiveHousekeepingTaskForRoom } from './roomCommandExecutor.js';
export function housekeepingDone(command: HousekeepingDoneCommand, ports: CorePorts): PmsCommandResult {
  return executeRoomCommand(command, ports, {
    nextStatus: (room) => ({
      ...roomStateFromAggregate(room).status,
      cleaning: command.inspectionRequired === true ? 'inspection' : 'clean',
    }),
    dryRunExtras: (room) => ({
      housekeepingTask: {
        roomId: room.roomId,
        kind: 'room-cleaning',
        status: command.inspectionRequired === true ? 'inspection' : 'done',
        reason: command.meta.reason,
        correlationId: command.meta.correlationId,
        ...(command.inspectionRequired === true ? {} : { completedAt: command.meta.requestedAt }),
      },
      events: ['HousekeepingCompleted'],
    }),
    confirm: ({ command, room, previousStatus, nextStatus, idSuffix }) => {
      const existingTask = findActiveHousekeepingTaskForRoom(ports, room.roomId);
      const task = completeHousekeepingTask(
        existingTask ?? createHousekeepingTask({
          taskId: `task-housekeeping-${idSuffix}`,
          roomId: room.roomId,
          kind: 'room-cleaning',
          status: 'inProgress',
          reason: command.meta.reason,
          correlationId: command.meta.correlationId,
          createdAt: command.meta.requestedAt,
        }),
        nextStatus.cleaning,
        command.meta.requestedAt,
      );
      return {
        housekeepingTask: task,
        events: [
          {
            eventId: `event-housekeeping-completed-${idSuffix}`,
            type: 'HousekeepingCompleted' as const,
            aggregateId: room.roomId,
            roomId: room.roomId,
            previousStatus,
            nextStatus,
            task,
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

export function housekeepingInspection(command: HousekeepingInspectionCommand, ports: CorePorts): PmsCommandResult {
  return executeRoomCommand(command, ports, {
    nextStatus: (room) => ({
      ...roomStateFromAggregate(room).status,
      cleaning: command.result === 'pass' ? 'clean' : 'rework',
    }),
    dryRunExtras: (room) => ({
      housekeepingTask: {
        roomId: room.roomId,
        kind: 'room-cleaning',
        status: command.result === 'pass' ? 'done' : 'rework',
        reason: command.meta.reason,
        correlationId: command.meta.correlationId,
        ...(command.result === 'pass' ? { completedAt: command.meta.requestedAt } : {}),
      },
      events: [command.result === 'pass' ? 'HousekeepingInspectionPassed' : 'HousekeepingInspectionFailed'],
    }),
    confirm: ({ command, room, previousStatus, nextStatus, idSuffix }) => {
      const existingTask = command.taskId ? ports.housekeepingTasks.get(command.taskId) : findActiveHousekeepingTaskForRoom(ports, room.roomId);
      const task = completeHousekeepingTask(
        existingTask ?? createHousekeepingTask({
          taskId: `task-inspection-${idSuffix}`,
          roomId: room.roomId,
          kind: 'room-cleaning',
          status: 'inspection',
          reason: command.meta.reason,
          correlationId: command.meta.correlationId,
          createdAt: command.meta.requestedAt,
        }),
        nextStatus.cleaning,
        command.meta.requestedAt,
      );
      const type = command.result === 'pass' ? 'HousekeepingInspectionPassed' : 'HousekeepingInspectionFailed';
      return {
        housekeepingTask: task,
        events: [
          {
            eventId: `event-housekeeping-inspection-${idSuffix}`,
            type,
            aggregateId: room.roomId,
            roomId: room.roomId,
            previousStatus,
            nextStatus,
            task,
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

export function housekeepingRework(command: HousekeepingReworkCommand, ports: CorePorts): PmsCommandResult {
  return executeRoomCommand(command, ports, {
    nextStatus: (room) => ({
      ...roomStateFromAggregate(room).status,
      cleaning: command.inspectionRequired === true ? 'inspection' : 'clean',
    }),
    dryRunExtras: (room) => ({
      housekeepingTask: {
        roomId: room.roomId,
        kind: 'rework-cleaning',
        status: command.inspectionRequired === true ? 'inspection' : 'done',
        reason: command.meta.reason,
        correlationId: command.meta.correlationId,
        ...(command.inspectionRequired === true ? {} : { completedAt: command.meta.requestedAt }),
      },
      events: ['HousekeepingReworkCompleted'],
    }),
    confirm: ({ command, room, previousStatus, nextStatus, idSuffix }) => {
      const existingTask = command.taskId ? ports.housekeepingTasks.get(command.taskId) : findActiveHousekeepingTaskForRoom(ports, room.roomId);
      const task = completeHousekeepingTask(
        existingTask ?? createHousekeepingTask({
          taskId: `task-rework-${idSuffix}`,
          roomId: room.roomId,
          kind: 'rework-cleaning',
          status: 'rework',
          reason: command.meta.reason,
          correlationId: command.meta.correlationId,
          createdAt: command.meta.requestedAt,
        }),
        nextStatus.cleaning,
        command.meta.requestedAt,
      );
      return {
        housekeepingTask: task,
        events: [
          {
            eventId: `event-housekeeping-rework-completed-${idSuffix}`,
            type: 'HousekeepingReworkCompleted' as const,
            aggregateId: room.roomId,
            roomId: room.roomId,
            previousStatus,
            nextStatus,
            task,
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

// Adhoc operator transition `clean → dirty` (e.g. staff spots an issue after cleaning has finished).
// Only a currently-clean room may be marked dirty; the inverse (dirty → clean) belongs to
// housekeeping_done. Emits a HousekeepingMarkedDirty event for audit; creates no new task because the
// follow-up cleanup will arrive via the normal housekeeping_done flow.
export function housekeepingMarkDirty(command: HousekeepingMarkDirtyCommand, ports: CorePorts): PmsCommandResult {
  return executeRoomCommand(command, ports, {
    validate: (room) => {
      const current = roomStateFromAggregate(room).status.cleaning;
      return current === 'clean'
        ? []
        : [{ code: 'ROOM_NOT_MARK_DIRTY_ELIGIBLE', message: '只有「干净」状态的房间可以手动标记为脏房。', field: 'cleaning' }];
    },
    nextStatus: (room) => ({ ...roomStateFromAggregate(room).status, cleaning: 'dirty' }),
    dryRunExtras: () => ({ events: ['HousekeepingMarkedDirty'] }),
    confirm: ({ room, previousStatus, nextStatus, idSuffix, command }) => ({
      events: [
        {
          eventId: `event-housekeeping-marked-dirty-${idSuffix}`,
          type: 'HousekeepingMarkedDirty' as const,
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
