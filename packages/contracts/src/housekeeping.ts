export type HousekeepingTaskKind = 'checkout-cleaning' | 'room-cleaning' | 'rework-cleaning';
export type HousekeepingTaskStatus = 'pending' | 'inProgress' | 'inspection' | 'rework' | 'done' | 'cancelled';

export interface HousekeepingTask {
  readonly taskId: string;
  readonly roomId: string;
  readonly kind: HousekeepingTaskKind;
  readonly status: HousekeepingTaskStatus;
  readonly reason: string;
  readonly correlationId: string;
  readonly createdAt: string;
  readonly completedAt?: string;
}
