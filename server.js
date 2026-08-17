const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.svg': 'image/svg+xml'
};

function handleRequest(req, res) {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '' || reqPath === '/index.html') {
    reqPath = '/app.html';
  }
  
  const filePath = path.join(__dirname, reqPath);
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>404 Not Found</h1><p><a href="/app.html">Go to HEIC to JPG Converter</a></p>`);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
}

function tryPort(port) {
  const server = http.createServer(handleRequest);
  
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      tryPort(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });

  server.once('listening', () => {
    const address = server.address();
    console.log(`\n==================================================`);
    console.log(`🚀 HEIC to JPG Converter is LIVE!`);
    console.log(`👉 Open: http://localhost:${address.port}/app.html`);
    console.log(`==================================================\n`);
  });

  server.listen(port, '0.0.0.0');
}

const START_PORT = parseInt(process.env.PORT || '3001', 10);
tryPort(START_PORT);


