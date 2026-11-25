import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FreightStore } from './src/store.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 5 * 1024 * 1024) {
        reject(Object.assign(new Error('Размер запроса превышает 5 МБ'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Некорректный JSON в теле запроса'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(indexPath).pipe(res);
    return;
  }
  const ext = path.extname(fullPath);
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(fullPath).pipe(res);
}

export function createAppServer(store) {
  return http.createServer(async (req, res) => {
    const urlObj = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = urlObj.pathname;
    const method = req.method || 'GET';

    try {
      if (pathname === '/api/health' && method === 'GET') {
        return sendJson(res, 200, { ok: true });
      }

      if (pathname === '/api/state' && method === 'GET') {
        const role = urlObj.searchParams.get('role') || 'logist';
        return sendJson(res, 200, store.getStateForRole(role));
      }

      if (pathname === '/api/demo/reset' && method === 'POST') {
        const trip = store.resetDemoTrip();
        return sendJson(res, 200, { ok: true, trip });
      }

      if (pathname === '/api/trips' && method === 'POST') {
        const body = await readJsonBody(req);
        const trip = store.createTrip(body);
        return sendJson(res, 201, { trip });
      }

      // /api/trips/:id/...
      const tripMatch = pathname.match(/^\/api\/trips\/([^/]+)(\/.*)?$/);
      if (tripMatch) {
        const tripId = decodeURIComponent(tripMatch[1]);
        const sub = tripMatch[2] || '';

        if (sub === '' && method === 'GET') {
          const role = urlObj.searchParams.get('role') || 'logist';
          const trip = store.getTripForRole(tripId, role);
          return sendJson(res, 200, { trip });
        }

        if (sub === '/propose' && method === 'POST') {
          const body = await readJsonBody(req);
          const trip = store.proposeTerms(tripId, body);
          return sendJson(res, 200, { trip });
        }

        if (sub === '/confirm' && method === 'POST') {
          const body = await readJsonBody(req);
          const trip = store.confirmTerms(tripId, body);
          return sendJson(res, 200, { trip });
        }

        if (sub === '/delivery' && method === 'POST') {
          const body = await readJsonBody(req);
          const trip = store.updateDelivery(tripId, body);
          return sendJson(res, 200, { trip });
        }

        if (sub === '/documents' && method === 'POST') {
          const body = await readJsonBody(req);
          const trip = store.uploadDocument(tripId, body);
          return sendJson(res, 201, { trip });
        }

        const docReviewMatch = sub.match(/^\/documents\/([^/]+)\/review$/);
        if (docReviewMatch && method === 'POST') {
          const docId = decodeURIComponent(docReviewMatch[1]);
          const body = await readJsonBody(req);
          const trip = store.reviewDocument(tripId, docId, body);
          return sendJson(res, 200, { trip });
        }

        if (sub === '/accounting/export' && method === 'POST') {
          const result = store.exportAccounting(tripId);
          return sendJson(res, 200, result);
        }

        if (sub === '/accounting/download' && method === 'GET') {
          const result = store.exportAccounting(tripId);
          res.writeHead(200, {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${result.record.fileName}"`,
            'Cache-Control': 'no-store',
          });
          res.end(result.csvContent);
          return;
        }

        if (sub === '/integrity/verify' && method === 'POST') {
          const body = await readJsonBody(req);
          const result = store.verifyIntegrity(tripId, body);
          return sendJson(res, 200, result);
        }

        if (sub === '/integrity/sample' && method === 'GET') {
          const variant = urlObj.searchParams.get('variant') || 'original';
          const sample = store.getIntegritySample(tripId, variant);
          return sendJson(res, 200, sample);
        }
      }

      if (pathname.startsWith('/api/')) {
        return sendJson(res, 404, { error: 'API endpoint not found' });
      }

      serveStatic(req, res, pathname);
    } catch (err) {
      const code = err.statusCode || 500;
      sendJson(res, code, { error: err.message || 'Внутренняя ошибка сервера' });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || '127.0.0.1';
  const dataFile = process.env.DATA_FILE || path.join(__dirname, 'data', 'state.json');
  const store = new FreightStore(dataFile);
  const server = createAppServer(store);
  server.listen(port, host, () => {
    console.log(`UrFU Freight MVP running at http://${host}:${port}`);
  });
}
