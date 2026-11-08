"use client";

import Image from 'next/image'
import { Bar, Button, Collapse, Expand, Field, LockScreen, Notification, Phone, Stage, WALLPAPER, type Act, type Rect } from '@/ui/stageshow/kit'
import { CHECK, ChipIcon } from './glyphs'
import { SHOP } from './shopWords'
import './tether-stage.css'

// Tether's shopping loop, two phones telling one event. Zoe (indigo) asks her
// shopping agent for headphones; it proposes three options, each carrying the
// rule engine's label. The one over budget opens Tether's amber "no that
// teaches" sheet, with her real numbers and two ways forward; she taps Ask
// Amara. Amara's lock screen gets the push, the request opens with the budget
// consequence first, she approves, and the payoff holds: Approved and paid,
// with the proof PayPal can check.
//
// Wide: the phones side by side, pinned from the top and cropped at the
// bottom through filler (the sheet's level hint, the empty canvas). Compact:
// one phone at a time on a track that pans to Amara when the story crosses.
//
// Every string comes from the app: src/ui/teenWords.ts, src/ai/explain.ts,
// src/ui/approveWords.ts, the shop, ask, request and activity pages (words.ts).

type Approve = 'idle' | 'busy'
type S = {
  query: string
  typing: boolean
  looking: boolean
  shown: number
  scroll: number
  sheet: boolean
  asked: boolean
  note: boolean
  launch: boolean
  open: boolean
  approve: Approve
  paid: boolean
  focus: 'zoe' | 'amara'
  noteAt: Rect
}

const ZERO: Rect = { x: 0, y: 0, width: 0, height: 0 }

const START: S = {
  query: '',
  typing: false,
  looking: false,
  shown: 0,
  scroll: 0,
  sheet: false,
  asked: false,
  note: false,
  launch: false,
  open: false,
  approve: 'idle',
  paid: false,
  focus: 'zoe',
  noteAt: ZERO,
}

// The payoff with both phones: Zoe's ask sent, Amara's payment approved and proved
const POSTER: S = { ...START, query: SHOP.query, shown: 3, asked: true, launch: true, open: true, paid: true, focus: 'amara' }

// Zoe's phone is the hero; Amara's straddles its right edge, a step lower and
// in front, over Zoe's bezel and screen margin only (never her cards)
const WIDE = { phone: 340, top: 36, zoe: 172, amara: 494, drop: 52 }
const COMPACT = { phone: 326, top: 16, left: 16, step: 358 }

// Phone points to stage px: the pro frame is 402pt of screen plus 13pt each side
const scaleOf = (phone: number) => phone / (402 + 26)

const REST = { wide: { x: 500, y: 600 }, compact: { x: 180, y: 600 } }

async function script(a: Act<S>) {
  const compact = a.layout === 'compact'
  const s = scaleOf(compact ? COMPACT.phone : WIDE.phone)
  await a.wait(450)

  // 1. Zoe asks the agent
  a.mark('type')
  await a.click({ at: 'query', x: 0.7, y: 0.5 })
  a.put({ typing: true })
  await a.type('query', SHOP.query, { interval: 38 })
  await a.wait(150)
  await a.click({ at: 'find', x: 0.8, y: 0.55 })
  a.put({ looking: true, typing: false })
  await a.wait(650)

  // 2. Three options come back below the forms, each with its label; a flick brings them up
  a.put({ looking: false })
  await a.stagger([1, 2, 3], (n) => a.put({ shown: n }), 70)
  await a.wait(150)
  a.mark('scroll')
  const results = a.rect('results')
  const app = a.rect('zoe-app')
  const lift = results.y - app.y - 66 * s
  const phone = a.rect('zoe-phone')
  const start = { x: phone.x + 13 * s + 9, y: compact ? 560 : 590 }
  await a.move(start)
  // A flick: the finger travels a third of the way and lifts while moving; the page is thrown on
  const flick = a.drag({ x: start.x - 4, y: start.y - lift / 3 }, undefined, { duration: 260 })
  a.put({ scroll: lift / s })
  await flick
  await a.wait(800)

  // 3. The one over budget: the amber sheet, her numbers, two ways forward
  a.mark('sheet')
  await a.click({ at: 'why', x: 0.75, y: 0.55 })
  a.put({ sheet: true })
  await a.wait(1350)
  a.mark('ask')
  await a.click({ at: 'ask', x: 0.78, y: 0.55 })
  a.put({ sheet: false, asked: true })
  await a.wait(compact ? 350 : 450)

  // 4. Amara's phone buzzes
  if (compact) {
    await a.set({ focus: 'amara' })
    await a.wait(450)
  }
  a.put({ note: true })
  await a.wait(800)

  // 5. She opens it: the budget consequence first, then Approve
  a.mark('open')
  await a.set({ noteAt: a.rect('note', { layout: true }) })
  await a.click({ at: 'note', x: 0.6, y: 0.5 })
  a.put({ launch: true, open: true })
  await a.wait(700)
  // Opened, iOS clears it from the lock screen (under the app, unseen)
  a.put({ note: false })
  await a.wait(550)
  a.mark('approve')
  await a.click({ at: 'approve', x: 0.75, y: 0.6 })
  a.put({ approve: 'busy' })
  await a.wait(700)

  // 6. The payoff holds: approved and paid, and the proof
  a.put({ paid: true })
  a.mark('paid')
  await a.move(REST)
  await a.wait(2200)

  // 7. Reset with a cause: Amara locks her phone; Zoe's ask page gives way to a fresh Shop
  a.mark('reset')
  await a.snap({ query: '', shown: 0, scroll: 0 }, 'zoe-col')
  a.put({ launch: false, note: false, asked: false })
  await a.wait(420)
  await a.snap({ open: false, paid: false, approve: 'idle', noteAt: START.noteAt })
  if (compact) await a.set({ focus: 'zoe' })
  await a.wait(200)
}

