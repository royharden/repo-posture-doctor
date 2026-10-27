import { vi } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import childProcess from 'node:child_process';

const refused = (): never => { throw new Error('unexpected_network_or_subprocess'); };
// Install before test modules load, including the evaluator/demo import graph.
vi.stubGlobal('fetch', refused);
vi.stubGlobal('XMLHttpRequest', class { constructor() { refused(); } });
vi.stubGlobal('WebSocket', class { constructor() { refused(); } });
vi.stubGlobal('EventSource', class { constructor() { refused(); } });
vi.spyOn(http, 'request').mockImplementation(refused);
vi.spyOn(http, 'get').mockImplementation(refused);
vi.spyOn(https, 'request').mockImplementation(refused);
vi.spyOn(https, 'get').mockImplementation(refused);
vi.spyOn(net, 'connect').mockImplementation(refused);
vi.spyOn(net, 'createConnection').mockImplementation(refused);
vi.spyOn(tls, 'connect').mockImplementation(refused);
vi.spyOn(dgram, 'createSocket').mockImplementation(refused);
vi.spyOn(childProcess, 'spawn').mockImplementation(refused);
vi.spyOn(childProcess, 'exec').mockImplementation(refused);
vi.spyOn(childProcess, 'execFile').mockImplementation(refused);
vi.spyOn(childProcess, 'fork').mockImplementation(refused);
