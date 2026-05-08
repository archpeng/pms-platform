import type { CommandMeta } from './commandMeta.js';
import type { DomainError } from './domain.js';

export function validateCommandMeta(meta: CommandMeta | undefined): DomainError[] {
  if (!meta) {
    return [
      {
        code: 'MISSING_COMMAND_META',
        message: 'Command metadata is required.',
        field: 'meta',
      },
    ];
  }

  const errors: DomainError[] = [];

  if (!meta.actor?.id || !meta.actor.type) {
    errors.push({
      code: 'MISSING_ACTOR',
      message: 'Command actor id and type are required.',
      field: 'meta.actor',
    });
  }

  if (!meta.reason.trim()) {
    errors.push({
      code: 'MISSING_REASON',
      message: 'A reason is required for mutating PMS commands.',
      field: 'meta.reason',
    });
  }

  if (!meta.idempotencyKey.trim()) {
    errors.push({
      code: 'MISSING_IDEMPOTENCY_KEY',
      message: 'An idempotency key is required for mutating PMS commands.',
      field: 'meta.idempotencyKey',
    });
  }

  if (!meta.correlationId.trim()) {
    errors.push({
      code: 'MISSING_CORRELATION_ID',
      message: 'A correlation id is required for command tracing.',
      field: 'meta.correlationId',
    });
  }

  if (Number.isNaN(Date.parse(meta.requestedAt))) {
    errors.push({
      code: 'INVALID_REQUESTED_AT',
      message: 'requestedAt must be an ISO-8601 timestamp.',
      field: 'meta.requestedAt',
    });
  }

  if (meta.mode !== 'dryRun' && meta.mode !== 'confirm') {
    errors.push({
      code: 'INVALID_EXECUTION_MODE',
      message: 'Command mode must be dryRun or confirm.',
      field: 'meta.mode',
    });
  }

  return errors;
}
