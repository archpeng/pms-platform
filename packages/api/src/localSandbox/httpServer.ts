import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createPmsLocalHttpHandler } from './httpHandler.js';
import type { PmsLocalHttpServerOptions,StartedPmsLocalHttpServer } from './model.js';

export async function startPmsLocalHttpServer(options: PmsLocalHttpServerOptions): Promise<StartedPmsLocalHttpServer> {
  const server = createServer(createPmsLocalHttpHandler(options));
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 0;

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const url = `http://${address.address}:${address.port}`;

  return {
    server,
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          try {
            options.store.close?.();
            resolve();
          } catch (closeError) {
            reject(closeError);
          }
        });
      }),
  };
}
