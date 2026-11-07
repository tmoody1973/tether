import Image from "next/image";
import { REPO_URL } from "./bits";

export function Footer() {
  return (
    <footer className="l-foot">
      <div className="l-wrap">
        <Image src="/brand/tether-horizontal-color.svg" alt="Tether" width={106} height={32} />
        <span>Built for the PayPal AI Hackathon 2026.</span>
        <a href={REPO_URL}>github.com/tmoody1973/tether</a>
      </div>
    </footer>
  );
}
