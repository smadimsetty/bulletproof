# Bulletproof — visual design spec (Stage 4)

Written 2026-11-08 for Stage 4 of `2026-11-08-finish-the-app-design.md`.
Implementers: build exactly what is written here. Where this doc is silent,
reuse the closest pattern already in it rather than inventing a new one.

Scope: every screen defined by the Stage 0–3 plans. Plain React Native
`StyleSheet` + `react-native-reanimated` + `expo-haptics` +
`@expo/vector-icons` (Ionicons) + `react-native-svg` (already installed).
No styling library, no gesture library beyond what RN core ships
(`PanResponder`, already used by `SwipeToDelete`).

Install for this stage (controller runs it): `npx expo install
react-native-reanimated react-native-worklets` (Reanimated 4 needs the
worklets package; add `react-native-worklets/plugin` to babel only if the
installed version's docs say so — Expo SDK 56's babel preset normally
handles it). `app.json`: `userInterfaceStyle: "dark"`, `name: "Bulletproof"`.

---

## 1. Design principles

1. **Black canvas, one volt accent.** Everything is near-black and grey;
   the lime accent `#C6F432` is reserved for *the next action* and *earned
   progress* (primary button, active set, completed check, streak, PR).
   If two accent things compete on one screen, demote one to `secondary`.
   Danger red and success mint are for state only, never decoration.
2. **The number is the hero.** Every stat-bearing screen leads with one
   big tabular numeral (streak, hold seconds, day 6/14, timer). Labels are
   small, uppercase, tertiary. Never put two display-size numbers side by
   side; use `stat` size for secondary numbers.
3. **Every tap answers back within 100 ms.** Pressables scale to 0.97 with
   a light haptic; completions get a success haptic and a visible state
   change (fill, check, colour). No tap is silent, no save is silent —
   failures surface as a danger Toast with a working Retry.
4. **Always a next step.** Every screen ends with one obvious primary
   action placed in the thumb zone (bottom 1/3: sticky footer or the
   last card). Empty states teach and carry a button. Errors carry Retry.
   No screen is a dead end.
5. **Motion explains where things went.** Sheets rise from the bottom,
   pushes slide from the right, completed sets collapse and the next set
   lights up, numbers roll up to their value. Durations stay 120–320 ms;
   nothing bounces more than once. Respect Reduce Motion (cross-fade only).
6. **Calm density.** 16 px gutters, 12 px between cards, cards grouped
   by meaning. One card = one idea. Secondary info lives behind the eye
   toggle, a sheet, or a push — not on the surface.
7. **Ours, not borrowed.** No orange, no app-store-famous blue; no
   chevron-swoosh, flame or shield marks; copy is plain and direct
   ("Hold 45s", "Day 6 of 14"), never motivational-poster.

---

## 2. Tokens — new `apps/mobile/lib/theme.ts`

Replace the file wholesale. Keep exported names `COLORS`, `SPACING`,
`RADII`, `TYPE`, `sharedStyles` so untouched screens still compile during
the migration; old keys are mapped at the bottom (`COLORS.ink`,
`COLORS.muted`, `COLORS.card`, `COLORS.accentMuted`, `COLORS.background`,
`COLORS.border`, `COLORS.danger`). `SESSION_TYPE_COLORS` is deleted once
Stage 1 removed its only consumer (grep first; if still imported, keep it).

### 2.1 Colour

All ratios are WCAG 2.1 contrast, computed for this doc. AA = 4.5 normal
text, 3.0 large text (≥ 18.66 px bold / 24 px) and UI glyphs.

| Token | Hex | Use |
|---|---|---|
| `bg` | `#0B0C0F` | Screen background, status bar area |
| `surface` | `#15171C` | Cards, list rows, tab bar sits at `tabBar` |
| `elevated` | `#1E2128` | Inputs, chips, active set row, nested cards |
| `sheet` | `#262A32` | Bottom sheets, toasts, menus |
| `tabBar` | `#101115` | Tab bar + sticky footers |
| `scrim` | `rgba(0,0,0,0.6)` | Behind sheets/modals |
| `textPrimary` | `#F4F5F7` | Titles, values, body |
| `textSecondary` | `#B3B8C3` | Supporting copy, row subtitles |
| `textTertiary` | `#8E94A1` | Labels, hints, placeholders, inactive icons |
| `textDisabled` | `#5C6270` | Disabled labels only (exempt from AA) |
| `accent` | `#C6F432` | "Volt" — primary actions, active, earned |
| `accentPressed` | `#A8D41C` | Pressed primary button |
| `onAccent` | `#0B0C0F` | Text/icons on accent fills |
| `accentTint` | `#313A20` | Accent-on-surface tint (16 % accent over `surface`): selected chip bg, completed set row bg |
| `success` | `#3DDC97` | Better-than-before, pass, saved |
| `successTint` | `#1B3730` | |
| `warning` | `#FFB547` | Prefill banner, unsaved, pending request |
| `warningTint` | `#3A3023` | |
| `danger` | `#FF6369` | Worse, fail, destructive, errors |
| `dangerTint` | `#3A2328` | |
| `onDanger` | `#0B0C0F` | Text on danger-filled button |
| `border` | `#2C313A` | Input outlines, card outlines on `bg` |
| `borderStrong` | `#3A404B` | Focused-but-not-accent outlines, dividers in sheets |
| `divider` | `#20232A` | Hairline between list rows (`StyleSheet.hairlineWidth`) |
| `chartLeft` | `#4FC3F7` | L series (cyan) |
| `chartRight` | `#FF9F43` | R series (amber) |
| `chartSeries` | `['#C6F432','#4FC3F7','#FF9F43','#A78BFA','#F472B6','#3DDC97']` | Multi-series, in this order |
| `chartGrid` | `#23262E` | Chart grid lines / axis |

Contrast of text pairs (foreground on bg / surface / elevated / sheet):

| Foreground | bg | surface | elevated | sheet |
|---|---|---|---|---|
| textPrimary `#F4F5F7` | 17.9 | 16.4 | 14.8 | 13.2 |
| textSecondary `#B3B8C3` | 9.8 | 9.0 | 8.1 | 7.2 |
| textTertiary `#8E94A1` | 6.4 | 5.9 | 5.3 | 4.7 |
| accent `#C6F432` | 15.3 | 14.0 | 12.6 | 11.2 |
| success `#3DDC97` | 11.1 | 10.1 | 9.1 | 8.1 |
| warning `#FFB547` | 11.1 | 10.2 | 9.2 | 8.2 |
| danger `#FF6369` | 6.7 | 6.2 | 5.6 | 5.0 |
| chartLeft / chartRight | 9.8 / 9.6 | 8.9 / 8.8 | 8.0 / 7.9 | 7.2 / 7.1 |
| violet `#A78BFA` / pink `#F472B6` | 7.2 / 7.4 | 6.6 / 6.8 | 5.9 / 6.1 | 5.3 / 5.4 |

Fills: `onAccent` on `accent` 15.3; on `accentPressed` 11.3; `onDanger` on
`danger` 6.7. Tints: accent on `accentTint` 9.3 (textPrimary 11.0);
success on `successTint` 7.3; danger on `dangerTint` 5.0; warning on
`warningTint` 7.3. All pass AA for normal text. `textTertiary` passes AA
on every background including `sheet` (4.7) — never put it on `accentTint`.
L/R are cyan vs amber: distinguishable for deuteranopia/protanopia; still
always label lines "L"/"R" (never colour-only).

### 2.2 Type (system font = SF Pro)

`fontVariant: ['tabular-nums']` on every style marked **tab**. Line heights
are absolute px.

| Token | Size | Weight | Line height | Letter spacing | Notes |
|---|---|---|---|---|---|
| `display` | 64 | `'800'` | 68 | -2 | **tab**. Timer, streak hero, sprint day number |
| `numeral` | 40 | `'800'` | 44 | -1 | **tab**. Stat tiles, PR value, big counts |
| `stat` | 24 | `'700'` | 28 | -0.5 | **tab**. Secondary numbers, set inputs |
| `title1` | 28 | `'800'` | 34 | -0.5 | Large screen titles (tab roots) |
| `title2` | 22 | `'700'` | 28 | -0.3 | Sheet titles, pushed screen hero |
| `title3` | 17 | `'700'` | 22 | -0.2 | Card titles, exercise names |
| `body` | 16 | `'400'` | 22 | 0 | Body copy |
| `bodyStrong` | 16 | `'600'` | 22 | 0 | Row titles, button labels (md/lg) |
| `callout` | 14 | `'500'` | 20 | 0 | Row subtitles, chip labels, small buttons |
| `footnote` | 13 | `'400'` | 18 | 0 | Helper text, timestamps |
| `overline` | 12 | `'700'` | 16 | 1.2 | UPPERCASE section labels, stat labels (`textTransform: 'uppercase'`) |
| `caption` | 11 | `'600'` | 14 | 0.4 | Badges, chart axis labels, tab labels |

Default colours: titles/body `textPrimary`; callout `textSecondary`;
footnote/overline/caption `textTertiary`. Max 2 lines on row titles
(`numberOfLines={2}`), notes in feed cards 3 lines.
Dynamic Type: leave `allowFontScaling` on for body/callout/footnote; set
`maxFontSizeMultiplier={1.2}` on `display`, `numeral`, `stat` so layouts
hold.

### 2.3 Spacing, radii, sizes

```ts
export const SPACING = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
// screen gutter = lg (16); gap between cards = md (12); card padding = lg (16);
// gap between sections = xl (24); sticky footer padding = lg + safe-area bottom.
export const RADII = { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;
// inputs/chips-in-rows = sm; buttons = md; cards = lg; sheets top corners = xl; avatars/pills = pill.
export const SIZES = {
  hitMin: 44,          // every tappable: min 44x44 (use hitSlop to reach it on small glyphs)
  buttonSm: 36, buttonMd: 48, buttonLg: 56,
  iconSm: 16, iconMd: 20, iconLg: 24, iconXl: 32,
  rowMin: 56,          // list rows
  setRow: 52,          // logger set rows
  tabBar: 56,          // + safe-area bottom
  avatarXs: 24, avatarSm: 32, avatarMd: 44, avatarLg: 72, avatarXl: 96,
} as const;
```

