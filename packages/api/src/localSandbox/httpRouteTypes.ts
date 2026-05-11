import type { IncomingMessage,ServerResponse } from 'node:http';
import type { PmsLocalHttpHandlerOptions } from './model.js';

export interface PmsLocalRouteContext {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly url: URL;
  readonly options: PmsLocalHttpHandlerOptions;
}
