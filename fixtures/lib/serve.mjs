import { createServer } from 'node:http';

/**
 * Serve `handler` on a free loopback port. `close` ends open connections first,
 * so a test never waits on a browser's idle keep-alive socket.
 */
export async function listen(handler) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => {
      server.closeAllConnections();
      return new Promise(resolve => server.close(resolve));
    },
  };
}