**Old-key compatibility (bottom of theme.ts):**
`SPACING.md` changes meaning (16 → 12). Before the redesign, do a
codemod-free migration: export `LEGACY_SPACING = { xs:4, sm:8, md:16, lg:24, xl:32 }`
and point untouched screens at it via find/replace of the import in the
first implementation step (§7 step 1). Each redesigned screen moves to
the new scale.

### 2.4 Elevation (dark mode)

Shadows barely read on black; elevation is mostly **lighter surface +
hairline top highlight**. Define in `theme.ts`:

```ts
export const ELEVATION = {
  0: {},                                                       // flat on bg
  1: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#262A32' },            // cards
  2: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#30353F',
       shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },   // sheets, sticky footer, banner
  3: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#3A404B',
       shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },   // toasts, menus, PR overlay
  glow: { shadowColor: '#C6F432', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 0 } }, // primary CTA lg only, ProgressRing at 100%, PR moment
} as const;
```

Level → surface: 0 `bg`, 1 `surface`, 2 `sheet` (sheets) / `tabBar`
(footers), 3 `sheet`.

### 2.5 Motion

```ts
export const MOTION = {
  fast: 120,     // press feedback, chip toggle, checkbox
  base: 200,     // fades, toast in, row state change, tab cross-fade
  slow: 320,     // sheet / overlay enter, number roll-up base
  roll: 600,     // number roll-up for display/numeral
  stagger: 30,   // per list item, capped at 8 items (240 ms max)
  toastHold: 2500,
  easeOut: Easing.bezier(0.2, 0.9, 0.3, 1),     // enter
  easeIn:  Easing.bezier(0.4, 0, 1, 1),         // exit
  standard: Easing.bezier(0.4, 0, 0.2, 1),      // state changes
  spring:      { damping: 18, stiffness: 220, mass: 1 },   // press release, toggles
  sheetSpring: { damping: 26, stiffness: 260, mass: 0.9, overshootClamping: false },
  popSpring:   { damping: 10, stiffness: 300, mass: 0.8 }, // PR badge, check pop (one overshoot)
} as const;
```

- **Press scale:** every `Pressable` card/button/row uses the shared
  `PressableScale`: on pressIn `withTiming(0.97, { duration: 120, easing: standard })`,
  on pressOut `withSpring(1, spring)`. Rows in long lists use 0.98.
- **List enter:** `Animated.View` with `entering={FadeInDown.duration(200).delay(i * 30).withInitialValues({ transform: [{ translateY: 8 }] })}`
  for the first 8 items on first load only (not on refresh, not on
  paging). Removal: `exiting={FadeOut.duration(120)}`; reorder:
  `layout={LinearTransition.duration(200)}`.
- **Screen transitions:** stack pushes use the native slide (default
  `react-native-screens`). Full-screen modals (`presentation:
  'fullScreenModal'`) slide up. Tab switches: no animation (native).
- **Number roll-up:** `AnimatedNumber` (component inventory) animates from
  the previous value (or 0 on first mount) to the new value over `roll`
  with `easeOut`. Only on first render of a screen and on value change;
  not on every focus.
- **Reduce Motion:** read `useReducedMotion()` from reanimated; when true,
  replace springs/slides with 150 ms opacity fades and skip roll-ups.

### 2.6 Haptics map (`lib/haptics.ts`, thin wrappers that never throw)

| Interaction | Call |
|---|---|
| Any button / row press (on press, not pressIn) | `Haptics.impactAsync(ImpactFeedbackStyle.Light)` |
| Primary CTA (Start workout, Start sprint, Finish, Save) | `impactAsync(Medium)` |
| Chip / segmented / switch / stepper tick / picker selection / tab change | `Haptics.selectionAsync()` |
| Set completed (check) | `impactAsync(Rigid)` |
| Hold timer reaches target; rest timer ends | `notificationAsync(NotificationFeedbackType.Success)` |
| Hold/rest last 3 seconds (each second) | `impactAsync(Soft)` |
| Switch sides prompt | `impactAsync(Heavy)` |
| Workout finished saved, sprint day complete, assessment submitted, routine saved | `notificationAsync(Success)` |
| PR celebration | `notificationAsync(Success)` then 120 ms later `impactAsync(Heavy)` |
| Like (to liked) | `impactAsync(Light)`; unlike: none |
| Pull-to-refresh trigger | `impactAsync(Light)` |
| Destructive confirm opened (Discard, Delete, Block) | `notificationAsync(Warning)` |
| Any error toast / failed save | `notificationAsync(Error)` |
| Long-press menu open | `impactAsync(Medium)` |

`lib/haptics.ts` exports `tap()`, `primary()`, `select()`, `rigid()`,
`soft()`, `heavy()`, `success()`, `warning()`, `error()`, `pr()`.

---

## 3. Component inventory (`apps/mobile/components/ui/`)

All components: accept `style` override, `testID`, `accessibilityLabel`
where interactive; use tokens only (no raw hex). Each lives in its own
file; `components/ui/index.ts` re-exports.

**PressableScale** — `{ onPress, onLongPress?, disabled?, scaleTo?=0.97, haptic?: 'tap'|'primary'|'select'|'none'='tap', children, style, hitSlop? }`.
Reanimated wrapper around `Pressable` (§2.5). Disabled → opacity 0.4, no
scale, no haptic. Base for every interactive component below.

**Button** — `{ title, onPress, variant?: 'primary'|'secondary'|'ghost'|'destructive'='primary', size?: 'sm'|'md'|'lg'='md', icon?: IoniconName, iconPosition?: 'left'|'right', loading?, disabled?, fullWidth? }`.
- Heights 36/48/56; padding-x 14/18/22; radius `md`; label `callout` (sm) /
  `bodyStrong` (md/lg), lg label size 17.
- primary: bg `accent`, label `onAccent`, pressed bg `accentPressed`;
  `lg` adds `ELEVATION.glow`. Haptic `primary`.
- secondary: bg `elevated`, label `textPrimary`, 1px `border`.
- ghost: transparent, label `accent`; pressed bg `accentTint`.
- destructive: bg `dangerTint`, label `danger`; when it is *the*
  confirm in a confirm sheet, bg `danger` + label `onDanger`.
- loading: label replaced by `ActivityIndicator` (colour = label colour,
  size small), width locked to pre-loading width, presses ignored.
  Label is never swapped for "Starting…" text.
- Icon 18 (sm 16), gap 8.

**IconButton** — `{ icon, onPress, size?: 'sm'|'md'=36|44, variant?: 'plain'|'filled'|'accent', badge?: number, accessibilityLabel (required) }`.
plain: icon `textPrimary` on transparent; filled: `elevated` circle;
accent: `accent` circle, icon `onAccent`. Icon 20 (sm 18). Hit area ≥ 44
via hitSlop. `badge` > 0 → Badge (count) at top-right offset (-2,-2).

**Card** — `{ children, onPress?, padding?='lg', variant?: 'default'|'accent'|'outline', style }`.
`surface`, radius `lg`, `ELEVATION[1]`, padding 16, internal gap 12.
`accent` variant: 1px border `accent` + top-left 4×24 accent bar (used
for "today" sprint card and the active workout). `outline`: transparent
bg, 1px `border`. With `onPress` → wrapped in PressableScale(0.98).

**Sheet** (bottom sheet) — `{ visible, onClose, title?, subtitle?, children, footer?: ReactNode, snap?: 'auto'|'tall'='auto', dismissable?=true }`.
- RN `Modal` (`transparent`, `animationType="none"`, `statusBarTranslucent`)
  + reanimated. Scrim fades 0→0.6 over 200 ms; panel translateY from
  height → 0 with `withSpring(0, sheetSpring)`; exit `withTiming(height, { duration: 220, easing: easeIn })` then `onClose`.
- Panel: bg `sheet`, top radii `xl` (28), `ELEVATION[2]`, padding 16 +
  safe-area bottom, max height 90 % (`tall` = fixed 90 %).
- Grabber: 36×5, radius pill, `borderStrong`, 8 px from top, centered.
- Header: title `title2`, subtitle `footnote`; close IconButton
  (`close`, sm) right — omitted when `dismissable` false.
- Drag-to-dismiss on the grabber/header via `PanResponder`: follow finger
  (down only, upward rubber-band ×0.2); release with dy > 120 or vy > 1.0
  → dismiss, else spring back.
- `footer`: sticky inside panel above safe area, 1 hairline `divider`
  top border, primary Button full width.
- Keyboard: wrap content in `KeyboardAvoidingView behavior="padding"`.
- Every picker/option list in the app uses Sheet (no `Alert` with >2
  choices, no ad-hoc `Modal`).

**ActionSheet** — Sheet preset `{ visible, onClose, title?, actions: { label, icon?, destructive?, onPress }[] }`:
rows of ListRow (icon left), destructive rows in `danger`, then a
`secondary` Cancel button. Used for long-press menus and `⋯` menus.

**ConfirmSheet** — Sheet preset `{ title, body, confirmLabel, destructive?, requireText?: string, onConfirm, loading? }`.
Two buttons stacked (confirm on top, Cancel ghost below). `requireText`
→ TextField; confirm disabled until it matches (Delete account: `DELETE`).
Opening fires `warning()` when destructive. Replaces destructive `Alert`s.

**Chip** — `{ label, icon?, tone?: 'neutral'|'accent'|'success'|'warning'|'danger' }` (display only).
Height 28, padding-x 10, radius pill, label 13/600 (`callout` size 13).
neutral: `elevated` bg, `textSecondary`; tones use their tint bg + tone
colour text.

**FilterChip** — `{ label, selected, onToggle, count? }`.
Height 34, padding-x 14, radius pill. Off: `elevated` bg, 1px `border`,
`textSecondary`. On: `accentTint` bg, 1px `accent`, label `accent`,
leading `checkmark` 14. Toggle anim: bg/border colour interpolate 120 ms;
haptic `select`. Rows of filter chips: horizontal `ScrollView`,
`contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}`, no indicator.

