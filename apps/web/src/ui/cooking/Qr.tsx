import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * A QR code, drawn in the page's own ink on a square of bright paper.
 *
 * The generator paints black modules on a white ground; the ground is dropped so the paper
 * square underneath shows through, and the modules take `currentColor` (plum ink). Ink on
 * bright paper is well past what a phone camera needs. The four-module quiet zone is part of
 * the drawing itself, and the square is never rotated or cut, so the decoration around it
 * can be as loud as it likes without costing a scan.
 */
const inherit = (svg: string): string =>
  svg
    .replace(/fill="#[0-9a-f]{6}"/gi, 'fill="none"')
    .replace(/stroke="#[0-9a-f]{6}"/gi, 'stroke="currentColor"');

type Props = {
  text: string;
  /** What a screen reader hears. Leave it out where the code is only a picture of itself. */
  label?: string;
  /** Pixels, or any CSS length when it has to follow the viewport. */
  size?: number | string;
  className?: string;
};

export const Qr = ({ text, label, size = 224, className = '' }: Props) => {
  const [svg, setSvg] = useState('');

  useEffect(() => {
    let live = true;
    QRCode.toString(text, { type: 'svg', margin: 4, errorCorrectionLevel: 'M' })
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
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      data-testid="qr"
      style={{ width: size, height: size }}
      className={`aspect-square max-w-full flex-none bg-paper-bright text-charcoal [&>svg]:block [&>svg]:h-full [&>svg]:w-full ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};
