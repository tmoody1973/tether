import type { Metadata } from "next";
import "@/ui/tokens.css";
import "@/ui/teen.css";

export const metadata: Metadata = { title: "Tether", robots: { index: false, follow: false } };

export default function TeenLayout({ children }: LayoutProps<"/t/[token]">) {
  return children;
}
