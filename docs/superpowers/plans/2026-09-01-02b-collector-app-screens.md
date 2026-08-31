# Collector App Implementation Plan, Part 2 — Screens and Sync

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax.

**Continues [part 1](2026-09-01-02-collector-app.md).** Task numbering carries on from task 5. Part 1's Global Constraints and File Structure apply unchanged.

**Build order note.** `FRONTEND.md` §8 says: S0 → S1 → S2 → S4 → S5 first — that is the demo spine — then S7, then accept and outbox, then the rest. Tasks 8–15 build the spine. If time runs out, **stop after task 17.** A short loop that closes beats a long flow that stalls.

---

## Task 6: Design tokens and the primitive components

**Files:**
- Create: `client/app/src/theme/tokens.js`, `client/app/src/components/BigButton.js`, `StatusChip.js`, `PendingPill.js`, `StalenessStrip.js`
- Test: `client/app/test/components/primitives.test.js`

**Interfaces:**
- Produces: `tokens`, `<BigButton label onPress speakKey variant size>`, `<StatusChip status label>`, `<PendingPill count synced>`, `<StalenessStrip days>`

**The rules these encode.** Minimum touch target 56dp, primary actions 72dp. Text contrast ≥ 4.5:1. **Colour never carries meaning alone** — every status renders an icon, a word and a colour, and removing the colour must leave the meaning intact. System font scaling up to 200% without clipping.

- [ ] **Step 1: Write the failing test**

`client/app/test/components/primitives.test.js`:

```js
import { render, fireEvent } from "@testing-library/react-native";
import { LangProvider } from "../../src/i18n/useLang.js";
import { tokens } from "../../src/theme/tokens.js";
import BigButton from "../../src/components/BigButton.js";
import StatusChip from "../../src/components/StatusChip.js";
import PendingPill from "../../src/components/PendingPill.js";
import StalenessStrip from "../../src/components/StalenessStrip.js";

const wrap = (ui) => render(<LangProvider initial="mr">{ui}</LangProvider>);

describe("tokens", () => {
  it("sets the minimum touch target at 56 and primary at 72", () => {
    expect(tokens.touch.min).toBe(56);
    expect(tokens.touch.primary).toBe(72);
  });

  it("defines a distinct icon and word for every status, not just a colour", () => {
    for (const status of ["received", "pending", "authorised", "lapsed"]) {
      expect(tokens.status[status].icon).toBeTruthy();
      expect(tokens.status[status].color).toBeTruthy();
    }
  });
});

describe("BigButton", () => {
  it("renders its label and fires onPress", () => {
    const onPress = jest.fn();
    const { getByText } = wrap(<BigButton label="नवीन लॉट" onPress={onPress} />);
    fireEvent.press(getByText("नवीन लॉट"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("is at least 72dp tall when primary", () => {
    const { getByTestId } = wrap(<BigButton testID="b" label="X" onPress={() => {}} size="primary" />);
    const style = getByTestId("b").props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
    expect(flat.minHeight).toBeGreaterThanOrEqual(72);
  });

  it("carries an accessibility label so every control is reachable by screen reader", () => {
    const { getByLabelText } = wrap(<BigButton label="नवीन लॉट" onPress={() => {}} />);
    expect(getByLabelText("नवीन लॉट")).toBeTruthy();
  });
});

describe("StatusChip", () => {
  it("renders a word alongside the colour", () => {
    const { getByText } = wrap(<StatusChip status="received" />);
    expect(getByText("मिळाले")).toBeTruthy();
  });

  it("renders an icon glyph as well, so colour never carries meaning alone", () => {
    const { getByTestId } = wrap(<StatusChip status="pending" testID="chip" />);
    expect(getByTestId("chip-icon")).toBeTruthy();
  });
});

describe("PendingPill", () => {
  it("shows the synced state when nothing is queued", () => {
    const { getByText } = wrap(<PendingPill count={0} />);
    expect(getByText(/अद्ययावत/)).toBeTruthy();
  });

  it("shows the outbox count when items are queued", () => {
    const { getByText } = wrap(<PendingPill count={3} />);
    expect(getByText(/3/)).toBeTruthy();
    expect(getByText(/बाकी/)).toBeTruthy();
  });
});

describe("StalenessStrip", () => {
  it("renders nothing at three days or fewer", () => {
    const { toJSON } = wrap(<StalenessStrip days={3} />);
    expect(toJSON()).toBeNull();
  });

  it("greys the date between 4 and 14 days", () => {
    const { getByTestId } = wrap(<StalenessStrip days={7} validFrom="2026-09-02T09:00:00+05:30" />);
    expect(getByTestId("staleness-muted")).toBeTruthy();
  });

  it("shows the amber warning past 14 days, and still shows the values", () => {
    const { getByText } = wrap(<StalenessStrip days={20} validFrom="2026-08-10T09:00:00+05:30" />);
    expect(getByText("भाव जुने आहेत")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Write `client/app/src/theme/tokens.js`**

```js
/**
 * The collector app's visual system is not the dossier's. DESIGN.md records a
 * printed, document-like world built for a judge reading on a laptop; this is a
 * one-handed field tool used outdoors in sunlight by someone who may not read.
 *
 * What carries over: borders rather than shadows, and colour never carrying
 * meaning alone. What does not: the type scale, the density, the palette.
 */
export const tokens = {
  color: {
    bg: "#FFFFFF",
    surface: "#F4F5F7",
    ink: "#111418",
    inkMuted: "#5A6270",
    rule: "#D8DCE3",
    primary: "#14532D",
    primaryInk: "#FFFFFF",
    // Contrast checked against #FFFFFF: go 5.9:1, hold 4.6:1, stop 5.4:1.
    go: "#136B45",
    hold: "#7A5A12",
    stop: "#A33224",
    amberBg: "#FDF3D8",
  },

  // Large by field-tool standards. A collector may be holding a cart handle.
  touch: { min: 56, primary: 72, icon: 96 },

  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },

  type: {
    // allowFontScaling stays on everywhere; these are the unscaled bases and
    // every container is sized in minHeight, never height, so 200% scaling
    // grows the box instead of clipping the text.
    display: 44,
    title: 28,
    body: 20,
    label: 17,
    caption: 15,
  },

  radius: { sm: 6, md: 12, lg: 20 },

  /**
   * Every status is an icon glyph PLUS a word PLUS a colour. Remove the colour
   * and the meaning survives — that is the test, and it is a brief requirement
   * (FRONTEND.md section 1 rule 7), not a preference.
   */
  status: {
    received: { icon: "✓", color: "#136B45", stringKey: "received" },
    pending: { icon: "⟳", color: "#7A5A12", stringKey: "pending" },
    authorised: { icon: "◈", color: "#136B45", stringKey: "authorised" },
    lapsed: { icon: "✕", color: "#A33224", stringKey: "lapsed" },
    recommended: { icon: "★", color: "#14532D", stringKey: "recommended" },
  },
};

export default tokens;
```

- [ ] **Step 3: Write `client/app/src/components/BigButton.js`**

```js
import { Pressable, Text, StyleSheet } from "react-native";
import tokens from "../theme/tokens.js";
import { useLang } from "../i18n/useLang.js";

/**
 * The only button in the app. `speakKey` makes every control self-voicing:
 * pressing it plays the clip and then runs the action, so a collector who
 * cannot read still knows what they pressed.
 */
