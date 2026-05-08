import type {
  CleaningStatus,
  HousekeepingTask,
  MaintenanceTicket,
  OccupancyStatus,
  OperationRequest,
  ReservationReadModel,
  SaleStatus,
} from '@pms-platform/contracts';

export function reservationWorkflowOperationStatus(action: string): string {
  if (action === 'pendingActionConfirmed') return '已完成';
  if (action === 'pendingActionCancelled' || action === 'cancelled')
    return '已取消';
  if (action === 'pendingActionExpired' || action === 'expired')
    return '已过期';
  if (action === 'prepared' || action === 'pendingActionStatusRead')
    return '待确认';
  if (action === 'rejected') return '失败';
  return '处理中';
}

export function reservationStatusLabel(
  status: ReservationReadModel['status'],
): string {
  switch (status) {
    case 'booked':
      return 'Booked';
    case 'checkedIn':
      return 'Checked In';
    case 'checkedOut':
      return 'Checked Out';
    case 'cancelled':
      return 'Cancelled';
  }
}

export function operationRequestStatusLabel(
  status: OperationRequest['status'],
): string {
  if (status === 'awaitingConfirmation') return '待确认';
  if (status === 'processing') return '处理中';
  if (status === 'completed') return '已完成';
  if (status === 'failed' || status === 'rejected') return '失败';
  if (status === 'needsManualReview') return '需人工复核';
  if (status === 'expired') return '已过期';
  if (status === 'cancelled') return '已取消';
  if (status === 'duplicateIgnored') return '重复忽略';
  return '待处理';
}

export function occupancyStatusLabel(status: OccupancyStatus): string {
  if (status === 'occupied') return '在住';
  if (status === 'dueOut') return '预离';
  return '空房';
}

export function cleaningStatusLabel(status: CleaningStatus): string {
  if (status === 'dirty') return '脏房';
  if (status === 'cleaning') return '清洁中';
  if (status === 'inspection') return '待查';
  if (status === 'rework') return '返工';
  return '干净';
}

export function sellableStatusLabel(status: SaleStatus): string {
  if (status === 'outOfOrder') return '停售维修';
  if (status === 'outOfService') return '停售保留';
  return '可售';
}

export function housekeepingTaskStatusLabel(
  status: HousekeepingTask['status'],
): string {
  if (status === 'inProgress') return '处理中';
  if (status === 'inspection') return '待查';
  if (status === 'rework') return '返工';
  if (status === 'done') return '已完成';
  if (status === 'cancelled') return '已取消';
  return '待处理';
}

export function maintenanceTicketStatusLabel(
  status: MaintenanceTicket['status'],
): string {
  if (status === 'inProgress') return '处理中';
  if (status === 'resolved') return '已完成';
  return '待处理';
}
