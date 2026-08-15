/**
 * The browser's network, moved into Node.
 *
 * Chromium cannot complete a TLS handshake in this container — the agent proxy resets it inside the
 * CONNECT tunnel, and it does the same for localhost, so no shim or resolver rule gets round it.
 * Node's TLS stack negotiates fine through the same proxy.
 *
 * Playwright's request interception runs in Node, so every request the page makes is fetched here
 * and handed back to the page. Certificate verification still happens, against the normal CA
 * bundle — it moves one hop, it is not switched off.
 *
 * Known limit: WebSockets do not go through request interception, so Supabase realtime will not
 * connect. Anything depending on live push has to be judged on its polling/refresh path instead,
 * and reported as such rather than as verified.
 */
import net from 'node:net';
import tls from 'node:tls';
import https from 'node:https';

const PROXY = new URL(process.env.HTTPS_PROXY || 'http://127.0.0.1:35755');

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
      if (!/ 200 /.test(status)) return reject(new Error('CONNECT failed: ' + status));
      const rest = Buffer.from(buf.slice(end + 4), 'binary');
      if (rest.length) sock.unshift(rest);
      resolve(sock);
    };
    sock.on('data', onData);
    sock.on('error', reject);
    sock.setTimeout(45000, () => sock.destroy(new Error('tunnel timeout')));
  });
}

class TunnelAgent extends https.Agent {
  createConnection(opts, cb) {
    const host = opts.servername || opts.host;
    tunnel(host, opts.port || 443)
      .then((sock) => {
        const t = tls.connect({ socket: sock, servername: host, ALPNProtocols: ['http/1.1'] });
        t.once('secureConnect', () => cb(null, t));
        t.once('error', cb);
      })
      .catch(cb);
    return undefined;
  }
}
export const agent = new TunnelAgent({ keepAlive: true, maxSockets: 32 });

/** One request, made from Node, through the proxy. */
export function request(url, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const h = { ...headers };
    delete h['accept-encoding'];
    delete h['connection'];
    h.host = u.host;

    const req = https.request(
      {
        host: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method,
        headers: h,
        agent,
        servername: u.hostname
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })
        );
      }
    );
    req.on('error', reject);
    req.setTimeout(45000, () => req.destroy(new Error('request timeout')));
    if (body) req.write(body);
    req.end();
  });
}

/** JSON convenience for talking to the API directly, without a browser. */
export async function api(url, opts = {}) {
  const r = await request(url, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    body: opts.json ? JSON.stringify(opts.json) : opts.body
  });
  const text = r.body.toString('utf8');
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, headers: r.headers, text, json: parsed };
}

/** Attach interception to a Playwright context so the page's traffic flows through Node. */
export function intercept(context, log) {
  return context.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();

    if (!/^https?:/.test(url)) return route.continue();
    // Chromium reaches loopback directly; only the outside world needs Node's stack.
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(url)) return route.continue();

    try {
      const res = await request(url, {
        method: req.method(),
        headers: req.headers(),
        body: req.postDataBuffer()
      });

      log?.net.push({ status: res.status, method: req.method(), url: url.slice(0, 220) });
      if (res.status >= 400) {
        log?.failed.push({ status: res.status, method: req.method(), url: url.slice(0, 220),
          body: res.body.toString('utf8').slice(0, 400) });
      }

      const headers = { ...res.headers };
      // These describe a transfer that already finished here; replaying them confuses the browser.
      delete headers['content-encoding'];
      delete headers['content-length'];
      delete headers['transfer-encoding'];
      delete headers['strict-transport-security'];

      await route.fulfill({ status: res.status, headers, body: res.body });
    } catch (e) {
      log?.failed.push({ status: 0, method: req.method(), url: url.slice(0, 220), err: e.message });
      await route.abort();
    }
  });
}
