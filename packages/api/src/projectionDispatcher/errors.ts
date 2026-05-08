export class ProjectionDispatchPermanentError extends Error {}
export class ProjectionDispatchSkippedError extends Error {}

export function isRetryableDispatchError(error: unknown): boolean {
  return (
    !(error instanceof ProjectionDispatchPermanentError) &&
    !(error instanceof ProjectionDispatchSkippedError)
  );
}

export function isSkippedDispatchError(error: unknown): boolean {
  return error instanceof ProjectionDispatchSkippedError;
}