function ZoeShop({ s }: { s: S }) {
  return (
    <div className="tt-page" data-on={!s.asked || undefined}>
      <div className="tt-col" data-target="zoe-col" style={{ transform: `translateY(${-s.scroll}px)` }}>
        <div>
          <div className="t-eyebrow">Shop</div>
          <p className="t-left">
            <b className="money">{SHOP.left}</b> left this week
          </p>
        </div>
        <div className="t-card t-form">
          <span className="t-label">What are you after?</span>
          <Field className="t-field" value={s.query} placeholder={SHOP.placeholder} focused={s.typing} box={{ 'data-target': 'query', 'data-cursor': 'pointer' }} />
          <Button className="t-btn t-btn--primary" variant="primary" data-target="find">
            {s.looking ? 'Looking in your shops…' : 'Find options'}
          </Button>
          <p className="t-muted">A helper looks only in your shops and suggests two or three. It can&apos;t buy anything — your rules decide.</p>
        </div>
        <div className="t-card t-form">
          <span className="t-label">Paste a product link</span>
          <Field className="t-field" value="" placeholder="https://…" />
          <Button className="t-btn t-btn--ghost">Check it</Button>
        </div>
        <div className="t-card t-form">
          <span className="t-label">Search your shops</span>
          <Field className="t-field" value="" />
          <Button className="t-btn t-btn--ghost">Search</Button>
        </div>
        <div className="t-results" data-target="results">
          <Collapse open={s.shown > 0}>
            <div className="t-eyebrow" style={{ paddingBottom: 6 }}>
              What your rules say
            </div>
          </Collapse>
          {SHOP.cards.map((c, i) => (
            <Collapse key={c.kind} open={s.shown > i} reveal="drop">
              <article className="t-card t-result">
                <div className="t-result__top">
                  {c.title ? <span className="t-result__title">{c.title}</span> : <Bar w={c.bar} h={9} r={4} tone={3} />}
                  <span className="t-result__price money">{c.price}</span>
                </div>
                <div className="t-result__shop">{c.shop}</div>
                <span className={`t-chip t-chip--${c.kind}`}>
                  <ChipIcon kind={c.kind} />
                  {c.label}
                </span>
                <Button
                  className={`t-btn ${c.kind === 'over' ? 't-btn--ghost' : 't-btn--primary'}`}
                  variant={c.kind === 'over' ? 'secondary' : 'primary'}
                  data-target={c.kind === 'over' ? 'why' : undefined}
                >
                  {c.action}
                </Button>
              </article>
            </Collapse>
          ))}
        </div>
      </div>
    </div>
  )
}

