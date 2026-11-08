import Image from "next/image";
import Link from "next/link";
import { REPO_URL } from "./bits";

export function Top() {
  return (
    <header className="l-top">
      <Link className="l-top__logo" href="/" aria-label="Tether home">
        <Image src="/brand/tether-horizontal-color.svg" alt="" width={126} height={38} loading="eager" />
      </Link>
      <nav aria-label="Page">
        <a href="#how">How it works</a>
        <a href="#ai">What the AI can&apos;t do</a>
        <a href="#faq">FAQ</a>
        <a href={REPO_URL}>GitHub</a>
        <a className="l-btn l-btn--ink" href="#try">Try the demo</a>
      </nav>
    </header>
  );
}
