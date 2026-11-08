"use client";

// Decision 030: a product's Channel3 photo. Plain <img> (images come from many shop hosts and Channel3's CDN, so no
// next/image allow-list): fixed size so nothing shifts, lazy, no referrer sent to the image host, alt = the title.
// No photo, or one that fails to load (review LOW 6): a calm placeholder of the same size, never a broken-image icon.
import { useEffect, useRef, useState } from "react";

export function ProductPhoto({ src, title, className }: { src?: string; title: string; className: string }) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // An image that failed before React attached onError (server-rendered, then hydrated) is caught here.
  useEffect(() => { if (img.current?.complete && img.current.naturalWidth === 0) setFailed(true); }, [src]);
  if (!src || failed) return <span className={`${className} ${className}--none`} aria-hidden="true">{title.trim().charAt(0).toUpperCase() || "?"}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote shop images on arbitrary hosts; fixed size, lazy
    <img ref={img} src={src} alt={title} width={72} height={72} loading="lazy" decoding="async" referrerPolicy="no-referrer"
      className={className} onError={() => setFailed(true)} />
  );
}
