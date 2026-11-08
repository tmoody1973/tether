// Decision 030: a product's Channel3 photo. Plain <img> (images come from many shop hosts and Channel3's CDN, so no
// next/image allow-list): fixed size so nothing shifts, lazy, no referrer sent to the image host, alt = the title.
// No photo: a calm placeholder of the same size.
export function ProductPhoto({ src, title, className }: { src?: string; title: string; className: string }) {
  if (!src) return <span className={`${className} ${className}--none`} aria-hidden="true">{title.trim().charAt(0).toUpperCase() || "?"}</span>;
  // eslint-disable-next-line @next/next/no-img-element -- remote shop images on arbitrary hosts; fixed size, lazy
  return <img src={src} alt={title} width={72} height={72} loading="lazy" decoding="async" referrerPolicy="no-referrer" className={className} />;
}
