"use client";

import Image from 'next/image'
import { Bar, Button, Collapse, Expand, Field, LockScreen, Notification, Phone, Stage, WALLPAPER, type Act, type Rect } from '@/ui/stageshow/kit'
import { INVEST } from './investWords'
import './tether-stage.css'
import './invest-stage.css'

// Tether's investing loop, on the same two phones. From Level 2 Zoe can
// propose investing her savings: on VTI's page she reads what one share costs
// and what's inside, finds her own three answers, types $5 and sees it as a
// slice of a share, and proposes it to Amara. Amara's lock screen gets the
// push; the request shows the consequence and Zoe's answers; she approves.
// The payoff holds on both phones: Amara's "Bought." and Zoe's first
// investment card, which says plainly it is too soon to tell.
//
// Every string is the app's own (words.ts names each source).

type S = {
  scroll: number
  amount: string
  typing: boolean
  sending: boolean
  sent: boolean
  note: boolean
  launch: boolean
  open: boolean
  approving: boolean
  bought: boolean
  focus: 'zoe' | 'amara'
  noteAt: Rect
}

const ZERO: Rect = { x: 0, y: 0, width: 0, height: 0 }

const START: S = {
  scroll: 0,
  amount: '',
  typing: false,
  sending: false,
  sent: false,
  note: false,
  launch: false,
  open: false,
  approving: false,
  bought: false,
  focus: 'zoe',
  noteAt: ZERO,
}

// The payoff on both phones: Zoe's first investment, Amara's "Bought."
const POSTER: S = { ...START, amount: INVEST.amount, sent: true, launch: true, open: true, bought: true, focus: 'zoe' }

// Zoe's phone leads; Amara's straddles its right edge, lower and in front
const WIDE = { phone: 340, top: 36, zoe: 109, amara: 431, drop: 52 }
const COMPACT = { phone: 326, top: 16, left: 16, step: 358 }
const scaleOf = (phone: number) => phone / (402 + 26)
const REST = { wide: { x: 440, y: 620 }, compact: { x: 180, y: 600 } }

async function script(a: Act<S>) {
  const compact = a.layout === 'compact'
  const s = scaleOf(compact ? COMPACT.phone : WIDE.phone)
  await a.wait(1100)

  // 1. From the fund's facts to her proposal: one flick
  a.mark('scroll')
  const form = a.rect('ask-card')
  const app = a.rect('zoe-app')
  const lift = form.y - app.y - 64 * s
  const phone = a.rect('zoe-phone')
  const start = { x: phone.x + 13 * s + 9, y: compact ? 560 : 600 }
  await a.move(start)
  // A flick: the finger travels a third of the way and lifts while moving; the page is thrown on
  const flick = a.drag({ x: start.x - 4, y: start.y - lift / 3 }, undefined, { duration: 260 })
  a.put({ scroll: lift / s })
  await flick
  await a.wait(750)

  // 2. Five dollars, shown as a slice of one share as she types
  a.mark('amount')
  await a.click({ at: 'amount', x: 0.7, y: 0.5 })
  a.put({ typing: true })
  await a.type('amount', INVEST.amount)
  await a.wait(1200)
  await a.click({ at: 'propose', x: 0.8, y: 0.55 })
  a.put({ typing: false, sending: true })
  await a.wait(600)
  a.put({ sent: true })
  await a.wait(450)

  // 3. Amara's phone: the push, then the request with Zoe's answers
  if (compact) {
    await a.set({ focus: 'amara' })
    await a.wait(450)
  }
  a.mark('push')
  a.put({ note: true })
  await a.wait(900)
  await a.set({ noteAt: a.rect('note', { layout: true }) })
  await a.click({ at: 'note', x: 0.6, y: 0.5 })
  a.put({ launch: true, open: true })
  await a.wait(700)
  // Opened, iOS clears it from the lock screen (under the app, unseen)
  a.put({ note: false })
  await a.wait(700)
  a.mark('approve')
  await a.click({ at: 'approve', x: 0.75, y: 0.6 })
  a.put({ approving: true })
  await a.wait(650)

  // 4. Bought: both phones say so, and the payoff holds
  if (compact) {
    a.put({ bought: true })
    await a.wait(1300)
    await a.set({ focus: 'zoe' })
  } else {
    a.put({ bought: true })
  }
  a.mark('paid')
  await a.move(REST)
  await a.wait(2200)

  // 5. Amara locks her phone; Zoe's page gives way to the fund page again
  a.mark('reset')
  await a.snap({ scroll: 0, amount: '', sending: false }, 'zoe-form')
  a.put({ launch: false, note: false, sent: false, bought: false })
  await a.wait(280)
  await a.snap({ open: false, approving: false, noteAt: ZERO })
}

