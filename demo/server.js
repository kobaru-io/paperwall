#!/usr/bin/env node

/**
 * Simple HTTP server for Paperwall demo
 *
 * Serves static files from the demo directory for local testing.
 * Includes proper MIME types and CORS headers.
 *
 * Usage:
 *   node demo/server.js [port]
 *
 * Default port: 8080
 */

import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = parseInt(process.argv[2] || process.env.PORT || '8080', 10);
const ROOT = __dirname;

// MIME type mappings
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/**
 * Get MIME type from file extension
 */
function getMimeType(filepath) {
  const ext = extname(filepath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Normalize and validate requested path
 * Prevents directory traversal attacks
 */
function normalizePath(url) {
  // Remove query string and decode
  const path = decodeURIComponent(url.split('?')[0]);

  // Default to index.html for directory requests
  if (path === '/' || path === '') {
    return 'index.html';
  }

  // Remove leading slash
  return path.startsWith('/') ? path.slice(1) : path;
}

/**
 * Create HTTP server
 */
const server = createServer({ maxConnections: 100 }, async (req, res) => {
  const startTime = Date.now();

  try {
    const requestPath = normalizePath(req.url);
    const filePath = join(ROOT, requestPath);

    // Security check: ensure resolved path is within ROOT
    const resolvedPath = filePath;
    if (!resolvedPath.startsWith(ROOT)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden\n');
      logRequest(req, 403, Date.now() - startTime);
      return;
    }

    // Check if file exists
    const stats = await stat(filePath);

    if (!stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found\n');
      logRequest(req, 404, Date.now() - startTime);
      return;
    }

    // Read and serve file
    const content = await readFile(filePath);
    const mimeType = getMimeType(filePath);

    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': content.length,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(content);

    logRequest(req, 200, Date.now() - startTime);

  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found\n');
      logRequest(req, 404, Date.now() - startTime);
    } else {
      console.error('Server error:', error);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Internal Server Error\n');
      logRequest(req, 500, Date.now() - startTime);
    }
  }
});

/**
 * Log request to console
 */
function logRequest(req, statusCode, duration) {
  const method = req.method;
  const url = req.url;
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${method} ${url} - ${statusCode} (${duration}ms)`);
}

/**
 * Start server
 */
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('                                                ____');
  console.log('    ____  ____ _____  ___  ______      ______ _/ / /');
  console.log('   / __ \\/ __ `/ __ \\/ _ \\/ ___/ | /| / / __ `/ / / ');
  console.log('  / /_/ / /_/ / /_/ /  __/ /   | |/ |/ / /_/ / / /  ');
  console.log(' / .___/\\__,_/ .___/\\___/_/    |__/|__/\\__,_/_/_/   ');
  console.log('/_/         /_/                                     ');
  console.log('');
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://0.0.0.0:${PORT}`);
  console.log('');
  console.log('  Press Ctrl+C to stop');
  console.log('');
});

/**
 * Graceful shutdown
 */
process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
