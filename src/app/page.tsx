import type { Metadata } from "next";
import "@/ui/tokens.css";
import "./landing.css";
import { demoLinks } from "./demoLinks";
import { Agents } from "./landing/Agents";
import { AiCanCant } from "./landing/AiCanCant";
import { Features } from "./landing/Features";
import { Footer } from "./landing/Footer";
import { Hero } from "./landing/Hero";
import { HowItWorks } from "./landing/HowItWorks";
import { PayPal } from "./landing/PayPal";
import { Problem } from "./landing/Problem";
import { StandIns } from "./landing/StandIns";
import { Top } from "./landing/Top";
import { TryIt } from "./landing/TryIt";

const TITLE = "Tether — Let your teen shop. Keep the boundaries you agreed on.";
const DESCRIPTION =
  "Your teenager shops within limits you set, using your PayPal without sharing your card or login. A parent signs the rules, an AI agent proposes, code decides, PayPal pays.";

export const metadata: Metadata = {
  // Absolute share-card URLs: APP_BASE_URL where it's set; Next falls back to the Vercel production URL otherwise.
  ...(process.env.APP_BASE_URL ? { metadataBase: new URL(process.env.APP_BASE_URL) } : {}),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE, description: DESCRIPTION, type: "website", siteName: "Tether",
    images: [{ url: "/og-landing.png", width: 1200, height: 630, alt: "Tether: Let your teen shop. Keep the boundaries you agreed on. Amara's and Zoe's phones side by side." }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/og-landing.png"] },
};

export default function Landing() {
  const links = demoLinks();
  return (
    <div className="l-page">
      <Top />
      <main>
        <Hero links={links} />
        <Problem />
        {/* The family's experience before the agent architecture. */}
        <Features />
        <HowItWorks />
        <Agents />
        <AiCanCant />
        <PayPal />
        <StandIns />
        <TryIt links={links} />
      </main>
      <Footer />
    </div>
  );
}