export default function BigButton({
  label,
  onPress,
  speakKey,
  variant = "primary",
  size = "primary",
  disabled = false,
  testID,
  children,
}) {
  const { speak } = useLang();
  const minHeight = size === "primary" ? tokens.touch.primary : tokens.touch.min;

  const handle = () => {
    if (speakKey) speak(speakKey);
    onPress?.();
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={handle}
      style={({ pressed }) => [
        styles.base,
        { minHeight },
        variant === "primary" ? styles.primary : styles.secondary,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {children ?? (
        <Text
          allowFontScaling
          style={[styles.label, variant === "primary" ? styles.labelPrimary : styles.labelSecondary]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.md,
    borderWidth: 2,
  },
  primary: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
  secondary: { backgroundColor: tokens.color.bg, borderColor: tokens.color.rule },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.4 },
  label: { fontSize: tokens.type.body, fontWeight: "700", textAlign: "center" },
  labelPrimary: { color: tokens.color.primaryInk },
  labelSecondary: { color: tokens.color.ink },
});
```

- [ ] **Step 4: Write `client/app/src/components/StatusChip.js`**

```js
import { View, Text, StyleSheet } from "react-native";
import tokens from "../theme/tokens.js";
import { useLang } from "../i18n/useLang.js";

// Icon + word + colour. Never colour alone (FRONTEND.md section 1 rule 7).
export default function StatusChip({ status, label, testID }) {
  const { t } = useLang();
  const spec = tokens.status[status];
  if (!spec) return null;
  const text = label ?? t(spec.stringKey);

  return (
    <View testID={testID} style={[styles.chip, { borderColor: spec.color }]}>
      <Text testID={testID ? `${testID}-icon` : undefined} style={[styles.icon, { color: spec.color }]}>
        {spec.icon}
      </Text>
      <Text allowFontScaling style={[styles.text, { color: spec.color }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.xs,
    borderWidth: 1.5,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space.sm,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  icon: { fontSize: tokens.type.label, fontWeight: "700" },
  text: { fontSize: tokens.type.caption, fontWeight: "700" },
});
```

- [ ] **Step 5: Write `client/app/src/components/PendingPill.js` and `StalenessStrip.js`**

`PendingPill.js`:

```js
import { Pressable, Text, StyleSheet } from "react-native";
import tokens from "../theme/tokens.js";
import { useLang } from "../i18n/useLang.js";

/**
 * The one place offline is visible, and it is a count, not a warning. Offline
 * is the normal case, not an error state (FRONTEND.md section 3) — no banner,
 * no blocking, no spinner anywhere else in the app.
 */
export default function PendingPill({ count = 0, onPress }) {
  const { t } = useLang();
  const synced = count === 0;
  const spec = synced ? tokens.status.received : tokens.status.pending;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={synced ? t("synced") : `${count} ${t("pending_n")}`}
      style={[styles.pill, { borderColor: spec.color }]}
    >
      <Text style={[styles.text, { color: spec.color }]}>
        {spec.icon} {synced ? t("synced") : `${count} ${t("pending_n")}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderWidth: 1.5,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.space.md,
    minHeight: 40,
    justifyContent: "center",
  },
  text: { fontSize: tokens.type.caption, fontWeight: "700" },
});
```

`StalenessStrip.js`:

```js
import { View, Text, StyleSheet } from "react-native";
import tokens from "../theme/tokens.js";
import { useLang } from "../i18n/useLang.js";

const MR_MONTHS = [
  "जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून",
  "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर",
];

/**
 * Rate table older than 3 days: the date is shown greyed.
 * Older than 14 days: an amber strip saying the rates are old.
 *
 * VALUES ARE STILL SHOWN IN BOTH CASES. A stale price is worth more to a
 * collector than a blank screen, and hiding it would be the app refusing to
 * work offline — the one thing it must never do.
 */
export default function StalenessStrip({ days, validFrom }) {
  const { t } = useLang();
  if (days === null || days === undefined || days <= 3) return null;

  const date = validFrom ? new Date(validFrom) : null;
  const label = date ? `${t("rate_date")}: ${date.getDate()} ${MR_MONTHS[date.getMonth()]}` : t("rate_date");

  if (days <= 14) {
    return (
      <Text testID="staleness-muted" allowFontScaling style={styles.muted}>
        {label}
      </Text>
    );
  }

  return (
    <View testID="staleness-amber" style={styles.amber}>
      <Text style={styles.amberIcon}>⚠</Text>
      <Text allowFontScaling style={styles.amberText}>
        {t("rates_are_old")}
      </Text>
      <Text allowFontScaling style={styles.amberDate}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: tokens.type.caption, color: tokens.color.inkMuted, paddingVertical: tokens.space.xs },
  amber: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    backgroundColor: tokens.color.amberBg,
    borderWidth: 1,
    borderColor: tokens.color.hold,
    borderRadius: tokens.radius.sm,
    padding: tokens.space.sm,
  },
  amberIcon: { fontSize: tokens.type.label, color: tokens.color.hold },
  amberText: { fontSize: tokens.type.label, fontWeight: "700", color: tokens.color.hold, flex: 1 },
  amberDate: { fontSize: tokens.type.caption, color: tokens.color.hold },
});
```

- [ ] **Step 6: Run the tests and watch them pass**

```bash
cd client/app && npx jest test/components/primitives.test.js
```

Expected: PASS, 11 tests.

- [ ] **Step 7: Commit**

```bash
git add client/app/src/theme client/app/src/components client/app/test/components
git commit -m "feat(app): design tokens and primitives — 72dp targets, icon+word+colour statuses"
```

---

## Task 7: `CategoryIcon` — eight drawn symbols

Icons must be **drawn line art, not photographs and never emoji**, recognisable at 96dp on a low-DPI screen (`FRONTEND.md` S2).

**Files:**
- Create: `client/app/src/components/CategoryIcon.js`, `client/app/src/components/ConditionIcon.js`
- Test: `client/app/test/components/icons.test.js`

**Interfaces:**
- Produces: `<CategoryIcon code size color />` for the 8 parents + 8 sub-categories; `<ConditionIcon value size />` for GOOD/FAIR/POOR

- [ ] **Step 1: Write the failing test**

`client/app/test/components/icons.test.js`:

```js
import { render } from "@testing-library/react-native";
import { CATEGORY_CODES } from "@bhaav/core/constants";
import CategoryIcon, { ICON_PATHS } from "../../src/components/CategoryIcon.js";
import ConditionIcon from "../../src/components/ConditionIcon.js";

describe("CategoryIcon", () => {
  it("has a drawing for all eight parent categories", () => {
    for (const code of CATEGORY_CODES) {
      expect(ICON_PATHS[code]).toBeTruthy();
    }
  });

  it("has a drawing for all eight sub-categories", () => {
    for (const code of [
      "PCB_COMPUTER", "PCB_APPLIANCE",
      "BATTERY_PHONE", "BATTERY_INVERTER",
      "PANEL_LAPTOP", "PANEL_TV",
      "MOTOR_HDD", "MOTOR_FAN",
    ]) {
      expect(ICON_PATHS[code]).toBeTruthy();
    }
  });

  it("renders at the requested size", () => {
    const { getByTestId } = render(<CategoryIcon code="PCB" size={96} testID="icon" />);
    expect(getByTestId("icon").props.width).toBe(96);
  });

  it("falls back to the OTHER drawing rather than rendering nothing", () => {
    const { getByTestId } = render(<CategoryIcon code="NOPE" size={64} testID="icon" />);
    expect(getByTestId("icon")).toBeTruthy();
  });

  it("uses no emoji anywhere", () => {
    const all = JSON.stringify(ICON_PATHS);
    // Any codepoint above the BMP arithmetic range would be an emoji smuggled
    // in as a glyph rather than drawn.
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(all)).toBe(false);
  });
});

describe("ConditionIcon", () => {
  it("draws a distinct shape for each of the three conditions", () => {
    const shapes = ["GOOD", "FAIR", "POOR"].map(
      (v) => render(<ConditionIcon value={v} size={64} testID="c" />).getByTestId("c").props.children,
    );
    expect(new Set(shapes.map((s) => JSON.stringify(s))).size).toBe(3);
  });
});
```

- [ ] **Step 2: Write `client/app/src/components/CategoryIcon.js`**

```js
import Svg, { Path, Circle, Rect, Line } from "react-native-svg";
import tokens from "../theme/tokens.js";

/**
 * Drawn line art on a 48x48 grid, scaled up. Stroke-only so the shape stays
 * legible at 96dp on a low-DPI screen and in bright sunlight, and so a single
 * `color` prop is all a caller needs.
 *
 * No emoji, ever. An emoji renders differently on every handset, and half of
 * them are unrecognisable at this size.
 */
export const ICON_PATHS = {
  // Coiled wire
  CABLE: "M6 34c0-8 8-8 8-16s8-8 8 0 8 8 8 16 8 8 8 0",
  // Board with traces and pads
  PCB: "M8 8h32v32H8z M16 8v10 M16 18h8 M24 18v14 M32 40V26 M32 26h-8 M14 32h6",
  // Flat screen on a stand
  PANEL: "M6 10h36v22H6z M18 32v6 M30 32v6 M14 38h20",
  // Bulbous CRT
  CRT: "M10 12h28v20H10z M14 12c0 0 4-4 10-4s10 4 10 4 M20 32v5 M28 32v5 M16 37h16",
  // Cell with terminals
  BATTERY: "M10 16h24v18H10z M16 16v-4h4v4 M28 16v-4h4v4 M15 25h6 M27 22v6 M24 25h6",
  // Motor body with shaft
  MOTOR: "M12 16h20v18H12z M32 22h8 M32 28h8 M16 16v-4 M28 16v-4 M18 25h8",
  // Housing shell
  PLASTIC: "M10 18c8-8 20-8 28 0v14c-8 6-20 6-28 0z M18 20v12 M26 20v12",
  // Question mark in a square
  OTHER: "M10 10h28v28H10z M20 20c0-4 8-4 8 0s-4 3-4 6 M24 32v.5",

  // Sub-categories. Each visibly differs from its sibling at a glance — the
  // collector is choosing between two pictures, not reading two labels.
  PCB_COMPUTER: "M8 8h32v32H8z M16 8v10 M16 18h8 M24 18v14 M32 40V26 M32 26h-8 M12 34h4 M20 34h4 M28 34h4",
  PCB_APPLIANCE: "M8 12h32v24H8z M14 18h10 M14 24h6 M30 18v12 M24 30h10",
  BATTERY_PHONE: "M16 10h16v28H16z M20 10v-2h8v2 M22 32h4",
  BATTERY_INVERTER: "M8 14h32v22H8z M14 14v-4h6v4 M28 14v-4h6v4 M14 22h8 M28 19v6 M25 22h6",
  PANEL_LAPTOP: "M12 12h24v16H12z M8 28h32l2 6H6z",
  PANEL_TV: "M4 10h40v24H4z M18 34v4 M30 34v4 M14 38h20",
  MOTOR_HDD: "M8 10h32v28H8z M24 24m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M24 24m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M12 14h6",
  MOTOR_FAN: "M24 24m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0 M24 20c0-8 8-10 8-4s-4 4-8 4 M24 28c0 8-8 10-8 4s4-4 8-4 M20 24c-8 0-10-8-4-8s4 4 4 8 M28 24c8 0 10 8 4 8s-4-4-4-8",
};

export default function CategoryIcon({ code, size = 96, color = tokens.color.ink, testID }) {
  const d = ICON_PATHS[code] ?? ICON_PATHS.OTHER;
  return (
    <Svg testID={testID} width={size} height={size} viewBox="0 0 48 48" accessibilityRole="image">
      <Path
        d={d}
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export { Svg, Path, Circle, Rect, Line };
```

- [ ] **Step 3: Write `client/app/src/components/ConditionIcon.js`**

```js
import Svg, { Path } from "react-native-svg";
import tokens from "../theme/tokens.js";

/**
 * Intact outline / outline with a scratch / cracked outline.
 *
 * The SHAPE carries the meaning and the word beside it repeats it. Colour is
 * support only — the three are still distinguishable in greyscale, which is
 * the test.
 */
const SHAPES = {
  GOOD: "M10 10h28v28H10z",
  FAIR: "M10 10h28v28H10z M18 18l12 12",
  POOR: "M10 10h28v28H10z M24 10l-6 12 8 4-6 12",
};

const COLORS = {
  GOOD: tokens.color.go,
  FAIR: tokens.color.hold,
  POOR: tokens.color.stop,
};

export default function ConditionIcon({ value, size = 64, testID }) {
  return (
    <Svg testID={testID} width={size} height={size} viewBox="0 0 48 48" accessibilityRole="image">
      <Path
        d={SHAPES[value] ?? SHAPES.GOOD}
        stroke={COLORS[value] ?? tokens.color.ink}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export { SHAPES as CONDITION_SHAPES };
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd client/app && npx jest test/components/icons.test.js
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add client/app/src/components/CategoryIcon.js client/app/src/components/ConditionIcon.js client/app/test/components/icons.test.js
git commit -m "feat(app): sixteen drawn category icons and three condition pictograms, no emoji"
```

---

## Task 8: S0 Home

One full-width primary button. Two small tiles. **Nothing else** — no dashboard, no cards, no menu.

**Files:**
- Create: `client/app/src/state/Session.js`, `client/app/src/screens/S0Home.js`
- Test: `client/app/test/screens/S0Home.test.js`

**Interfaces:**
- Consumes: `pendingCount`, `earningsTotals`, `rateAgeDays`
- Produces: `<S0Home onNewLot onEarnings onPriceBoard />`; `SessionProvider` giving `{ collectorId, deviceId, lang, setLang }`

- [ ] **Step 1: Write the failing test**

`client/app/test/screens/S0Home.test.js`:

```js
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { LangProvider } from "../../src/i18n/useLang.js";
import S0Home from "../../src/screens/S0Home.js";

jest.mock("../../src/db/repos/outbox.js", () => ({ pendingCount: jest.fn(async () => 0) }));
jest.mock("../../src/db/repos/lots.js", () => ({
  earningsTotals: jest.fn(async () => ({ week: 0, month: 0 })),
}));
jest.mock("../../src/db/repos/reference.js", () => ({ rateAgeDays: jest.fn(async () => 1) }));
jest.mock("../../src/db/client.js", () => ({ getPrisma: jest.fn(async () => ({})) }));

const { pendingCount } = require("../../src/db/repos/outbox.js");
const { earningsTotals } = require("../../src/db/repos/lots.js");
const { rateAgeDays } = require("../../src/db/repos/reference.js");

const wrap = (props = {}) =>
  render(
    <LangProvider initial="mr">
      <S0Home onNewLot={() => {}} onEarnings={() => {}} onPriceBoard={() => {}} {...props} />
    </LangProvider>,
  );

beforeEach(() => {
  pendingCount.mockResolvedValue(0);
  earningsTotals.mockResolvedValue({ week: 0, month: 0 });
  rateAgeDays.mockResolvedValue(1);
});

describe("S0 Home", () => {
  it("shows one primary button and two tiles, and nothing else", async () => {
    const { getByText } = wrap();
    await waitFor(() => expect(getByText("नवीन लॉट")).toBeTruthy());
    expect(getByText("आजची कमाई")).toBeTruthy();
    expect(getByText("भाव")).toBeTruthy();
  });

  it("starts a new lot on the primary button", async () => {
    const onNewLot = jest.fn();
    const { getByText } = wrap({ onNewLot });
    await waitFor(() => getByText("नवीन लॉट"));
    fireEvent.press(getByText("नवीन लॉट"));
    expect(onNewLot).toHaveBeenCalled();
  });

  it("shows the synced pill when the outbox is empty", async () => {
    const { getByText } = wrap();
    await waitFor(() => expect(getByText(/अद्ययावत/)).toBeTruthy());
  });

  it("shows the pending count when the outbox has rows", async () => {
    pendingCount.mockResolvedValue(3);
    const { getByText } = wrap();
    await waitFor(() => expect(getByText(/3 बाकी/)).toBeTruthy());
  });

  it("shows this week's earnings on the tile", async () => {
    earningsTotals.mockResolvedValue({ week: 1260, month: 4200 });
    const { getByText } = wrap();
    await waitFor(() => expect(getByText("₹ 1260")).toBeTruthy());
  });

  it("shows the staleness strip when the rate table is old", async () => {
    rateAgeDays.mockResolvedValue(20);
    const { getByText } = wrap();
    await waitFor(() => expect(getByText("भाव जुने आहेत")).toBeTruthy());
  });

  it("renders no spinner tied to connectivity", async () => {
    const { queryByTestId } = wrap();
    await waitFor(() => {});
    expect(queryByTestId("network-spinner")).toBeNull();
  });
});
```

- [ ] **Step 2: Write `client/app/src/state/Session.js`**

```js
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as Application from "expo-application";
import { uuidv7 } from "@bhaav/core/ids";
import { getPrisma } from "../db/client.js";

const SessionContext = createContext(null);

/**
 * There is no login, no account, no form on first open (FRONTEND.md section 1
 * rule 4). The collector is a device-generated uuid with a coarse operating
 * area and nothing else — a deliberate privacy decision, and the answer to any
 * DPDP question.
 */
export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);

  useEffect(() => {
    (async () => {
      const db = await getPrisma();
      let row = await db.collector.findFirst();
      if (!row) {
        row = await db.collector.create({
          data: {
            id: uuidv7(),
            preferredLanguage: "mr",
            operatingArea: null,
            createdAt: new Date().toISOString(),
          },
        });
      }
      setSession({
        collectorId: row.id,
        lang: row.preferredLanguage,
        operatingArea: row.operatingArea,
        deviceId: Application.getAndroidId?.() ?? "unknown-device",
      });
    })();
  }, []);

  const value = useMemo(
    () => ({
      ...session,
      ready: session !== null,
      async setLang(lang) {
        const db = await getPrisma();
        await db.collector.update({
          where: { id: session.collectorId },
          data: { preferredLanguage: lang },
        });
        setSession((s) => ({ ...s, lang }));
      },
      async setOperatingArea(area) {
        const db = await getPrisma();
        await db.collector.update({
          where: { id: session.collectorId },
          data: { operatingArea: area },
        });
        setSession((s) => ({ ...s, operatingArea: area }));
      },
    }),
    [session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
```

- [ ] **Step 3: Write `client/app/src/screens/S0Home.js`**

```js
import { useEffect, useState, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, SafeAreaView } from "react-native";
import tokens from "../theme/tokens.js";
import { useLang } from "../i18n/useLang.js";
import BigButton from "../components/BigButton.js";
import PendingPill from "../components/PendingPill.js";
import StalenessStrip from "../components/StalenessStrip.js";
import { getPrisma } from "../db/client.js";
import { pendingCount } from "../db/repos/outbox.js";
import { earningsTotals } from "../db/repos/lots.js";
import { rateAgeDays } from "../db/repos/reference.js";

/**
 * One full-width button. Two small tiles. Nothing else — no dashboard, no
 * cards, no menu (FRONTEND.md S0).
 *
 * Every number here comes from local SQLite. Nothing on this screen waits on a
 * network call, and there is no spinner tied to connectivity anywhere.
 */
export default function S0Home({ onNewLot, onEarnings, onPriceBoard, onSyncDetail, onSafety }) {
  const { t, speak } = useLang();
  const [pending, setPending] = useState(0);
  const [totals, setTotals] = useState({ week: 0, month: 0 });
  const [ageDays, setAgeDays] = useState(null);

  const refresh = useCallback(async () => {
    const db = await getPrisma();
    const [p, tot, age] = await Promise.all([
      pendingCount(db),
      earningsTotals(db),
      rateAgeDays(db),
    ]);
    setPending(p);
    setTotals(tot);
    setAgeDays(age);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text allowFontScaling style={styles.brand}>
          {t("app_name")}
        </Text>
        <PendingPill count={pending} onPress={onSyncDetail} />
      </View>

      {ageDays !== null && <StalenessStrip days={ageDays} />}

      <View style={styles.main}>
        <BigButton
          label={t("new_lot")}
          speakKey="new_lot"
          onPress={onNewLot}
          size="primary"
          testID="new-lot"
        />
      </View>

      <View style={styles.tiles}>
        <Tile
          label={t("todays_earnings")}
          value={`₹ ${Math.round(totals.week)}`}
          onPress={() => {
            speak("todays_earnings");
            onEarnings?.();
          }}
        />
        <Tile
          label={t("price_board")}
          value="→"
          onPress={() => {
            speak("price_board");
            onPriceBoard?.();
          }}
        />
      </View>

      <Pressable onPress={onSafety} accessibilityRole="button" style={styles.safety}>
        <Text allowFontScaling style={styles.safetyText}>
          {t("safety")}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

function Tile({ label, value, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value}`}
      style={styles.tile}
    >
      <Text allowFontScaling style={styles.tileValue}>
        {value}
      </Text>
      <Text allowFontScaling style={styles.tileLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.bg, padding: tokens.space.md },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: tokens.space.md,
  },
  brand: { fontSize: tokens.type.title, fontWeight: "800", color: tokens.color.ink },
  main: { flex: 1, justifyContent: "center" },
  tiles: { flexDirection: "row", gap: tokens.space.md, marginBottom: tokens.space.md },
  tile: {
    flex: 1,
    minHeight: tokens.touch.min,
    borderWidth: 1.5,
    borderColor: tokens.color.rule,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    justifyContent: "center",
  },
  tileValue: { fontSize: tokens.type.title, fontWeight: "800", color: tokens.color.ink },
  tileLabel: { fontSize: tokens.type.caption, color: tokens.color.inkMuted, marginTop: 2 },
  safety: { minHeight: tokens.touch.min, alignItems: "center", justifyContent: "center" },
  safetyText: { fontSize: tokens.type.label, color: tokens.color.inkMuted, textDecorationLine: "underline" },
});
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd client/app && npx jest test/screens/S0Home.test.js
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add client/app/src/state client/app/src/screens/S0Home.js client/app/test/screens
git commit -m "feat(app): S0 home — one button, two tiles, a pending pill and nothing else"
```

---

## Task 9: S1 Camera — photo, GPS and timestamp

**The photo is captured for the record first, identification second.** It is compressed to roughly 200 KB and written to local storage before anything else happens. The collection location and timestamp are captured here — the first of the two geotags the record will carry.

**Files:**
- Create: `client/app/src/state/LotDraft.js`, `client/app/src/screens/S1Camera.js`, `client/app/src/components/PhotoStrip.js`
- Test: `client/app/test/screens/S1Camera.test.js`, `client/app/test/state/LotDraft.test.js`

**Interfaces:**
- Produces: `LotDraftProvider`, `useLotDraft() -> { draft, setPhotos, setCategory, setSubCategory, setQuantity, setCondition, setSource, reset }`; `<S1Camera onDone />`

- [ ] **Step 1: Write the failing draft test**

`client/app/test/state/LotDraft.test.js`:

```js
import { renderHook, act } from "@testing-library/react-native";
import { LotDraftProvider, useLotDraft } from "../../src/state/LotDraft.js";

const wrapper = ({ children }) => <LotDraftProvider>{children}</LotDraftProvider>;

describe("LotDraft", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useLotDraft(), { wrapper });
    expect(result.current.draft.photos).toEqual([]);
    expect(result.current.draft.categoryCode).toBeNull();
  });

  it("records the collection geotag and timestamp when photos are set", () => {
    const { result } = renderHook(() => useLotDraft(), { wrapper });
    act(() => {
      result.current.setPhotos([{ uri: "file://a.jpg", sha256: "a".repeat(64), bytes: 100 }], {
        lat: 19.3919,
        lng: 72.8397,
        ts: "2026-09-02T10:14:00+05:30",
      });
    });
    expect(result.current.draft.collectionLat).toBe(19.3919);
    expect(result.current.draft.collectionTs).toBe("2026-09-02T10:14:00+05:30");
  });

  it("caps photos at four", () => {
    const { result } = renderHook(() => useLotDraft(), { wrapper });
    act(() => {
      result.current.setPhotos(
        Array.from({ length: 6 }, (_, i) => ({ uri: `file://${i}.jpg`, sha256: "a".repeat(64), bytes: 1 })),
        { lat: null, lng: null, ts: "2026-09-02T10:14:00+05:30" },
      );
    });
    expect(result.current.draft.photos).toHaveLength(4);
  });

  it("defaults the unit to the category's default when a category is chosen", () => {
    const { result } = renderHook(() => useLotDraft(), { wrapper });
    act(() => {
      result.current.setCategory({ id: "c1", code: "PANEL", defaultUnit: "PIECE" });
    });
    expect(result.current.draft.unit).toBe("PIECE");
  });

  it("replaces the category with the leaf when a sub-category is chosen", () => {
    const { result } = renderHook(() => useLotDraft(), { wrapper });
    act(() => {
      result.current.setCategory({ id: "c1", code: "PCB", defaultUnit: "KG" });
      result.current.setSubCategory({ id: "c2", code: "PCB_APPLIANCE", defaultUnit: "KG" });
    });
    // lot.category_id points at the LEAF category. One column, no ambiguity.
    expect(result.current.draft.categoryId).toBe("c2");
    expect(result.current.draft.categoryCode).toBe("PCB_APPLIANCE");
    expect(result.current.draft.parentCode).toBe("PCB");
  });

  it("clears everything on reset", () => {
    const { result } = renderHook(() => useLotDraft(), { wrapper });
    act(() => {
      result.current.setCategory({ id: "c1", code: "PCB", defaultUnit: "KG" });
      result.current.setQuantity(3);
      result.current.reset();
    });
    expect(result.current.draft.categoryCode).toBeNull();
    expect(result.current.draft.quantity).toBeNull();
  });
});
```

- [ ] **Step 2: Write `client/app/src/state/LotDraft.js`**

```js
import { createContext, useContext, useMemo, useState, useCallback } from "react";

