'use strict';

/**
 * Express application factory — NO dotenv call here (only in server.js via env.js).
 *
 * Applies middleware in the correct order:
 *   1. Security headers (helmet)
 *   2. CORS
 *   3. Correlation ID
 *   4. Compression
 *   5. Body parsing
 *   6. Performance monitoring
 *   7. Request logging
 *   8. Rate limiting
 *   9. Monitoring routes (public probes + admin)
 *  10. API routes
 *  11. Error handler (MUST be last)
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const getCorsOptions = require('./middleware/corsConfig');
const correlationId = require('./middleware/correlationId');
const requestLogger = require('./middleware/requestLogger');
const { performanceMonitor } = require('./middleware/performanceMonitor');
const { globalLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes');
const monitoringRoutes = require('./modules/monitoring/monitoring.routes');

function createApp() {
  const app = express();

  // ── Trust proxy (MUST be before rate limiter so req.ip is correct) ─
  app.set('trust proxy', 1);

  // ── Security ──────────────────────────────────
  app.use(helmet());
  app.use(cors(getCorsOptions()));

  // ── Correlation ID (before everything else) ───
  app.use(correlationId());

  // ── Parsing & compression ─────────────────────
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ── Performance monitoring ────────────────────
  app.use(performanceMonitor());

  // ── Request logging ───────────────────────────
  app.use(requestLogger);

  // ── Rate limiting ─────────────────────────────
  // Temporarily disabled
  // if (process.env.NODE_ENV !== 'development') {
  //   app.use('/api/', globalLimiter());
  // }

  // ── Monitoring endpoints (probes are public) ──
  app.use('/api/v1/monitoring', monitoringRoutes);

  // ── API routes ────────────────────────────────
  app.use('/api/v1', routes);

  // ── Static uploads ─────────────────────────────────
  {
    const path = require('path');
    const uploadsPath = path.resolve(__dirname, '../uploads');
    const corpHeader = (req, res, next) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    };

    // Public assets (logos, avatars) — always served without auth.
    // These are loaded via <img src> tags which cannot send JWT tokens.
    const publicDirs = ['logos', 'avatars'];
    for (const dir of publicDirs) {
      app.use(
        `/uploads/${dir}`,
        corpHeader,
        express.static(path.join(uploadsPath, dir)),
        // Terminate here. express.static calls next() when the file is missing,
        // which previously dropped the request through to the authenticated
        // /uploads mount below — so a deleted logo answered 401 Unauthorized
        // instead of 404, making a storage problem look like an auth problem.
        (_req, res) => res.status(404).json({ success: false, message: 'Asset not found' }),
      );
    }

    if (process.env.NODE_ENV === 'development') {
      // Dev: open access for all remaining uploads
      app.use('/uploads', corpHeader, express.static(uploadsPath));
    } else {
      // Production: require authentication for sensitive uploads (xrays, documents, etc.)
      const { authenticate } = require('./middleware/authenticate');
      app.use('/uploads', authenticate(), corpHeader, express.static(uploadsPath));
    }
  }

  // ── Centralized error handler (MUST be last) ──
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