function FundTop({ flash }: { flash: boolean }) {
  return (
    <>
      <div>
        <div className="t-eyebrow">Look closer</div>
        <div className="t-h2 ti-name">{INVEST.name}</div>
        <p className="t-muted">{INVEST.listing}</p>
      </div>
      {flash && <p className="t-flash">{INVEST.sent}</p>}
      <section className="t-card">
        <div className="t-card__k">One share costs</div>
        <div className="t-big money">{INVEST.price}</div>
        <p className="t-small">{INVEST.close}</p>
      </section>
      <section className="t-card">
        <div className="t-card__k">What&apos;s inside</div>
        <p className="t-small" style={{ marginTop: 4 }}>
          Its biggest holdings, by share of the fund:
        </p>
        <ul className="t-hl">
          {INVEST.inside.map(([name, pct]) => (
            <li key={name}>
              <span>{name}</span>
              <span className="t-hl__bar">
                <i style={{ width: `${(pct / INVEST.inside[0][1]) * 100}%` }} />
              </span>
              <span className="t-hl__pct">{pct.toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function ZoeFund({ s }: { s: S }) {
  return (
    <div className="tt-page" data-on={!s.sent || undefined}>
      <div className="tt-col" data-target="zoe-form" style={{ transform: `translateY(${-s.scroll}px)` }}>
        <FundTop flash={false} />
        <p className="t-small">{INVEST.onList}</p>
        <div className="t-card t-form" data-target="ask-card">
          <div className="t-label" style={{ fontSize: 16 }}>
            Ask yourself
          </div>
          {INVEST.answers.map(([q, answer]) => (
            <div key={q} className="t-form">
              <span className="t-label">{q}</span>
              <div className="t-textarea">{answer}</div>
            </div>
          ))}
          <span className="t-label">How much, in dollars?</span>
          <Field className="t-field" value={s.amount} placeholder="5.00" focused={s.typing} box={{ 'data-target': 'amount', 'data-cursor': 'pointer' }} />
          <Collapse open={!!s.amount}>
            <p className="t-hint">{INVEST.shares}</p>
          </Collapse>
          <p className="t-muted">{INVEST.limits}</p>
          <Button className="t-btn t-btn--primary" variant="primary" data-target="propose">
            {s.sending ? 'Sending…' : 'Propose to Amara'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ZoeSent({ s }: { s: S }) {
  return (
    <div className="tt-page" data-on={(s.sent && !s.bought) || undefined}>
      <div className="tt-col">
        <FundTop flash />
      </div>
    </div>
  )
}

function ZoeHolding({ s }: { s: S }) {
  return (
    <div className="tt-page" data-on={s.bought || undefined}>
      <div className="tt-col">
        <div>
          <div className="t-eyebrow">Invest</div>
          <div className="t-h2 ti-name">Search the whole market</div>
          <p className="t-small" style={{ marginTop: 4 }}>
            You have <b className="money">{INVEST.left}</b> available to invest. You propose, Amara decides. Tether recommends nothing.
          </p>
        </div>
        <div className="t-form">
          <span className="t-label">A fund or company</span>
          <Field className="t-field" value="" />
          <Button className="t-btn t-btn--ghost">Search</Button>
        </div>
        <section>
          <div className="t-eyebrow" style={{ marginBottom: 6 }}>
            Your investments
          </div>
          <section className="t-card">
            <div className="g-row">
              <b style={{ fontSize: 17 }}>VTI</b>
              <span className="t-muted">{INVEST.since}</span>
            </div>
            <div className="t-big money">
              $5.00 <span className="ti-unit">worth today</span>
            </div>
            <div className="t-row ti-row">
              <span>You own</span>
              <b>{INVEST.owns}</b>
            </div>
            <div className="t-row ti-row">
              <span>You put in</span>
              <b>{INVEST.putIn}</b>
            </div>
            <p className="t-hint" style={{ marginTop: 8 }}>
              {INVEST.tooSoon}
            </p>
            <p className="t-quote" style={{ marginTop: 10 }}>
              Why you picked it: <i>&ldquo;{INVEST.answers[0][1]}&rdquo;</i>
            </p>
          </section>
        </section>
      </div>
    </div>
  )
}

function AmaraRequest({ s }: { s: S }) {
  const [a, left, b, amount, c] = INVEST.consequence
  return (
    <div className="tt-page" data-on={!s.bought || undefined}>
      <div className="g-col">
        <span className="g-back">‹ Home</span>
        <div>
          <div className="g-eyebrow">Request</div>
          <div className="g-title">{INVEST.request}</div>
          <p className="g-sub">{INVEST.shareSub}</p>
        </div>
        <section className="g-card">
          <p>
            <span>{a}</span>
            <b className="money">{left}</b>
            <span>{b}</span>
            <b className="money">{amount}</b>
            <span>{c}</span>
          </p>
        </section>
        <section className="g-card">
          <div className="g-eyebrow">Her answers</div>
          <p style={{ marginTop: 6 }}>
            <span className="g-q">{INVEST.answers[0][0]}</span>
            <br />
            <span className="g-reason">&ldquo;{INVEST.answers[0][1]}&rdquo;</span>
          </p>
          <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
            <Bar w="62%" h={8} r={4} tone={2} />
            <Bar w="80%" h={8} r={4} tone={2} />
          </div>
        </section>
        <div className="g-decide">
          <Button className="g-btn" variant="primary" data-target="approve">
            {s.approving ? 'Working…' : 'Approve $5.00'}
          </Button>
          <Button className="g-btn g-btn--ghost">Not this time</Button>
        </div>
      </div>
    </div>
  )
}

function AmaraBought({ s }: { s: S }) {
  return (
    <div className="tt-page" data-on={s.bought || undefined}>
      <div className="g-col">
        <p className="g-flash">{INVEST.bought}</p>
        <div className="g-eyebrow">Zoe&apos;s investments</div>
        <section className="g-card">
          <div className="g-def">
            <span className="g-def__k">VTI</span>
            <span className="g-def__lead" />
            <span className="g-def__v">$5.00</span>
          </div>
          <p className="g-holdline">{INVEST.herSentence}</p>
          <p className="g-note">{INVEST.tooSoon}</p>
        </section>
        {/* The rest of her Home: this week and the record, as filler */}
        <section className="g-card g-rows">
          {[
            [64, 150],
            [52, 188],
            [70, 132],
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
  return (
    <Notification
      {...props}
      icon={<Image className="tt-appicon" src="/brand/tether-app-icon.svg" alt="" width={38} height={38} />}
      title="Tether"
      body={
        <>
          {INVEST.request}
          <br />
          {INVEST.push}
        </>
      }
    />
  )
}

export default function TetherInvestStory() {
  return (
    <Stage<S> width={880} height={660} compact={{ below: 620, width: 358, height: 640 }} initial={START} poster={POSTER} script={script} cursor={{ at: REST, style: 'touch' }} className="tt tt-invest">
      {(s, _rect, layout) => {
        const compact = layout === 'compact'
        const width = compact ? COMPACT.phone : WIDE.phone
        const top = compact ? COMPACT.top : WIDE.top
        const amaraTop = compact ? COMPACT.top : WIDE.top + WIDE.drop
        const pan = compact && s.focus === 'amara' ? -COMPACT.step : 0
        return (
          <div className="tt-track" style={{ transform: `translateX(${pan}px)` }}>
            <Phone width={width} time="8:54" className="tt-phone" data-target="zoe-phone" style={{ left: compact ? COMPACT.left : WIDE.zoe, top }}>
              <div className="tt-app tt-app--teen" data-target="zoe-app">
                <ZoeFund s={s} />
                <ZoeSent s={s} />
                <ZoeHolding s={s} />
                <div className="tt-statusbg" />
              </div>
            </Phone>

            <Phone width={width} time="8:54" dark={!s.open} wallpaper={WALLPAPER} className="tt-phone" style={{ left: compact ? COMPACT.left + COMPACT.step : WIDE.amara, top: amaraTop }}>
              <LockScreen time="8:54" date="" stack="top" size="satellite">
                <div className="tt-note" data-on={s.note || undefined}>
                  <TetherNote data-target="note" />
                </div>
              </LockScreen>
              <div className="tt-launch" data-on={s.launch || undefined}>
                <Expand open={s.open} from={s.noteAt} radius={24} face={<TetherNote />} className="tt-expand">
                  <div className="tt-app tt-app--guard">
                    <AmaraRequest s={s} />
                    <AmaraBought s={s} />
                  </div>
                </Expand>
              </div>
            </Phone>
          </div>
        )
      }}
    </Stage>
  )
}
