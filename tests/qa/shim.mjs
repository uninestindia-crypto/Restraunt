/**
 * A local TLS shim, so a browser can be driven against the live site from this container.
 *
 * Outbound HTTPS here only leaves through the agent proxy, and that proxy resets Chromium's TLS
 * handshake inside the CONNECT tunnel (curl and Node negotiate fine; Chromium does not). Without a
 * way round that, none of this QA session could touch the real deployments.
 *
 * So: Chromium resolves every hostname to 127.0.0.1 and talks plain TLS to this process using a
 * throwaway cert. This process then makes the real request with Node's TLS stack, through the
 * proxy, validating the upstream certificate against the normal CA bundle. Verification is not
 * disabled anywhere — it moves from Chromium to Node, one hop earlier.
 *
 * Handles ordinary requests and WebSocket upgrades (Supabase realtime rides the latter).
 */
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';

const DIR = '/tmp/claude-0/-home-user-Restraunt/fdf1f216-74b6-5b33-8106-81640b245ebf/scratchpad';
const PROXY = new URL(process.env.HTTPS_PROXY || 'http://127.0.0.1:35755');

export const traffic = [];

/** Open a raw TCP tunnel to host:port through the agent proxy. */
function tunnel(host, port = 443) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(Number(PROXY.port), PROXY.hostname, () => {
      sock.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`);
    });
    let buf = '';
    const onData = (d) => {
      buf += d.toString('binary');
      const end = buf.indexOf('\r\n\r\n');
      if (end === -1) return;
      sock.removeListener('data', onData);
      const status = buf.slice(0, buf.indexOf('\r\n'));
      if (!/ 200 /.test(status)) return reject(new Error('proxy CONNECT: ' + status));
      const rest = Buffer.from(buf.slice(end + 4), 'binary');
      if (rest.length) sock.unshift(rest);
      resolve(sock);
    };
    sock.on('data', onData);
    sock.on('error', reject);
    sock.setTimeout(45000, () => sock.destroy(new Error('tunnel timeout')));
  });
}

/** An https.Agent whose sockets are TLS over a proxy tunnel, verified against the real CA. */
class TunnelAgent extends https.Agent {
  createConnection(opts, cb) {
    const host = opts.servername || opts.host;
    tunnel(host, opts.port || 443)
      .then((sock) => {
        const t = tls.connect({ socket: sock, servername: host, ALPNProtocols: ['http/1.1'] });
        t.once('secureConnect', () => cb(null, t));
        t.once('error', (e) => cb(e));
      })
      .catch(cb);
    return undefined;
  }
}
const agent = new TunnelAgent({ keepAlive: true, maxSockets: 24 });

const tlsOpts = {
  key: readFileSync(`${DIR}/shim.key`),
  cert: readFileSync(`${DIR}/shim.crt`)
};

function forward(req, res, scheme) {
  const host = (req.headers.host || '').split(':')[0];
  if (!host) { res.writeHead(400); return res.end('no host'); }

  const headers = { ...req.headers };
  delete headers['accept-encoding']; // let Node hand back what the origin sent, undecoded surprises off

  const upstream = https.request(
    { host, port: 443, path: req.url, method: req.method, headers, agent, servername: host },
    (up) => {
      traffic.push({ status: up.statusCode, method: req.method, url: `https://${host}${req.url}`.slice(0, 300) });
      res.writeHead(up.statusCode, up.headers);
      up.pipe(res);
    }
  );
  upstream.on('error', (e) => {
    traffic.push({ status: 0, method: req.method, url: `https://${host}${req.url}`.slice(0, 300), err: e.message });
    if (!res.headersSent) res.writeHead(502);
    res.end('shim upstream error: ' + e.message);
  });
  req.pipe(upstream);
}

/** WebSocket and other upgrades: splice the two sockets once the origin has agreed. */
async function onUpgrade(req, clientSock, head) {
  const host = (req.headers.host || '').split(':')[0];
  try {
    const raw = await tunnel(host, 443);
    const up = tls.connect({ socket: raw, servername: host });
    up.once('secureConnect', () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (const [k, v] of Object.entries(req.headers)) lines.push(`${k}: ${v}`);
      up.write(lines.join('\r\n') + '\r\n\r\n');
      if (head?.length) up.write(head);
      up.pipe(clientSock);
      clientSock.pipe(up);
      traffic.push({ status: 101, method: 'WS', url: `wss://${host}${req.url}`.slice(0, 300) });
    });
    up.on('error', () => clientSock.destroy());
    clientSock.on('error', () => up.destroy());
  } catch (e) {
    traffic.push({ status: 0, method: 'WS', url: `wss://${host}${req.url}`, err: e.message });
    clientSock.destroy();
  }
}

export function start() {
  const secure = https.createServer(tlsOpts, (req, res) => forward(req, res, 'https'));
  secure.on('upgrade', onUpgrade);
  secure.on('clientError', (e, s) => s.destroy());

  const plain = http.createServer((req, res) => forward(req, res, 'http'));
  plain.on('upgrade', onUpgrade);

  return Promise.all([
    new Promise((r) => secure.listen(443, '127.0.0.1', r)),
    new Promise((r) => plain.listen(80, '127.0.0.1', r))
  ]).then(() => ({
    stop: () => { secure.close(); plain.close(); }
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start().then(() => console.log('shim listening on 443/80'));
}
