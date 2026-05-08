import { pmsBaseProjectionSchemaVersion, type HotelProfile, type PmsBaseTableSpec } from './schema.js';
import { dateTimeField, hiddenCanonicalIdField, linkedRecordField, longTextField, selectField, textField } from './fields.js';

export function roomLedgerTable(profile: HotelProfile): PmsBaseTableSpec {
  return {
    logicalName: 'RoomLedger',
    displayName: '房态台账',
    fields: [
      hiddenCanonicalIdField(),
      textField('roomNumber', '房号'),
      textField('roomType', '房型'),
      textField('zone', '区域', false),
      selectField('occupancyStatus', '入住状态', ['空房', '在住', '预离']),
      selectField('cleaningStatus', '清洁状态', ['干净', '脏房', '清洁中', '待查', '返工']),
      selectField('sellableStatus', '可售状态', ['可售', '停售维修', '停售保留', '停售业主']),
      textField('roomCode', '房态码'),
      textField('currentReservationCode', '当前预订', false),
      textField('maintenanceNote', '维修备注', false),
      textField('housekeepingTaskStatus', '保洁任务状态', false),
      textField('lastOperator', '最后操作人'),
      textField('lastReason', '最后原因'),
      dateTimeField('lastUpdatedAt', '更新时间'),
      textField('schemaVersion', '版本'),
    ],
    views: [
      { logicalName: 'frontdesk-all-rooms', displayName: '全部房态', kind: 'grid' },
      { logicalName: 'cleaning-queue', displayName: '保洁队列', kind: 'grid', filterHint: '清洁状态 in 脏房,清洁中,待查,返工' },
      { logicalName: 'maintenance-stop-sell', displayName: '停售维修', kind: 'grid', filterHint: '可售状态 = 停售维修' },
    ],
    seedRecords: profile.rooms.map((room) => ({
      logicalKey: `room:${room.roomNumber}`,
      fields: {
        后端ID: `room:${room.roomNumber}`,
        房号: room.roomNumber,
        房型: room.roomType,
        区域: room.zone,
        入住状态: room.initialStatus.occupancyStatus,
        清洁状态: room.initialStatus.cleaningStatus,
        可售状态: room.initialStatus.sellableStatus,
        房态码: `${room.roomNumber}:${room.initialStatus.occupancyStatus}:${room.initialStatus.cleaningStatus}:${room.initialStatus.sellableStatus}`,
        当前预订: null,
        维修备注: null,
        保洁任务状态: null,
        最后操作人: 'provisioning-seed',
        最后原因: '初始种子房间',
        更新时间: '2026-04-28T00:00:00.000Z',
        版本: pmsBaseProjectionSchemaVersion,
      },
    })),
  };
}

export function operationRequestsTable(profile: HotelProfile): PmsBaseTableSpec {
  return {
    logicalName: 'OperationRequests',
    displayName: 'PMS操作请求',
    fields: [
      hiddenCanonicalIdField(),
      textField('clientToken', '请求令牌'),
      selectField('action', '操作类型', ['CHECK_IN', 'CHECK_OUT', 'HOUSEKEEPING_DONE', 'HOUSEKEEPING_INSPECTION', 'HOUSEKEEPING_REWORK', 'REPORT_MAINTENANCE', 'MAINTENANCE_DONE', 'RESTORE_SELLABLE', 'RESERVATION_WORKFLOW', 'RESERVATION_GROUP_WORKFLOW']),
      selectField('status', '操作状态', ['待处理', '待确认', '处理中', '已完成', '失败', '需人工复核', '已过期', '已取消', '重复忽略']),
      textField('roomNumber', '房号'),
      textField('operator', '操作人'),
      textField('reason', '原因'),
      dateTimeField('requestedAt', '请求时间'),
      longTextField('payloadJSON', '请求JSON', false),
      longTextField('resultJSON', '结果JSON', false),
      textField('schemaVersion', '版本'),
    ],
    views: [
      { logicalName: 'pending-operations', displayName: '待处理操作', kind: 'grid', filterHint: '操作状态 in 待处理,待确认,处理中,需人工复核' },
      { logicalName: 'failed-operations', displayName: '失败操作', kind: 'grid', filterHint: '操作状态 = 失败' },
    ],
    seedRecords: profile.proofRoomNumbers.flatMap((roomNumber) =>
      profile.enabledWorkflows.map((workflow) => ({
        logicalKey: `operation:${workflow}:${roomNumber}`,
        fields: {
          后端ID: `operation-request:sandbox-${workflow.toLowerCase().replaceAll('_', '-')}-${roomNumber}`,
          请求令牌: `sandbox-${workflow.toLowerCase().replaceAll('_', '-')}-${roomNumber}`,
          操作类型: workflow,
          操作状态: '待处理',
          房号: roomNumber,
          操作人: 'provisioning-seed',
          原因: `seed ${workflow} proof request`,
          请求时间: '2026-04-28T00:00:00.000Z',
          请求JSON: JSON.stringify({ workflow, roomNumber }),
          结果JSON: null,
          版本: pmsBaseProjectionSchemaVersion,
        },
      })),
    ),
    upsertPolicy: {
      strategy: profile.operationRequestStrategy,
      uniqueField: '请求令牌',
      createOnMissing: profile.operationRequestStrategy === 'adapterUpsert',
      updateAllowedFields: ['操作状态', '结果JSON', '版本'],
    },
  };
}

