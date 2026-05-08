import type { CommandExecutionMode,PmsCommandType } from './commandMeta.js';
import type { OperationRequestAction } from './operationRequest.js';

export type PmsCapabilityClass = 'read' | 'dryRun' | 'safeIntake' | 'draft' | 'prepareConfirm' | 'confirm' | 'internal';

export interface PmsCapabilitySchemaRefs {
  readonly request?: string;
  readonly response?: string;
  readonly result?: string;
}

export interface PmsCapabilitySlot {
  readonly name: string;
  readonly required: boolean;
  readonly source: 'user' | 'context' | 'system' | 'server';
  readonly schemaRef?: string;
}

export interface PmsCapabilityRefs {
  readonly commandType?: PmsCommandType;
  readonly readModel?: string;
  readonly workflow?: string;
  readonly operationRequestAction?: OperationRequestAction;
  readonly domainEvents?: readonly string[];
}

export interface PmsCapabilityIdempotencyMetadata {
  readonly required: boolean;
  readonly keyField?: string;
  readonly fingerprintRequired: boolean;
  readonly replaySafe: boolean;
}

export interface PmsCapabilityAuditMetadata {
  readonly auditRequired: boolean;
  readonly emitsDomainEvents: boolean;
  readonly eventTypes: readonly string[];
}

export interface PmsCapabilityEndpointMetadata {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly operation: string;
  readonly mode?: CommandExecutionMode;
  readonly auth: 'bearer-token';
}

export interface PmsCapabilityManifestItem {
  readonly name: string;
  readonly version: string;
  readonly class: PmsCapabilityClass;
  readonly customerChatAllowed: boolean;
  readonly naturalLanguageExecutable: boolean;
  readonly confirmationRequired: boolean;
  readonly schemaRefs: PmsCapabilitySchemaRefs;
  readonly slots: readonly PmsCapabilitySlot[];
  readonly refs: PmsCapabilityRefs;
  readonly idempotency: PmsCapabilityIdempotencyMetadata;
  readonly audit: PmsCapabilityAuditMetadata;
  readonly endpoint: PmsCapabilityEndpointMetadata;
}

export type PmsCapabilityPlannerProjectionItem = Omit<PmsCapabilityManifestItem, 'endpoint'>;

export interface PmsCapabilityPlannerProjection {
  readonly schemaVersion: 'pms-capability-planner-projection-v1';
  readonly capabilities: readonly PmsCapabilityPlannerProjectionItem[];
}

export interface PmsCapabilityManifest {
  readonly schemaVersion: 'pms-capability-manifest-v1';
  readonly generatedAt: string;
  readonly capabilities: readonly PmsCapabilityManifestItem[];
  readonly plannerProjection: PmsCapabilityPlannerProjection;
}