**SegmentedControl** — `{ options: { value, label, disabled? }[], value, onChange, size?: 'sm'|'md' }`.
Track `elevated`, radius `md`, height 36 (sm 32), padding 3. Thumb:
`sheet` bg + `ELEVATION[1]`, radius `sm`, slides with
`withSpring(x, spring)`. Labels `callout` 600: selected `textPrimary`,
others `textTertiary`, disabled `textDisabled`. Haptic `select`.

**Stat** — `{ value: number|string, label, unit?, delta?: { value: string, direction: 'better'|'worse'|'same' }, size?: 'hero'|'lg'|'md'='lg', animate?=true, align?: 'left'|'center' }`.
Label `overline` above. Value: hero=`display`, lg=`numeral`, md=`stat`;
numbers render via AnimatedNumber when `animate`. Unit `title3`
`textSecondary` baseline-aligned, 4 px left gap ("75" "s"). Delta below:
`callout` 600, arrow icon `arrow-up`/`arrow-down`/`remove` 14, colour
success/danger/`textTertiary`. Stat *tiles* (grid of 2): Card padding 14,
min height 96.

**AnimatedNumber** — `{ value: number, format?: (n) => string, style, duration?=600 }`.
Reanimated shared value → `useAnimatedProps` on an
`Animated.createAnimatedComponent(TextInput)` with `editable={false}`
and `text` prop (worklet formats; integers round). Tabular style required.

**ProgressRing** — `{ progress: 0..1+, size?=72, stroke?=8, label?: ReactNode, tone?: 'accent'|'success' }`.
`react-native-svg`: track circle `elevated`, progress circle tone colour,
`strokeLinecap="round"`, rotated -90°. Animate `strokeDashoffset` with
`withTiming(…, { duration: 600, easing: easeOut })` via animated props.
Progress ≥ 1 → full ring + `ELEVATION.glow` + center `checkmark` icon pops
in (`popSpring`). Center label default: `stat` "2/3".

**Toast** — `useToast()` from Stage 1 rebuilt: `show({ message, tone?: 'neutral'|'success'|'danger'|'pr', action?: { label, onPress }, icon? })`.
Position: top, below safe area + header (top inset + 56). Card `sheet`,
`ELEVATION[3]`, radius `lg`, padding 12/16, max width screen − 32.
Leading icon 20 in tone colour (`checkmark-circle`, `alert-circle`,
`trophy`). Message `callout` `textPrimary`; action ghost Button sm
right ("Retry"). Enter: translateY -24 → 0 + opacity, 200 ms easeOut;
hold 2500 (danger with action: 5000); exit 160 ms easeIn. Swipe up to
dismiss. One at a time; a new toast replaces (cross-fade). Provider
(`ToastProvider`) mounts once in `app/_layout.tsx` so any screen can
call it. `pr` tone → PR celebration (below).

**EmptyState** — `{ icon, title, body, action?: { label, onPress, icon? }, secondaryAction?, compact? }`.
Centered column, max width 300. Icon in a 64 circle `accentTint`, icon 28
`accent`. Title `title3`, body `callout` `textSecondary` centered,
gap 8; action primary Button md 16 px below. `compact` (inside a card):
icon 40 circle/20 icon, no secondary action. Exact copy per screen in §4.

**ErrorState** — `{ message?, onRetry, retrying }`: EmptyState with icon
`cloud-offline-outline` in `dangerTint`/`danger`, title "Couldn't load
this", body = message or "Check your connection and try again.", action
"Try again" with `loading={retrying}`. `onRetry` must re-run the load
(Stage 0.2 rule).

**Skeleton** — `{ width, height, radius?=sm }` + presets `SkeletonRow`
(avatar circle 44 + two bars 60%/40% × 12), `SkeletonCard` (bar 40% ×
14, bar 90% × 12, bar 70% × 12, inside Card), `SkeletonStat`.
Colour `elevated`; shimmer = opacity loop 0.5 ↔ 1, 900 ms each way,
`withRepeat(withTiming(...), -1, true)`. Reduce Motion: static 0.7.
Every screen's loading state = skeletons in the shape of the real content,
never a spinner alone or "Loading…" text. Spinners only inside buttons and
for load-more footers.

**ListRow** — `{ title, subtitle?, leading?: ReactNode | { icon, tone? }, trailing?: 'chevron' | 'switch' | ReactNode, value?: string, onPress?, destructive?, disabled? }`.
Min height 56, padding 12/16, gap 12. Leading icon in 32 square `elevated`
radius `sm` (icon 18 `textSecondary`, tone colours for tones). Title
`bodyStrong`, subtitle `footnote` `textSecondary`. `value` right in
`callout` `textTertiary`, chevron `chevron-forward` 18 `textTertiary`.
Grouped rows sit in one Card with padding 0 and hairline `divider`
between rows inset 60 px from left (when leading present) else 16.

**Avatar** — `{ uri?: string|null, name: string, size?: 'xs'|'sm'|'md'|'lg'|'xl', ring?: boolean }`.
Circle; image via `Image` with fade-in 150 ms. Fallback: initials (max 2,
`bodyStrong` scaled to 40 % of size) on a colour derived from a stable hash
of name into `chartSeries[1..5]` at 30 % over `elevated` (precompute 5
tint hexes in the component). `ring` = 2 px `accent` ring with 2 px `bg`
gap (used on own avatar in Profile when streak ≥ 1).

**Badge** — `{ count?: number, dot?: boolean, tone?: 'accent'|'danger'|'neutral', label?: string }`.
Dot 8×8. Count: min 18 high, pill, `caption` 700, `danger` bg + `onDanger` text
(6.7:1; white on danger would be only 2.9:1)
for unread; `accent`/`onAccent` for neutral counts. "99+" cap. `label`
form = Chip-like small tag, e.g. "Private" (neutral, `lock-closed` 12),
"PR" (accent), "Sprint" (accentTint/accent).

**TabBar styling** (expo-router `Tabs` `screenOptions`):
`tabBarStyle: { backgroundColor: tabBar, borderTopColor: divider, borderTopWidth: hairline, height: 56 + insets.bottom }`,
`tabBarActiveTintColor: accent`, `tabBarInactiveTintColor: textTertiary`,
`tabBarLabelStyle: caption`, icons 24: outline when inactive, filled when
active (`barbell`/`barbell-outline`, `time`, `stats-chart`, `people`,
`person-circle`). `tabBarButton` wrapped in PressableScale haptic `select`.
Badge on Feed tab = unread inbox count (`tabBarBadge`, style bg `danger`,
colour `onDanger`). `headerShown: false` on tab roots — each tab root
renders its own LargeHeader.

**Header styling.** Two forms:
- *LargeHeader* (tab roots, in-content): title `title1` left, up to two
  IconButtons right, padding top = safe-area top + 8, bottom 12. On scroll
  past 40 px, a compact bar fades in (`bg` at 92 % opacity + hairline
  bottom `divider`, title `title3` centered) — driven by
  `useAnimatedScrollHandler`.
- *Stack header* (pushed screens): native header with
  `headerStyle: { backgroundColor: bg }`, `headerShadowVisible: false`,
  `headerTintColor: textPrimary` (back chevron), `headerTitleStyle:
  { fontSize: 17, fontWeight: '700', color: textPrimary }`,
  `headerBackTitle: ''` (`headerBackButtonDisplayMode: 'minimal'`), right
  actions = IconButton plain sm. Set once in root `Stack screenOptions`.
  `contentStyle: { backgroundColor: bg }` everywhere so no white flash.

**TextField** — `{ label?, value, onChangeText, placeholder?, helper?, error?, multiline?, maxLength?, showCount?, leftIcon?, secureTextEntry?, ...TextInputProps }`.
Label `overline` above (gap 6). Field: `elevated` bg, radius `sm`, height
48 (multiline min 96, `textAlignVertical: 'top'`), padding-x 14, `body`
`textPrimary`, placeholder `textTertiary`, `selectionColor: accent`,
`keyboardAppearance="dark"`. Border 1px transparent → focused `accent`
(120 ms) → error `danger`. Helper/error `footnote` below; error in
`danger` with `alert-circle` 14. Count right-aligned `caption`
("128/500"), turns `warning` at 90 %.

**NumberField** — TextField variant `{ value: string, unit?, align='center', width?, decimal? }`:
`stat` 24/700 tabular centered, `keyboardType` `number-pad` /
`decimal-pad`, `selectTextOnFocus`. Used in SetRow (height 44, width 72)
and assessment inputs (height 56, width 96, unit `callout` `textTertiary`
right of field). Placeholder = prev value in `textTertiary`.

**Stepper** — `{ value, min, max, step?=1, onChange, format? }`.
Row: IconButton filled `remove` · value `numeral`-sized 40 tabular
(AnimatedNumber, 200 ms) min width 72 centered · IconButton filled `add`.
Each tick `select` haptic; at bound the button disables (opacity 0.4)
and a press fires `warning()`. Long-press repeats every 120 ms after
400 ms.

**SwitchRow** — ListRow with `trailing='switch'`: RN `Switch`
`trackColor={{ false: borderStrong, true: accent }}`, `thumbColor="#F4F5F7"`,
`ios_backgroundColor={borderStrong}`; toggle fires `select`. Whole row
toggles. Optional `subtitle` explains effect.

**SectionHeader** — `{ title, action?: { label, onPress } }`.
Row, padding-top 24, bottom 8, horizontal 16 (or 4 when inside screen
padding): `overline` `textTertiary` left; action ghost text `callout` 600
`accent` right with hitSlop 12.

**DescriptionToggle** (rebuild Stage 0 `DescriptionToggle.tsx`, keep
`DescriptionToggleButton` + `useToggle` exports). Button: Ionicons
`eye-outline` (collapsed) / `eye-off-outline` (open), 18, `textTertiary`
→ `accent` when open, hitSlop 13 (44 target). Body: `callout`
`textSecondary`, line height 20, revealed with reanimated height+opacity
(measure via `onLayout`, `withTiming(200, easeOut)`); `entering={FadeIn}`
fallback is fine if measuring is awkward. Haptic `select`. Not persisted.