export function housekeepingTasksTable(): PmsBaseTableSpec {
  return {
    logicalName: 'HousekeepingTasks',
    displayName: '保洁任务',
    fields: [
      hiddenCanonicalIdField(),
      textField('taskId', '任务ID'),
      textField('roomNumber', '房号'),
      linkedRecordField('relatedRoom', '关联房间', 'RoomLedger', '房号'),
      selectField('kind', '任务类型', ['checkout-cleaning', 'room-cleaning', 'rework-cleaning']),
      selectField('status', '任务状态', ['待处理', '处理中', '待查', '返工', '已完成', '已取消']),
      textField('reason', '原因'),
      textField('correlationId', '关联ID'),
      dateTimeField('createdAt', '创建时间'),
      dateTimeField('completedAt', '完成时间', false),
      textField('schemaVersion', '版本'),
    ],
    views: [{ logicalName: 'active-housekeeping', displayName: '当前保洁任务', kind: 'grid' }],
    seedRecords: [],
  };
}

export function maintenanceTicketsTable(): PmsBaseTableSpec {
  return {
    logicalName: 'MaintenanceTickets',
    displayName: '维修工单',
    fields: [
      hiddenCanonicalIdField(),
      textField('ticketId', '工单ID'),
      textField('roomNumber', '房号'),
      linkedRecordField('relatedRoom', '关联房间', 'RoomLedger', '房号'),
      selectField('status', '工单状态', ['待处理', '处理中', '已完成']),
      selectField('severity', '严重级别', ['Low', 'Medium', 'High', 'StopSell']),
      selectField('stopSellRequested', '是否停售', ['是', '否']),
      textField('reason', '维修备注'),
      textField('correlationId', '关联ID'),
      dateTimeField('createdAt', '创建时间'),
      dateTimeField('resolvedAt', '完成时间', false),
      textField('schemaVersion', '版本'),
    ],
    views: [
      { logicalName: 'active-maintenance', displayName: '当前维修', kind: 'grid' },
      { logicalName: 'maintenance-stop-sell', displayName: '维修停售', kind: 'grid', filterHint: '是否停售 = 是' },
    ],
    seedRecords: [],
  };
}

export function reservationsTable(): PmsBaseTableSpec {
  return {
    logicalName: 'Reservations',
    displayName: '预订',
    fields: [
      hiddenCanonicalIdField(),
      textField('reservationCode', '预订号'),
      textField('roomNumber', '房号', false),
      linkedRecordField('relatedRoom', '关联房间', 'RoomLedger', '房号'),
      textField('guestLabel', '客人'),
      dateTimeField('arrivalDate', '到店日期'),
      dateTimeField('departureDate', '离店日期'),
      selectField('status', '预订状态', ['已预订', '已入住', '已离店', '已取消']),
      textField('schemaVersion', '版本'),
    ],
    views: [
      { logicalName: 'today-arrivals', displayName: '今日到店', kind: 'grid' },
      { logicalName: 'today-departures', displayName: '今日离店', kind: 'grid' },
    ],
    seedRecords: [],
  };
}

export function staysTable(): PmsBaseTableSpec {
  return {
    logicalName: 'Stays',
    displayName: '入住记录',
    fields: [
      hiddenCanonicalIdField(),
      textField('reservationCode', '预订号'),
      textField('roomNumber', '房号'),
      linkedRecordField('relatedRoom', '关联房间', 'RoomLedger', '房号'),
      selectField('status', '入住状态', ['inHouse', 'checkedOut']),
      dateTimeField('checkedInAt', '入住时间'),
      dateTimeField('checkedOutAt', '离店时间', false),
      textField('schemaVersion', '版本'),
    ],
    views: [
      { logicalName: 'current-stays', displayName: '当前在住', kind: 'grid', filterHint: '入住状态 = inHouse' },
      { logicalName: 'stay-history', displayName: '入住历史', kind: 'grid' },
    ],
    seedRecords: [],
    upsertPolicy: {
      strategy: 'adapterUpsert',
      uniqueField: '后端ID',
      createOnMissing: true,
      updateAllowedFields: ['预订号', '房号', '关联房间', '入住状态', '入住时间', '离店时间', '版本'],
    },
  };
}