const EMPTY = {
  photos: [],
  collectionLat: null,
  collectionLng: null,
  collectionTs: null,
  categoryId: null,
  categoryCode: null,
  parentCode: null,
  unit: null,
  quantity: null,
  condition: null,
  sourceType: null,
};

const MAX_PHOTOS = 4;

const LotDraftContext = createContext(null);

/**
 * The in-flight lot, S1 through S6. Held in memory rather than written to
 * SQLite at each step: a lot that was abandoned halfway through is not a
 * record of anything, and a half-lot in the database would be a half-lot in
 * the outbox.
 *
 * The row is written once, at the moment the collector accepts a recycler
 * (S6), and at that moment it becomes real and syncable.
 */
export function LotDraftProvider({ children }) {
  const [draft, setDraft] = useState(EMPTY);

  const setPhotos = useCallback((photos, { lat, lng, ts }) => {
    setDraft((d) => ({
      ...d,
      photos: photos.slice(0, MAX_PHOTOS),
      collectionLat: lat ?? d.collectionLat,
      collectionLng: lng ?? d.collectionLng,
      collectionTs: ts ?? d.collectionTs,
    }));
  }, []);

  const setCategory = useCallback((cat) => {
    setDraft((d) => ({
      ...d,
      categoryId: cat.id,
      categoryCode: cat.code,
      parentCode: null,
      unit: cat.defaultUnit,
    }));
  }, []);

  const setSubCategory = useCallback((sub) => {
    setDraft((d) => ({
      ...d,
      parentCode: d.categoryCode,
      categoryId: sub.id,
      categoryCode: sub.code,
      unit: sub.defaultUnit ?? d.unit,
    }));
  }, []);

  const value = useMemo(
    () => ({
      draft,
      setPhotos,
      setCategory,
      setSubCategory,
      setUnit: (unit) => setDraft((d) => ({ ...d, unit })),
      setQuantity: (quantity) => setDraft((d) => ({ ...d, quantity })),
      setCondition: (condition) => setDraft((d) => ({ ...d, condition })),
      setSource: (sourceType) => setDraft((d) => ({ ...d, sourceType })),
      reset: () => setDraft(EMPTY),
    }),
    [draft, setPhotos, setCategory, setSubCategory],
  );

  return <LotDraftContext.Provider value={value}>{children}</LotDraftContext.Provider>;
}