function ZoeWeek({ s }: { s: S }) {
  return (
    <div className="tt-page" data-on={s.asked || undefined}>
      <div className="tt-col">
        <div>
          <div className="t-eyebrow">Your week</div>
          <div className="t-hero money">{SHOP.left}</div>
          <div className="t-hero-sub">left this week</div>
        </div>
        <div>
          <div className="t-bar">
            <span style={{ width: `${(16.98 / 30) * 100}%` }} />
          </div>
          <div className="t-barlabels">
            <span>
              spent <span className="money">$16.98</span> of <span className="money">$30.00</span>
            </span>
            <span>{SHOP.resets}</span>
          </div>
        </div>
        <div className="t-pill">{SHOP.level}</div>
        <p className="t-flash" data-target="flash">
          {SHOP.sent}
        </p>
        <section>
          <div className="t-eyebrow" style={{ marginBottom: 6 }}>
            This week
          </div>
          <div className="t-card t-card--tight">
            {[
              [118, 150],
              [96, 176],
            ].map(([a, b], i) => (
              <div key={i} className="t-row">
                <span className="t-row__who">
                  <Bar w={46} h={9} r={4} tone={4} />
                  <Bar w={b} h={7} r={3} tone={2} style={{ marginTop: 9 }} />
                </span>
                <Bar w={a / 3} h={9} r={4} tone={3} />
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="t-eyebrow" style={{ marginBottom: 6 }}>
            Your asks
          </div>
          <div className="t-card t-card--tight">
            <div className="t-row">
              <span className="t-row__who">
                {SHOP.focal.shop}
                <small>{SHOP.focal.title} · Waiting for Amara</small>
              </span>
              <span className="t-row__amt money">{SHOP.focal.price}</span>
            </div>
          </div>
        </section>
        <Button className="t-btn t-btn--primary" variant="primary">
          Find something
        </Button>
      </div>
    </div>
  )
}

function Sheet({ s }: { s: S }) {
  return (
    <>
      <div className="t-scrim" data-on={s.sheet || undefined} />
      <section className="t-sheet" data-on={s.sheet || undefined}>
        <div className="t-grabber" />
        <span className="t-chip t-chip--over">
          <ChipIcon kind="over" />
          Not this time
        </span>
        <div>
          <div className="t-h2">That one doesn&apos;t fit this week.</div>
          <p className="t-muted" style={{ marginTop: 5 }}>
            <span className="money">{SHOP.focal.price}</span> · {SHOP.focal.shop}
          </p>
        </div>
        <div className="t-card t-card--quiet">
          <p className="t-small">{SHOP.sentence}</p>
          <p className="t-small" style={{ marginTop: 6 }}>
            {SHOP.numbers}
          </p>
        </div>
        <div className="t-routes">
          <Button className="t-btn t-btn--primary" variant="primary" data-target="ask">
            Ask Amara
          </Button>
          <Button className="t-btn t-btn--ghost">{SHOP.wait}</Button>
        </div>
        {/* Her level hint sits under the crop: filler */}
        <div className="t-hint" style={{ display: 'grid', gap: 9, paddingBlock: 17 }}>
          <Bar w="88%" h={7} r={3} tone={2} style={{ background: '#D6D0FF' }} />
          <Bar w="54%" h={7} r={3} tone={2} style={{ background: '#D6D0FF' }} />
        </div>
      </section>
    </>
  )
}

function AmaraRequest({ s }: { s: S }) {
  return (
    <div className="tt-page" data-on={!s.paid || undefined}>
      <div className="g-col">
        <span className="g-back">‹ Home</span>
        <div>
          <div className="g-eyebrow">Request</div>
          <div className="g-title">{SHOP.request}</div>
        </div>
        <section className="g-card">
          <p>
            She has <b className="money">{SHOP.left}</b> left this week. This would use the rest and <b className="money">{SHOP.over}</b> more.
          </p>
          <div className="g-bar">
            <span style={{ width: `${(13.02 / 25.3) * 100}%` }} />
          </div>
          <div className="g-barlabels">
            <span>{SHOP.left} available</span>
            <span className="g-over">{SHOP.over} over</span>
          </div>
          <p className="g-note">{SHOP.focal.title}</p>
        </section>
        {/* Her reason: the real one is about another item, so it stays filler */}
        <section className="g-card" style={{ display: 'grid', gap: 10 }}>
          <div className="g-eyebrow">Her reason</div>
          <Bar w="86%" h={8} r={4} tone={2} />
          <Bar w="48%" h={8} r={4} tone={2} />
        </section>
        <section className="g-card g-card--quiet">
          <p>
            <span>Her last 4 weeks: </span>
            <b>inside budget 4 of 4</b>
            <span>, savings kept 4 of 4.</span>
          </p>
        </section>
        <div className="g-decide">
          <Button className="g-btn" variant="primary" data-target="approve">
            {s.approve === 'busy' ? 'Working…' : `Approve ${SHOP.focal.price}`}
          </Button>
          <Button className="g-btn g-btn--ghost">Not this time</Button>
        </div>
        <p className="g-seam">Sandbox only; no real money moves.</p>
      </div>
    </div>
  )
}

function AmaraPaid({ s }: { s: S }) {
  return (
    <div className="tt-page" data-on={s.paid || undefined}>
      <div className="g-col">
        <p className="g-flash">{SHOP.paid}</p>
        <section className="g-card">
          <div className="g-row">
            <span className="g-row__shop">{SHOP.focal.shop}</span>
            <span className="g-row__amt">{SHOP.focal.price}</span>
          </div>
          <div className="g-row__sub">{SHOP.focal.title}</div>
          <dl className="g-proofbox">
            <div>
              <dt>PayPal ID</dt>
              <dd>
                <code>{SHOP.paypalId}</code>
              </dd>
            </div>
            <div>
              <dt>Allowed by</dt>
              <dd>Rules v3, signed by you, and you approved it</dd>
            </div>
            <div>
              <dt>Permission slip</dt>
              <dd>Single use, this cart only, valid 2 minutes.</dd>
            </div>
            <div>
              <dt>Checked against PayPal</dt>
              <dd className="g-ok">{CHECK}Matches PayPal</dd>
            </div>
          </dl>
        </section>
        {/* The record goes on with older payments: filler */}
        <section className="g-card g-rows">
          {[
            [52, 150],
            [64, 176],
          ].map(([a, b], i) => (
            <div key={i} className="g-rowitem">
              <div className="g-row">
                <Bar w={a} h={9} r={4} tone={4} />
                <Bar w={40} h={9} r={4} tone={3} />
              </div>
              <Bar w={b} h={7} r={3} tone={2} />
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

function TetherNote(props: { 'data-target'?: string }) {
  return <Notification {...props} icon={<Image className="tt-appicon" src="/brand/tether-app-icon.svg" alt="" width={38} height={38} />} title="Tether" body={SHOP.request} />
}

export default function TetherShopStory() {
  return (
    <Stage<S> width={1000} height={680} compact={{ below: 720, width: 358, height: 640 }} initial={START} poster={POSTER} script={script} cursor={{ at: REST, style: 'touch' }} className="tt tt-shop">
      {(s, _rect, layout) => {
        const compact = layout === 'compact'
        const width = compact ? COMPACT.phone : WIDE.phone
        const top = compact ? COMPACT.top : WIDE.top
        const amaraTop = compact ? COMPACT.top : WIDE.top + WIDE.drop
        const pan = compact && s.focus === 'amara' ? -COMPACT.step : 0
        const zoeLeft = compact ? COMPACT.left : WIDE.zoe
        const amaraLeft = compact ? COMPACT.left + COMPACT.step : WIDE.amara
        return (
          <>
            <div className="tt-track" style={{ transform: `translateX(${pan}px)` }}>
              <Phone width={width} time="8:54" className="tt-phone" data-target="zoe-phone" style={{ left: zoeLeft, top }}>
                <div className="tt-app tt-app--teen" data-target="zoe-app">
                  <ZoeShop s={s} />
                  <ZoeWeek s={s} />
                  <div className="tt-statusbg" />
                  <Sheet s={s} />
                </div>
              </Phone>

              <Phone width={width} time="8:54" dark={!s.open} wallpaper={WALLPAPER} className="tt-phone" data-target="amara-phone" style={{ left: amaraLeft, top: amaraTop }}>
                <LockScreen time="8:54" date="" stack="top" size="satellite">
                  <div className="tt-note" data-on={s.note || undefined}>
                    <TetherNote data-target="note" />
                  </div>
                </LockScreen>
                <div className="tt-launch" data-on={s.launch || undefined}>
                  <Expand open={s.open} from={s.noteAt} radius={24} face={<TetherNote />} className="tt-expand">
                    <div className="tt-app tt-app--guard">
                      <AmaraRequest s={s} />
                      <AmaraPaid s={s} />
                    </div>
                  </Expand>
                </div>
              </Phone>
            </div>
          </>
        )
      }}
    </Stage>
  )
}
