// Server statis untuk preview lokal (penilaian di /, dashboard di /kadiv/)
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};
http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(ROOT, p);
  if (!file.startsWith(path.normalize(ROOT))) { res.writeHead(403); return res.end(); }
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch (e) {}
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(8321, () => console.log('static server on :8321'));