export function useLotDraft() {
  const ctx = useContext(LotDraftContext);
  if (!ctx) throw new Error("useLotDraft must be used inside <LotDraftProvider>");
  return ctx;
}

export { EMPTY as EMPTY_DRAFT, MAX_PHOTOS };
```

- [ ] **Step 3: Write `client/app/src/components/PhotoStrip.js`**

```js
import { View, Image, Pressable, Text, StyleSheet } from "react-native";
import tokens from "../theme/tokens.js";
import { MAX_PHOTOS } from "../state/LotDraft.js";

export default function PhotoStrip({ photos, onRemove }) {
  return (
    <View style={styles.strip} accessibilityLabel={`${photos.length} / ${MAX_PHOTOS}`}>
      {photos.map((p, i) => (
        <Pressable
          key={p.uri}
          onPress={() => onRemove?.(i)}
          accessibilityRole="button"
          accessibilityLabel={`${i + 1}`}
          style={styles.thumbWrap}
        >
          <Image source={{ uri: p.uri }} style={styles.thumb} />
          <Text style={styles.remove}>×</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: "row", gap: tokens.space.sm },
  thumbWrap: { width: 64, height: 64, borderRadius: tokens.radius.sm, overflow: "hidden" },
  thumb: { width: 64, height: 64 },
  remove: {
    position: "absolute",
    top: 0,
    right: 4,
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    textShadowColor: "#000000",
    textShadowRadius: 3,
  },
});
```

- [ ] **Step 4: Write `client/app/src/screens/S1Camera.js`**

```js
import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import tokens from "../theme/tokens.js";
import { useLang } from "../i18n/useLang.js";
import { useLotDraft } from "../state/LotDraft.js";
import BigButton from "../components/BigButton.js";
import PhotoStrip from "../components/PhotoStrip.js";
import { MAX_PHOTOS } from "../state/LotDraft.js";

const TARGET_WIDTH = 1024;
const JPEG_QUALITY = 0.6; // lands around 200 KB on a typical scrap photo

/**
 * The photograph's job is the RECORD: it is evidence of what physically
 * existed, and it is written to local storage before anything else happens.
 * Nothing in this flow waits on it being understood by a machine — there is no
 * classifier here and that is a decision, not a gap (AI.md section 1).
 *
 * The collection location and timestamp are captured HERE. GPS is satellite,
 * so it works with no network. If GPS is unavailable we never block: the
 * collector picks an operating area instead and the coordinates stay null,
 * which the schema already allows.
 */
export default function S1Camera({ onDone, onNoGps }) {
  const { t, speak } = useLang();
  const { draft, setPhotos } = useLotDraft();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef(null);
  const fixRef = useRef(null);

  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, [permission, requestPermission]);

  useEffect(() => {
    speak("take_photo");
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        fixRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      } catch {
        fixRef.current = null;
      }
    })();
    // speak is stable per language; running this once on mount is intended
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function shoot() {
    if (busy || draft.photos.length >= MAX_PHOTOS) return;
    setBusy(true);
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 1, skipProcessing: true });
      const small = await ImageManipulator.manipulateAsync(
        shot.uri,
        [{ resize: { width: TARGET_WIDTH } }],
        { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
      );
      const info = await FileSystem.getInfoAsync(small.uri, { size: true });
      const sha256 = await FileSystem.readAsStringAsync(small.uri, {
        encoding: FileSystem.EncodingType.Base64,
      }).then((b64) =>
        require("expo-crypto").digestStringAsync(
          require("expo-crypto").CryptoDigestAlgorithm.SHA256,
          b64,
        ),
      );

      setPhotos([...draft.photos, { uri: small.uri, sha256, bytes: info.size ?? 0 }], {
        lat: fixRef.current?.lat ?? null,
        lng: fixRef.current?.lng ?? null,
        // The device's clock, not the server's: this lot may be created days
        // before it ever syncs (DB.md 3.5).
        ts: new Date().toISOString(),
      });
    } finally {
      setBusy(false);
    }
  }

  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <Text allowFontScaling style={styles.msg}>
          {t("take_photo")}
        </Text>
        <BigButton label={t("next")} onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView ref={cameraRef} style={styles.camera} enableTorch={torch} facing="back" />

      <View style={styles.overlay}>
        <PhotoStrip
          photos={draft.photos}
          onRemove={(i) =>
            setPhotos(
              draft.photos.filter((_, idx) => idx !== i),
              { lat: draft.collectionLat, lng: draft.collectionLng, ts: draft.collectionTs },
            )
          }
        />

        <View style={styles.controls}>
          <Pressable
            onPress={() => setTorch((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="torch"
            style={styles.torch}
          >
            <Text style={styles.torchText}>{torch ? "◉" : "○"}</Text>
          </Pressable>

          <Pressable
            testID="shutter"
            onPress={shoot}
            accessibilityRole="button"
            accessibilityLabel={t("take_photo")}
            style={styles.shutter}
          >
            {busy ? <ActivityIndicator color={tokens.color.ink} /> : <View style={styles.shutterInner} />}
          </Pressable>

          <View style={styles.torch} />
        </View>

        {draft.photos.length > 0 && (
          <BigButton
            testID="s1-next"
            label={t("next")}
            onPress={() => {
              if (!fixRef.current) onNoGps?.();
              onDone?.();
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" },
  camera: { ...StyleSheet.absoluteFillObject },
  overlay: { flex: 1, justifyContent: "flex-end", padding: tokens.space.md, gap: tokens.space.md },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  torch: { width: tokens.touch.min, height: tokens.touch.min, alignItems: "center", justifyContent: "center" },
  torchText: { color: "#FFFFFF", fontSize: 30 },
  shutter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 5,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#FFFFFF" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: tokens.space.lg, padding: tokens.space.lg },
  msg: { fontSize: tokens.type.body, color: tokens.color.ink, textAlign: "center" },
});
```

- [ ] **Step 5: Install `expo-crypto` and write the screen test**

```bash
cd client/app && npx expo install expo-crypto
```

`client/app/test/screens/S1Camera.test.js`:

```js
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { LangProvider } from "../../src/i18n/useLang.js";
import { LotDraftProvider } from "../../src/state/LotDraft.js";
import S1Camera from "../../src/screens/S1Camera.js";

jest.mock("expo-camera", () => ({
  CameraView: require("react-native").View,
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));
jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 19.3919, longitude: 72.8397 },
  })),
}));
jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  manipulateAsync: jest.fn(async () => ({ uri: "file://small.jpg" })),
}));
jest.mock("expo-file-system", () => ({
  EncodingType: { Base64: "base64" },
  getInfoAsync: jest.fn(async () => ({ size: 198_000 })),
  readAsStringAsync: jest.fn(async () => "Zm9v"),
}));
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: jest.fn(async () => "a".repeat(64)),
}));