**TimerDisplay** — `{ mode: 'hold'|'rest'|'switch', remainingMs?, elapsedMs?, targetMs?, onSkip?, onAdd15?, onStop? }`.
- *Hold (in a SetRow while running):* the row expands to 96 high; left
  ProgressRing 56/6 accent filling toward target; centre `display`-scaled
  to 44/800 tabular "0:42" counting **up** with target "/ 0:60" `stat`
  `textTertiary`; right Button secondary sm "Stop". At target: ring
  completes + glow, text turns `accent`, `success()` haptic, keeps
  counting (over-hold allowed) and the value logged is the elapsed.
  Last 3 s before target: `soft()` each second and the number scales
  1 → 1.06 → 1 per tick.
- *Rest (RestBar, docked above the sticky footer):* full-width bar 64 high,
  `sheet` bg, radius `lg`, inset 12, `ELEVATION[2]`. Left: "REST"
  overline + `stat` countdown "1:24"; a 4 px progress line along the
  bottom edge (accent, shrinking left→right). Right: ghost "-15", ghost
  "+15", secondary sm "Skip". Ends: bar flashes `accentTint` 200 ms,
  `success()`, slides down out (200 ms).
- *Switch sides:* full-width banner in the exercise card, `warningTint`
  bg, `swap-horizontal` icon, "Switch to RIGHT side" `title3` `warning`,
  5 s countdown `stat`, `heavy()` on show; auto-dismiss into the R set
  becoming active.
Time format `m:ss` (<10 min), `h:mm:ss` beyond; always tabular.

**SetRow** — states (row height 52, radius `sm`, padding-x 8, gap 8;
columns: SET 36 · PREV flex 1 · inputs · ✓ 44):
| State | Visual |
|---|---|
| idle | bg transparent; set label `callout` 700 `textSecondary` in 28 circle `elevated`; prev "60s" / "8 × 20kg" `footnote` `textTertiary`; NumberFields `elevated`; check button 36 square radius `sm` 1.5px `borderStrong` outline, icon none |
| next-up (first incomplete set of the exercise in focus) | bg `elevated`; 3 px accent bar on left edge; set label circle 1px `accent` |
| active timer | expands per TimerDisplay hold; bg `elevated`, border 1px `accent` |
| completed | bg `accentTint`; set-label circle filled `accent`, label `onAccent`; values `textPrimary`; check button filled `accent` with `checkmark` 20 `onAccent`; on completion the check pops (scale 0.6 → 1, `popSpring`), the row bg interpolates 200 ms, `rigid()` haptic, and focus/"next-up" moves to the next set |
| warm-up | set label "W" in `warningTint` circle, `warning` text; row otherwise like idle/completed; completed warm-up uses `elevated` bg (not accent — warm-ups never look like earned work and never trigger PRs) |
| side tags | label "1L"/"1R": the L/R letter is a 14 px suffix in `chartLeft`/`chartRight` colour |
| PR set | completed + trailing `trophy` 14 `accent` after the value + Badge "PR" for the session |
Swipe left to delete (existing `SwipeToDelete`, restyled: red `dangerTint`
action with `trash-outline` `danger`). Header row above sets: `caption`
`textTertiary` "SET · PREVIOUS · SECONDS · ✓" (labels per kind:
`KG · REPS`, `REPS`, `SECONDS`, `TIME`).

**PR celebration moment** — triggered by Toast `tone: 'pr'`:
1. The completed SetRow's check does its pop, then a `trophy` icon slides
   in after the value.
2. A PR toast (not the plain one): `sheet` card with 2 px accent left
   border, `ELEVATION.glow`; content: `trophy` 24 accent in 40 circle
   `accentTint` · "NEW PR" `overline` `accent` · "Longest hold (L)"
   `callout` · value `numeral` 32 AnimatedNumber rolling from the old best
   to the new ("60 → 75s", old best `footnote` struck through). Enter with
   `popSpring` scale 0.9→1 + translateY; hold 3000 ms.
3. Burst: 10 small accent/white rounded rects (6×3) radiate from the toast
   icon 40–70 px over 500 ms (reanimated per-particle translate + fade,
   random angles seeded per PR). Skip under Reduce Motion.
4. Haptic `pr()`.
On the workout summary the PR card lists them with trophy icons; on
Progress, recent PRs list. Never more than one celebration per 1.5 s —
queue extras as plain `success` toasts.

**Other shared pieces**: `StickyFooter` (`tabBar` bg, `ELEVATION[2]`,
padding 12/16 + safe-area bottom, holds 1 primary or primary+secondary);
`ScreenScroll` (ScrollView/FlatList defaults: `bg`, padding 16, gap 12,
`RefreshControl tintColor={accent}`, `indicatorStyle="white"`,
`keyboardDismissMode="on-drag"`); `ActiveWorkoutBanner` (see §4.4);
`Calendar` and charts per Progress screen.

**Charts** (`react-native-gifted-charts` LineChart, wrap in
`components/ui/LineChartCard.tsx`): height 140, `thickness 3`,
`curved`, `color` series colour, `dataPointsColor` same, data point radius
4 (last point 6 with 2 px `bg` stroke), `rulesColor chartGrid`,
`rulesType="solid"`, `yAxisColor/xAxisColor transparent`,
`yAxisTextStyle`/`xAxisLabelTextStyle` = `caption` `textTertiary`,
`noOfSections 3`, `areaChart` with `startFillColor` series colour at
opacity 0.18 → 0, `isAnimated animationDuration={600}`. Legend: dots +
"L" / "R" `caption` top-right. Pass/fail rows: 12 px circles, pass =
`success` fill, fail = 1.5px `danger` outline, 6 gap.

---

## 4. Screens

Conventions for every screen: background `bg`; content gutter 16; pull-to-
refresh on every list/scroll that shows server data; loading = skeleton of
the screen's shape; error = ErrorState with working Retry; focus reload is
silent (no skeleton). `Footer` means StickyFooter.

### 4.1 Sign-in (`/sign-in`)

Purpose: get in with Apple or email code; first impression.

```
┌──────────────────────────────┐
│                              │
│        [ mark 96pt ]         │  icon mark (§6) on bg, arc draws in 700ms
│        BULLETPROOF           │  title1 800, letterSpacing 4
│  Mobility that sticks.       │  body textSecondary
│  Fix one pain point          │
│  in 14 days.                 │
│                              │
│ (flex spacer)                │
│ [  Sign in with Apple     ]  │  AppleAuthenticationButton WHITE, 56h, radius 14
│ [  Continue with email    ]  │  Button secondary lg, icon mail-outline
│ Use the same sign-in method  │  footnote textTertiary centered
│ each time.                   │
│ Terms · Privacy              │  ghost caption links
└──────────────────────────────┘
```
Email step (same screen, content cross-fades 200 ms, back chevron top-
left): TextField "Email" (`keyboardType email-address`, autofocus) →
primary lg "Send code". Code step: "Enter the 6-digit code sent to
<email>" + 6 boxed digit cells (each 48×56 `elevated`, radius `sm`,
`stat`; active cell 1px accent; one hidden TextInput with
`textContentType="oneTimeCode"`), auto-submits on 6th digit; "Resend
code" ghost, disabled with "Resend in 0:24" countdown for 30 s.
Errors inline under the field (`danger`) + `error()` haptic; wrong code
shakes the cells (translateX 0,-8,8,-6,6,0 over 300 ms).
Transition out: on success the mark scales 1 → 1.1 and fades, routes to
onboarding or tabs (replace). Flow: the only actions are the two sign-in
paths; nothing else competes.

### 4.2 Onboarding (`/onboarding`)

Full-screen, no back gesture, one screen, 3 steps. Top: step indicator =
3 segments (each flex 1, 4 h, radius pill, gap 6; done/current `accent`,
future `elevated`; current segment fills with 300 ms width animation).
Steps slide horizontally (translateX, 280 ms easeOut). Footer: primary lg
"Continue" (step 3: "Agree and start"); secondary ghost "Back" on steps
2–3 left of it.

1. **You** — "Set up your profile" `title1`. Avatar xl with `camera`
   IconButton accent overlay bottom-right (→ image picker); TextField
   "Display name"; TextField "Handle" with leftIcon `at`, live status
   right: spinner → `checkmark-circle` success "Available" / `close-circle`
   danger "Taken" / helper "3–20 letters, numbers or _". Continue disabled
   until valid + available.
2. **Training** — "How you train" `title1`. "Units" SegmentedControl
   kg/lbs. "Weekly goal" Stepper 1–14 (default 3) with helper "Workouts
   per week to keep your streak alive."
3. **Terms** — "One last thing" `title1`; Card with 3 bullet rows (icons
   `shield-checkmark-outline`, `medkit-outline`, `people-outline`):
   "Zero tolerance for abusive content.", "Not medical advice — stop if
   something hurts.", "Your workouts are private unless you share them.";
   ListRows "Terms of Use" / "Privacy Policy" (chevron → WebBrowser);
   checkbox row (24 square radius 6, `accent` fill + `checkmark` when
   on): "I agree to the Terms, including zero tolerance for abusive
   content." Footer primary disabled until checked.
Finish: `success()`, a full-screen accent flash-free transition: content
fades out 200 ms, tabs fade in on the Workout tab, Toast "Welcome,
<name>." Error on create → Toast danger with Retry; stays on step 3.

### 4.3 Workout tab (`(tabs)/index`)

Purpose: start something in one tap. This is home.

