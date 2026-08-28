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
const sanitizeMongo = require('./middleware/sanitizeMongo');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes');
const monitoringRoutes = require('./modules/monitoring/monitoring.routes');

/**
 * Razorpay's server-to-server webhook. Declared once here because two pieces of
 * middleware need to know about it: the raw body parser (signature verification
 * needs the exact bytes) and the global rate limiter (a gateway retry storm must
 * not be throttled against ordinary user traffic).
 */
const RAZORPAY_WEBHOOK_PATH = '/api/v1/payments/gateway/webhook';

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

  // The Razorpay webhook signature is an HMAC over the EXACT bytes Razorpay
  // sent, so this route must see the raw body. It has to be mounted here,
  // ahead of express.json: body-parser marks a request as read (req._body) once
  // any parser has run, and express.raw() then short-circuits. The raw parser
  // that payment.routes.js used to declare was therefore a no-op, and the
  // service reconstructed a "raw" body with JSON.stringify — which only
  // reproduces Razorpay's bytes for plain-ASCII payloads and silently fails for
  // any patient name or address containing a non-ASCII character.
  // See docs/BestoClinic_Defect_Register.docx §2.3.
  app.use(RAZORPAY_WEBHOOK_PATH, express.raw({ type: 'application/json', limit: '1mb' }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ── Input hardening ───────────────────────────
  // Strip Mongo operators ($ne, $gt, dotted paths) from body/query/params
  // before anything reads them. Must sit after the body parsers.
  app.use(sanitizeMongo());

  // ── Performance monitoring ────────────────────
  app.use(performanceMonitor());

  // ── Request logging ───────────────────────────
  app.use(requestLogger);

  // ── Rate limiting ─────────────────────────────
  // Was commented out as "temporarily disabled", which left login, register,
  // refresh and forgot-password with no brute-force protection at all.
  // Skipped in development so local work isn't throttled, and skipped for
  // health probes so an orchestrator can't be locked out of its own checks.
  // server.js connects Redis before createApp(), so the limiter binds to the
  // shared Redis store rather than per-process memory.
  if (process.env.NODE_ENV !== 'development') {
    // Build the limiter once — globalLimiter() constructs a new store per call.
    const limiter = globalLimiter();

    // Paths that must never be throttled. Health and monitoring are mounted after
    // this middleware, so without listing them here an orchestrator polling
    // /health shares the same per-IP budget as ordinary traffic — under load the
    // probe starts answering 429 and the instance is pulled from rotation exactly
    // when it is needed. The comment above claimed this already happened; it did not.
    const UNTHROTTLED = [
      RAZORPAY_WEBHOOK_PATH,
      '/api/v1/health',
      '/api/v1/monitoring',
    ];

    app.use('/api/', (req, res, next) => {
      // Razorpay retries aggressively after any outage on our side. Sharing the
      // 100-request budget with ordinary traffic meant those retries could be
      // answered with 429 and the payments never reconciled.
      if (UNTHROTTLED.some((p) => req.originalUrl.startsWith(p))) return next();
      return limiter(req, res, next);
    });
  }

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
