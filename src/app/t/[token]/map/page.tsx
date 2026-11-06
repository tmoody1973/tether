import { Suspense } from "react";
import { teenSession } from "@/auth/teen";
import { now as clockNow } from "@/clock/clock";
import { teenWeek } from "@/flows/teen";
import { shopMap } from "@/flows/teenMap";
import { LinkGone, TeenLoading, TeenShell, TileChip } from "@/ui/teen";
import { tileWords } from "@/ui/teenWords";
import { NotShopping } from "../NotShopping";
import { SuggestForm } from "./SuggestForm";

// F4 "Zoe's map of where her money works": Open / Ask first / Locked tiles. No prices, ratings, links or promotions.
export default function MapPage({ params, searchParams }: PageProps<"/t/[token]/map">) {
  return (
    <Suspense fallback={<TeenLoading />}>
      <ShopMap params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ShopMap({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await params;
  const session = await teenSession(token);
  if (!session) return <LinkGone />;
  const { db, fam } = session;
  const now = await clockNow(db, fam.id);
  const w = await teenWeek(db, fam.id, now);
  const g = w.guardianName;
  if (w.state !== "active") {
    return (
      <TeenShell token={token} active="map" level={w.level} center>
        {w.state === "ended"
          ? <><h1 className="t-h2">Your week&apos;s finished.</h1><p className="t-small">Your map comes back when {g} renews your rules.</p></>
          : <NotShopping w={w} />}
      </TeenShell>
    );
  }
  const { tiles, suggested } = await shopMap(db, fam.id, now);
  const sp = await searchParams;
  const sent = typeof sp.suggested === "string" && suggested.includes(sp.suggested) ? sp.suggested : null; // only if it really is waiting

  return (
    <TeenShell token={token} active="map" level={w.level}>
      <div>
        <h1 className="t-eyebrow">Map</h1>
        <p className="t-h2" style={{ marginTop: 6 }}>Where your money works</p>
      </div>
      {sent && <p className="t-flash" role="status">Sent. {g} will see your suggestion for {sent}.</p>}
      <ul className="t-tiles" aria-label="Your shops">
        {tiles.map((tile) => {
          const { label, line } = tileWords(tile, g);
          return (
            <li key={tile.id} className={tile.kind === "locked" ? "t-tile t-tile--locked" : "t-tile"} aria-label={`${tile.name}: ${label}. ${line}`}>
              <span className="t-tile__name">{tile.name}</span>
              <TileChip kind={tile.kind} label={label} />
              <span className="t-tile__line">{line}</span>
            </li>
          );
        })}
      </ul>
      {suggested.length > 0 && (
        <section aria-labelledby="waiting-h">
          <h2 className="t-eyebrow" id="waiting-h" style={{ marginBottom: 4 }}>Waiting for {g}</h2>
          <ul className="t-card t-card--tight" style={{ listStyle: "none" }}>
            {suggested.map((d) => <li key={d} className="t-row"><span className="t-row__who">{d}<small>You suggested this shop</small></span></li>)}
          </ul>
        </section>
      )}
      <SuggestForm token={token} guardian={g} />
    </TeenShell>
  );
}
