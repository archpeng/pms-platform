import {
  checkoutableOccupancyStatuses,
  type Actor,
  type AuditEntry,
  type CheckOutCommand,
  type CheckOutDryRunPlan,
  type CleaningStatus,
  type CommandExecutionMode,
  type DomainError,
  type DomainEvent,
  type HousekeepingTask,
  type OccupancyStatus,
  type RoomState,
  type RoomStatus,
  type SaleStatus,
  validateCommandMeta,
} from '@pms-platform/contracts';

export const corePackageName = '@pms-platform/core';

export interface RoomAggregate {
  readonly roomId: string;
  readonly roomNumber: string;
  readonly occupancyStatus: OccupancyStatus;
  readonly cleaningStatus: CleaningStatus;
  readonly saleStatus: SaleStatus;
}

export interface CoreContractBoundaryCheck {
  readonly packageName: typeof corePackageName;
  readonly supportedCommandType: CheckOutCommand['type'];
  readonly supportedExecutionModes: readonly CommandExecutionMode[];
}

export interface RoomRepository {
  get(roomId: string): RoomAggregate | undefined;
  save(room: RoomAggregate): void;
  list(): RoomAggregate[];
}

export interface HousekeepingTaskRepository {
  get(taskId: string): HousekeepingTask | undefined;
  save(task: HousekeepingTask): void;
  list(): HousekeepingTask[];
}

export interface AuditRepository {
  append(entry: AuditEntry): void;
  list(): AuditEntry[];
}

export interface IdempotencyRepository<TValue = unknown> {
  get(idempotencyKey: string): TValue | undefined;
  save(idempotencyKey: string, value: TValue): void;
  has(idempotencyKey: string): boolean;
}

export interface DomainEventCollector {
  append(event: DomainEvent): void;
  list(): DomainEvent[];
  clear(): void;
}

export interface CorePorts {
  readonly rooms: RoomRepository;
  readonly housekeepingTasks: HousekeepingTaskRepository;
  readonly audits: AuditRepository;
  readonly idempotency: IdempotencyRepository;
  readonly events: DomainEventCollector;
}

export interface CoreCheckOutDryRunPlan extends CheckOutDryRunPlan {
  readonly roomNumber: string;
  readonly reason: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly requestedAt: string;
  readonly actor: Actor;
}

export interface CoreCheckOutConfirmResult {
  readonly commandType: 'CHECK_OUT';
  readonly roomId: string;
  readonly roomNumber: string;
  readonly previousStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
  readonly housekeepingTask: HousekeepingTask;
  readonly auditEntry: AuditEntry;
  readonly events: readonly DomainEvent[];
}

export type CheckOutResult =
  | {
      readonly ok: true;
      readonly mode: 'dryRun';
      readonly plan: CoreCheckOutDryRunPlan;
    }
  | {
      readonly ok: true;
      readonly mode: 'confirm';
      readonly result: CoreCheckOutConfirmResult;
    }
  | {
      readonly ok: false;
      readonly mode: CommandExecutionMode | 'unsupported';
      readonly errors: readonly DomainError[];
    };

export const supportedOccupancyStatuses: readonly OccupancyStatus[] = ['occupied', 'dueOut', 'vacant'];
export const supportedCleaningStatuses: readonly CleaningStatus[] = ['clean', 'dirty'];
export const supportedSaleStatuses: readonly SaleStatus[] = ['sellable', 'outOfOrder', 'outOfService'];
export const supportedExecutionModes: readonly CommandExecutionMode[] = ['dryRun', 'confirm'];

export function describeCoreContractBoundary(): CoreContractBoundaryCheck {
  return {
    packageName: corePackageName,
    supportedCommandType: 'CHECK_OUT',
    supportedExecutionModes,
  };
}

export function deriveRoomCode(room: Pick<RoomAggregate, 'roomNumber' | 'occupancyStatus' | 'cleaningStatus' | 'saleStatus'>): string {
  return [room.roomNumber, room.occupancyStatus, room.cleaningStatus, room.saleStatus].join(':');
}

export function roomAggregateFromState(state: RoomState): RoomAggregate {
  return {
    roomId: state.roomId,
    roomNumber: state.roomNumber,
    occupancyStatus: state.status.occupancy,
    cleaningStatus: state.status.cleaning,
    saleStatus: state.status.sale,
  };
}

export function roomStateFromAggregate(room: RoomAggregate): RoomState {
  return {
    roomId: room.roomId,
    roomNumber: room.roomNumber,
    status: {
      occupancy: room.occupancyStatus,
      cleaning: room.cleaningStatus,
      sale: room.saleStatus,
    },
  };
}

export function createCheckoutCleaningTask(input: {
  readonly taskId: string;
  readonly roomId: string;
  readonly reason: string;
  readonly correlationId: string;
  readonly createdAt: string;
}): HousekeepingTask {
  return {
    taskId: input.taskId,
    roomId: input.roomId,
    kind: 'checkout-cleaning',
    status: 'pending',
    reason: input.reason,
    correlationId: input.correlationId,
    createdAt: input.createdAt,
  };
}

export function checkOut(command: CheckOutCommand, ports: CorePorts): CheckOutResult {
  const metaErrors = validateCommandMeta(command.meta);
  const mode = command.meta?.mode === 'dryRun' || command.meta?.mode === 'confirm' ? command.meta.mode : 'unsupported';

  if (metaErrors.length > 0) {
    return {
      ok: false,
      mode,
      errors: metaErrors,
    };
  }

  if (command.meta.mode === 'confirm') {
    const idempotentResult = ports.idempotency.get(command.meta.idempotencyKey) as CoreCheckOutConfirmResult | undefined;
    if (idempotentResult) {
      return {
        ok: true,
        mode: 'confirm',
        result: idempotentResult,
      };
    }
  }

  const room = ports.rooms.get(command.roomId);
  const errors = validateCheckoutDomainInput(command, room);

  if (errors.length > 0) {
    return {
      ok: false,
      mode,
      errors,
    };
  }

  if (!room) {
    throw new Error('Invariant violation: checkout room must exist after validation succeeds.');
  }

  if (command.meta.mode === 'confirm') {
    return confirmCheckOut(command, room, ports);
  }

  return dryRunCheckOut(command, room);
}

