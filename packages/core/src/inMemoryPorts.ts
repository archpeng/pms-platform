import {
  type AuditEntry,
  type DomainEvent,
  type HousekeepingTask,
  type MaintenanceTicket,
} from '@pms-platform/contracts';
import { type RoomAggregate } from './model.js';
import {
  type AuditRepository,
  type CorePorts,
  type DomainEventCollector,
  type HousekeepingTaskRepository,
  type IdempotencyRepository,
  type MaintenanceTicketRepository,
  type RoomRepository,
} from './ports.js';

export function createInMemoryRoomRepository(initialRooms: readonly RoomAggregate[] = []): RoomRepository {
  const rooms = new Map(initialRooms.map((room) => [room.roomId, cloneRoom(room)]));

  return {
    get(roomId) {
      const room = rooms.get(roomId);
      return room ? cloneRoom(room) : undefined;
    },
    save(room) {
      rooms.set(room.roomId, cloneRoom(room));
    },
    list() {
      return Array.from(rooms.values(), cloneRoom);
    },
  };
}

export function createInMemoryHousekeepingTaskRepository(
  initialTasks: readonly HousekeepingTask[] = [],
): HousekeepingTaskRepository {
  const tasks = new Map(initialTasks.map((task) => [task.taskId, cloneHousekeepingTask(task)]));

  return {
    get(taskId) {
      const task = tasks.get(taskId);
      return task ? cloneHousekeepingTask(task) : undefined;
    },
    save(task) {
      tasks.set(task.taskId, cloneHousekeepingTask(task));
    },
    list() {
      return Array.from(tasks.values(), cloneHousekeepingTask);
    },
  };
}

export function createInMemoryMaintenanceTicketRepository(
  initialTickets: readonly MaintenanceTicket[] = [],
): MaintenanceTicketRepository {
  const tickets = new Map(initialTickets.map((ticket) => [ticket.ticketId, cloneMaintenanceTicket(ticket)]));

  return {
    get(ticketId) {
      const ticket = tickets.get(ticketId);
      return ticket ? cloneMaintenanceTicket(ticket) : undefined;
    },
    save(ticket) {
      tickets.set(ticket.ticketId, cloneMaintenanceTicket(ticket));
    },
    list() {
      return Array.from(tickets.values(), cloneMaintenanceTicket);
    },
  };
}

export function createInMemoryAuditRepository(initialEntries: readonly AuditEntry[] = []): AuditRepository {
  const entries = initialEntries.map(cloneAuditEntry);

  return {
    append(entry) {
      entries.push(cloneAuditEntry(entry));
    },
    list() {
      return entries.map(cloneAuditEntry);
    },
  };
}

export function createInMemoryIdempotencyRepository<TValue = unknown>(
  initialEntries: readonly (readonly [string, TValue])[] = [],
): IdempotencyRepository<TValue> {
  const entries = new Map<string, TValue>(initialEntries.map(([key, value]) => [key, cloneValue(value)]));

  return {
    get(idempotencyKey) {
      const value = entries.get(idempotencyKey);
      return value === undefined ? undefined : cloneValue(value);
    },
    save(idempotencyKey, value) {
      entries.set(idempotencyKey, cloneValue(value));
    },
    has(idempotencyKey) {
      return entries.has(idempotencyKey);
    },
  };
}

export function createInMemoryDomainEventCollector(initialEvents: readonly DomainEvent[] = []): DomainEventCollector {
  const events = initialEvents.map(cloneDomainEvent);

  return {
    append(event) {
      events.push(cloneDomainEvent(event));
    },
    list() {
      return events.map(cloneDomainEvent);
    },
    clear() {
      events.length = 0;
    },
  };
}

export function createInMemoryCorePorts(initialRooms: readonly RoomAggregate[] = []): CorePorts {
  return {
    rooms: createInMemoryRoomRepository(initialRooms),
    housekeepingTasks: createInMemoryHousekeepingTaskRepository(),
    maintenanceTickets: createInMemoryMaintenanceTicketRepository(),
    audits: createInMemoryAuditRepository(),
    idempotency: createInMemoryIdempotencyRepository(),
    events: createInMemoryDomainEventCollector(),
  };
}

function cloneRoom(room: RoomAggregate): RoomAggregate {
  return { ...room };
}

function cloneHousekeepingTask(task: HousekeepingTask): HousekeepingTask {
  return { ...task };
}

function cloneMaintenanceTicket(ticket: MaintenanceTicket): MaintenanceTicket {
  return { ...ticket };
}

function cloneAuditEntry(entry: AuditEntry): AuditEntry {
  return { ...entry, actor: { ...entry.actor } };
}

function cloneDomainEvent(event: DomainEvent): DomainEvent {
  if (event.type === 'RoomCheckedIn' || event.type === 'RoomCheckedOut') {
    return {
      ...event,
      actor: { ...event.actor },
      previousStatus: { ...event.previousStatus },
      nextStatus: { ...event.nextStatus },
    };
  }

  if (event.type === 'HousekeepingTaskCreated') {
    return {
      ...event,
      actor: { ...event.actor },
      task: { ...event.task },
    };
  }

  if (
    event.type === 'HousekeepingCompleted' ||
    event.type === 'HousekeepingInspectionPassed' ||
    event.type === 'HousekeepingInspectionFailed' ||
    event.type === 'HousekeepingReworkCompleted'
  ) {
    return {
      ...event,
      actor: { ...event.actor },
      previousStatus: { ...event.previousStatus },
      nextStatus: { ...event.nextStatus },
      ...(event.task ? { task: { ...event.task } } : {}),
    };
  }

  if (event.type === 'MaintenanceReported' || event.type === 'MaintenanceCompleted') {
    return {
      ...event,
      actor: { ...event.actor },
      previousStatus: { ...event.previousStatus },
      nextStatus: { ...event.nextStatus },
      ticket: { ...event.ticket },
    };
  }

  return {
    ...event,
    actor: { ...event.actor },
    previousStatus: { ...event.previousStatus },
    nextStatus: { ...event.nextStatus },
  };
}

function cloneValue<TValue>(value: TValue): TValue {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as TValue;
}
