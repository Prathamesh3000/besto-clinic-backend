import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { getClinicSettings } from '../api';
import { QrCode, Download, Printer, Copy, Check, ArrowRight, AlertTriangle } from 'lucide-react';

export default function ClinicQRCard({ compact = false }) {
  const navigate = useNavigate();
  const [clinic, setClinic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    getClinicSettings()
      .then((res) => setClinic(res.data || res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const deepLink = clinic?.clinicCode
    ? `bestoclinic://clinic/${clinic.clinicCode}`
    : null;

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
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html>
        <head><title>QR Code - ${clinic?.name || 'Clinic'}</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:system-ui,sans-serif;">
          <h2 style="margin-bottom:8px;">${clinic?.name || 'Clinic'}</h2>
          <p style="color:#666;margin-bottom:24px;font-size:14px;">Scan to find us on BestoClinic</p>
          <img src="${url}" width="300" height="300" />
          <p style="margin-top:16px;font-size:18px;font-weight:600;letter-spacing:2px;">${clinic?.clinicCode || ''}</p>
        </body>
      </html>
    `);
    win.document.close();
    win.onload = () => { win.print(); };
  }, [clinic?.name, clinic?.clinicCode]);

  const handleCopyCode = useCallback(() => {
    if (!clinic?.clinicCode) return;
    navigator.clipboard.writeText(clinic.clinicCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [clinic?.clinicCode]);

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5 h-full">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-24 h-24 bg-neutral-100 rounded-xl" />
          <div className="w-full space-y-2">
            <div className="h-4 bg-neutral-100 rounded w-3/4 mx-auto" />
            <div className="h-3 bg-neutral-100 rounded w-1/2 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  // ── No clinic code ──
  if (!clinic?.clinicCode) {
    return (
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5 h-full">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold font-display text-neutral-900">Clinic QR Code</h3>
            <p className="text-xs text-neutral-500">No clinic code assigned yet</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Compact mode (dashboard sidebar) ──
  if (compact) {
    return (
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
              <QrCode className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold font-display text-neutral-900">QR Code</h3>
              <p className="text-xs text-neutral-500">Scan to connect</p>
            </div>
          </div>
        </div>

        {/* QR + Code + Actions — centered vertical layout */}
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="bg-white border border-neutral-200 rounded-xl p-3">
            <QRCodeSVG value={deepLink} size={120} level="M" includeMargin={false} />
          </div>

          {/* Clinic Code */}
          <button
            onClick={handleCopyCode}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 rounded-lg group hover:bg-primary-100 transition-colors"
          >
            <span className="text-sm font-mono font-bold text-primary-700 tracking-wider">
              {clinic.clinicCode}
            </span>
            {copied ? (
              <Check className="h-3.5 w-3.5 text-secondary-500" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-primary-400 group-hover:text-primary-600 transition-colors" />
            )}
          </button>

          <p className="text-[11px] text-neutral-500 text-center leading-relaxed max-w-[200px]">
            Display at reception for patients to scan
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={handleDownload}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors"
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
        </div>

        {/* Hidden canvas for PNG export */}
        <div ref={canvasRef} className="hidden">
          <QRCodeCanvas value={deepLink} size={600} level="M" includeMargin />
        </div>
      </div>
    );
  }

  // ── Full mode (standalone page or full-width) ──
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
            <QrCode className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold font-display text-neutral-900">Clinic QR Code</h3>
            <p className="text-xs text-neutral-500">Patients scan this to find your clinic</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/clinic/qr-code')}
          className="text-sm font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-primary-50 transition-colors"
        >
          View Full Page <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
        {/* QR Code */}
        <div className="bg-white border-2 border-neutral-200 rounded-xl p-4 shrink-0">
          <QRCodeSVG value={deepLink} size={160} level="M" includeMargin={false} />
        </div>

        {/* Info & Actions */}
        <div className="flex-1 text-center sm:text-left">
          <p className="text-sm font-semibold text-neutral-800">{clinic.name}</p>

          <button
            onClick={handleCopyCode}
            className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-primary-50 rounded-lg group hover:bg-primary-100 transition-colors"
          >
            <span className="text-sm font-mono font-bold text-primary-700 tracking-wider">
              {clinic.clinicCode}
            </span>
            {copied ? (
              <Check className="h-3.5 w-3.5 text-secondary-500" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-primary-400 group-hover:text-primary-600 transition-colors" />
            )}
          </button>

          <p className="text-xs text-neutral-500 mt-3 max-w-[280px]">
            Display this QR code at your reception desk so patients can scan it to find your clinic in the BestoClinic app.
          </p>

          <div className="flex items-center gap-2 mt-4 justify-center sm:justify-start">
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-white border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
          </div>
        </div>
      </div>

      {/* Hidden canvas for PNG export */}
      <div ref={canvasRef} className="hidden">
        <QRCodeCanvas value={deepLink} size={600} level="M" includeMargin />
      </div>
    </div>
  );
}
