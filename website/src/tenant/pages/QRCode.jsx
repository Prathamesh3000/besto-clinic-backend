import { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { getClinicSettings } from '../api';
import { Spinner } from '../../platform/components/shared';
import {
  QrCode, Download, Printer, Copy, Check, Share2,
  Smartphone, Info, AlertTriangle, Maximize, Minimize,
} from 'lucide-react';

/* ─── Design Tokens ────────────────────────────── */
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const btnPrimary = 'px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all';
const btnGhost = 'px-4 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition';

export default function QRCodePage() {
  const [clinic, setClinic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [displayMode, setDisplayMode] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    getClinicSettings()
      .then((res) => setClinic(res.data || res))
      .catch((err) => setError(err.message || 'Failed to load clinic settings'))
      .finally(() => setLoading(false));
  }, []);

  const deepLink = clinic?.clinicCode
    ? `bestoclinic://clinic/${clinic.clinicCode}`
    : null;

  // Display mode: Esc key to exit + auto-refresh every 5 minutes
  useEffect(() => {
    if (!displayMode) return;
    const handleKey = (e) => { if (e.key === 'Escape') setDisplayMode(false); };
    window.addEventListener('keydown', handleKey);
    const refreshTimer = setInterval(() => {
      getClinicSettings()
        .then((res) => setClinic(res.data || res))
        .catch(() => {});
    }, 5 * 60 * 1000);
    return () => {
      window.removeEventListener('keydown', handleKey);
      clearInterval(refreshTimer);
    };
  }, [displayMode]);

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current?.querySelector('canvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(clinic?.name || 'clinic').replace(/\s+/g, '-').toLowerCase()}-qr-code.png`;
    a.click();
  }, [clinic?.name]);

  const handlePrint = useCallback(() => {
    const canvas = canvasRef.current?.querySelector('canvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const addr = clinic?.address;
    const addressParts = [addr?.street, addr?.locality, addr?.city, addr?.state].filter(Boolean);
    const addressStr = addressParts.join(', ');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>QR Code - ${clinic?.name || 'Clinic'}</title>
          <style>
            @page { size: A5 portrait; margin: 0; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; background: #fff; padding: 40px; }
            .card { border: 2px solid #e5e7eb; border-radius: 24px; padding: 48px 40px; text-align: center; max-width: 400px; width: 100%; }
            .clinic-name { font-size: 24px; font-weight: 700; color: #111; margin-bottom: 4px; }
            .subtitle { font-size: 14px; color: #6b7280; margin-bottom: 28px; }
            .qr-wrap { display: inline-block; padding: 16px; border: 2px solid #f3f4f6; border-radius: 16px; margin-bottom: 20px; }
            .code { font-size: 28px; font-weight: 700; letter-spacing: 4px; color: #111; font-family: monospace; margin-bottom: 8px; }
            .instruction { font-size: 13px; color: #9ca3af; margin-bottom: 4px; }
            .address { font-size: 12px; color: #9ca3af; margin-top: 20px; padding-top: 16px; border-top: 1px solid #f3f4f6; }
            .brand { font-size: 11px; color: #d1d5db; margin-top: 24px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="clinic-name">${clinic?.name || 'Clinic'}</div>
            <div class="subtitle">Scan to join us on BestoClinic</div>
            <div class="qr-wrap"><img src="${url}" width="260" height="260" /></div>
            <div class="code">${clinic?.clinicCode || ''}</div>
            <div class="instruction">Open the BestoClinic app and scan this QR code</div>
            <div class="instruction">or enter the code above manually</div>
            ${addressStr ? `<div class="address">${addressStr}</div>` : ''}
            <div class="brand">Powered by BestoClinic</div>
          </div>
        </body>
      </html>
    `);
    win.document.close();
    win.onload = () => { win.print(); };
  }, [clinic?.name, clinic?.clinicCode, clinic?.address]);

  const handleCopyCode = useCallback(() => {
    if (!clinic?.clinicCode) return;
    navigator.clipboard.writeText(clinic.clinicCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [clinic?.clinicCode]);

  const handleCopyLink = useCallback(() => {
    if (!deepLink) return;
    navigator.clipboard.writeText(deepLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }, [deepLink]);

  if (loading) return <Spinner />;

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <p className="text-sm text-neutral-500">{error}</p>
        </div>
      </div>
    );
  }

  // Clinic has no clinicCode yet
  if (!clinic?.clinicCode) {
    return (
      <div className="max-w-[1280px] mx-auto w-full space-y-6">
        <div className="animate-[fadeUp_0.4s_ease-out_both]">
          <h2 className="text-2xl font-semibold font-display text-neutral-900">Clinic QR Code</h2>
          <p className="text-sm text-neutral-500 mt-1">Let patients find your clinic by scanning a QR code</p>
        </div>

        <div className={`${cardCls} p-8 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '50ms' }}>
          <div className="max-w-md mx-auto text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
            </div>
            <h3 className="font-semibold font-display text-neutral-900 text-lg">QR Code Not Available</h3>
            <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
              Your clinic doesn't have a clinic code assigned yet. A clinic code is required to generate a QR code.
              Please run the seed script or contact the platform administrator to generate one.
            </p>
            <div className="mt-4 p-3 bg-neutral-50 rounded-xl">
              <code className="text-xs text-neutral-500">node scripts/seed-platform-full.js</code>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Display Mode: fullscreen QR for reception screens ──
  if (displayMode) {
    return (
      <div className="fixed inset-0 z-50 bg-neutral-950 flex flex-col items-center justify-center">
        <button
          onClick={() => setDisplayMode(false)}
          className="absolute top-6 right-6 p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
          title="Exit Display Mode"
        >
          <Minimize className="h-5 w-5 text-white" />
        </button>

        <div className="bg-white rounded-3xl p-10 shadow-2xl">
          <QRCodeSVG
            value={deepLink}
            size={320}
            level="M"
            includeMargin={false}
          />
        </div>

        <h2 className="text-white text-2xl font-bold mt-8">{clinic.name}</h2>
        <p className="text-white/50 text-sm mt-2">Scan to join us on BestoClinic</p>
        <p className="text-white/70 text-xl font-mono font-bold tracking-[6px] mt-4">{clinic.clinicCode}</p>

        <p className="absolute bottom-6 text-white/20 text-xs">
          Press Esc or click <Minimize className="inline h-3 w-3" /> to exit · Auto-refreshes every 5 minutes
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">
      {/* Header */}
      <div
        className="flex items-center justify-between animate-[fadeUp_0.4s_ease-out_both]"
      >
        <div>
          <h2 className="text-2xl font-semibold font-display text-neutral-900">Clinic QR Code</h2>
          <p className="text-sm text-neutral-500 mt-1">Let patients find your clinic by scanning a QR code</p>
        </div>
        <button
          onClick={() => setDisplayMode(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 transition-colors"
          title="Full-screen display for reception"
        >
          <Maximize className="h-4 w-4" /> Display Mode
        </button>
      </div>

      <div
        className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '50ms' }}
      >
        {/* Main QR Card */}
        <div className={`lg:col-span-2 ${cardCls} p-8`}>
          <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
            {/* QR Code */}
            <div className="shrink-0">
              <div className="bg-white border-2 border-neutral-200 rounded-2xl p-6 shadow-sm">
                <QRCodeSVG
                  value={deepLink}
                  size={200}
                  level="M"
                  includeMargin={false}
                />
              </div>
            </div>

            {/* Info & Actions */}
            <div className="flex-1 text-center md:text-left">
              <h3 className="text-lg font-bold font-display text-neutral-900">{clinic.name}</h3>

              {/* Clinic Code Badge */}
              <button
                onClick={handleCopyCode}
                className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-primary-50 rounded-xl group hover:bg-primary-100 transition-colors"
              >
                <span className="text-lg font-mono font-bold text-primary-700 tracking-widest">
                  {clinic.clinicCode}
                </span>
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Copy className="h-4 w-4 text-primary-400 group-hover:text-primary-600 transition-colors" />
                )}
              </button>

              {/* Deep Link */}
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-2 mt-3 text-xs text-neutral-400 hover:text-neutral-600 transition-colors group"
              >
                <span className="font-mono">{deepLink}</span>
                {linkCopied ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </button>

              <p className="text-sm text-neutral-500 mt-4 max-w-sm">
                Display this QR code at your reception desk, appointment cards, or marketing materials so patients
                can scan it to find your clinic in the BestoClinic app.
              </p>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 mt-6 justify-center md:justify-start">
                <button
                  onClick={handleDownload}
                  className={`inline-flex items-center gap-1.5 ${btnPrimary}`}
                >
                  <Download className="h-4 w-4" /> Download PNG
                </button>
                <button
                  onClick={handlePrint}
                  className={`inline-flex items-center gap-1.5 ${btnGhost}`}
                >
                  <Printer className="h-4 w-4" /> Print
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right sidebar — Tips */}
        <div className="space-y-4">
          {/* How it works */}
          <div className={`${cardCls} p-5`}>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 rounded-lg bg-primary-50">
                <Smartphone className="h-4 w-4 text-primary-600" />
              </div>
              <h4 className="font-semibold font-display text-neutral-900 text-sm">How It Works</h4>
            </div>
            <ol className="space-y-3">
              {[
                'Patient opens the BestoClinic app',
                'Taps the QR scan card on the home screen',
                'Scans this QR code with their camera',
                'Returning patients go straight to sign-in',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-primary-50 text-primary-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-xs text-neutral-500 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Tips */}
          <div className={`${cardCls} p-5`}>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 rounded-lg bg-amber-50">
                <Info className="h-4 w-4 text-amber-600" />
              </div>
              <h4 className="font-semibold font-display text-neutral-900 text-sm">Placement Tips</h4>
            </div>
            <ul className="space-y-2.5">
              {[
                'Print and display at the reception desk',
                'Include on appointment cards and brochures',
                'Add to your website or social media',
                'Patients can also type the code manually',
              ].map((tip, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-1 h-1 rounded-full bg-neutral-300 shrink-0 mt-2" />
                  <span className="text-xs text-neutral-500 leading-relaxed">{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Hidden canvas for PNG export */}
      <div ref={canvasRef} className="hidden">
        <QRCodeCanvas
          value={deepLink}
          size={600}
          level="M"
          includeMargin
        />
      </div>
    </div>
  );
}
