// A trimmed copy of the Stageshow kit (MIT, see LICENSE): only the parts the
// landing page's two stories use. Each component imports its own CSS.
// Source: the stageshow skill's kit/, copied as-is apart from this index and one Tether addition, marked
// "Tether addition" in stage.tsx and act.ts: Stage's `paused` prop, which holds the current frame (WCAG 2.2.2).
export { Stage } from './stage'
export type { StageProps } from './stage'
export type { Act, Script } from './act'
export type { Point, Rect } from './measure'
export { Bar } from './window'
export { Phone, LockScreen, Notification, WALLPAPER } from './phone'
export { Collapse } from './motion/Collapse'
export { Expand } from './motion/Expand'
export { Button } from './controls/Button'
export { Field } from './controls/Field'
