import {
  checkoutableOccupancyStatuses,
  pmsProjectionSchemaVersion,
  type Actor,
  type AuditEntry,
  type CheckInCommand,
  type CheckInDryRunPlan,
  type CheckOutCommand,
  type CheckOutDryRunPlan,
  type CleaningStatus,
  type CommandExecutionMode,
  type CommandProjection,
  type DashboardReadModel,
  type DomainError,
  type DomainEvent,
  type HousekeepingTask,
  type HousekeepingTaskProjection,
  type OccupancyStatus,
  type OperationLogProjection,
  type ProjectionFreshness,
  type ReadModelStatus,
  type RoomLedgerProjection,
  type RoomReadModel,
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
  readonly supportedCommandTypes: readonly (CheckInCommand['type'] | CheckOutCommand['type'])[];
  readonly supportedReadModels: readonly ['pms_get_room', 'pms_dashboard'];
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

export interface CoreCheckInDryRunPlan extends CheckInDryRunPlan {
  readonly roomNumber: string;
  readonly reason: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly requestedAt: string;
  readonly actor: Actor;
}

export interface CoreCheckInConfirmResult {
  readonly commandType: 'CHECK_IN';
  readonly roomId: string;
  readonly roomNumber: string;
  readonly previousStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
  readonly auditEntry: AuditEntry;
  readonly events: readonly DomainEvent[];
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

export type CheckInResult =
  | {
      readonly ok: true;
      readonly mode: 'dryRun';
      readonly plan: CoreCheckInDryRunPlan;
    }
  | {
      readonly ok: true;
      readonly mode: 'confirm';
      readonly result: CoreCheckInConfirmResult;
    }
  | {
      readonly ok: false;
      readonly mode: CommandExecutionMode | 'unsupported';
      readonly errors: readonly DomainError[];
    };

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
    supportedCommandTypes: ['CHECK_IN', 'CHECK_OUT'],
    supportedReadModels: ['pms_get_room', 'pms_dashboard'],
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

export function checkIn(command: CheckInCommand, ports: CorePorts): CheckInResult {
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
    const idempotentResult = ports.idempotency.get(command.meta.idempotencyKey) as CoreCheckInConfirmResult | undefined;
    if (idempotentResult) {
      return {
        ok: true,
        mode: 'confirm',
        result: idempotentResult,
      };
    }
  }

  const room = ports.rooms.get(command.roomId);
  const errors = validateCheckInDomainInput(command, room);

  if (errors.length > 0) {
    return {
      ok: false,
      mode,
      errors,
    };
  }

  if (!room) {
    throw new Error('Invariant violation: check-in room must exist after validation succeeds.');
  }

  if (command.meta.mode === 'confirm') {
    return confirmCheckIn(command, room, ports);
  }

  return dryRunCheckIn(command, room);
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

export function checkInNextStatusForRoom(room: Pick<RoomAggregate, 'cleaningStatus' | 'saleStatus'>): RoomStatus {
  return {
    occupancy: 'occupied',
    cleaning: room.cleaningStatus,
    sale: room.saleStatus,
  };
}

export function checkoutNextStatusForRoom(room: Pick<RoomAggregate, 'saleStatus'>): RoomStatus {
  return {
    occupancy: 'vacant',
    cleaning: 'dirty',
    sale: room.saleStatus,
  };
}

function dryRunCheckIn(command: CheckInCommand, room: RoomAggregate): CheckInResult {
  const currentStatus = roomStateFromAggregate(room).status;
  const nextStatus = checkInNextStatusForRoom(room);
  const warnings = command.overrideDirtyRoom && room.cleaningStatus !== 'clean' ? ['DIRTY_ROOM_OVERRIDE_APPROVED'] : [];

  return {
    ok: true,
    mode: 'dryRun',
    plan: {
      commandType: 'CHECK_IN',
      roomId: room.roomId,
      roomNumber: room.roomNumber,
      currentStatus,
      nextStatus,
      overrideDirtyRoom: command.overrideDirtyRoom === true,
      warnings,
      events: ['RoomCheckedIn'],
      reason: command.meta.reason,
      correlationId: command.meta.correlationId,
      idempotencyKey: command.meta.idempotencyKey,
      requestedAt: command.meta.requestedAt,
      actor: { ...command.meta.actor },
    },
  };
}

function confirmCheckIn(command: CheckInCommand, room: RoomAggregate, ports: CorePorts): CheckInResult {
  const previousStatus = roomStateFromAggregate(room).status;
  const nextStatus = checkInNextStatusForRoom(room);
  const idSuffix = safeIdSuffix(command.meta.idempotencyKey);
  const auditEntry: AuditEntry = {
    auditId: `audit-checkin-${idSuffix}`,
    commandType: 'CHECK_IN',
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
      eventId: `event-room-checked-in-${idSuffix}`,
      type: 'RoomCheckedIn',
      aggregateId: room.roomId,
      roomId: room.roomId,
      previousStatus,
      nextStatus,
      occurredAt: command.meta.requestedAt,
      correlationId: command.meta.correlationId,
      idempotencyKey: command.meta.idempotencyKey,
      actor: { ...command.meta.actor },
    },
  ];
  const result: CoreCheckInConfirmResult = {
    commandType: 'CHECK_IN',
    roomId: room.roomId,
    roomNumber: room.roomNumber,
    previousStatus,
    nextStatus,
    auditEntry,
    events,
  };

  ports.rooms.save({
    ...room,
    occupancyStatus: nextStatus.occupancy,
    cleaningStatus: nextStatus.cleaning,
    saleStatus: nextStatus.sale,
  });
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

export function validateCheckInDomainInput(command: CheckInCommand, room: RoomAggregate | undefined): DomainError[] {
  const errors = validateCommandMeta(command.meta);

  if (!room) {
    errors.push({
      code: 'ROOM_NOT_FOUND',
      message: 'Room was not found.',
      field: 'roomId',
    });
    return errors;
  }

  const dirtyAllowed = command.overrideDirtyRoom === true;
  if (room.occupancyStatus !== 'vacant' || room.saleStatus !== 'sellable' || (room.cleaningStatus !== 'clean' && !dirtyAllowed)) {
    errors.push({
      code: 'ROOM_NOT_CHECKIN_ELIGIBLE',
      message: 'Room is not eligible for check-in.',
      field: 'room.status',
    });
  }

  return errors;
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

export function getRoomReadModel(roomId: string, ports: CorePorts, generatedAt: string): RoomReadModel {
  const room = ports.rooms.get(roomId);
  const housekeepingTasks = ports.housekeepingTasks.list().filter((task) => task.roomId === roomId);
  const projectionFreshness = createProjectionFreshness(generatedAt, room ? 'fresh' : 'unavailable');

  return {
    schemaVersion: pmsProjectionSchemaVersion,
    generatedAt,
    summaryStatus: projectionFreshness.status,
    room: room ? roomStateFromAggregate(room) : undefined,
    activeReservation: undefined,
    housekeepingTasks,
    maintenanceTickets: [],
    projectionFreshness,
  };
}

export function getDashboardReadModel(ports: CorePorts, generatedAt: string): DashboardReadModel {
  const rooms = ports.rooms.list();
  const tasks = ports.housekeepingTasks.list();
  const projectionFreshness = createProjectionFreshness(generatedAt, 'fresh');

  return {
    schemaVersion: pmsProjectionSchemaVersion,
    generatedAt,
    summaryStatus: projectionFreshness.status,
    counts: {
      totalRooms: rooms.length,
      vacantClean: rooms.filter((room) => room.occupancyStatus === 'vacant' && room.cleaningStatus === 'clean').length,
      vacantDirty: rooms.filter((room) => room.occupancyStatus === 'vacant' && room.cleaningStatus === 'dirty').length,
      inHouse: rooms.filter((room) => room.occupancyStatus === 'occupied').length,
      dueOut: rooms.filter((room) => room.occupancyStatus === 'dueOut').length,
      stopSell: rooms.filter((room) => room.saleStatus !== 'sellable').length,
    },
    queues: {
      cleaning: tasks.filter((task) => task.status === 'pending' || task.status === 'inProgress').length,
      inspection: 0,
      pendingOperationRequests: 0,
      failedOperationRequests: 0,
    },
    projectionFreshness,
  };
}

export function buildCheckInProjection(result: CoreCheckInConfirmResult): CommandProjection {
  return buildCommandProjection({
    commandType: 'CHECK_IN',
    roomId: result.roomId,
    roomNumber: result.roomNumber,
    status: result.nextStatus,
    auditEntry: result.auditEntry,
    events: result.events,
  });
}

export function buildCheckOutProjection(result: CoreCheckOutConfirmResult): CommandProjection {
  return buildCommandProjection({
    commandType: 'CHECK_OUT',
    roomId: result.roomId,
    roomNumber: result.roomNumber,
    status: result.nextStatus,
    auditEntry: result.auditEntry,
    events: result.events,
    housekeepingTask: result.housekeepingTask,
  });
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

function createProjectionFreshness(generatedAt: string, status: ReadModelStatus): ProjectionFreshness {
  return {
    status,
    generatedAt,
    note: status === 'fresh' ? 'pms-read-model-current' : 'room-not-found',
  };
}

function buildCommandProjection(input: {
  readonly commandType: 'CHECK_IN' | 'CHECK_OUT';
  readonly roomId: string;
  readonly roomNumber: string;
  readonly status: RoomStatus;
  readonly auditEntry: AuditEntry;
  readonly events: readonly DomainEvent[];
  readonly housekeepingTask?: HousekeepingTask;
}): CommandProjection {
  const roomLedger: RoomLedgerProjection = {
    schemaVersion: pmsProjectionSchemaVersion,
    roomId: input.roomId,
    roomNumber: input.roomNumber,
    status: { ...input.status },
    roomCode: deriveRoomCode({
      roomNumber: input.roomNumber,
      occupancyStatus: input.status.occupancy,
      cleaningStatus: input.status.cleaning,
      saleStatus: input.status.sale,
    }),
    lastActor: { ...input.auditEntry.actor },
    lastReason: input.auditEntry.reason,
    lastUpdatedAt: input.auditEntry.occurredAt,
  };
  const housekeepingTask: HousekeepingTaskProjection | undefined = input.housekeepingTask
    ? { ...input.housekeepingTask }
    : undefined;
  const operationLog: OperationLogProjection = {
    auditId: input.auditEntry.auditId,
    commandType: input.commandType,
    roomId: input.auditEntry.roomId,
    actor: { ...input.auditEntry.actor },
    source: input.auditEntry.source,
    reason: input.auditEntry.reason,
    idempotencyKey: input.auditEntry.idempotencyKey,
    correlationId: input.auditEntry.correlationId,
    occurredAt: input.auditEntry.occurredAt,
    domainEventTypes: input.events.map((event) => event.type),
  };

  return {
    schemaVersion: pmsProjectionSchemaVersion,
    commandType: input.commandType,
    mode: 'confirm',
    correlationId: input.auditEntry.correlationId,
    idempotencyKey: input.auditEntry.idempotencyKey,
    roomLedger,
    ...(housekeepingTask ? { housekeepingTask } : {}),
    operationLog,
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
  if (event.type === 'RoomCheckedIn' || event.type === 'RoomCheckedOut') {
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