```
LargeHeader: "Workout"                       [library-outline] (→ /library)
┌ Active workout (only if in progress) ────────┐  Card accent
│ ● 12:43  Morning mobility       [Resume →]   │
└───────────────────────────────────────────────┘
┌ Sprint card ──────────────────────────────────┐  Card accent when today's day not done
│ ANKLES SPRINT                    Day 6 / 14   │  overline · stat
│ ▓▓▓▓▓▓░░░░░░░░  (14 segment bar)               │
│ Today · 4 exercises · ~12 min                 │  callout
│ [ Start today's routine          ▶ ]          │  primary lg
│ Last assessment ›                              │  ghost sm
└───────────────────────────────────────────────┘
[ + Start empty workout ]                         Button secondary lg fullWidth
SectionHeader ROUTINES                 + Routine  (and folder IconButton)
  ▸ Folder name (3)                       ⋯
     ┌ Routine card: title / "Ankle CARs, Calf raise +2" / [Start] ┐
  ▸ Unfiled
SectionHeader RECENT                       See all
  WorkoutListRow ×3
```
- Sprint card states: *no sprint* → Card with `flash-outline` icon circle,
  "Pick a pain point" `title3`, body "14 days of short daily routines, with
  a before/after check.", primary "Start a sprint" (→ `/sprint`).
  *Day done* → card loses accent border, shows `checkmark-circle` success
  "Day 6 done — back tomorrow", secondary "View sprint". *Pending
  assessment* → warning Chip "Assessment due", primary "Take assessment".
  14-segment bar: each segment flex 1, h 6, gap 3, radius pill; done
  `accent`, today `accent` 40 % pulsing (opacity 0.4↔1, 1.2 s), future
  `elevated`.
- Routine card: Card padding 14; title `title3`; exercise preview
  `footnote`; right: Button primary sm "Start" (icon `play`). Long-press
  → ActionSheet (Edit, Move to folder, Delete). Folders: row with
  `chevron-forward` rotating 90° on expand (200 ms), count `caption`;
  children animate with `LinearTransition`.
- Loading: SkeletonCard ×2 + SkeletonRow ×3. Error: ErrorState.
- Empty routines (no routines, no folders): compact EmptyState icon
  `albums-outline`, "No routines yet", "Save a workout as a routine, or
  build one from scratch.", action "Create routine".
- Empty recent: compact EmptyState `barbell-outline`, "No workouts yet",
  "Your finished workouts will show up here." (no action — the start
  buttons are above).
- Flow: starting anything pushes the Logger (full-screen modal);
  returning lands here with the active-workout card present. "See all" →
  History tab (`router.navigate`).

### 4.4 Active workout banner (global)

Shown above the tab bar on every tab while a workout is in progress and
the logger is not visible: height 52, inset 8, radius `lg`, `sheet` bg,
`ELEVATION[2]`, left 3 px accent bar. Content: pulsing 8 px accent dot ·
"Morning mobility" `bodyStrong` · elapsed `stat`-like 17/700 tabular
right · `close` IconButton sm (→ ConfirmSheet "Discard workout?"). Tap →
reopens logger (route via `resumeRouteForSession` equivalent). Enters by
sliding up 16 px + fade when the logger is dismissed.

### 4.5 Sprint flow (`/sprint`, stack push from Workout tab)

Header title follows state: "Choose a pain point" / "Baseline" /
"Reassessment" / "Day 6 of 14" / "Results". State changes inside the
screen cross-fade (200 ms) — never a blank flash.

**a) Pain point picker.**
`title1` "What's bothering you?" + body `textSecondary` "Pick one. You'll
test it, train it daily for 14 days, then test again." 2×2 grid of
square-ish Cards (aspect 1:1.1, gap 12): Ionicons glyph 32 in 56 circle
`accentTint` (Ankles `footsteps-outline`, Rounded shoulders
`body-outline`, Nerd neck `phone-portrait-outline`, Anterior pelvic tilt
`git-commit-outline`), name `title3`, one-line `footnote` description
("Stiff, re-injured ankles"). Selected: border 2 px accent + check badge
top-right; Footer primary lg "Start sprint" (disabled until a pick);
previously sprinted pain points show `caption` "Last: Oct 2" bottom. Tap
card → `select()`. Start → `primary()`, loading on button.

**b) Assessment form (baseline / reassessment).**
Top: Chip "BASELINE" or "REASSESSMENT · CYCLE 2" + `title2` "Test your
ankles" + `footnote` "Takes ~5 minutes. Be honest — this is your before
photo." Prefill banner (when prefilled): Card bg `warningTint`, icon
`time-outline` warning, `callout` "Prefilled from your Oct 2 assessment
— change anything that's different." + ghost sm "Clear all". Then one
Card per test, numbered:
```
┌ 1  Knee-to-wall test          👁 ┐   number in 24 circle elevated; eye toggle
│ (description, collapsed)          │
│  LEFT          RIGHT              │   overline in chartLeft / chartRight
│ [  9.5 ] cm   [ 11.0 ] cm         │   NumberField 56h
└────────────────────────────────────┘
```
Pass/fail tests: two large toggle buttons side by side (48 h, flex 1):
"Pass" (`checkmark`) selected = `successTint`/`success` border;
"Fail" (`close`) selected = `dangerTint`/`danger`. Completed cards get a
small `checkmark-circle` success at the header right replacing the
number. Progress: header-right `caption` "4/6 done". Footer: primary lg
"Save baseline" / "Save reassessment" (disabled until complete; helper
above it "2 tests left" when incomplete). Submit → `success()`, next
state. Reassessment variant shows a hero strip first: `display` "14"
"days done" + "Time to see what changed." Validation errors scroll to and
shake the first incomplete card.

**c) Sprint day (active).**
```
Day 6 of 14                       [clipboard-outline] Last assessment
┌ hero ─────────────────────────────┐
│  6 /14      ProgressRing(6/14)     │ display "6" + stat "/14"
│  ANKLES · 8 days left              │
└────────────────────────────────────┘
TODAY'S ROUTINE              ~12 min
 ① Banded ankle distraction   2 × 60s     👁  [swap-horizontal-outline]
 ② Single-leg balance, eyes closed 3×30s  👁  ⇄
 ...
Footer: [ ▶ Start today's routine ]   (primary lg)
        Abandon sprint  (ghost sm, danger text, under the footer button? no — in header ⋯)
```
Exercise rows: Card ListRow-like, number circle, name `bodyStrong`,
prescription `callout` tabular, eye toggle, swap IconButton → Swap Sheet
(title "Swap exercise", rows = candidates with prescription; empty:
"No alternatives for this slot yet."). Day done: rows show checkmarks,
Footer becomes success Card "Day 6 done. See you tomorrow." + secondary
"View workout". Routine in progress: Footer "Resume routine". Header `⋯`
(ActionSheet): "Last assessment", "Switch pain point" (destructive →
ConfirmSheet "Abandon this sprint? Your progress so far is kept in
History."). Fallback "no routine for today" = EmptyState
`calendar-outline`, "No routine scheduled today", "This sprint doesn't
have a session for today's date.", action "Switch pain point".

**d) Last assessment sheet** (Sheet, `tall`): title "Last assessment",
subtitle "Oct 2 · baseline". Rows per test: name `bodyStrong`; right
values `stat` 20 tabular with L/R colour-coded prefixes; under it, when
an earlier value exists: `footnote` "was 8.0 cm" + direction Chip
(success "Better" `arrow-up` / danger "Worse" / neutral "Same").

**e) Results (assessment summary).**
Hero: `overline` "ANKLES · 14 DAYS" + `title1` "Here's what changed".
Headline Stat hero: count of improved tests "4 of 6 improved" (number
rolls). Per test Card: name; two columns BEFORE (textTertiary values) →
AFTER (`stat` textPrimary) with delta Chip coloured by `better_direction`;
bilateral shows L and R rows. Cards enter staggered (30 ms). Improved
cards get a 2 px success left bar. Footer: primary lg "Start another
sprint" + secondary "Done" (→ Workout tab). `success()` on mount; if ≥ 1
improved, the hero number gets the PR-style glow once.

### 4.6 Logger (`/workout/[id]`, `presentation: 'fullScreenModal'`)

Purpose: log fast with one hand. The biggest flow screen.

```
[chevron-down]   Morning mobility ✎    [clipboard] [ Finish ]   custom header, bg
  12:43 elapsed · 3 exercises · 7/12 sets    stat-ish row, tabular
──────────────────────────────────────────
┌ Ankle CARs                     👁  ⋯ ┐   title3; ⋯ = ActionSheet
│ SET  PREVIOUS   SECONDS        ✓     │   (Replace, Measure ROM on/off,
│ 1L   60s        [ 60 ]        [✓]    │    Rest timer, Remove)
│ 1R   55s        [ 60 ]        [✓]    │
│ 2L   60s        [ 0:42 / 1:00 ][Stop]│  ← active hold (expanded row)
│ 2R   55s        [    ]        [ ]    │
│ + Add set                             │  ghost sm, accent
└───────────────────────────────────────┘
...
[ + Add exercise ]                         Button secondary lg fullWidth
[ Discard workout ]                        ghost danger sm, centered
╭ REST 1:24 ▁▁▁▁▁▁▁  -15 +15 [Skip] ╮    RestBar docked above home indicator
```
- Header: `chevron-down` IconButton (minimise → banner; workout keeps
  running), title tap → rename Sheet, right: `clipboard-outline` (sprint
  workouts only → Last assessment sheet), Button primary sm "Finish".
  Below header a summary line: elapsed (ticking, tabular), counts.
- Exercise card: Card; name `title3` (tap → exercise detail push over the
  modal); "Sprint" Badge for sprint exercises; target line `footnote`
  ("Target 2 × 60s · rest 45s"). ROM column appears when measuring
  ("ROM °" NumberField 64 wide). Unit per exercise in the card header.
- Completion flow: tap ✓ → SetRow completed animation → rest timer starts
  in RestBar (if configured) → next set becomes "next-up" and the scroll
  view auto-scrolls it into view if off-screen (`scrollTo` animated,
  centered at 40 % screen height). When an exercise's last set completes,
  its card header shows `checkmark-circle` success and the next card's
  first set lights up.
- Unilateral: after an L set completes, the Switch-sides banner shows
  (5 s) and the matching R set becomes next-up.