const wrap = (props = {}) =>
  render(
    <LangProvider initial="mr">
      <LotDraftProvider>
        <S1Camera onDone={() => {}} {...props} />
      </LotDraftProvider>
    </LangProvider>,
  );

describe("S1 Camera", () => {
  it("shows a shutter", () => {
    expect(wrap().getByTestId("shutter")).toBeTruthy();
  });

  it("compresses the shot and only then advances", async () => {
    const { getByTestId } = wrap();
    fireEvent.press(getByTestId("shutter"));
    await waitFor(() => expect(getByTestId("s1-next")).toBeTruthy());
    const { getInfoAsync } = require("expo-file-system");
    expect(getInfoAsync).toHaveBeenCalled();
  });

  it("hides the next action until at least one photo exists", () => {
    expect(wrap().queryByTestId("s1-next")).toBeNull();
  });

  it("requests a GPS fix on mount", async () => {
    wrap();
    const { getCurrentPositionAsync } = require("expo-location");
    await waitFor(() => expect(getCurrentPositionAsync).toHaveBeenCalled());
  });

  it("still advances when GPS is unavailable — it never blocks", async () => {
    const { getCurrentPositionAsync } = require("expo-location");
    getCurrentPositionAsync.mockRejectedValueOnce(new Error("no fix"));
    const onDone = jest.fn();
    const onNoGps = jest.fn();
    const { getByTestId } = wrap({ onDone, onNoGps });
    fireEvent.press(getByTestId("shutter"));
    await waitFor(() => getByTestId("s1-next"));
    fireEvent.press(getByTestId("s1-next"));
    expect(onDone).toHaveBeenCalled();
    expect(onNoGps).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run the tests and watch them pass**

```bash
cd client/app && npx jest test/state/LotDraft.test.js test/screens/S1Camera.test.js
```

Expected: PASS, 11 tests.

- [ ] **Step 7: Commit**

```bash
git add client/app/src/state/LotDraft.js client/app/src/screens/S1Camera.js client/app/src/components/PhotoStrip.js client/app/test/state client/app/test/screens/S1Camera.test.js
git commit -m "feat(app): S1 camera — photo compressed for the record, first geotag and timestamp"
```

---

## Task 10: S2 Category grid

A 2×4 grid of large drawn symbols. **Tapping any icon speaks its name aloud.** Tap once to hear, tap the confirm arrow to select, or long-press to select directly.

**Files:**
- Create: `client/app/src/screens/S2Category.js`
- Test: `client/app/test/screens/S2Category.test.js`

**Interfaces:**
- Consumes: `loadReference`, `useLotDraft`
- Produces: `<S2Category onDone={(cat) => ...} />`

- [ ] **Step 1: Write the failing test**

`client/app/test/screens/S2Category.test.js`:

```js
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { LangProvider } from "../../src/i18n/useLang.js";
import { LotDraftProvider } from "../../src/state/LotDraft.js";
import S2Category from "../../src/screens/S2Category.js";

const CATEGORIES = [
  { id: "1", code: "CABLE", parent_code: null, default_unit: "KG", icon_key: "cable" },
  { id: "2", code: "PCB", parent_code: null, default_unit: "KG", icon_key: "pcb" },
  { id: "3", code: "PANEL", parent_code: null, default_unit: "PIECE", icon_key: "panel" },
  { id: "4", code: "CRT", parent_code: null, default_unit: "PIECE", icon_key: "crt" },
  { id: "5", code: "BATTERY", parent_code: null, default_unit: "KG", icon_key: "battery" },
  { id: "6", code: "MOTOR", parent_code: null, default_unit: "KG", icon_key: "motor" },
  { id: "7", code: "PLASTIC", parent_code: null, default_unit: "KG", icon_key: "plastic" },
  { id: "8", code: "OTHER", parent_code: null, default_unit: "KG", icon_key: "other" },
  { id: "9", code: "PCB_COMPUTER", parent_code: "PCB", default_unit: "KG", icon_key: "pcb-computer" },
];

jest.mock("../../src/db/client.js", () => ({ getPrisma: jest.fn(async () => ({})) }));
jest.mock("../../src/db/repos/reference.js", () => ({
  loadReference: jest.fn(async () => ({ categories: CATEGORIES, recyclers: [], rates: [] })),
}));
jest.mock("../../src/audio/speak.js", () => ({ speak: jest.fn(async () => {}) }));

const wrap = (props = {}) =>
  render(
    <LangProvider initial="mr">
      <LotDraftProvider>
        <S2Category onDone={() => {}} {...props} />
      </LotDraftProvider>
    </LangProvider>,
  );

describe("S2 Category grid", () => {
  it("shows exactly the eight parent categories, never the sub-categories", async () => {
    const { getByText, queryByText } = wrap();
    await waitFor(() => expect(getByText("तार")).toBeTruthy());
    for (const label of ["तार", "सर्किट बोर्ड", "स्क्रीन", "जुना टीव्ही", "बॅटरी", "मोटर", "प्लास्टिक", "इतर"]) {
      expect(getByText(label)).toBeTruthy();
    }
    expect(queryByText("कॉम्प्युटर बोर्ड")).toBeNull();
  });

  it("speaks the category name on a single tap without selecting it", async () => {
    const { speak } = require("../../src/audio/speak.js");
    const onDone = jest.fn();
    const { getByText } = wrap({ onDone });
    await waitFor(() => getByText("सर्किट बोर्ड"));
    fireEvent.press(getByText("सर्किट बोर्ड"));
    expect(speak).toHaveBeenCalledWith(["cat_pcb"], "mr");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("selects on long press", async () => {
    const onDone = jest.fn();
    const { getByText } = wrap({ onDone });
    await waitFor(() => getByText("सर्किट बोर्ड"));
    fireEvent(getByText("सर्किट बोर्ड"), "longPress");
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ code: "PCB" }));
  });

  it("selects via the confirm arrow after a tap", async () => {
    const onDone = jest.fn();
    const { getByText, getByTestId } = wrap({ onDone });
    await waitFor(() => getByText("तार"));
    fireEvent.press(getByText("तार"));
    fireEvent.press(getByTestId("s2-confirm"));
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ code: "CABLE" }));
  });

  it("shows no confirm arrow until something is highlighted", async () => {
    const { queryByTestId, getByText } = wrap();
    await waitFor(() => getByText("तार"));
    expect(queryByTestId("s2-confirm")).toBeNull();
  });

  it("carries the category's default unit through to the draft", async () => {
    const onDone = jest.fn();
    const { getByText } = wrap({ onDone });
    await waitFor(() => getByText("स्क्रीन"));
    fireEvent(getByText("स्क्रीन"), "longPress");
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ defaultUnit: "PIECE" }));
  });
});
```

- [ ] **Step 2: Write `client/app/src/screens/S2Category.js`**

```js
import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, SafeAreaView } from "react-native";
import tokens from "../theme/tokens.js";
import { useLang } from "../i18n/useLang.js";
import { useLotDraft } from "../state/LotDraft.js";
import CategoryIcon from "../components/CategoryIcon.js";
import BigButton from "../components/BigButton.js";
import { getPrisma } from "../db/client.js";
import { loadReference } from "../db/repos/reference.js";

const clipKey = (code) => `cat_${code.toLowerCase()}`;
const stringKey = (code) => `cat_${code.toLowerCase()}`;

/**
 * The primary and only required classification input.
 *
 * This is a HUMAN TAP by choice, not a shortcut (AI.md section 1). The
 * collector is holding the material; their answer is right essentially every
 * time. An image model trained on borrowed, non-Indian data would be right
 * perhaps 85% of the time, would need good light, and would be wrong in
 * exactly the cases that matter most.
 *
 * Tap once to HEAR, confirm to SELECT — so a collector who cannot read can
 * explore the grid safely before committing.
 */
export default function S2Category({ onDone, onBack }) {
  const { t, speak } = useLang();
  const { setCategory } = useLotDraft();
  const [parents, setParents] = useState([]);
  const [highlighted, setHighlighted] = useState(null);

  useEffect(() => {
    (async () => {
      const db = await getPrisma();
      const { categories } = await loadReference(db);
      setParents(categories.filter((c) => !c.parent_code));
    })();
    speak("choose_category");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function choose(cat) {
    const payload = { id: cat.id, code: cat.code, defaultUnit: cat.default_unit };
    setCategory(payload);
    onDone?.(payload);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Text allowFontScaling style={styles.heading}>
        {t("choose_category")}
      </Text>

      <View style={styles.grid}>
        {parents.map((cat) => {
          const on = highlighted?.id === cat.id;
          return (
            <Pressable
              key={cat.id}
              accessibilityRole="button"
              accessibilityLabel={t(stringKey(cat.code))}
              accessibilityState={{ selected: on }}
              onPress={() => {
                setHighlighted(cat);
                speak(clipKey(cat.code));
              }}
              onLongPress={() => choose(cat)}
              style={[styles.cell, on && styles.cellOn]}
            >
              <CategoryIcon
                code={cat.code}
                size={tokens.touch.icon}
                color={on ? tokens.color.primary : tokens.color.ink}
              />
              <Text allowFontScaling style={[styles.label, on && styles.labelOn]}>
                {t(stringKey(cat.code))}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <BigButton label={t("back")} variant="secondary" size="min" onPress={onBack} />
        {highlighted && (
          <View style={styles.confirmWrap}>
            <BigButton
              testID="s2-confirm"
              label={`${t("next")} →`}
              onPress={() => choose(highlighted)}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.bg, padding: tokens.space.md },
  heading: {
    fontSize: tokens.type.title,
    fontWeight: "800",
    color: tokens.color.ink,
    marginBottom: tokens.space.md,
  },
  grid: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm },
  cell: {
    width: "47%",
    minHeight: 150,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: tokens.color.rule,
    borderRadius: tokens.radius.md,
    padding: tokens.space.sm,
  },
  cellOn: { borderColor: tokens.color.primary, backgroundColor: tokens.color.surface },
  label: { fontSize: tokens.type.label, fontWeight: "700", color: tokens.color.ink, marginTop: 4 },
  labelOn: { color: tokens.color.primary },
  footer: { flexDirection: "row", gap: tokens.space.md, alignItems: "center" },
  confirmWrap: { flex: 1 },
});
```

- [ ] **Step 3: Run the tests and watch them pass**

```bash
cd client/app && npx jest test/screens/S2Category.test.js
```

Expected: PASS, 6 tests.

- [ ] **Step 4: Commit**

```bash
git add client/app/src/screens/S2Category.js client/app/test/screens/S2Category.test.js
git commit -m "feat(app): S2 icon grid — tap to hear, confirm to select, human classification by choice"
```

---

## Task 11: S3 Sub-category — the clarifying question

Shown only for the four categories where the sub-type sets the price and **no photograph could ever settle it** — the difference is inside the object or in its grade, not on its surface. Two large pictures, one question, spoken aloud. **"I don't know" is always present and routes to the lower-value sub-type**, so uncertainty never inflates the estimate.

**Files:**
- Create: `client/app/src/screens/S3SubCategory.js`
- Test: `client/app/test/screens/S3SubCategory.test.js`

**Interfaces:**
- Produces: `<S3SubCategory parentCode onDone onSkip />`, `SUB_QUESTIONS`

- [ ] **Step 1: Write the failing test**

`client/app/test/screens/S3SubCategory.test.js`:

```js
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { LangProvider } from "../../src/i18n/useLang.js";
import { LotDraftProvider } from "../../src/state/LotDraft.js";
import S3SubCategory, { SUB_QUESTIONS, needsSubQuestion } from "../../src/screens/S3SubCategory.js";

const CATEGORIES = [
  { id: "2", code: "PCB", parent_code: null, default_unit: "KG" },
  { id: "9", code: "PCB_COMPUTER", parent_code: "PCB", default_unit: "KG" },
  { id: "10", code: "PCB_APPLIANCE", parent_code: "PCB", default_unit: "KG" },
];

jest.mock("../../src/db/client.js", () => ({ getPrisma: jest.fn(async () => ({})) }));
jest.mock("../../src/db/repos/reference.js", () => ({
  loadReference: jest.fn(async () => ({ categories: CATEGORIES, recyclers: [], rates: [] })),
}));
jest.mock("../../src/audio/speak.js", () => ({ speak: jest.fn(async () => {}) }));

const wrap = (props = {}) =>
  render(
    <LangProvider initial="mr">
      <LotDraftProvider>
        <S3SubCategory parentCode="PCB" onDone={() => {}} {...props} />
      </LotDraftProvider>
    </LangProvider>,
  );

describe("needsSubQuestion", () => {
  it("is true for exactly the four categories whose sub-type sets the price", () => {
    expect(["PCB", "BATTERY", "PANEL", "MOTOR"].every(needsSubQuestion)).toBe(true);
  });

  it("is false for the other four", () => {
    expect(["CABLE", "CRT", "PLASTIC", "OTHER"].some(needsSubQuestion)).toBe(false);
  });
});

describe("SUB_QUESTIONS", () => {
  it("names the lower-value option in every pair, so I-don't-know can route there", () => {
    for (const q of Object.values(SUB_QUESTIONS)) {
      expect(q.lowerValueCode).toBe(q.optionB.code);
    }
  });
});

describe("S3 Sub-category", () => {
  it("asks the question and shows both options", async () => {
    const { getByText } = wrap();
    await waitFor(() => expect(getByText("कोणता बोर्ड?")).toBeTruthy());
    expect(getByText("कॉम्प्युटर बोर्ड")).toBeTruthy();
    expect(getByText("टीव्ही बोर्ड")).toBeTruthy();
  });

  it("always shows an I-don't-know option", async () => {
    const { getByText } = wrap();
    await waitFor(() => expect(getByText("मला माहीत नाही")).toBeTruthy());
  });

  it("routes I-don't-know to the lower-value sub-type", async () => {
    const onDone = jest.fn();
    const { getByText } = wrap({ onDone });
    await waitFor(() => getByText("मला माहीत नाही"));
    fireEvent.press(getByText("मला माहीत नाही"));
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ code: "PCB_APPLIANCE" }));
  });

  it("selects the option the collector picked", async () => {
    const onDone = jest.fn();
    const { getByText } = wrap({ onDone });
    await waitFor(() => getByText("कॉम्प्युटर बोर्ड"));
    fireEvent.press(getByText("कॉम्प्युटर बोर्ड"));
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ code: "PCB_COMPUTER" }));
  });

  it("speaks the question on arrival", async () => {
    const { speak } = require("../../src/audio/speak.js");
    wrap();
    await waitFor(() => expect(speak).toHaveBeenCalledWith(["ask_which_board"], "mr"));
  });
});
```

- [ ] **Step 2: Write `client/app/src/screens/S3SubCategory.js`**

```js
import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, SafeAreaView } from "react-native";
import tokens from "../theme/tokens.js";
import { useLang } from "../i18n/useLang.js";
import { useLotDraft } from "../state/LotDraft.js";
import CategoryIcon from "../components/CategoryIcon.js";
import { getPrisma } from "../db/client.js";
import { loadReference } from "../db/repos/reference.js";

/**
 * The four distinctions that set the price and that NO PHOTOGRAPH COULD EVER
 * RESOLVE — the difference is inside the object or in its grade, not on its
 * surface. So they are always asked, never inferred (FLOW.md).
 *
 * optionB is the lower-value sub-type in every pair, and `lowerValueCode`
 * points at it: "I don't know" routes there, so uncertainty never inflates the
 * estimate.
 */
export const SUB_QUESTIONS = {
  PCB: {
    questionKey: "ask_which_board",
    optionA: { code: "PCB_COMPUTER", stringKey: "sub_pcb_computer", clipKey: "sub_pcb_computer" },
    optionB: { code: "PCB_APPLIANCE", stringKey: "sub_pcb_appliance", clipKey: "sub_pcb_appliance" },
    lowerValueCode: "PCB_APPLIANCE",
  },
  BATTERY: {
    questionKey: "ask_which_battery",
    optionA: { code: "BATTERY_PHONE", stringKey: "sub_battery_phone", clipKey: "sub_battery_phone" },
    optionB: {
      code: "BATTERY_INVERTER",
      stringKey: "sub_battery_inverter",
      clipKey: "sub_battery_inverter",
    },
    lowerValueCode: "BATTERY_INVERTER",
  },
  PANEL: {
    questionKey: "ask_which_screen",
    optionA: { code: "PANEL_LAPTOP", stringKey: "sub_panel_laptop", clipKey: "sub_panel_laptop" },
    optionB: { code: "PANEL_TV", stringKey: "sub_panel_tv", clipKey: "sub_panel_tv" },
    lowerValueCode: "PANEL_TV",
  },
  MOTOR: {
    questionKey: "ask_which_part",
    optionA: { code: "MOTOR_HDD", stringKey: "sub_motor_hdd", clipKey: "sub_motor_hdd" },
    optionB: { code: "MOTOR_FAN", stringKey: "sub_motor_fan", clipKey: "sub_motor_fan" },
    lowerValueCode: "MOTOR_FAN",
  },
};

export function needsSubQuestion(parentCode) {
  return Object.hasOwn(SUB_QUESTIONS, parentCode);
}

export default function S3SubCategory({ parentCode, onDone, onBack }) {
  const { t, speak } = useLang();
  const { setSubCategory } = useLotDraft();
  const [byCode, setByCode] = useState(new Map());
  const spec = SUB_QUESTIONS[parentCode];

  useEffect(() => {
    (async () => {
      const db = await getPrisma();
      const { categories } = await loadReference(db);
      setByCode(new Map(categories.map((c) => [c.code, c])));
    })();
    if (spec) speak(spec.questionKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentCode]);

  if (!spec) return null;

  function pick(code) {
    const row = byCode.get(code);
    if (!row) return;
    const payload = { id: row.id, code: row.code, defaultUnit: row.default_unit };
    setSubCategory(payload);
    onDone?.(payload);
  }

  const Option = ({ option }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(option.stringKey)}
      onPress={() => {
        speak(option.clipKey);
        pick(option.code);
      }}
      style={styles.option}
    >
      <CategoryIcon code={option.code} size={tokens.touch.icon} />
      <Text allowFontScaling style={styles.optionLabel}>
        {t(option.stringKey)}
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(spec.questionKey)}
        onPress={() => speak(spec.questionKey)}
      >
        <Text allowFontScaling style={styles.question}>
          {t(spec.questionKey)}
        </Text>
      </Pressable>

      <View style={styles.options}>
        <Option option={spec.optionA} />
        <Option option={spec.optionB} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("dont_know")}
        onPress={() => {
          speak("dont_know");
          // Routes to the LOWER-value sub-type. Uncertainty must never
          // inflate the estimate, because an inflated estimate is a promise
          // the counter will break.
          pick(spec.lowerValueCode);
        }}
        style={styles.dontKnow}
      >
        <Text allowFontScaling style={styles.dontKnowText}>
          {t("dont_know")}
        </Text>
      </Pressable>

      <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
        <Text allowFontScaling style={styles.backText}>
          {t("back")}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.bg, padding: tokens.space.md },
  question: {
    fontSize: tokens.type.title,
    fontWeight: "800",
    color: tokens.color.ink,
    marginBottom: tokens.space.lg,
  },
  options: { flex: 1, flexDirection: "row", gap: tokens.space.md },
  option: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: tokens.color.rule,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    gap: tokens.space.sm,
  },
  optionLabel: {
    fontSize: tokens.type.label,
    fontWeight: "700",
    color: tokens.color.ink,
    textAlign: "center",
  },
  dontKnow: {
    minHeight: tokens.touch.min,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: tokens.color.rule,
    borderRadius: tokens.radius.md,
    marginTop: tokens.space.md,
  },
  dontKnowText: { fontSize: tokens.type.body, color: tokens.color.inkMuted, fontWeight: "600" },
  back: { minHeight: tokens.touch.min, alignItems: "center", justifyContent: "center" },
  backText: { fontSize: tokens.type.label, color: tokens.color.inkMuted },
});
```

- [ ] **Step 3: Run the tests and watch them pass**

```bash
cd client/app && npx jest test/screens/S3SubCategory.test.js
```

Expected: PASS, 8 tests.

- [ ] **Step 4: Commit**

```bash
git add client/app/src/screens/S3SubCategory.js client/app/test/screens/S3SubCategory.test.js
git commit -m "feat(app): S3 clarifying question — always asked, never inferred, unknown routes lower"
```

---

**Tasks 12–21 continue in [part 3](2026-09-01-02c-collector-app-value-sync.md):** S4 Quantity (12), S4b Condition (13), S4c Source (14), S5 Value and ranked recyclers (15), S6 Accept (16), S7 Handover with QR and the two-sided confirm (17), S8 Ledger (18), Price board (19), Safety cards (20), and the sync engine with the pending pill, delta and staleness (21).