export function inventoryCalendarTable(): PmsBaseTableSpec {
  return {
    logicalName: 'InventoryCalendar',
    displayName: '库存日历',
    fields: [
      hiddenCanonicalIdField(),
      textField('intervalKey', '库存区间键'),
      textField('propertyId', '门店ID'),
      textField('roomId', '房间ID'),
      textField('roomNumber', '房号'),
      linkedRecordField('relatedRoom', '关联房间', 'RoomLedger', '房号'),
      textField('roomTypeId', '房型ID', false),
      textField('roomType', '房型', false),
      dateTimeField('startDate', '开始日期'),
      dateTimeField('endDate', '结束日期'),
      selectField('calendarKind', '日历状态', ['available', 'reserved', 'occupied', 'blocked']),
      selectField('sellableStatus', '可售状态', ['sellable', 'outOfOrder', 'outOfService']),
      textField('title', '标题'),
      longTextField('sourceRefsJSON', '来源JSON'),
      textField('projectionStatus', '投影状态'),
      dateTimeField('prunedAt', '剪枝时间', false),
      dateTimeField('updatedAt', '更新时间'),
      textField('schemaVersion', '版本'),
    ],
    views: [
      { logicalName: 'inventory-calendar', displayName: '库存日历', kind: 'gantt' },
      { logicalName: 'inventory-detail', displayName: '库存明细', kind: 'grid' },
      { logicalName: 'inventory-month-overview', displayName: '月历概览', kind: 'calendar' },
    ],
    seedRecords: [],
  };
}

export function operationLogsTable(): PmsBaseTableSpec {
  return {
    logicalName: 'OperationLogs',
    displayName: '操作日志',
    fields: [
      hiddenCanonicalIdField(),
      textField('auditId', '审计ID'),
      selectField('commandType', '操作类型', ['CHECK_IN', 'CHECK_OUT', 'HOUSEKEEPING_DONE', 'HOUSEKEEPING_INSPECTION', 'HOUSEKEEPING_REWORK', 'REPORT_MAINTENANCE', 'MAINTENANCE_DONE', 'RESTORE_SELLABLE']),
      textField('roomNumber', '房号'),
      linkedRecordField('relatedRoom', '关联房间', 'RoomLedger', '房号'),
      linkedRecordField('relatedOperationRequest', '关联操作请求', 'OperationRequests', '请求令牌'),
      textField('actor', '操作人'),
      textField('source', '来源'),
      textField('reason', '原因'),
      textField('idempotencyKey', '幂等键'),
      textField('correlationId', '关联ID'),
      dateTimeField('occurredAt', '发生时间'),
      longTextField('domainEventTypes', '领域事件'),
      longTextField('payloadJSON', '载荷JSON', false),
      textField('schemaVersion', '版本'),
    ],
    views: [{ logicalName: 'recent-operation-logs', displayName: '最近操作日志', kind: 'grid' }],
    seedRecords: [],
  };
}

export function projectionStatusTable(): PmsBaseTableSpec {
  return {
    logicalName: 'ProjectionStatus',
    displayName: '投影状态',
    fields: [
      hiddenCanonicalIdField(),
      textField('projectionName', '投影名称'),
      textField('aggregateKey', '聚合键'),
      selectField('status', '状态', ['pending', 'retry_pending', 'failed', 'delivered', 'fresh', 'stale', 'pruned']),
      { logicalName: 'attemptCount', displayName: '尝试次数', kind: 'number', required: true },
      dateTimeField('lastProjectedAt', '最近投影时间', false),
      longTextField('lastErrorSummary', '错误摘要', false),
      dateTimeField('updatedAt', '更新时间'),
      textField('schemaVersion', '版本'),
    ],
    views: [
      { logicalName: 'projection-status-overview', displayName: '投影状态', kind: 'grid' },
      { logicalName: 'projection-status-needs-attention', displayName: '异常投影', kind: 'grid', filterHint: 'status in failed/retry_pending/stale' },
    ],
    seedRecords: [],
    upsertPolicy: {
      strategy: 'adapterUpsert',
      uniqueField: '后端ID',
      createOnMissing: true,
      updateAllowedFields: ['投影名称', '聚合键', '状态', '尝试次数', '最近投影时间', '错误摘要', '更新时间', '版本'],
    },
  };
}
