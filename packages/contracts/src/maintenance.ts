export type MaintenanceSeverity = 'Low' | 'Medium' | 'High' | 'StopSell';
export type MaintenanceTicketStatus = 'open' | 'inProgress' | 'resolved';

export interface MaintenanceTicket {
  readonly ticketId: string;
  readonly roomId: string;
  readonly status: MaintenanceTicketStatus;
  readonly severity: MaintenanceSeverity;
  readonly reason: string;
  readonly stopSellRequested: boolean;
  readonly correlationId: string;
  readonly createdAt: string;
  readonly resolvedAt?: string;
}
