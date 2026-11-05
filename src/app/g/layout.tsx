import type { Metadata } from "next";
import "@/ui/tokens.css";
import "@/ui/guardian.css";

export const metadata: Metadata = { title: "Tether", robots: { index: false, follow: false } };

export default function GuardianLayout({ children }: LayoutProps<"/g">) {
  return children;
}