export function checkoutNextStatusForRoom(room: Pick<RoomAggregate, 'saleStatus'>): RoomStatus {
  return {
    occupancy: 'vacant',
    cleaning: 'dirty',
    sale: room.saleStatus,
  };
}

function dryRunCheckOut(command: CheckOutCommand, room: RoomAggregate): CheckOutResult {
  const currentStatus = roomStateFromAggregate(room).status;
  const nextStatus = checkoutNextStatusForRoom(room);
  const housekeepingTask = {
    roomId: room.roomId,
    kind: 'checkout-cleaning' as const,
    status: 'pending' as const,
    reason: command.meta.reason,
    correlationId: command.meta.correlationId,
  };

  return {
    ok: true,
    mode: 'dryRun',
    plan: {
      commandType: 'CHECK_OUT',
      roomId: room.roomId,
      roomNumber: room.roomNumber,
      currentStatus,
      nextStatus,
      housekeepingTask,
      events: ['RoomCheckedOut', 'HousekeepingTaskCreated'],
      reason: command.meta.reason,
      correlationId: command.meta.correlationId,
      idempotencyKey: command.meta.idempotencyKey,
      requestedAt: command.meta.requestedAt,
      actor: { ...command.meta.actor },
    },
  };
}

function confirmCheckOut(command: CheckOutCommand, room: RoomAggregate, ports: CorePorts): CheckOutResult {
  const previousStatus = roomStateFromAggregate(room).status;
  const nextStatus = checkoutNextStatusForRoom(room);
  const idSuffix = safeIdSuffix(command.meta.idempotencyKey);
  const task = createCheckoutCleaningTask({
    taskId: `task-checkout-${idSuffix}`,
    roomId: room.roomId,
    reason: command.meta.reason,
    correlationId: command.meta.correlationId,
    createdAt: command.meta.requestedAt,
  });
  const auditEntry: AuditEntry = {
    auditId: `audit-checkout-${idSuffix}`,
    commandType: 'CHECK_OUT',
    roomId: room.roomId,
    actor: { ...command.meta.actor },
    source: command.meta.source,
    reason: command.meta.reason,
    idempotencyKey: command.meta.idempotencyKey,
    correlationId: command.meta.correlationId,
    occurredAt: command.meta.requestedAt,
  };
  const events: readonly DomainEvent[] = [
    {
      eventId: `event-room-checked-out-${idSuffix}`,
      type: 'RoomCheckedOut',
      aggregateId: room.roomId,
      roomId: room.roomId,
      previousStatus,
      nextStatus,
      occurredAt: command.meta.requestedAt,
      correlationId: command.meta.correlationId,
      idempotencyKey: command.meta.idempotencyKey,
      actor: { ...command.meta.actor },
    },
    {
      eventId: `event-housekeeping-task-created-${idSuffix}`,
      type: 'HousekeepingTaskCreated',
      aggregateId: task.taskId,
      task,
      occurredAt: command.meta.requestedAt,
      correlationId: command.meta.correlationId,
      idempotencyKey: command.meta.idempotencyKey,
      actor: { ...command.meta.actor },
    },
  ];
  const result: CoreCheckOutConfirmResult = {
    commandType: 'CHECK_OUT',
    roomId: room.roomId,
    roomNumber: room.roomNumber,
    previousStatus,
    nextStatus,
    housekeepingTask: task,
    auditEntry,
    events,
  };

  ports.rooms.save({
    ...room,
    occupancyStatus: nextStatus.occupancy,
    cleaningStatus: nextStatus.cleaning,
    saleStatus: nextStatus.sale,
  });
  ports.housekeepingTasks.save(task);
  ports.audits.append(auditEntry);
  for (const event of events) {
    ports.events.append(event);
  }
  ports.idempotency.save(command.meta.idempotencyKey, result);

  return {
    ok: true,
    mode: 'confirm',
    result,
  };
}

function safeIdSuffix(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function validateCheckoutDomainInput(command: CheckOutCommand, room: RoomAggregate | undefined): DomainError[] {
  const errors = validateCommandMeta(command.meta);

  if (!room) {
    errors.push({
      code: 'ROOM_NOT_FOUND',
      message: 'Room was not found.',
      field: 'roomId',
    });
    return errors;
  }

  if (!checkoutableOccupancyStatuses.includes(room.occupancyStatus)) {
    errors.push({
      code: 'ROOM_NOT_CHECKOUTABLE',
      message: 'Room is not in a checkoutable occupancy state.',
      field: 'room.occupancyStatus',
    });
  }

  return errors;
}

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

function cloneAuditEntry(entry: AuditEntry): AuditEntry {
  return { ...entry, actor: { ...entry.actor } };
}

function cloneDomainEvent(event: DomainEvent): DomainEvent {
  if (event.type === 'RoomCheckedOut') {
    return {
      ...event,
      actor: { ...event.actor },
      previousStatus: { ...event.previousStatus },
      nextStatus: { ...event.nextStatus },
    };
  }

  return {
    ...event,
    actor: { ...event.actor },
    task: { ...event.task },
  };
}

function cloneValue<TValue>(value: TValue): TValue {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as TValue;
}