- Empty (no exercises): EmptyState `add-circle-outline`, "Add your first
  exercise", "Pick from the library or create your own.", action "Add
  exercise".
- Keyboard: `KeyboardAvoidingView` + `automaticallyAdjustKeyboardInsets`;
  a 44 h accessory bar above keyboard with "Done" and ✓ "Complete set".
- Errors: any failed save → danger Toast "Couldn't save that set" + Retry;
  the row shows a `alert-circle` danger icon in the ✓ slot until retried.
- Loading: header renders immediately; SkeletonCard ×2.

**Exercise picker** (Sheet `tall`): search TextField (`search` leftIcon,
autofocus), FilterChip row (Mine, body parts top 6, types), list of
ExerciseListRow (name, `footnote` type · body parts, right `add-circle`
accent; already-added rows show `checkmark` and are still tappable to add
again). Multi-select: tapping toggles selection (row `accentTint`), Footer
primary "Add 3 exercises". First row "+ Create exercise" (accent text,
`create-outline`). Empty search: "No exercises match “xyz”." + ghost
"Create “xyz”".

**Finish sheet** (Sheet `tall`, not dismissable by drag while saving):
```
Finish workout                                   title2
┌ 42:10 │ 5 exercises │ 18 sets ┐  3 Stat md tiles in one row
[ Title _______________________ ]
[ Notes / caption ______________ ]
VISIBILITY  [Private | Followers | Public]       SegmentedControl
  helper: "Make your profile public in Settings to post publicly" (when disabled)
  sprint workouts: helper "Sprint workouts default to Private."
PHOTOS  [+][img ×][img ×]                        72×72 thumbs radius sm, max 4
Footer: [ Save workout ] primary lg   ·  Discard (ghost danger, left)
```
Save → button loading → on success: sheet dismisses, logger dismisses,
`success()`, workout detail (summary) pushes with a one-time celebratory
header (see 4.7). Routine-differs → ConfirmSheet "Update routine?" body
"This workout changed exercises or sets. Update ‘Ankle day’ to match?"
confirm "Update routine" / "Keep original". Photo upload partial failure
→ warning Toast "Saved, but 1 photo didn't upload — add it from the
workout."

### 4.7 Workout detail (`/workout-summary/[id]`, stack push)

One screen, two modes.

**Own:**
```
header: back · "" · [share-outline] [ellipsis-horizontal]
"Morning mobility"            title1
Sat, Nov 8 · 7:42 PM · Followers (lock/people icon chip)
[ photo pager 4:5, dots ]     (if photos) radius lg, full gutter width
┌ 42:10  │  5  │  18  ┐        Stat md tiles: TIME / EXERCISES / SETS
┌ PERSONAL RECORDS (2) ┐       Card accent; rows trophy · name · kind · value
EXERCISES
  Card per exercise: name (→ exercise detail), sets as compact rows
  "1L 60s · 1R 55s ..." in a 2-col tabular grid; warm-ups dim
Footer: [ Save as routine ] secondary  [ Start again ] primary
```
`⋯` ActionSheet: Edit (title/notes/visibility/photos → Sheet), Save as
routine, Share card, Delete (ConfirmSheet). When arriving from Finish
(`?justFinished=1`): top hero card "Workout saved" with `checkmark-circle`
success 32 popping in, stats roll up, PR card glows once; Footer primary
"Done" (→ Workout tab) instead of "Start again".
"Start again" = copy (`source='copy'`) of own workout → logger.

**Other's (read-only):** author row first (Avatar md, name `bodyStrong`,
`@handle · 2h` `footnote`; tap → profile), then title/photos/stats/PRs/
exercises as above. Bottom: action bar (sticky, `tabBar` bg): like
button (`heart-outline`; liked = `heart` filled `accent`
fill, count tabular) · comments (`chatbubble-outline` + count → comments)
· spacer · primary sm "Copy workout" (→ ActionSheet "Start now" / "Save
as routine"). Header `⋯`: Report workout, Hide from feed, Block @handle.
Like animation: heart scale 1 → 1.3 → 1 (`popSpring`), count rolls.
Not found / not visible → EmptyState `eye-off-outline` "This workout
isn't available", "It may be private or deleted.", action "Go back".

### 4.8 History (`(tabs)/history`)

LargeHeader "History" + right IconButton `calendar-outline` (→ Progress
tab scrolled to calendar). Above the list: a summary strip — 3 small Stats
(THIS WEEK n, THIS MONTH n, TOTAL n). SectionList grouped by month
("NOVEMBER 2026" sticky SectionHeader, `bg` 95 %). Row = WorkoutListRow
rebuilt: leading 44 square `elevated` radius `sm` with date `caption`
"NOV" over `stat` 17 "08"; title `bodyStrong`; subtitle `footnote` "42
min · 5 exercises · 18 sets"; trailing Badges (Sprint, PR count with
trophy). Swipe-to-delete stays (ConfirmSheet). Keyset load-more with
spinner footer. Empty: EmptyState `time-outline`, "No workouts yet",
"Finish a workout and it'll land here.", action "Start a workout" (→
Workout tab). Loading: SkeletonRow ×8. Tap → workout detail.

### 4.9 Progress (`(tabs)/progress`)

LargeHeader "Progress". Sections:

