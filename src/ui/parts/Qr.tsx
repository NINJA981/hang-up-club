import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { tokenToRgb } from '../color';

/** A QR code drawn locally (no service), on a light tile with a 16px quiet zone. */
export function QrCode({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState<string | undefined>();
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      width: 256,
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: tokenToRgb('--call-bg'), light: tokenToRgb('--call-text') },
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);
  return (
    <div
      className="inline-flex size-72 items-center justify-center rounded-lg bg-call-text p-4"
      data-testid="qr"
    >
      {src ? (
        <img src={src} alt={label} width={256} height={256} className="size-64" />
      ) : (
        <span className="text-meta text-call-bg">Drawing the code…</span>
      )}
    </div>
  );
}
