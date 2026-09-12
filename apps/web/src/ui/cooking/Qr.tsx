import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * A QR code, drawn in the page's own ink.
 *
 * The generator paints in black on white; those are swapped for `currentColor` on nothing,
 * so the code sits on the cream ground like everything else and takes its colour from the
 * text around it. A scanner does not care, and the rest of the screen does.
 */
const inherit = (svg: string): string =>
  svg
    .replace(/fill="#[0-9a-f]{6}"/gi, 'fill="none"')
    .replace(/stroke="#[0-9a-f]{6}"/gi, 'stroke="currentColor"');

type Props = { text: string; label: string; size?: number };

export const Qr = ({ text, label, size = 224 }: Props) => {
  const [svg, setSvg] = useState('');

  useEffect(() => {
    let live = true;
    QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((drawn) => {
        if (live) setSvg(inherit(drawn));
      })
      .catch(() => {
        if (live) setSvg('');
      });
    return () => {
      live = false;
    };
  }, [text]);

  return (
    <div
      role="img"
      aria-label={label}
      data-testid="qr"
      style={{ width: size, height: size }}
      className="max-w-full rounded-md bg-cream p-2 text-charcoal shadow-1 [&>svg]:h-full [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};