1. **Consistency card** (Card accent if streak ≥ 1):
   left: `overline` "WEEK STREAK", `display` AnimatedNumber "3",
   `footnote` "Best 7"; right: ProgressRing 88/10 "2/3" with `caption`
   "THIS WEEK". Tap ring → **Weekly goal sheet** (title "Weekly goal",
   Stepper 1–14, helper "Finish this many workouts Mon–Sun to keep the
   streak.", Footer "Save"). Streak 0: number shows "0" in `textTertiary`
   and `footnote` "Finish a workout to start a streak."
2. **Calendar card**: header "November 2026" `title3` with
   `chevron-back`/`chevron-forward` IconButtons sm (next disabled at the
   current month); swipe horizontally to change month (PanResponder dx >
   60). Grid 7 cols, header M T W T F S S `caption`. Cell 40 h: day
   `callout` tabular; workout day = 32 circle `accent` fill + `onAccent`
   number; sprint-day workout = same plus 2 px `bg` gap + 2 px `accent`
   outer ring (ring encodes sprint); sprint day without workout = 1.5px
   `accent` outline only; today = `textPrimary` 700 with 4 px dot below.
   Month change: grid cross-fades + slides 24 px in swipe direction.
   Legend row: ● Workout ◎ Sprint day.
3. **Assessment trends**: SectionHeader "ASSESSMENTS". One Card per pain
   point: title `title3`, `footnote` "3 assessments"; per test: name
   `callout`, headline right "9.5 → 12.0 cm" `stat` 17 with verdict
   colour + arrow; LineChartCard (L/R) or pass/fail dots row. Single point
   → value + `footnote` "Reassess to see a trend". Empty: compact
   EmptyState `analytics-outline`, "No assessments yet", "Complete a
   sprint's baseline to start tracking.", action "Start a sprint".
4. **Personal records**: SectionHeader "RECENT PRS" + "See all". Card of
   ListRows: leading trophy in `accentTint` square; title exercise name;
   subtitle "Longest hold (L) · Nov 6"; trailing value `stat` 17 tabular
   + `footnote` "↑ from 60s". Row → exercise detail. Empty compact:
   `trophy-outline`, "No PRs yet", "Beat a previous hold, rep or ROM and
   it shows up here."
5. **Recap entry**: two side-by-side Cards (flex 1): `overline` "OCTOBER",
   `title3` "Monthly recap", `footnote` "12 workouts", `arrow-forward`
   accent. Right card "NOVEMBER SO FAR". → `/recap`.

Loading: SkeletonStat + SkeletonCard ×3. Error: ErrorState full screen.
"See all" PRs → `/exercise` isn't a list; route to a PR list mode of
the library (`/library?filter=prs`, rows show best values) — builder may
instead render a full-list Sheet; pick the Sheet if simpler.

### 4.10 Monthly recap (`/recap`, stack push)

Header: title "Recap", right `share-outline` IconButton. Month switcher row:
`chevron-back` · "October 2026" `title2` · `chevron-forward`.
Hero: `display` "12" + `overline` "WORKOUTS". Grid 2×2 Stat tiles (ACTIVE
DAYS, TOTAL TIME "8h 20m", LONGEST STREAK "3 wk", PRS). Card "Top
exercises" — 3 rows with rank number `stat` accent, name, `footnote` "24
sets". Card "Sprint" — days completed ProgressRing + assessment delta
chips. All numbers roll up on mount and on month change; tiles stagger.
Footer: primary lg "Share recap" (icon `share-outline`) → share card.
Empty month: EmptyState `calendar-clear-outline`, "Nothing logged in
October", "Recaps fill in as you train.", action "Start a workout".

**Share card** (1080×1350, rendered at 360×450): bg `#0B0C0F`; top-left
mark 28 + "BULLETPROOF" `caption` 800 letterSpacing 3; `overline`
"OCTOBER 2026 RECAP" accent; hero `display`-scaled 96 "12" + "workouts";
2×2 stats `stat` with overline labels; bottom: a 270° arc motif from the
icon at 30 % opacity bleeding off the bottom-right corner (decorative).
Workout variant: title `title1`, date, TIME/EXERCISES/SETS row, PR rows
with trophy, top 3 exercise names.

### 4.11 Exercise detail (`/exercise/[id]`, stack push)

```
header: back · [⋯ when isMine: Edit, Delete]
Ankle CARs                       title1
[Stretch/hold] [Unilateral] [ankle] [calf]   Chips
Description  👁  (collapsed)
[ ▶ Watch demo ]                 secondary md, icon play-circle (only with URL)
YOUR BESTS
  ┌ L 75s ┐ ┌ R 60s ┐          Stat md tiles, overline LONGEST HOLD (L)/(R), chartLeft/Right accents
TREND (LineChartCard, L/R)        ROM chart second if any
RECENT
  Nov 8 · Morning mobility   (→ workout detail)
    1L 60s · 1R 55s · 2L 75s 🏆
Footer (when opened from library/picker context, not from logger):
  [ + Add to workout ] if a workout is active, else none
```
Empty history: compact EmptyState `stats-chart-outline`, "You haven't
logged this yet", "Add it to a workout to start tracking bests." Loading:
title skeleton + SkeletonCard ×2.

### 4.12 Exercise library (`/library`, stack push)

Header "Exercises", right `add` IconButton (→ new). Search TextField
(sticky under header). Two chip rows: (1) "Mine", exercise types
(Stretch/hold, Balance, Strength, Plyo, Cardio); (2) body parts. An
"Equipment" FilterChip opens a Sheet with multi-select ListRows. Active
filter count shows as "Clear (3)" ghost at the row end. List: rows with
name `bodyStrong`, `footnote` "Stretch/hold · ankle, calf", trailing
`person-circle-outline` 16 for custom ("Mine") + chevron. Alphabetical
SectionList with sticky letters. Empty filtered: EmptyState
`search-outline`, "No exercises match", "Try fewer filters.", action
"Clear filters"; with search text, secondary "Create “text”". Loading:
SkeletonRow ×10.

### 4.13 Custom exercise form (`/library/new`, modal `presentation: 'modal'`)

Header: "Cancel" (ghost, left) · "New exercise"/"Edit exercise" · "Save"
(accent text, right, disabled until valid; loading spinner). Body:
TextField Name (80 count); SegmentedControl (5 types, scrollable if
narrow — use two rows of FilterChips single-select if they don't fit at
375 pt; builder checks); `footnote` under it explaining what the logger
will ask ("Logs seconds held per set"); movement pattern Sheet picker row
(strength/plyo only, slides in with layout animation); SwitchRow
"Unilateral" subtitle "Log left and right separately"; TextField Body
parts (helper "Comma-separated, e.g. ankle, calf"); TextField Equipment;
TextField Description (multiline); TextField Demo URL (`url` keyboard,
error "Must start with https://"). Edit mode: destructive Button at the
bottom "Delete exercise" → ConfirmSheet; if used in history → the sheet
says "This exercise is in N workouts and can't be deleted." with only OK.
Saved → `success()`, dismiss; returning to picker auto-adds (existing
mechanism) and shows Toast "Added Ankle CARs".

### 4.14 Routine editor (`/routines/[id]`, modal `presentation: 'modal'`)

Header: Cancel · "New routine"/"Edit routine" · Save. Body: TextField
title (`title2`-sized input, no box: underline style 1px `border` →
accent on focus); TextField notes; Folder ListRow (value = folder name /
"Unfiled", → **Folder sheet**: radio rows + "+ New folder" inline
TextField). EXERCISES: Card per exercise: name, `reorder-three` handles
replaced by up/down IconButtons sm (`chevron-up`/`chevron-down`), remove
`close` IconButton; fields row: "Sets" Stepper compact (32 buttons, `stat`
value), kind target NumberField ("Hold s" / "Reps" / "Time" / "kg ×
reps"), "Rest" NumberField with "s". Reorder animates with
`LinearTransition`. "+ Add exercises" secondary → picker Sheet. Empty:
compact EmptyState `list-outline`, "No exercises yet", "Add the moves you
want in this routine.", action "Add exercises". Save validation: title +
≥ 1 exercise; error Toast names what's missing. Saved → `success()`,
dismiss, Workout tab shows the routine with an enter animation.

### 4.15 Feed (`(tabs)/feed`)

LargeHeader "Feed", right: `person-add-outline` (→ people search),
`notifications-outline` with Badge count (→ inbox). FlatList of
**FeedCard**:
```
┌──────────────────────────────────────┐
│ (av) Priya Shah        · 2h       ⋯  │ Avatar sm; bodyStrong; footnote
│ Evening hips                          │ title3
│ Felt way looser in the 90/90 today.   │ body, 3 lines, "more" ghost
│ [ photo pager 4:5, radius md, dots ]  │ only if photos; double-tap = like
│ [42 min] [5 exercises] [18 sets] [🏆2] │ Chips
│ ♡ 12      💬 3                         │ IconButton + tabular counts
└──────────────────────────────────────┘
```
Card padding 16, gap 12, separated by 12. Own posts show visibility chip
in the author row. Tap card body → workout detail; author → profile;
comment icon → comments. Double-tap photo: big heart (accent, 80) pops at
tap point and fades (500 ms) + like. Keyset paging, spinner footer,
"You're all caught up" `footnote` end marker with `checkmark-done`.
Empty (follows nobody): EmptyState `people-outline`, "Your feed is
quiet", "Follow friends to see their workouts here.", action "Find
people". Empty (follows people, no posts): same icon, "Nothing new yet",
"When people you follow finish workouts, they'll show up here." Loading:
SkeletonCard ×3 with a 4:5 image block. Hidden/reported items exit with
`FadeOut` + layout collapse.

### 4.16 Comments (`/comments/[workoutId]`, Sheet-like modal `presentation: 'formSheet'` or stack push — use stack push for reliability)

Header "Comments". List: Avatar sm, name `bodyStrong` + `footnote` time
inline, body `body`. Long-press → ActionSheet (Delete [own or workout
owner], Report). Composer docked at bottom (KeyboardAvoidingView):
`elevated` multiline TextField (max 500, grows to 4 lines) + accent
IconButton `arrow-up` (disabled when empty; loading while posting). New
comment enters at bottom with FadeInDown and list scrolls to it.
Word-filter rejection → field error with the server message. Empty:
compact EmptyState `chatbubble-outline`, "No comments yet", "Say
something nice." (composer autofocus off).

### 4.17 Inbox (`/inbox`, stack push)

Header "Activity". Sections "FOLLOW REQUESTS" (if any) then "EARLIER".
Request row: Avatar md, "**priya** wants to follow you" `callout`, time;
trailing Button primary sm "Approve" + IconButton filled `close`
(decline). On approve the row morphs to "**priya** now follows you" with
a `checkmark` success fade. Notification rows: Avatar md with a 18 corner
glyph badge (heart `accent` / chatbubble / person-add), text, time,
trailing 40 thumbnail if the workout has a photo. Unread rows have
`surface` bg + 6 px accent dot left; read rows `bg`. Opening marks all
read (dots fade after 600 ms). Empty: EmptyState
`notifications-outline`, "No activity yet", "Likes, comments and follows
will show up here."

### 4.18 Profile — own (`(tabs)/profile`)

```
LargeHeader: "@sohan"                    [settings-outline]
(Avatar xl, ring if streak)  Sohan Madimsetty   title2
                             @sohan · Private badge (if private)
Bio text (body textSecondary, 3 lines)
┌ 128 ┐ ┌ 42 ┐ ┌ 37 ┐                   Stat md tiles: WORKOUTS / FOLLOWERS / FOLLOWING
┌ ⚡ 3 WEEK STREAK ┐   compact Card, `flash` icon, accent number
[ Edit profile ] secondary  [ Share ] IconButton filled share-outline
WORKOUTS
  WorkoutListRow …
```
Followers/Following tiles → follow list. Edit profile → Sheet `tall`
(avatar, name, handle with availability, bio 160 count) with Save.
Empty workouts: compact EmptyState `barbell-outline`, "No workouts yet",
action "Start a workout".

### 4.19 Profile — other (`/profile/[userId]`)

Same layout; header title = handle; header `⋯`: Report user, Block @handle
(ConfirmSheet "Block @priya? You won't see each other's workouts,
comments or profiles. They won't be told."). Under the bio, FollowButton
full width md: `Follow` (primary) / `Requested` (secondary,
`time-outline`, tap → ConfirmSheet "Cancel request?") / `Following`
(secondary, `checkmark`, tap → ConfirmSheet "Unfollow @priya?") / `Follow
back` (primary). State change cross-fades the label (150 ms) +
`select()`. If they follow me, a Chip "Follows you" next to the handle.

**Private (not viewable)**: Avatar, name, handle, Badge "Private", then a
Card centered: `lock-closed` 28 in `elevated` circle, "This profile is
private", "Follow @priya to see their workouts.", FollowButton. No counts,
streak or bio.

### 4.20 People search (`/people`, stack push)

Header "Find people". Search TextField autofocus, `search` icon, clear
button. Debounced 300 ms; results ListRows: Avatar md, name, `@handle`,
trailing FollowButton sm. Before typing: EmptyState `search-outline`
compact, "Find friends by name or handle". No results: "No one matches
“xyz”". Loading: SkeletonRow ×5 under the field.

### 4.21 Follow list (`/follow-list`)

Header "Followers" / "Following" with SegmentedControl at top to switch
(changes `kind` param). Rows like People search; own Followers list row
`⋯` → "Remove follower" (ConfirmSheet). Empty: "No followers yet" /
"Not following anyone yet" + (own) action "Find people".

### 4.22 Settings (`/settings`, stack push from Profile gear)

Grouped ListRow cards with SectionHeaders:
- **PROFILE**: row with Avatar sm + name + "Edit profile" → edit Sheet.
- **TRAINING**: Units (value "kg" → Sheet with SegmentedControl), Weekly
  goal (value "3 / week" → Weekly goal sheet).
- **PRIVACY**: SwitchRow "Public profile" subtitle "Anyone can see your
  public workouts"; Default post visibility (value → Sheet radio list);
  Blocked users (value count, chevron).
- **NOTIFICATIONS**: SwitchRows Follows, Likes, Comments, (Reports —
  moderators).
- **APPLE HEALTH**: SwitchRow "Save workouts to Apple Health".
- **ABOUT**: Terms of Use, Privacy Policy, Support (`open-outline`
  trailing icon instead of chevron), version `footnote` centered at the
  bottom ("Bulletproof 1.0.0 (22)").
- **ACCOUNT**: info row "Signed in with Apple" / "Signed in as
  sohan@…" (no chevron); "Sign out" row (`log-out-outline`, textPrimary)
  → ConfirmSheet; "Delete account" row destructive → ConfirmSheet
  (requireText `DELETE`, body "This permanently deletes your workouts,
  sprints, photos and profile. This can't be undone.").
Every switch saves optimistically; failure reverts it with a danger
Toast + Retry. Each row change `select()`.

### 4.23 Blocked users (`/blocked`)

Header "Blocked". Rows: Avatar md, name, @handle, trailing Button
secondary sm "Unblock" → row exits with FadeOut, Toast "Unblocked
@priya". Empty: EmptyState `hand-left-outline`, "No one blocked", "People
you block can't see your profile or workouts, and you won't see theirs."

### 4.24 Report sheet (Sheet)

Title "Report", subtitle "What's wrong with this workout/comment/user?".
Radio ListRows for the 6 reasons (radio = 22 circle, selected = accent
ring + 10 dot). TextField "Add details (optional)". Footer destructive
filled "Submit report". Done → sheet content cross-fades to
`checkmark-circle` success 48 + "Thanks — we'll review this." + "Also
block @priya?" secondary button + "Done" primary. Duplicate → inline
`footnote` "You already reported this."

---

## 5. Navigation & flow map

**Tabs** (`(tabs)/_layout.tsx`): Workout (`barbell`) · History (`time`) ·
Progress (`stats-chart`) · Feed (`people`, badge = unread) · Profile
(`person-circle`). ActiveWorkoutBanner renders above the tab bar
(position absolute, bottom = tab bar height + 8) from the tabs layout.

**Root stack** (`app/_layout.tsx`), guards: no session → `sign-in`; no
profile → `onboarding`; else `(tabs)`.

| Route | Presentation |
|---|---|
| `sign-in`, `onboarding` | root replace, no back, `animation: 'fade'` |
| `workout/[id]` (logger) | `fullScreenModal`, `gestureEnabled: false` (minimise via chevron) |
| `sprint` | push |
| `workout-summary/[id]` | push |
| `exercise/[id]` | push (also from inside logger: pushes over the modal — register it inside the modal's stack or present as `modal`; builder verifies with expo-router and picks `modal` if push-over-fullScreenModal misbehaves) |
| `recap` | push |
| `library`, `people`, `inbox`, `comments/[id]`, `follow-list`, `profile/[id]`, `settings`, `blocked` | push |
| `library/new`, `routines/[id]` | `modal` (page sheet, swipe-down dismiss with unsaved-changes ConfirmSheet via `beforeRemove`) |
| Pickers, finish, last assessment, swap, weekly goal, folder, report, action menus, confirms, edit profile | in-screen `Sheet` |

**Key cross-links** (every one must exist):
- Workout tab → sprint card → `/sprint`; → Start → logger; routine Start →
  logger; library icon → `/library`; recent row → workout detail; See all
  → History tab.
- Logger → exercise name → exercise detail; Finish → workout detail
  (`justFinished`) → Done → Workout tab.
- Sprint day → Start → logger; day done → View workout → workout detail;
  Results → Start another sprint → picker.
- History row → workout detail → exercise name → exercise detail → recent
  set group → workout detail.
- Progress: PR row → exercise detail; calendar day with workout → that
  workout's detail (single) or a Sheet listing the day's workouts
  (multiple); assessment card → `/sprint` when a sprint is active;
  recap card → recap.
- Feed card → workout detail (other) → author → profile → workout row →
  workout detail; Copy workout → logger or routine editor; comment icon →
  comments → commenter avatar → profile.
- Inbox: follow request → profile; like/comment → workout detail
  (comments scrolled); new follower → profile.
- Profile: counts → follow list → profile; gear → settings → blocked.
- Push notification tap → same targets as inbox via `data.url`.

**Back/escape rule:** every push has the native back; every modal has
Cancel/close; every sheet dismisses by drag, scrim tap or close (except
while saving). Destructive exits always confirm.

---

## 6. App icon + splash

**Concept — "Range".** A thick open arc (a joint's range of motion) with a
solid ball at its leading end: the arc = mobility gained, the ball = the
joint/the user. Abstract, geometric, no letterform, no shield, swoosh,
flame or check.

**Icon SVG (1024 × 1024, iOS applies its own corner mask — do not round):**

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%">
      <stop offset="0" stop-color="#1A1D23"/>
      <stop offset="1" stop-color="#0B0C0F"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <!-- faint full-circle track -->
  <circle cx="512" cy="512" r="300" fill="none" stroke="#1E2128" stroke-width="112"/>
  <!-- 270° range arc: starts at 135° (bottom-left), sweeps clockwise to 45° (bottom-right) -->
  <path d="M 299.9 724.1 A 300 300 0 1 1 724.1 724.1"
        fill="none" stroke="#C6F432" stroke-width="112" stroke-linecap="round"/>
  <!-- joint ball at the arc's end, slightly larger than the stroke -->
  <circle cx="724.1" cy="724.1" r="84" fill="#C6F432"/>
  <circle cx="724.1" cy="724.1" r="84" fill="none" stroke="#0B0C0F" stroke-width="16"/>
</svg>
```
Arc endpoints: centre (512,512), r 300, angles 135° and 45° measured
clockwise from +x in screen coords → (512 ± 212.1, 512 + 212.1). The
large-arc flag 1 and sweep 1 draw the long way over the top. The 16 px
`#0B0C0F` stroke on the ball separates it from the arc cap so it reads as
a distinct joint. Export `assets/icon.png` 1024² (no alpha, required by
App Store). Generate with any SVG → PNG renderer (e.g. `sharp` in a
one-off script in the scratchpad, not a repo dependency).

**Splash:** `expo-splash-screen` config in `app.json`:
`{ "image": "./assets/splash-mark.png", "imageWidth": 160, "backgroundColor": "#0B0C0F", "resizeMode": "contain" }`.
`splash-mark.png` = the same arc + ball **without** background rect and
track circle, transparent, 512². In-app continuation (sign-in screen and
cold launch while auth resolves): the mark at 96 pt centred, arc drawn
from 0 → 270° via animated `strokeDashoffset` over 700 ms easeOut, ball
pops (`popSpring`) at the end, then content fades in. Under Reduce Motion
the mark is static.

**Wordmark** (share cards, sign-in): "BULLETPROOF", system font 800,
letterSpacing 4 (at 28 pt), `textPrimary`; never set in accent.

---

## 7. Implementation order (one subagent task each)

Each step: implement → `npx jest && npx tsc --noEmit` → visual check of
the touched screens in `expo export` bundle compile → commit. Steps 1–4
must land before any screen step; screen steps are independent after
that unless noted.

1. **Tokens + infra.** Install reanimated/worklets (controller). New
   `lib/theme.ts` (§2, with legacy aliases + `LEGACY_SPACING`), switch
   old screens' imports to legacy spacing, `lib/haptics.ts`, `app.json`
   `userInterfaceStyle: dark` + name, root Stack `screenOptions` (header
   + `contentStyle`), StatusBar `light`. App must look "dark but
   unredesigned" and still compile.
2. **Primitives A:** PressableScale, Button, IconButton, Card, Chip,
   Badge, SectionHeader, ListRow (+ grouped), SwitchRow, Avatar,
   Skeleton presets, AnimatedNumber, Stat.
3. **Primitives B:** Sheet, ActionSheet, ConfirmSheet, Toast +
   ToastProvider (replace Stage 1 `useToast` internals, keep its API
   working), EmptyState, ErrorState, StickyFooter, ScreenScroll,
   LargeHeader.
4. **Primitives C:** TextField, NumberField, Stepper, SegmentedControl,
   FilterChip (+ row), DescriptionToggle rebuild, ProgressRing,
   LineChartCard, TimerDisplay (hold/rest/switch).
5. **Tab bar + ActiveWorkoutBanner + Workout tab** (§4.3, 4.4, 5 tabs).
6. **Logger shell**: fullScreenModal presentation, header, summary line,
   ExerciseCard, exercise picker Sheet (§4.6 minus set rows).
7. **SetRow states + timers + RestBar + switch-sides + PR celebration**
   (§3 SetRow/TimerDisplay/PR). Highest risk — keep all logger logic
   untouched; only presentation + haptic calls.
8. **Finish sheet + workout detail (own, justFinished, other's)** (§4.6
   finish, §4.7).
9. **Sprint flow**: picker, assessment form, sprint day, swap + last
   assessment sheets, results (§4.5).
10. **History** (§4.8).
11. **Progress tab + weekly goal sheet + calendar** (§4.9).
12. **Recap + share card restyle** (§4.10).
13. **Exercise detail + library + custom exercise form** (§4.11–4.13).
14. **Routine editor + routines section + folder sheet** (§4.14, routine
    parts of 4.3).
15. **Feed + FeedCard + comments** (§4.15, 4.16).
16. **Inbox + report sheet + blocked users** (§4.17, 4.23, 4.24).
17. **Profiles (own/other/private) + people search + follow list + edit
    profile sheet** (§4.18–4.21).
18. **Settings** (§4.22).
19. **Sign-in + onboarding** (§4.1, 4.2).
20. **Icon + splash assets** (§6; controller renders PNGs) and removal of
    `LEGACY_SPACING` + old aliases once grep shows no users.
21. **Flow sweep** (one Opus pass): walk every cross-link in §5, every
    empty/error state, Reduce Motion, Dynamic Type at 1.2×, 375 pt width
    (iPhone SE/mini) — fix anything clipped; confirm no `Alert` remains
    for >2 options or destructive confirms, and no "Loading…" text.

---

## 8. Decisions the owner may want to weigh in on

- **Accent = volt lime `#C6F432`.** Highest-energy option that keeps
  dark-on-accent buttons at 15:1. Alternatives considered: electric
  violet `#8B5CF6` (calmer, weaker on buttons), hot coral `#FF5A4E`
  (clashes with danger red). Changing it is a one-token swap plus
  `accentPressed`/`accentTint`.
- **Logger as a full-screen modal** with a minimise chevron (vs today's
  stack push). Clearer "you're in a workout" mode; changes back-gesture
  behaviour.
- **Icon concept "Range"** (270° arc + joint ball).
- **Like colour = accent, not red** — keeps red strictly for errors/worse.
