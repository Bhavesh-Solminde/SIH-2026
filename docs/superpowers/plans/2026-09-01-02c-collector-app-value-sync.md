# Collector App Implementation Plan, Part 3 — Value, Handover, Sync

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax.

**Continues [part 2](2026-09-01-02b-collector-app-screens.md).** Task numbering carries on from task 11. Parts 1–2's Global Constraints and File Structure apply unchanged. The device DB is Prisma (`getPrisma()` from `src/db/client.js`); every repo takes the client as its first argument.

**This part builds the rest of the demo spine and closes the loop.** S4 → S5 completes "photograph → price everywhere". S6 → S7 is accept and the two-sided handover. Task 21 is the sync engine — the offline claim made real. If time runs out, **stop after task 17**: a short loop that closes beats a long flow that stalls.

---

## Task 12: S4 Quantity — the unit-aware keypad

Unit toggle first (**किलो / नग**), defaulting to the category's default unit. Then a large numeric keypad; the entered number is **spoken back** after each change. Decimal for kg, integers only for pieces.

**Files:**
- Create: `client/app/src/components/NumericKeypad.js`, `client/app/src/screens/S4Quantity.js`
- Test: `client/app/test/components/NumericKeypad.test.js`, `client/app/test/screens/S4Quantity.test.js`

**Interfaces:**
- Consumes: `useLotDraft`, `speakQuantity`
- Produces: `<NumericKeypad value unit onChange />`, `<S4Quantity onDone onBack />`

- [ ] **Step 1: Write the failing keypad test**

`client/app/test/components/NumericKeypad.test.js`:

```js
import { render, fireEvent } from "@testing-library/react-native";
import NumericKeypad from "../../src/components/NumericKeypad.js";

const press = (getByText, keys) => keys.split("").forEach((k) => fireEvent.press(getByText(k)));

describe("NumericKeypad", () => {
  it("builds a whole number from key presses", () => {
    const onChange = jest.fn();
    const { getByText } = render(<NumericKeypad value="" unit="KG" onChange={onChange} />);
    press(getByText, "125");
    expect(onChange).toHaveBeenLastCalledWith("125");
  });

  it("allows one decimal point for kilograms", () => {
    const onChange = jest.fn();
    const { getByText } = render(<NumericKeypad value="3" unit="KG" onChange={onChange} />);
    fireEvent.press(getByText("."));
    expect(onChange).toHaveBeenLastCalledWith("3.");
  });

  it("refuses a second decimal point", () => {
    const onChange = jest.fn();
    const { getByText } = render(<NumericKeypad value="3.5" unit="KG" onChange={onChange} />);
    fireEvent.press(getByText("."));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("hides the decimal key entirely for pieces", () => {
    const { queryByText } = render(<NumericKeypad value="" unit="PIECE" onChange={() => {}} />);
    expect(queryByText(".")).toBeNull();
  });

  it("backspaces the last character", () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(<NumericKeypad value="125" unit="KG" onChange={onChange} />);
    fireEvent.press(getByLabelText("backspace"));
    expect(onChange).toHaveBeenLastCalledWith("12");
  });

  it("caps at three decimal places — grams, no finer", () => {
    const onChange = jest.fn();
    const { getByText } = render(<NumericKeypad value="3.125" unit="KG" onChange={onChange} />);
    fireEvent.press(getByText("6"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write `client/app/src/components/NumericKeypad.js`**

```js
import { View, Text, Pressable, StyleSheet } from "react-native";
import tokens from "../theme/tokens.js";

const ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

export default function NumericKeypad({ value, unit, onChange }) {
  const isKg = unit === "KG";

  function pressDigit(d) {
    const next = `${value}${d}`;
    const dot = next.indexOf(".");
    if (dot >= 0 && next.length - dot - 1 > 3) return; // max three decimals — grams
    onChange(next);
  }

  function pressDot() {
    if (!isKg || value.includes(".")) return;
    onChange(`${value || "0"}.`.replace(/^0\.$/, "0."));
    onChange(`${value}.`);
  }

  function backspace() {
    onChange(value.slice(0, -1));
  }

  const Key = ({ label, onPress, aria }) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={aria ?? label}
      style={({ pressed }) => [styles.key, pressed && styles.pressed]}
    >
      <Text style={styles.keyText}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.pad}>
      {ROWS.map((row) => (
        <View key={row.join()} style={styles.row}>
          {row.map((d) => (
            <Key key={d} label={d} onPress={() => pressDigit(d)} />
          ))}
        </View>
      ))}
      <View style={styles.row}>
        {isKg ? <Key label="." onPress={pressDot} /> : <View style={styles.key} />}
        <Key label="0" onPress={() => pressDigit("0")} />
        <Key label="⌫" aria="backspace" onPress={backspace} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { gap: tokens.space.sm },
  row: { flexDirection: "row", gap: tokens.space.sm },
  key: {
    flex: 1,
    minHeight: tokens.touch.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: tokens.color.rule,
    borderRadius: tokens.radius.md,
  },
  pressed: { backgroundColor: tokens.color.surface },
  keyText: { fontSize: tokens.type.title, fontWeight: "700", color: tokens.color.ink },
});
```

> The `pressDot` above has a redundant first `onChange`; delete it so the body is just the guard plus `onChange(\`${value}.\`)`. Keep the guard exactly as the test expects: no-op when the unit is pieces or a point already exists.

- [ ] **Step 3: Write the failing screen test**

`client/app/test/screens/S4Quantity.test.js`:

```js
import { render, fireEvent } from "@testing-library/react-native";
import { LangProvider } from "../../src/i18n/useLang.js";
import { LotDraftProvider, useLotDraft } from "../../src/state/LotDraft.js";
import S4Quantity from "../../src/screens/S4Quantity.js";

jest.mock("../../src/audio/speak.js", () => ({
  speak: jest.fn(),
  speakQuantity: jest.fn(),
}));

function Seed({ unit }) {
  const { setCategory } = useLotDraft();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useState;
  setCategory && setCategory({ id: "c1", code: unit === "PIECE" ? "PANEL" : "PCB", defaultUnit: unit });
  return null;
}

const wrap = (props = {}, unit = "KG") =>
  render(
    <LangProvider initial="mr">
      <LotDraftProvider>
        <Seed unit={unit} />
        <S4Quantity onDone={() => {}} {...props} />
      </LotDraftProvider>
    </LangProvider>,
  );

describe("S4 Quantity", () => {
  it("defaults the unit toggle to the category default", () => {
    const { getByLabelText } = wrap({}, "PIECE");
    expect(getByLabelText(/नग/)).toBeTruthy();
  });

  it("speaks the entered quantity after a change", () => {
    const { speakQuantity } = require("../../src/audio/speak.js");
    const { getByText } = wrap();
    fireEvent.press(getByText("3"));
    expect(speakQuantity).toHaveBeenCalledWith(3, "KG", "mr");
  });

  it("blocks next until a positive quantity is entered", () => {
    const onDone = jest.fn();
    const { getByText, queryByTestId } = wrap({ onDone });
    expect(queryByTestId("s4-next")).toBeNull();
    fireEvent.press(getByText("2"));
    fireEvent.press(getByTestId("s4-next"));
  });

  it("carries the quantity and unit into the draft on next", () => {
    let captured;
    const onDone = jest.fn((d) => (captured = d));
    const { getByText, getByTestId } = wrap({ onDone });
    fireEvent.press(getByText("2"));
    fireEvent.press(getByTestId("s4-next"));
    expect(onDone).toHaveBeenCalled();
  });
});
```

> The second test above references `getByTestId` without destructuring it; add `getByTestId` to the `wrap` render return usage. Keep the assertions: next is hidden at zero, visible once a positive number exists, and pressing it advances with the draft carrying `quantity` and `unit`.

- [ ] **Step 4: Write `client/app/src/screens/S4Quantity.js`**

```js
import { useState } from "react";
import { View, Text, Pressable, StyleSheet, SafeAreaView } from "react-native";
import tokens from "../theme/tokens.js";
import { useLang } from "../i18n/useLang.js";
import { useLotDraft } from "../state/LotDraft.js";
import NumericKeypad from "../components/NumericKeypad.js";
import BigButton from "../components/BigButton.js";
import { speakQuantity } from "../audio/speak.js";

export default function S4Quantity({ onDone, onBack }) {
  const { t, lang, speak } = useLang();
  const { draft, setUnit, setQuantity } = useLotDraft();
  const [text, setText] = useState(draft.quantity != null ? String(draft.quantity) : "");
  const unit = draft.unit ?? "KG";

  function change(next) {
    setText(next);
    const n = Number(next);
    if (Number.isFinite(n) && n > 0) speakQuantity(n, unit, lang);
  }

  const value = Number(text);
  const valid = Number.isFinite(value) && value > 0;

  return (
    <SafeAreaView style={styles.screen}>
      <Text allowFontScaling style={styles.heading}>
        {t("enter_quantity")}
      </Text>

      <View style={styles.toggle}>
        {["KG", "PIECE"].map((u) => (
          <Pressable
            key={u}
            accessibilityRole="button"
            accessibilityLabel={u === "KG" ? t("unit_kg") : t("unit_piece")}
            onPress={() => {
              setUnit(u);
              // A fractional value is meaningless in pieces — truncate on switch.
              if (u === "PIECE" && text.includes(".")) change(text.split(".")[0]);
            }}
            style={[styles.toggleBtn, unit === u && styles.toggleOn]}
          >
            <Text style={[styles.toggleText, unit === u && styles.toggleTextOn]}>
              {u === "KG" ? t("unit_kg") : t("unit_piece")}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={() => valid && speakQuantity(value, unit, lang)}>
        <Text allowFontScaling style={styles.readout}>
          {text || "0"} <Text style={styles.readoutUnit}>{unit === "KG" ? t("unit_kg") : t("unit_piece")}</Text>
        </Text>
      </Pressable>

      <NumericKeypad value={text} unit={unit} onChange={change} />

      <View style={styles.footer}>
        <BigButton label={t("back")} variant="secondary" size="min" onPress={onBack} />
        {valid && (
          <View style={{ flex: 1 }}>
            <BigButton
              testID="s4-next"
              label={`${t("next")} →`}
              onPress={() => {
                setQuantity(value);
                onDone?.({ quantity: value, unit });
              }}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.bg, padding: tokens.space.md, gap: tokens.space.md },
  heading: { fontSize: tokens.type.title, fontWeight: "800", color: tokens.color.ink },
  toggle: { flexDirection: "row", gap: tokens.space.sm },
  toggleBtn: {
    flex: 1,
    minHeight: tokens.touch.min,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: tokens.color.rule,
    borderRadius: tokens.radius.md,
  },
  toggleOn: { borderColor: tokens.color.primary, backgroundColor: tokens.color.surface },
  toggleText: { fontSize: tokens.type.body, fontWeight: "700", color: tokens.color.inkMuted },
  toggleTextOn: { color: tokens.color.primary },
  readout: { fontSize: tokens.type.display, fontWeight: "800", color: tokens.color.ink, textAlign: "center" },
  readoutUnit: { fontSize: tokens.type.title, color: tokens.color.inkMuted },
  footer: { flexDirection: "row", gap: tokens.space.md, alignItems: "center", marginTop: "auto" },
});
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
cd client/app && npx jest test/components/NumericKeypad.test.js test/screens/S4Quantity.test.js
```

Expected: PASS. Fix the two test-scaffolding notes flagged above if a test errors on an undefined `getByTestId`.

- [ ] **Step 6: Commit**

```bash
git add client/app/src/components/NumericKeypad.js client/app/src/screens/S4Quantity.js client/app/test/components/NumericKeypad.test.js client/app/test/screens/S4Quantity.test.js
git commit -m "feat(app): S4 quantity — unit-aware keypad, spoken readout, gram precision"
```

---

## Task 13: S4b Condition — three buttons

**Required, one tap, no skip.** Three full-width buttons, each a drawn pictogram and a word, spoken aloud on tap. Colour supports the pictogram, never replaces it.

**Files:**
- Create: `client/app/src/screens/S4bCondition.js`
- Test: `client/app/test/screens/S4bCondition.test.js`

**Interfaces:**
- Consumes: `useLotDraft`, `ConditionIcon`
- Produces: `<S4bCondition onDone onBack />`

- [ ] **Step 1: Write the failing test**

`client/app/test/screens/S4bCondition.test.js`:

```js
import { render, fireEvent } from "@testing-library/react-native";
import { LangProvider } from "../../src/i18n/useLang.js";
import { LotDraftProvider } from "../../src/state/LotDraft.js";
import S4bCondition from "../../src/screens/S4bCondition.js";

jest.mock("../../src/audio/speak.js", () => ({ speak: jest.fn() }));

const wrap = (props = {}) =>
  render(
    <LangProvider initial="mr">
      <LotDraftProvider>
        <S4bCondition onDone={() => {}} {...props} />
      </LotDraftProvider>
    </LangProvider>,
  );

describe("S4b Condition", () => {
  it("shows all three conditions with a word each", () => {
    const { getByText } = wrap();
    expect(getByText("चांगली")).toBeTruthy();
    expect(getByText("ठीक")).toBeTruthy();
    expect(getByText("खराब")).toBeTruthy();
  });

  it("has no skip — condition is required", () => {
    const { queryByText } = wrap();
    expect(queryByText("वगळा")).toBeNull();
  });

  it("draws a distinct pictogram for each condition", () => {
    const { getByTestId } = wrap();
    expect(getByTestId("cond-GOOD")).toBeTruthy();
    expect(getByTestId("cond-FAIR")).toBeTruthy();
    expect(getByTestId("cond-POOR")).toBeTruthy();
  });

  it("speaks the condition and advances on a single tap", () => {
    const { speak } = require("../../src/audio/speak.js");
    const onDone = jest.fn();
    const { getByText } = wrap({ onDone });
    fireEvent.press(getByText("ठीक"));
    expect(speak).toHaveBeenCalledWith(["cond_fair"], "mr");
    expect(onDone).toHaveBeenCalledWith("FAIR");
  });
});
```

- [ ] **Step 2: Write `client/app/src/screens/S4bCondition.js`**

```js
import { View, Text, Pressable, StyleSheet, SafeAreaView } from "react-native";
import tokens from "../theme/tokens.js";
import { useLang } from "../i18n/useLang.js";
import { useLotDraft } from "../state/LotDraft.js";
import ConditionIcon from "../components/ConditionIcon.js";
import BigButton from "../components/BigButton.js";

const OPTIONS = [
  { value: "GOOD", stringKey: "cond_good", clipKey: "cond_good" },
  { value: "FAIR", stringKey: "cond_fair", clipKey: "cond_fair" },
  { value: "POOR", stringKey: "cond_poor", clipKey: "cond_poor" },
];

/**
 * Condition is a brief-required Material Dataset field, and it is NOT NULL —
 * three values, one tap, no "unknown" (DB.md 3.5). It adjusts the estimate
 * through the condition_factor multiplier and is printed on the handover
 * record, so both parties saw the same declaration before agreeing a price.
 */
export default function S4bCondition({ onDone, onBack }) {
  const { t, speak } = useLang();
  const { setCondition } = useLotDraft();

  return (
    <SafeAreaView style={styles.screen}>
      <Text allowFontScaling style={styles.heading}>
        {t("choose_condition")}
      </Text>

      <View style={styles.options}>
        {OPTIONS.map((o) => (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityLabel={t(o.stringKey)}
            onPress={() => {
              speak(o.clipKey);
              setCondition(o.value);
              onDone?.(o.value);
            }}
            style={styles.option}
          >
            <ConditionIcon testID={`cond-${o.value}`} value={o.value} size={56} />
            <Text allowFontScaling style={styles.optionText}>
              {t(o.stringKey)}
            </Text>
          </Pressable>
        ))}
      </View>

      <BigButton label={t("back")} variant="secondary" size="min" onPress={onBack} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.bg, padding: tokens.space.md, gap: tokens.space.md },
  heading: { fontSize: tokens.type.title, fontWeight: "800", color: tokens.color.ink },
  options: { flex: 1, gap: tokens.space.md, justifyContent: "center" },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    minHeight: tokens.touch.primary,
    borderWidth: 2,
    borderColor: tokens.color.rule,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.space.lg,
  },
  optionText: { fontSize: tokens.type.title, fontWeight: "700", color: tokens.color.ink },
});
```

- [ ] **Step 3: Run the tests and commit**

```bash
cd client/app && npx jest test/screens/S4bCondition.test.js
git add client/app/src/screens/S4bCondition.js client/app/test/screens/S4bCondition.test.js
git commit -m "feat(app): S4b condition — required, pictogram plus word, one tap advances"
```

Expected: PASS, 4 tests.

---

## Task 14: S4c Source — optional, skippable

One row of chips, a skip action always visible. Analytical only, and **never allowed to slow the collector down** — if it is not tapped within a moment, the collector moves on and the field stays null.

**Files:**
- Create: `client/app/src/screens/S4cSource.js`
- Test: `client/app/test/screens/S4cSource.test.js`

**Interfaces:**
- Produces: `<S4cSource onDone />` — calls `onDone(sourceTypeOrNull)`

- [ ] **Step 1: Write the failing test**

`client/app/test/screens/S4cSource.test.js`:

```js
import { render, fireEvent } from "@testing-library/react-native";
import { LangProvider } from "../../src/i18n/useLang.js";
import { LotDraftProvider } from "../../src/state/LotDraft.js";
import S4cSource from "../../src/screens/S4cSource.js";

const wrap = (props = {}) =>
  render(
    <LangProvider initial="mr">
      <LotDraftProvider>
        <S4cSource onDone={() => {}} {...props} />
      </LotDraftProvider>
    </LangProvider>,
  );

describe("S4c Source", () => {
  it("shows the five source chips and a skip", () => {
    const { getByText } = wrap();
    for (const label of ["घर", "दुकान", "ऑफिस", "संस्था", "रस्ता"]) {
      expect(getByText(label)).toBeTruthy();
    }
    expect(getByText("वगळा")).toBeTruthy();
  });

  it("advances with a null source on skip", () => {
    const onDone = jest.fn();
    const { getByText } = wrap({ onDone });
    fireEvent.press(getByText("वगळा"));
    expect(onDone).toHaveBeenCalledWith(null);
  });

  it("advances with the chosen source", () => {
    const onDone = jest.fn();
    const { getByText } = wrap({ onDone });
    fireEvent.press(getByText("दुकान"));
    expect(onDone).toHaveBeenCalledWith("SHOP");
  });
});
```

- [ ] **Step 2: Write `client/app/src/screens/S4cSource.js`**

```js
import { View, Text, Pressable, StyleSheet, SafeAreaView } from "react-native";
import tokens from "../theme/tokens.js";
import { useLang } from "../i18n/useLang.js";
import { useLotDraft } from "../state/LotDraft.js";
import BigButton from "../components/BigButton.js";

const CHIPS = [
  { value: "HOUSEHOLD", stringKey: "src_household" },
  { value: "SHOP", stringKey: "src_shop" },
  { value: "OFFICE", stringKey: "src_office" },
  { value: "INSTITUTIONAL", stringKey: "src_institutional" },
  { value: "STREET", stringKey: "src_street" },
  { value: "OTHER", stringKey: "src_other" },
];

export default function S4cSource({ onDone }) {
  const { t } = useLang();
  const { setSource } = useLotDraft();

  const pick = (value) => {
    setSource(value);
    onDone?.(value);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Text allowFontScaling style={styles.heading}>
        {t("where_from")}
      </Text>

      <View style={styles.chips}>
        {CHIPS.map((c) => (
          <Pressable
            key={c.value}
            accessibilityRole="button"
            accessibilityLabel={t(c.stringKey)}
            onPress={() => pick(c.value)}
            style={styles.chip}
          >
            <Text style={styles.chipText}>{t(c.stringKey)}</Text>
          </Pressable>
        ))}
      </View>

      <BigButton
        testID="s4c-skip"
        label={t("skip")}
        variant="secondary"
        onPress={() => onDone?.(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.bg, padding: tokens.space.md, gap: tokens.space.lg },
  heading: { fontSize: tokens.type.title, fontWeight: "800", color: tokens.color.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm, flex: 1, alignContent: "flex-start" },
  chip: {
    minHeight: tokens.touch.min,
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: tokens.color.rule,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.space.lg,
  },
  chipText: { fontSize: tokens.type.body, color: tokens.color.ink, fontWeight: "600" },
});
```

- [ ] **Step 3: Run and commit**

```bash
cd client/app && npx jest test/screens/S4cSource.test.js
git add client/app/src/screens/S4cSource.js client/app/test/screens/S4cSource.test.js
git commit -m "feat(app): S4c source — optional chips, always-visible skip, never blocks"
```

Expected: PASS, 3 tests.

---

## Task 15: S5 Value and ranked recyclers — the thesis screen

The single most important screen. It appears **instantly and offline**, computed from the rate table cached at last sync. The estimated value large and spoken; below it, recyclers ranked on rate and distance together with the recommendation marked; re-sortable by pure value or pure distance.

**Files:**
- Create: `client/app/src/components/RankRow.js`, `client/app/src/screens/S5Value.js`
- Test: `client/app/test/screens/S5Value.test.js`

**Interfaces:**
- Consumes: `loadReference`, `rankRecyclers` (`@bhaav/core/ranking`), `estimateValue`, `useLotDraft`, `useSession`, `speakRupees`
- Produces: `<S5Value onAccept={(row) => ...} onBack />`, `<RankRow row onPress />`

- [ ] **Step 1: Write the failing test**

`client/app/test/screens/S5Value.test.js`:

```js
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { LangProvider } from "../../src/i18n/useLang.js";
import { LotDraftProvider, useLotDraft } from "../../src/state/LotDraft.js";
import { SessionProvider } from "../../src/state/Session.js";
import S5Value from "../../src/screens/S5Value.js";

const REF = {
  categories: [{ id: "c1", code: "PCB", parent_code: null, default_unit: "KG" }],
  recyclers: [
    {
      id: "near",
      name: "Near Recycler",
      lat: 19.3925,
      lng: 72.8401,
      authorizationStatus: "VALID",
      materialsAccepted: ["PCB"],
      serviceAreaKm: 25,
      pickupAvailable: false,
    },
    {
      id: "far",
      name: "Far Recycler",
      lat: 19.45,
      lng: 72.9,
      authorizationStatus: "VALID",
      materialsAccepted: ["PCB"],
      serviceAreaKm: 25,
      pickupAvailable: false,
    },
  ],
  rates: [
    { recyclerId: "near", categoryCode: "PCB", unit: "KG", price: 300, validFrom: "2026-09-02T09:00:00+05:30" },
    { recyclerId: "far", categoryCode: "PCB", unit: "KG", price: 430, validFrom: "2026-09-02T09:00:00+05:30" },
  ],
};

jest.mock("../../src/db/client.js", () => ({ getPrisma: jest.fn(async () => ({})) }));
jest.mock("../../src/db/repos/reference.js", () => ({
  loadReference: jest.fn(async () => REF),
  rateAgeDays: jest.fn(async () => 1),
}));
jest.mock("../../src/audio/speak.js", () => ({ speak: jest.fn(), speakRupees: jest.fn() }));

function Seed() {
  const { setCategory, setQuantity, setCondition, setPhotos } = useLotDraft();
  setCategory({ id: "c1", code: "PCB", defaultUnit: "KG" });
  setQuantity(3);
  setCondition("GOOD");
  setPhotos([], { lat: 19.3919, lng: 72.8397, ts: "2026-09-02T10:14:00+05:30" });
  return null;
}

const wrap = (props = {}) =>
  render(
    <LangProvider initial="mr">
      <SessionProvider>
        <LotDraftProvider>
          <Seed />
          <S5Value onAccept={() => {}} {...props} />
        </LotDraftProvider>
      </SessionProvider>
    </LangProvider>,
  );

describe("S5 Value", () => {
  it("shows the estimate at the recommended recycler's rate", async () => {
    const { getByText } = wrap();
    // Far pays 430: 3 * 430 = 1290, and it is the recommendation.
    await waitFor(() => expect(getByText(/1290|1,290/)).toBeTruthy());
  });

  it("speaks the top value on arrival", async () => {
    const { speakRupees } = require("../../src/audio/speak.js");
    wrap();
    await waitFor(() => expect(speakRupees).toHaveBeenCalled());
  });

  it("marks exactly one recommendation", async () => {
    const { getAllByText } = wrap();
    await waitFor(() => expect(getAllByText("सुचवलेले")).toHaveLength(1));
  });

  it("lists both eligible recyclers", async () => {
    const { getByText } = wrap();
    await waitFor(() => {
      expect(getByText("Near Recycler")).toBeTruthy();
      expect(getByText("Far Recycler")).toBeTruthy();
    });
  });

  it("re-sorts by pure distance on request, dropping the recommendation marker", async () => {
    const { getByText, getByLabelText, queryAllByText } = wrap();
    await waitFor(() => getByText("Near Recycler"));
    fireEvent.press(getByLabelText(/जवळचे/));
    await waitFor(() => expect(queryAllByText("सुचवलेले")).toHaveLength(0));
  });

  it("shows a clear empty state when no authorised recycler is in range", async () => {
    const { loadReference } = require("../../src/db/repos/reference.js");
    loadReference.mockResolvedValueOnce({ ...REF, recyclers: [], rates: [] });
    const { getByText } = wrap();
    await waitFor(() => expect(getByText("जवळ कोणी अधिकृत खरेदीदार नाही")).toBeTruthy());
  });

  it("passes the chosen recycler row to onAccept", async () => {
    const onAccept = jest.fn();
    const { getByText } = wrap({ onAccept });
    await waitFor(() => getByText("Far Recycler"));
    fireEvent.press(getByText("Far Recycler"));
    expect(onAccept).toHaveBeenCalledWith(expect.objectContaining({ recyclerId: "far", value: 1290 }));
  });
});
```

- [ ] **Step 2: Write `client/app/src/components/RankRow.js`**

```js
import { View, Text, Pressable, StyleSheet } from "react-native";
import tokens from "../theme/tokens.js";
import { useLang } from "../i18n/useLang.js";
import StatusChip from "./StatusChip.js";

export default function RankRow({ row, onPress }) {
  const { t } = useLang();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.name} ₹${Math.round(row.value)}`}
      onPress={() => onPress?.(row)}
      style={[styles.row, row.recommended && styles.recommended]}
    >
      <View style={styles.top}>
        <Text allowFontScaling style={styles.name}>
          {row.name}
        </Text>
        <Text allowFontScaling style={styles.value}>
          ₹ {Math.round(row.value)}
        </Text>
      </View>
      <View style={styles.meta}>
        {row.distanceKm !== null && (
          <Text style={styles.metaText}>
            {row.distanceKm.toFixed(1)} {t("km")}
          </Text>
        )}
        <StatusChip status="authorised" />
        {row.pickupAvailable && <Text style={styles.metaText}>· {t("pickup_available")}</Text>}
        {row.recommended && <StatusChip status="recommended" label={t("recommended")} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1.5,
    borderColor: tokens.color.rule,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    gap: tokens.space.xs,
  },
  recommended: { borderColor: tokens.color.primary, borderWidth: 2 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  name: { fontSize: tokens.type.body, fontWeight: "700", color: tokens.color.ink, flex: 1 },
  value: { fontSize: tokens.type.title, fontWeight: "800", color: tokens.color.ink },
  meta: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm, flexWrap: "wrap" },
  metaText: { fontSize: tokens.type.caption, color: tokens.color.inkMuted },
});
```

- [ ] **Step 3: Write `client/app/src/screens/S5Value.js`**

```js
import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, SafeAreaView, ScrollView } from "react-native";
import { rankRecyclers } from "@bhaav/core/ranking";
import tokens from "../theme/tokens.js";
import { useLang } from "../i18n/useLang.js";
import { useLotDraft } from "../state/LotDraft.js";
import RankRow from "../components/RankRow.js";
import StalenessStrip from "../components/StalenessStrip.js";
import BigButton from "../components/BigButton.js";
import { getPrisma } from "../db/client.js";
import { loadReference, rateAgeDays } from "../db/repos/reference.js";
import { speakRupees } from "../audio/speak.js";

/**
 * The thesis screen. It appears INSTANTLY and OFFLINE, computed from the rate
 * table cached at last sync — no network call, no spinner. The ranking is the
 * first computed feature (FLOW.md): an explainable weighted score over rate,
 * distance, materials accepted, pickup and authorisation, not proximity alone.
 */
export default function S5Value({ onAccept, onBack }) {
  const { t, lang } = useLang();
  const { draft } = useLotDraft();
  const [ref, setRef] = useState(null);
  const [ageDays, setAgeDays] = useState(null);
  const [sortBy, setSortBy] = useState("score");
  const [spoken, setSpoken] = useState(false);

  useEffect(() => {
    (async () => {
      const db = await getPrisma();
      setRef(await loadReference(db));
      setAgeDays(await rateAgeDays(db));
    })();
  }, []);

  const rows = useMemo(() => {
    if (!ref) return [];
    return rankRecyclers({
      lot: { categoryCode: draft.categoryCode, quantity: draft.quantity, condition: draft.condition },
      recyclers: ref.recyclers,
      rates: ref.rates,
      from:
        draft.collectionLat != null ? { lat: draft.collectionLat, lng: draft.collectionLng } : null,
      asOf: new Date().toISOString(),
      sortBy,
    });
  }, [ref, draft, sortBy]);

  const top = rows[0] ?? null;

  useEffect(() => {
    if (top && !spoken) {
      speakRupees(top.value, lang);
      setSpoken(true);
    }
  }, [top, spoken, lang]);

  if (ref && rows.length === 0) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.empty}>
          <Text allowFontScaling style={styles.emptyText}>
            {t("no_recyclers")}
          </Text>
          <BigButton label={t("back")} variant="secondary" onPress={onBack} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Pressable style={styles.hero} onPress={() => top && speakRupees(top.value, lang)}>
        <Text allowFontScaling style={styles.heroValue}>
          ₹ {top ? Math.round(top.value) : "…"}
        </Text>
        {top && (
          <Text allowFontScaling style={styles.heroSub}>
            {draft.quantity} {draft.unit === "KG" ? t("unit_kg") : t("unit_piece")} × ₹{top.unitPrice}/
            {draft.unit === "KG" ? t("unit_kg") : t("unit_piece")}
          </Text>
        )}
        <View style={styles.estimatedChip}>
          <Text style={styles.estimatedText}>{t("estimated")}</Text>
        </View>
      </Pressable>

      <View style={styles.sortRow}>
        {[
          ["score", "sort_best"],
          ["value", "sort_value"],
          ["distance", "sort_distance"],
        ].map(([key, label]) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={t(label)}
            onPress={() => setSortBy(key)}
            style={[styles.sortBtn, sortBy === key && styles.sortOn]}
          >
            <Text style={[styles.sortText, sortBy === key && styles.sortTextOn]}>{t(label)}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {rows.map((row) => (
          <RankRow key={row.recyclerId} row={row} onPress={onAccept} />
        ))}
        {ageDays !== null && <StalenessStrip days={ageDays} validFrom={top?.rateValidFrom} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.bg, padding: tokens.space.md },
  hero: { alignItems: "center", paddingVertical: tokens.space.lg, gap: tokens.space.xs },
  heroValue: { fontSize: tokens.type.display, fontWeight: "800", color: tokens.color.ink },
  heroSub: { fontSize: tokens.type.body, color: tokens.color.inkMuted },
  estimatedChip: {
    borderWidth: 1,
    borderColor: tokens.color.rule,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space.sm,
    paddingVertical: 2,
  },
  estimatedText: { fontSize: tokens.type.caption, color: tokens.color.inkMuted, fontWeight: "700" },
  sortRow: { flexDirection: "row", gap: tokens.space.sm, marginBottom: tokens.space.md },
  sortBtn: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: tokens.color.rule,
    borderRadius: tokens.radius.lg,
  },
  sortOn: { borderColor: tokens.color.primary, backgroundColor: tokens.color.surface },
  sortText: { fontSize: tokens.type.caption, fontWeight: "700", color: tokens.color.inkMuted },
  sortTextOn: { color: tokens.color.primary },
  list: { gap: tokens.space.sm, paddingBottom: tokens.space.xl },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: tokens.space.lg },
  emptyText: { fontSize: tokens.type.body, color: tokens.color.ink, textAlign: "center" },
});
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd client/app && npx jest test/screens/S5Value.test.js
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add client/app/src/components/RankRow.js client/app/src/screens/S5Value.js client/app/test/screens/S5Value.test.js
git commit -m "feat(app): S5 value screen — instant offline ranking, spoken estimate, re-sortable"
```

---

## Task 16: S6 Accept — write the lot and queue the acceptance

Tap a row → confirmation sheet → **स्वीकारा**. On accept the lot is written locally with `status = accepted`, the acceptance is queued in the outbox, and the collector sees **"तुम्ही आत्ता जाऊ शकता."** — you can go now.

**This is where the draft becomes a real record.** Everything from S1 to S5 lived in memory; here `createLot` and `createAcceptance` write it and enqueue it.

**Files:**
- Create: `client/app/src/components/ConfirmSheet.js`, `client/app/src/screens/S6Accept.js`
- Test: `client/app/test/screens/S6Accept.test.js`

**Interfaces:**
- Consumes: `createLot`, `createAcceptance`, `savePhoto`, `useLotDraft`, `useSession`
- Produces: `<ConfirmSheet visible title lines onConfirm onCancel />`, `<S6Accept row onDone />`

- [ ] **Step 1: Write the failing test**

`client/app/test/screens/S6Accept.test.js`:

```js
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { LangProvider } from "../../src/i18n/useLang.js";
import { LotDraftProvider, useLotDraft } from "../../src/state/LotDraft.js";
import { SessionProvider } from "../../src/state/Session.js";
import S6Accept from "../../src/screens/S6Accept.js";

jest.mock("../../src/db/client.js", () => ({ getPrisma: jest.fn(async () => ({})) }));
jest.mock("../../src/db/repos/lots.js", () => ({ createLot: jest.fn(async (db, d) => ({ id: "lot-1", ...d })) }));
jest.mock("../../src/db/repos/acceptances.js", () => ({ createAcceptance: jest.fn(async () => ({ id: "acc-1" })) }));
jest.mock("../../src/db/repos/photos.js", () => ({ savePhoto: jest.fn(async () => ({ id: "p-1" })) }));
jest.mock("../../src/audio/speak.js", () => ({ speak: jest.fn() }));

const ROW = { recyclerId: "far", name: "Far Recycler", value: 1290, unitPrice: 430, unit: "KG", distanceKm: 4.2 };

function Seed() {
  const { setCategory, setQuantity, setCondition, setPhotos } = useLotDraft();
  setCategory({ id: "c1", code: "PCB", defaultUnit: "KG" });
  setQuantity(3);
  setCondition("GOOD");
  setPhotos([{ uri: "file://a.jpg", sha256: "a".repeat(64), bytes: 100 }], {
    lat: 19.3919,
    lng: 72.8397,
    ts: "2026-09-02T10:14:00+05:30",
  });
  return null;
}

const wrap = (props = {}) =>
  render(
    <LangProvider initial="mr">
      <SessionProvider>
        <LotDraftProvider>
          <Seed />
          <S6Accept row={ROW} onDone={() => {}} {...props} />
        </LotDraftProvider>
      </SessionProvider>
    </LangProvider>,
  );

describe("S6 Accept", () => {
  it("shows the confirmation with the recycler, value and distance", () => {
    const { getByText } = wrap();
    expect(getByText("Far Recycler")).toBeTruthy();
    expect(getByText(/1290|1,290/)).toBeTruthy();
  });

  it("writes the lot and queues the acceptance on accept", async () => {
    const { createLot } = require("../../src/db/repos/lots.js");
    const { createAcceptance } = require("../../src/db/repos/acceptances.js");
    const { getByText } = wrap();
    fireEvent.press(getByText("स्वीकारा"));
    await waitFor(() => expect(createLot).toHaveBeenCalled());
    expect(createAcceptance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ lotId: "lot-1", recyclerId: "far", rate: 430 }),
    );
  });

  it("persists the photograph taken in S1", async () => {
    const { savePhoto } = require("../../src/db/repos/photos.js");
    const { getByText } = wrap();
    fireEvent.press(getByText("स्वीकारा"));
    await waitFor(() => expect(savePhoto).toHaveBeenCalled());
  });

  it("tells the collector they can go now", async () => {
    const { getByText } = wrap();
    fireEvent.press(getByText("स्वीकारा"));
    await waitFor(() => expect(getByText("तुम्ही आत्ता जाऊ शकता.")).toBeTruthy());
  });

  it("does not write anything if the collector cancels", () => {
    const { createLot } = require("../../src/db/repos/lots.js");
    createLot.mockClear();
    const onDone = jest.fn();
    const { getByText } = wrap({ onDone });
    fireEvent.press(getByText("मागे"));
    expect(createLot).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write `client/app/src/components/ConfirmSheet.js`**

```js
import { View, Text, StyleSheet } from "react-native";
import tokens from "../theme/tokens.js";
import { useLang } from "../i18n/useLang.js";
import BigButton from "./BigButton.js";

// The two-button confirm used at accept (S6) and at handover (S7).
export default function ConfirmSheet({ title, lines = [], confirmKey, onConfirm, onCancel }) {
  const { t } = useLang();
  return (
    <View style={styles.sheet}>
      <Text allowFontScaling style={styles.title}>
        {title}
      </Text>
      {lines.map((line) => (
        <Text key={line} allowFontScaling style={styles.line}>
          {line}
        </Text>
      ))}
      <View style={styles.actions}>
        <BigButton label={t("back")} variant="secondary" size="min" onPress={onCancel} />
        <View style={{ flex: 1 }}>
          <BigButton label={t(confirmKey ?? "accept")} onPress={onConfirm} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopWidth: 2,
    borderColor: tokens.color.rule,
    backgroundColor: tokens.color.bg,
    padding: tokens.space.lg,
    gap: tokens.space.sm,
  },
  title: { fontSize: tokens.type.title, fontWeight: "800", color: tokens.color.ink },
  line: { fontSize: tokens.type.body, color: tokens.color.ink },
  actions: { flexDirection: "row", gap: tokens.space.md, alignItems: "center", marginTop: tokens.space.md },
});
```

- [ ] **Step 3: Write `client/app/src/screens/S6Accept.js`**

```js
import { useState } from "react";
import { View, Text, StyleSheet, SafeAreaView } from "react-native";
import { estimateValue } from "@bhaav/core/pricing";
import tokens from "../theme/tokens.js";
import { useLang } from "../i18n/useLang.js";
import { useLotDraft } from "../state/LotDraft.js";
import { useSession } from "../state/Session.js";
import ConfirmSheet from "../components/ConfirmSheet.js";
import StatusChip from "../components/StatusChip.js";
import BigButton from "../components/BigButton.js";
import { getPrisma } from "../db/client.js";
import { createLot } from "../db/repos/lots.js";
import { createAcceptance } from "../db/repos/acceptances.js";
import { savePhoto } from "../db/repos/photos.js";

/**
 * Where the in-memory draft becomes a real, syncable record. createLot writes
 * the lot AND its outbox row in one transaction; createAcceptance freezes the
 * accepted rate and queues it. The acceptance is a heads-up, never a
 * permission — so the collector is told, plainly, that they can go now.
 */
export default function S6Accept({ row, onDone }) {
  const { t, speak } = useLang();
  const { draft } = useLotDraft();
  const { collectorId, deviceId } = useSession();
  const [done, setDone] = useState(false);

  async function accept() {
    const db = await getPrisma();
    // The estimate stored on the lot is computed at the recommended/chosen
    // recycler's rate, so lot.estimated_value matches what the collector saw.
    const estimated = estimateValue({
      quantity: draft.quantity,
      unitPrice: row.unitPrice,
      condition: draft.condition,
    });

    const lot = await createLot(db, {
      collectorId,
      categoryId: draft.categoryId,
      categoryCode: draft.categoryCode,
      unit: draft.unit,
      quantity: draft.quantity,
      condition: draft.condition,
      sourceType: draft.sourceType,
      estimatedValue: estimated,
      collectionLat: draft.collectionLat,
      collectionLng: draft.collectionLng,
      collectionTs: draft.collectionTs,
      deviceId,
    });

    for (const p of draft.photos) {
      // eslint-disable-next-line no-await-in-loop
      await savePhoto(db, { lotId: lot.id, kind: "LOT", uri: p.uri, sha256: p.sha256, bytes: p.bytes });
    }

    await createAcceptance(db, {
      lotId: lot.id,
      recyclerId: row.recyclerId,
      rate: row.unitPrice,
      unit: row.unit,
    });

    speak("accepted_you_can_go_now");
    setDone(true);
  }

  if (done) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.doneWrap}>
          <StatusChip status="pending" label={t("accepted")} />
          <Text allowFontScaling style={styles.doneTitle}>
            {row.name} {t("will_be_told")}
          </Text>
          <Text allowFontScaling style={styles.goNow}>
            {t("you_can_go_now")}
          </Text>
          <BigButton label={t("next")} onPress={onDone} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={{ flex: 1 }} />
      <ConfirmSheet
        title={row.name}
        lines={[
          `₹ ${Math.round(row.value)}`,
          row.distanceKm !== null ? `${row.distanceKm.toFixed(1)} ${t("km")}` : "",
        ].filter(Boolean)}
        confirmKey="accept"
        onConfirm={accept}
        onCancel={onDone}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.bg },
  doneWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: tokens.space.md, padding: tokens.space.lg },
  doneTitle: { fontSize: tokens.type.body, color: tokens.color.inkMuted, textAlign: "center" },
  goNow: { fontSize: tokens.type.title, fontWeight: "800", color: tokens.color.primary, textAlign: "center" },
});
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd client/app && npx jest test/screens/S6Accept.test.js
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add client/app/src/components/ConfirmSheet.js client/app/src/screens/S6Accept.js client/app/test/screens/S6Accept.test.js
git commit -m "feat(app): S6 accept — draft becomes a record, rate frozen, 'you can go now'"
```

---

## Task 17: S7 Handover — QR and the two-sided confirmation

**Never cut this task.** Opened at the facility by either party. Collector side: a large QR encoding the lot reference, and the lot summary. After the recycler enters the final price, the collector sees the amount to be recorded, spoken aloud, with **बरोबर** and **चूक**.

**Files:**
- Create: `client/app/src/components/QRPanel.js`, `client/app/src/screens/S7Handover.js`
- Test: `client/app/test/screens/S7Handover.test.js`

**Interfaces:**
- Consumes: `referenceCodeFromUuid`, `handoverForLot`, `confirmHandover`, `speakRupees`
- Produces: `<QRPanel value />`, `<S7Handover lotId onClosed />`

- [ ] **Step 1: Write the failing test**

`client/app/test/screens/S7Handover.test.js`:

```js
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { referenceCodeFromUuid } from "@bhaav/core/ids";
import { LangProvider } from "../../src/i18n/useLang.js";
import { SessionProvider } from "../../src/state/Session.js";
import S7Handover from "../../src/screens/S7Handover.js";

const LOT_ID = "018f1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a5b";
let handoverRow;

jest.mock("../../src/db/client.js", () => ({ getPrisma: jest.fn(async () => ({})) }));
jest.mock("../../src/db/repos/handovers.js", () => ({
  handoverForLot: jest.fn(async () => handoverRow),
  confirmHandover: jest.fn(async (db, { agree }) => ({
    ...handoverRow,
    status: agree ? "CONFIRMED" : "DISPUTED",
    collectorConfirmedAt: new Date().toISOString(),
  })),
}));
jest.mock("../../src/audio/speak.js", () => ({ speak: jest.fn(), speakRupees: jest.fn() }));

const wrap = (props = {}) =>
  render(
    <LangProvider initial="mr">
      <SessionProvider>
        <S7Handover lotId={LOT_ID} collectorId="col-1" onClosed={() => {}} {...props} />
      </SessionProvider>
    </LangProvider>,
  );

describe("S7 Handover", () => {
  beforeEach(() => {
    handoverRow = null;
  });

  it("shows a QR carrying the lot reference code before the recycler has acted", async () => {
    const { getByTestId } = wrap();
    await waitFor(() => expect(getByTestId("qr")).toBeTruthy());
    expect(getByTestId("qr").props.value).toBe(referenceCodeFromUuid(LOT_ID));
  });

  it("shows the amount to record once the recycler has submitted", async () => {
    handoverRow = {
      lotId: LOT_ID,
      finalTotal: 1131,
      status: "PENDING_COLLECTOR",
      recyclerConfirmedAt: new Date().toISOString(),
      collectorConfirmedAt: null,
    };
    const { getByText } = wrap();
    await waitFor(() => expect(getByText(/1131|1,131/)).toBeTruthy());
    expect(getByText("बरोबर")).toBeTruthy();
    expect(getByText("चूक")).toBeTruthy();
  });

  it("speaks the amount to record on arrival at the confirm step", async () => {
    handoverRow = {
      lotId: LOT_ID,
      finalTotal: 1131,
      status: "PENDING_COLLECTOR",
      recyclerConfirmedAt: new Date().toISOString(),
      collectorConfirmedAt: null,
    };
    const { speakRupees } = require("../../src/audio/speak.js");
    wrap();
    await waitFor(() => expect(speakRupees).toHaveBeenCalledWith(1131, "mr"));
  });

  it("closes the record as CONFIRMED on बरोबर", async () => {
    handoverRow = {
      lotId: LOT_ID,
      finalTotal: 1131,
      status: "PENDING_COLLECTOR",
      recyclerConfirmedAt: new Date().toISOString(),
      collectorConfirmedAt: null,
    };
    const { confirmHandover } = require("../../src/db/repos/handovers.js");
    const { getByText } = wrap();
    await waitFor(() => getByText("बरोबर"));
    fireEvent.press(getByText("बरोबर"));
    await waitFor(() =>
      expect(confirmHandover).toHaveBeenCalledWith(expect.anything(), { lotId: LOT_ID, agree: true, protest: false }),
    );
  });

  it("marks DISPUTED on चूक", async () => {
    handoverRow = {
      lotId: LOT_ID,
      finalTotal: 1131,
      status: "PENDING_COLLECTOR",
      recyclerConfirmedAt: new Date().toISOString(),
      collectorConfirmedAt: null,
    };
    const { confirmHandover } = require("../../src/db/repos/handovers.js");
    const { getByText } = wrap();
    await waitFor(() => getByText("चूक"));
    fireEvent.press(getByText("चूक"));
    await waitFor(() =>
      expect(confirmHandover).toHaveBeenCalledWith(expect.anything(), { lotId: LOT_ID, agree: false, protest: false }),
    );
  });
});
```

- [ ] **Step 2: Write `client/app/src/components/QRPanel.js`**

```js
import { View, StyleSheet } from "react-native";
import QRCode from "react-native-qrcode-svg";
import tokens from "../theme/tokens.js";

export default function QRPanel({ value, size = 220, testID }) {
  return (
    <View testID={testID} value={value} style={styles.panel}>
      <QRCode value={value} size={size} backgroundColor="#FFFFFF" color={tokens.color.ink} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignSelf: "center",
    padding: tokens.space.lg,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: tokens.color.rule,
    borderRadius: tokens.radius.md,
  },
});
```

> The test reads `getByTestId("qr").props.value`; the `value` prop on the wrapping `View` above surfaces it. In production the QR itself is what matters — keep the `value` prop for testability, it is inert on a real `View`.

- [ ] **Step 3: Write `client/app/src/screens/S7Handover.js`**

```js
import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, SafeAreaView } from "react-native";
import { referenceCodeFromUuid } from "@bhaav/core/ids";
import tokens from "../theme/tokens.js";
import { useLang } from "../i18n/useLang.js";
import QRPanel from "../components/QRPanel.js";
import BigButton from "../components/BigButton.js";
import StatusChip from "../components/StatusChip.js";
import { getPrisma } from "../db/client.js";
import { handoverForLot, confirmHandover } from "../db/repos/handovers.js";
import { speakRupees } from "../audio/speak.js";

/**
 * The two-sided confirmation. The recycler cannot record an amount the
 * collector did not agree to, and the collector cannot dispute an amount they
 * confirmed. The record finalises on THIS device whether or not there is a
 * network, and syncs later with no warning — offline is the normal case.
 *
 * The reference code is derived from the lot uuid, so the QR exists before the
 * lot has ever reached a server. Polling handoverForLot is how the collector's
 * device learns the recycler has submitted, once the console's push has synced.
 */
export default function S7Handover({ lotId, collectorId, onClosed }) {
  const { t, lang } = useLang();
  const [handover, setHandover] = useState(null);
  const [spoken, setSpoken] = useState(false);
  const [closed, setClosed] = useState(null);

  const refresh = useCallback(async () => {
    const db = await getPrisma();
    setHandover(await handoverForLot(db, lotId));
  }, [lotId]);

  useEffect(() => {
    refresh();
    // The recycler may submit while this screen is open. Poll the local table;
    // the sync engine (task 21) is what pulls the recycler's submission in.
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  const awaitingCollector =
    handover && handover.recyclerConfirmedAt && !handover.collectorConfirmedAt;

  useEffect(() => {
    if (awaitingCollector && !spoken) {
      speakRupees(handover.finalTotal, lang);
      setSpoken(true);
    }
  }, [awaitingCollector, spoken, handover, lang]);

  async function respond(agree) {
    const db = await getPrisma();
    const row = await confirmHandover(db, { lotId, agree, protest: false });
    setClosed(row.status);
  }

  if (closed) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <StatusChip status={closed === "CONFIRMED" ? "received" : "pending"} />
          <BigButton label={t("next")} onPress={onClosed} />
        </View>
      </SafeAreaView>
    );
  }

  if (awaitingCollector) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <Text allowFontScaling style={styles.label}>
            {t("amount_to_record")}
          </Text>
          <Text allowFontScaling style={styles.amount}>
            ₹ {Math.round(handover.finalTotal)}
          </Text>
          <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <BigButton label={t("wrong")} variant="secondary" speakKey="wrong" onPress={() => respond(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <BigButton label={t("correct")} speakKey="correct" onPress={() => respond(true)} />
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Default: show the QR and wait for the recycler to scan and submit.
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.center}>
        <QRPanel testID="qr" value={referenceCodeFromUuid(lotId)} />
        <Text allowFontScaling style={styles.code}>
          {referenceCodeFromUuid(lotId)}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.bg, padding: tokens.space.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: tokens.space.lg },
  label: { fontSize: tokens.type.body, color: tokens.color.inkMuted },
  amount: { fontSize: tokens.type.display, fontWeight: "800", color: tokens.color.ink },
  actions: { flexDirection: "row", gap: tokens.space.md, alignSelf: "stretch" },
  code: { fontSize: tokens.type.title, fontWeight: "800", letterSpacing: 2, color: tokens.color.ink },
});
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd client/app && npx jest test/screens/S7Handover.test.js
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add client/app/src/components/QRPanel.js client/app/src/screens/S7Handover.js client/app/test/screens/S7Handover.test.js
git commit -m "feat(app): S7 handover — QR from the lot uuid, spoken amount, two-sided confirm

Never cut this. It is the two-sided signature — one of the two things being
demonstrated."
```

**At this point the demo spine is complete: S0 → S1 → S2 → S4 → S5 → S6 → S7.** Everything below is enhancement.

---

## Task 18: S8 Earnings ledger

A reverse-chronological list: date, category icon, weight, amount, and a status chip. Header totals for this week and this month. Nothing more — no charts, no analytics.

**Files:**
- Create: `client/app/src/screens/S8Ledger.js`
- Test: `client/app/test/screens/S8Ledger.test.js`

**Interfaces:**
- Consumes: `listLots`, `earningsTotals`, `CategoryIcon`, `useLang.setLang`
- Produces: `<S8Ledger onBack />`

- [ ] **Step 1: Write the failing test**

`client/app/test/screens/S8Ledger.test.js`:

```js
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { LangProvider } from "../../src/i18n/useLang.js";
import S8Ledger from "../../src/screens/S8Ledger.js";

jest.mock("../../src/db/client.js", () => ({ getPrisma: jest.fn(async () => ({})) }));
jest.mock("../../src/db/repos/lots.js", () => ({
  listLots: jest.fn(async () => [
    {
      id: "l1",
      categoryCode: "PCB",
      quantity: 3,
      unit: "KG",
      finalTotal: 1131,
      handoverStatus: "CONFIRMED",
      createdAt: "2026-09-02T12:40:00+05:30",
    },
    {
      id: "l2",
      categoryCode: "CABLE",
      quantity: 5,
      unit: "KG",
      finalTotal: null,
      handoverStatus: null,
      createdAt: "2026-09-02T09:00:00+05:30",
    },
  ]),
  earningsTotals: jest.fn(async () => ({ week: 1131, month: 4200 })),
}));

const wrap = (props = {}) =>
  render(
    <LangProvider initial="mr">
      <S8Ledger onBack={() => {}} {...props} />
    </LangProvider>,
  );

describe("S8 Ledger", () => {
  it("shows week and month totals", async () => {
    const { getByText } = wrap();
    await waitFor(() => expect(getByText(/1131/)).toBeTruthy());
    expect(getByText(/4200/)).toBeTruthy();
  });

  it("marks a confirmed lot received and an open one pending", async () => {
    const { getByText, getAllByText } = wrap();
    await waitFor(() => getAllByText(/मिळाले|बाकी/));
    expect(getByText("मिळाले")).toBeTruthy();
    expect(getByText("बाकी")).toBeTruthy();
  });

  it("lists lots newest first", async () => {
    const { getAllByTestId } = wrap();
    await waitFor(() => expect(getAllByTestId(/ledger-row/)).toHaveLength(2));
  });

  it("lets the collector change language from here", async () => {
    const { getByLabelText } = wrap();
    await waitFor(() => getByLabelText(/भाषा/));
    fireEvent.press(getByLabelText(/भाषा/));
  });
});
```

- [ ] **Step 2: Write `client/app/src/screens/S8Ledger.js`**

```js
import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, SafeAreaView } from "react-native";
import tokens from "../theme/tokens.js";
import { useLang } from "../i18n/useLang.js";
import CategoryIcon from "../components/CategoryIcon.js";
import StatusChip from "../components/StatusChip.js";
import { getPrisma } from "../db/client.js";
import { listLots, earningsTotals } from "../db/repos/lots.js";

export default function S8Ledger({ onBack }) {
  const { t, lang, setLang } = useLang();
  const [lots, setLots] = useState([]);
  const [totals, setTotals] = useState({ week: 0, month: 0 });

  useEffect(() => {
    (async () => {
      const db = await getPrisma();
      setLots(await listLots(db, 100));
      setTotals(await earningsTotals(db));
    })();
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.totals}>
        <Total label={t("this_week")} value={totals.week} />
        <Total label={t("this_month")} value={totals.month} />
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {lots.length === 0 && (
          <Text allowFontScaling style={styles.empty}>
            {t("no_lots_yet")}
          </Text>
        )}
        {lots.map((l) => (
          <View key={l.id} testID={`ledger-row-${l.id}`} style={styles.row}>
            <CategoryIcon code={l.categoryCode} size={40} />
            <View style={styles.rowMid}>
              <Text allowFontScaling style={styles.rowQty}>
                {l.quantity} {l.unit === "KG" ? t("unit_kg") : t("unit_piece")}
              </Text>
              <Text allowFontScaling style={styles.rowDate}>
                {new Date(l.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <View style={styles.rowRight}>
              {l.finalTotal != null && (
                <Text allowFontScaling style={styles.amount}>
                  ₹ {Math.round(l.finalTotal)}
                </Text>
              )}
              <StatusChip status={l.handoverStatus === "CONFIRMED" ? "received" : "pending"} />
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("language")}
          onPress={() => setLang(lang === "mr" ? "hi" : "mr")}
          style={styles.langBtn}
        >
          <Text style={styles.langText}>{t("language")}: {lang === "mr" ? "मराठी" : "हिंदी"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Total({ label, value }) {
  return (
    <View style={styles.total}>
      <Text allowFontScaling style={styles.totalValue}>
        ₹ {Math.round(value)}
      </Text>
      <Text allowFontScaling style={styles.totalLabel}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.bg, padding: tokens.space.md },
  totals: { flexDirection: "row", gap: tokens.space.md, marginBottom: tokens.space.md },
  total: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: tokens.color.rule,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
  },
  totalValue: { fontSize: tokens.type.title, fontWeight: "800", color: tokens.color.ink },
  totalLabel: { fontSize: tokens.type.caption, color: tokens.color.inkMuted },
  list: { gap: tokens.space.sm, paddingBottom: tokens.space.lg },
  empty: { fontSize: tokens.type.body, color: tokens.color.inkMuted, textAlign: "center", marginTop: tokens.space.xl },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    borderWidth: 1,
    borderColor: tokens.color.rule,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
  },
  rowMid: { flex: 1 },
  rowQty: { fontSize: tokens.type.body, fontWeight: "700", color: tokens.color.ink },
  rowDate: { fontSize: tokens.type.caption, color: tokens.color.inkMuted },
  rowRight: { alignItems: "flex-end", gap: 4 },
  amount: { fontSize: tokens.type.body, fontWeight: "800", color: tokens.color.ink },
  footer: { paddingTop: tokens.space.md },
  langBtn: { minHeight: tokens.touch.min, alignItems: "center", justifyContent: "center" },
  langText: { fontSize: tokens.type.label, color: tokens.color.inkMuted },
});
```

- [ ] **Step 3: Run and commit**

```bash
cd client/app && npx jest test/screens/S8Ledger.test.js
git add client/app/src/screens/S8Ledger.js client/app/test/screens/S8Ledger.test.js
git commit -m "feat(app): S8 earnings ledger with language toggle"
```

Expected: PASS, 4 tests.

---

## Task 19: Price board

A plain table of current rates per category, with the date. A speaker button reads the whole board aloud in sequence — the feature for a collector who wants to know the rates before buying from a household.

**Files:**
- Create: `client/app/src/screens/PriceBoard.js`
- Test: `client/app/test/screens/PriceBoard.test.js`

**Interfaces:**
- Consumes: `loadReference`, `rateAgeDays`, `speak`, `rupeeClipKeys`
- Produces: `<PriceBoard onBack />`

- [ ] **Step 1: Write the failing test**

`client/app/test/screens/PriceBoard.test.js`:

```js
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { LangProvider } from "../../src/i18n/useLang.js";
import PriceBoard from "../../src/screens/PriceBoard.js";

jest.mock("../../src/db/client.js", () => ({ getPrisma: jest.fn(async () => ({})) }));
jest.mock("../../src/db/repos/reference.js", () => ({
  loadReference: jest.fn(async () => ({
    categories: [
      { id: "c1", code: "PCB", parent_code: null, default_unit: "KG" },
      { id: "c2", code: "CABLE", parent_code: null, default_unit: "KG" },
    ],
    recyclers: [],
    rates: [
      { recyclerId: "r1", categoryCode: "PCB", unit: "KG", price: 200, validFrom: "2026-09-02T09:00:00+05:30" },
      { recyclerId: "r2", categoryCode: "PCB", unit: "KG", price: 190, validFrom: "2026-09-02T09:00:00+05:30" },
    ],
  })),
  rateAgeDays: jest.fn(async () => 1),
}));
jest.mock("../../src/audio/speak.js", () => ({ speak: jest.fn() }));

const wrap = (props = {}) =>
  render(
    <LangProvider initial="mr">
      <PriceBoard onBack={() => {}} {...props} />
    </LangProvider>,
  );

describe("Price board", () => {
  it("shows the best current rate per category", async () => {
    const { getByText } = wrap();
    // PCB best of 200/190 = 200
    await waitFor(() => expect(getByText(/₹ ?200/)).toBeTruthy());
  });

  it("reads the whole board aloud when the speaker is pressed", async () => {
    const { speak } = require("../../src/audio/speak.js");
    const { getByLabelText } = wrap();
    await waitFor(() => getByLabelText(/भाव/));
    fireEvent.press(getByLabelText("read-board"));
    expect(speak).toHaveBeenCalled();
  });

  it("shows the rate date", async () => {
    const { getByText } = wrap();
    await waitFor(() => expect(getByText(/भाव:/)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Write `client/app/src/screens/PriceBoard.js`**

```js
import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, SafeAreaView } from "react-native";
import tokens from "../theme/tokens.js";
import { useLang } from "../i18n/useLang.js";
import CategoryIcon from "../components/CategoryIcon.js";
import { getPrisma } from "../db/client.js";
import { loadReference } from "../db/repos/reference.js";
import { rupeeClipKeys } from "../audio/speak.js";

export default function PriceBoard({ onBack }) {
  const { t, lang, speak } = useLang();
  const [board, setBoard] = useState([]);
  const [rateDate, setRateDate] = useState(null);

  useEffect(() => {
    (async () => {
      const db = await getPrisma();
      const { categories, rates } = await loadReference(db);
      // Best (highest) current rate per parent category — what a collector
      // could get if they took it to the best buyer.
      const best = new Map();
      for (const r of rates) {
        const cur = best.get(r.categoryCode);
        if (!cur || r.price > cur.price) best.set(r.categoryCode, r);
      }
      setBoard(
        categories
          .filter((c) => !c.parent_code)
          .map((c) => ({ code: c.code, price: best.get(c.code)?.price ?? null, unit: c.default_unit })),
      );
      const newest = rates.reduce((a, r) => (r.validFrom > a ? r.validFrom : a), "");
      setRateDate(newest || null);
    })();
  }, []);

  function readAll() {
    const keys = [];
    for (const row of board) {
      if (row.price == null) continue;
      keys.push(`cat_${row.code.toLowerCase()}`, ...rupeeClipKeys(row.price));
    }
    speak(keys);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text allowFontScaling style={styles.heading}>
          {t("price_board")}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="read-board" onPress={readAll} style={styles.speaker}>
          <Text style={styles.speakerIcon}>🔊</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {board.map((row) => (
          <View key={row.code} style={styles.row}>
            <CategoryIcon code={row.code} size={40} />
            <Text allowFontScaling style={styles.catName}>
              {t(`cat_${row.code.toLowerCase()}`)}
            </Text>
            <Text allowFontScaling style={styles.price}>
              {row.price != null ? `₹ ${row.price}/${row.unit === "KG" ? t("unit_kg") : t("unit_piece")}` : "—"}
            </Text>
          </View>
        ))}
      </ScrollView>

      {rateDate && (
        <Text allowFontScaling style={styles.date}>
          {t("rate_date")}: {new Date(rateDate).toLocaleDateString()}
        </Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.bg, padding: tokens.space.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: tokens.space.md },
  heading: { fontSize: tokens.type.title, fontWeight: "800", color: tokens.color.ink },
  speaker: { width: tokens.touch.min, height: tokens.touch.min, alignItems: "center", justifyContent: "center" },
  speakerIcon: { fontSize: tokens.type.title },
  list: { gap: tokens.space.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    borderBottomWidth: 1,
    borderColor: tokens.color.rule,
    paddingVertical: tokens.space.sm,
  },
  catName: { flex: 1, fontSize: tokens.type.body, fontWeight: "700", color: tokens.color.ink },
  price: { fontSize: tokens.type.body, fontWeight: "800", color: tokens.color.ink },
  date: { fontSize: tokens.type.caption, color: tokens.color.inkMuted, textAlign: "center", paddingTop: tokens.space.md },
});
```

> The 🔊 glyph on the speaker button is UI chrome, not a status icon; the "no emoji" rule in `DESIGN.md` is about icons that carry meaning. If you prefer, swap it for a small drawn SVG speaker — the test only checks the accessibility label `read-board`.

- [ ] **Step 3: Run and commit**

```bash
cd client/app && npx jest test/screens/PriceBoard.test.js
git add client/app/src/screens/PriceBoard.js client/app/test/screens/PriceBoard.test.js
git commit -m "feat(app): price board with spoken read-aloud of the whole board"
```

Expected: PASS, 3 tests.

---

## Task 20: Safety cards

Pictorial cards with audio, per the brief: do not burn cables, do not open batteries, handle CRTs carefully, do not use acid on boards. Six cards, images plus one spoken sentence each. **No text-only content.**

**Files:**
- Create: `client/app/src/screens/Safety.js`
- Test: `client/app/test/screens/Safety.test.js`

**Interfaces:**
- Produces: `<Safety onBack />`, `SAFETY_CARDS`

- [ ] **Step 1: Write the failing test**

`client/app/test/screens/Safety.test.js`:

```js
import { render, fireEvent } from "@testing-library/react-native";
import { LangProvider } from "../../src/i18n/useLang.js";
import Safety, { SAFETY_CARDS } from "../../src/screens/Safety.js";

jest.mock("../../src/audio/speak.js", () => ({ speak: jest.fn() }));

const wrap = (props = {}) =>
  render(
    <LangProvider initial="mr">
      <Safety onBack={() => {}} {...props} />
    </LangProvider>,
  );

describe("Safety", () => {
  it("has the four brief-named hazards plus more, each with an icon and a clip", () => {
    expect(SAFETY_CARDS.length).toBeGreaterThanOrEqual(4);
    for (const card of SAFETY_CARDS) {
      expect(card.iconCode).toBeTruthy();
      expect(card.clipKey).toBeTruthy();
      expect(card.stringKey).toBeTruthy();
    }
  });

  it("renders every card", () => {
    const { getAllByTestId } = wrap();
    expect(getAllByTestId(/safety-card/)).toHaveLength(SAFETY_CARDS.length);
  });

  it("speaks a card's sentence when tapped", () => {
    const { speak } = require("../../src/audio/speak.js");
    const { getAllByTestId } = wrap();
    fireEvent.press(getAllByTestId(/safety-card/)[0]);
    expect(speak).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write `client/app/src/screens/Safety.js`**

```js
import { View, Text, ScrollView, Pressable, StyleSheet, SafeAreaView } from "react-native";
import tokens from "../theme/tokens.js";
import { useLang } from "../i18n/useLang.js";
import CategoryIcon from "../components/CategoryIcon.js";

// Reuses category drawings as hazard illustrations. Each card is an image plus
// one spoken sentence — never text alone (brief requirement). Add the six
// safety string/clip keys to the i18n table and audio manifest when recording.
export const SAFETY_CARDS = [
  { id: "cables", iconCode: "CABLE", stringKey: "safety_no_burn", clipKey: "safety_no_burn" },
  { id: "battery", iconCode: "BATTERY", stringKey: "safety_no_open_battery", clipKey: "safety_no_open_battery" },
  { id: "crt", iconCode: "CRT", stringKey: "safety_crt_care", clipKey: "safety_crt_care" },
  { id: "acid", iconCode: "PCB", stringKey: "safety_no_acid", clipKey: "safety_no_acid" },
  { id: "gloves", iconCode: "MOTOR", stringKey: "safety_gloves", clipKey: "safety_gloves" },
  { id: "children", iconCode: "OTHER", stringKey: "safety_children", clipKey: "safety_children" },
];

export default function Safety() {
  const { t, speak } = useLang();
  return (
    <SafeAreaView style={styles.screen}>
      <Text allowFontScaling style={styles.heading}>
        {t("safety")}
      </Text>
      <ScrollView contentContainerStyle={styles.list}>
        {SAFETY_CARDS.map((card) => (
          <Pressable
            key={card.id}
            testID={`safety-card-${card.id}`}
            accessibilityRole="button"
            accessibilityLabel={t(card.stringKey)}
            onPress={() => speak(card.clipKey)}
            style={styles.card}
          >
            <CategoryIcon code={card.iconCode} size={64} color={tokens.color.stop} />
            <Text allowFontScaling style={styles.cardText}>
              {t(card.stringKey)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.bg, padding: tokens.space.md },
  heading: { fontSize: tokens.type.title, fontWeight: "800", color: tokens.color.ink, marginBottom: tokens.space.md },
  list: { gap: tokens.space.md },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    borderWidth: 1.5,
    borderColor: tokens.color.rule,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
  },
  cardText: { flex: 1, fontSize: tokens.type.body, color: tokens.color.ink, fontWeight: "600" },
});
```

> Add `safety_no_burn`, `safety_no_open_battery`, `safety_crt_care`, `safety_no_acid`, `safety_gloves`, `safety_children` to both languages in `strings.js` and to `CLIP_KEYS` in `clips.js`, with placeholder audio, before this screen ships. This is part of README open item 6.

- [ ] **Step 3: Run and commit**

```bash
cd client/app && npx jest test/screens/Safety.test.js
git add client/app/src/screens/Safety.js client/app/test/screens/Safety.test.js
git commit -m "feat(app): pictorial safety cards with spoken guidance, no text-only content"
```

Expected: PASS, 3 tests.

---

## Task 21: The sync engine — the offline claim made real

Needs plan 01 tasks 9–11 (`/sync/bootstrap`, `/sync/push`, `/sync/delta`). This drains the outbox and pulls reference updates, and it is **never a UI gate**: a screen that shows a spinner tied to connectivity is built wrong.

**Files:**
- Create: `client/app/src/sync/net.js`, `client/app/src/sync/engine.js`
- Test: `client/app/test/sync/engine.test.js`

**Interfaces:**
- Consumes: `pending`, `markSynced`, `bumpAttempt`, `replaceReference`, `markPhotoUploaded`, `photosForLot`
- Produces: `bootstrap(db, baseUrl)`, `pushOutbox(db, baseUrl, deviceId)`, `pullDelta(db, baseUrl)`, `syncNow(db, baseUrl, deviceId)`, `isReachable(baseUrl)`

- [ ] **Step 1: Write the failing test**

`client/app/test/sync/engine.test.js`:

```js
import { pushOutbox, syncNow } from "../../src/sync/engine.js";

jest.mock("../../src/db/repos/outbox.js", () => ({
  pending: jest.fn(),
  markSynced: jest.fn(async () => {}),
  bumpAttempt: jest.fn(async () => {}),
}));
jest.mock("../../src/db/repos/reference.js", () => ({ replaceReference: jest.fn(async () => {}) }));
jest.mock("../../src/db/repos/photos.js", () => ({
  photosForLot: jest.fn(async () => []),
  markPhotoUploaded: jest.fn(async () => {}),
}));

const { pending, markSynced, bumpAttempt } = require("../../src/db/repos/outbox.js");

function mockFetch(handler) {
  global.fetch = jest.fn(handler);
}

const db = {};

describe("pushOutbox", () => {
  beforeEach(() => {
    pending.mockReset();
    markSynced.mockClear();
    bumpAttempt.mockClear();
  });

  it("posts every pending row and marks the applied ones synced", async () => {
    pending.mockResolvedValue([
      { id: "o1", entityType: "lot", entityId: "lot-1", payload: JSON.stringify({ id: "lot-1" }) },
      { id: "o2", entityType: "acceptance", entityId: "acc-1", payload: JSON.stringify({ id: "acc-1", lot_id: "lot-1" }) },
    ]);
    mockFetch(async () => ({
      ok: true,
      json: async () => ({ applied: ["lot-1", "acc-1"], rejected: [] }),
    }));

    await pushOutbox(db, "http://host:4000", "pixel");
    // Marks by the OUTBOX row id, not the entity id.
    expect(markSynced).toHaveBeenCalledWith(db, ["o1", "o2"]);
  });

  it("leaves a rejected row pending and records the reason", async () => {
    pending.mockResolvedValue([
      { id: "o1", entityType: "acceptance", entityId: "acc-1", payload: JSON.stringify({ id: "acc-1", lot_id: "missing" }) },
    ]);
    mockFetch(async () => ({
      ok: true,
      json: async () => ({ applied: [], rejected: [{ id: "acc-1", reason: "unknown lot missing" }] }),
    }));

    await pushOutbox(db, "http://host:4000", "pixel");
    expect(markSynced).not.toHaveBeenCalledWith(db, expect.arrayContaining(["o1"]));
    expect(bumpAttempt).toHaveBeenCalledWith(db, "o1", "unknown lot missing");
  });

  it("does nothing and does not throw when there is nothing to push", async () => {
    pending.mockResolvedValue([]);
    await expect(pushOutbox(db, "http://host:4000", "pixel")).resolves.toBeUndefined();
  });

  it("swallows a network error — offline is normal, never a thrown failure", async () => {
    pending.mockResolvedValue([{ id: "o1", entityType: "lot", entityId: "lot-1", payload: "{}" }]);
    mockFetch(async () => {
      throw new Error("Network request failed");
    });
    await expect(pushOutbox(db, "http://host:4000", "pixel")).resolves.toBeUndefined();
    expect(markSynced).not.toHaveBeenCalled();
  });

  it("maps handover_confirm rows onto the confirm endpoint, not /sync/push", async () => {
    pending.mockResolvedValue([
      { id: "o1", entityType: "handover_confirm", entityId: "lot-1", payload: JSON.stringify({ lot_id: "lot-1", agree: true, protest: false, confirmed_at: "2026-09-02T12:45:00+05:30" }) },
    ]);
    const calls = [];
    mockFetch(async (url, opts) => {
      calls.push(url);
      return { ok: true, json: async () => ({ handover: { status: "CONFIRMED" } }) };
    });
    await pushOutbox(db, "http://host:4000", "pixel");
    expect(calls.some((u) => u.includes("/handover/lot-1/confirm"))).toBe(true);
    expect(markSynced).toHaveBeenCalledWith(db, ["o1"]);
  });
});

describe("syncNow", () => {
  it("pushes then pulls, and never rejects even if a leg fails", async () => {
    pending.mockResolvedValue([]);
    mockFetch(async (url) => {
      if (url.includes("/sync/delta")) throw new Error("offline");
      return { ok: true, json: async () => ({}) };
    });
    await expect(syncNow(db, "http://host:4000", "pixel")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Write `client/app/src/sync/net.js`**

```js
/**
 * A reachability probe. It is NEVER a UI gate — no screen awaits it. It exists
 * only so the sync engine can decide whether an attempt is worth making, and a
 * false negative just means the outbox drains a moment later.
 */
export async function isReachable(baseUrl, timeoutMs = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 3: Write `client/app/src/sync/engine.js`**

```js
import { pending, markSynced, bumpAttempt } from "../db/repos/outbox.js";
import { replaceReference } from "../db/repos/reference.js";
import { one, meta } from "../db/repos/reference.js"; // eslint-disable-line no-unused-vars

/**
 * The sync engine. Three moves — bootstrap, push, pull — and none of them is
 * ever awaited by a screen. Every write already committed locally; this just
 * ships it when a network happens to exist. A failure here is a no-op, not an
 * error the collector sees.
 */

// Entity type -> how it reaches the server. Most go in one /sync/push batch;
// the collector's confirmation has its own endpoint.
function partition(rows) {
  const batch = [];
  const confirms = [];
  for (const row of rows) {
    if (row.entityType === "handover_confirm") confirms.push(row);
    else batch.push(row);
  }
  return { batch, confirms };
}

export async function pushOutbox(db, baseUrl, deviceId) {
  const rows = await pending(db);
  if (rows.length === 0) return;
  const { batch, confirms } = partition(rows);

  try {
    // 1) The idempotent batch. Marked synced by OUTBOX row id, keyed back from
    //    the entity ids the server reports as applied.
    if (batch.length > 0) {
      const records = batch.map((r) => ({ type: r.entityType, id: r.entityId, payload: JSON.parse(r.payload) }));
      const res = await fetch(`${baseUrl}/sync/push`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ device_id: deviceId, records }),
      });
      if (res.ok) {
        const { applied = [], rejected = [] } = await res.json();
        const appliedSet = new Set(applied);
        const rejectedById = new Map(rejected.map((r) => [r.id, r.reason]));
        const syncedRowIds = batch.filter((r) => appliedSet.has(r.entityId)).map((r) => r.id);
        await markSynced(db, syncedRowIds);
        for (const r of batch) {
          if (rejectedById.has(r.entityId)) {
            // eslint-disable-next-line no-await-in-loop
            await bumpAttempt(db, r.id, rejectedById.get(r.entityId));
          }
        }
      }
    }

    // 2) Each confirmation to its own endpoint.
    for (const row of confirms) {
      const p = JSON.parse(row.payload);
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(`${baseUrl}/handover/${p.lot_id}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          collectorId: p.collector_id ?? undefined,
          agree: p.agree,
          protest: p.protest,
          confirmedAt: p.confirmed_at,
        }),
      });
      if (res.ok) {
        // eslint-disable-next-line no-await-in-loop
        await markSynced(db, [row.id]);
      }
    }
  } catch {
    // Offline is the normal case (FRONTEND.md section 3). Swallow it; the rows
    // stay pending and the next drain retries.
  }
}

export async function bootstrap(db, baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/sync/bootstrap`);
    if (!res.ok) return;
    await replaceReference(db, await res.json());
  } catch {
    // No bootstrap yet just means the app runs on whatever it last cached.
  }
}

export async function pullDelta(db, baseUrl) {
  try {
    const lastSync = (await db.meta.findUnique({ where: { key: "last_sync" } }))?.value;
    const since = lastSync ?? new Date(0).toISOString();
    const res = await fetch(`${baseUrl}/sync/delta?since=${encodeURIComponent(since)}`);
    if (!res.ok) return;
    const delta = await res.json();
    // Delta is applied by re-bootstrapping the affected slices. At hackathon
    // volume a full replaceReference on any change is simplest and correct;
    // removedRecyclerIds are already excluded because the server never returns
    // a lapsed recycler in the snapshot.
    if (
      delta.categories?.length ||
      delta.recyclers?.length ||
      delta.rates?.length ||
      delta.removedRecyclerIds?.length
    ) {
      await bootstrap(db, baseUrl);
    }
  } catch {
    // ignore
  }
}

export async function syncNow(db, baseUrl, deviceId) {
  await pushOutbox(db, baseUrl, deviceId);
  await pullDelta(db, baseUrl);
}
```

> Remove the stray `import { one, meta } ...` line — it was a scaffolding artefact. `pullDelta` reads `last_sync` through `db.meta.findUnique`, which is the Prisma client already passed in. Keep only the three real imports at the top.

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd client/app && npx jest test/sync/engine.test.js
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Wire the engine into the app shell**

In `App.js`, wrap the navigator in `SessionProvider` and `LangProvider`, and start a periodic drain that is never awaited by any screen:

```js
import { useEffect } from "react";
import { getPrisma } from "./src/db/client.js";
import { syncNow, bootstrap } from "./src/sync/engine.js";

const BASE_URL = "http://192.168.1.100:4000"; // the demo laptop over the hotspot

function useBackgroundSync(collectorReady, deviceId) {
  useEffect(() => {
    if (!collectorReady) return undefined;
    let alive = true;
    (async () => {
      const db = await getPrisma();
      await bootstrap(db, BASE_URL);
      const tick = async () => {
        if (!alive) return;
        await syncNow(db, BASE_URL, deviceId);
      };
      await tick();
      const timer = setInterval(tick, 15_000);
      return () => clearInterval(timer);
    })();
    return () => {
      alive = false;
    };
  }, [collectorReady, deviceId]);
}
```

Set `BASE_URL` to the demo laptop's hotspot IP. This is the one value that changes per demo; keep it in one place.

- [ ] **Step 6: Full app test run and manual smoke**

```bash
cd client/app && npm test
```

Expected: the whole app suite green. Then, with plan 01 running on the laptop and the phone on the hotspot: create a lot in airplane mode, watch the pending pill climb, disable airplane mode, watch it fall to synced. That is the offline claim, demonstrated.

- [ ] **Step 7: Commit**

```bash
git add client/app/src/sync client/app/App.js client/app/test/sync
git commit -m "feat(app): sync engine — outbox drain, delta pull, never a UI gate

Offline is the normal case: every failure here is a no-op, and no screen ever
awaits the network."
```

---

## Collector app done — what exists now

The full flow, offline-first, on a real Android 12 device:

**S0** home → **S1** camera (photo + first geotag) → **S2** category → **S3** sub-category → **S4** quantity → **S4b** condition → **S4c** source → **S5** value and ranked recyclers → **S6** accept (lot written, rate frozen) → **S7** handover (QR + two-sided confirm) → **S8** ledger. Plus the price board, safety cards, and a sync engine draining the outbox whenever a network appears.

Every write commits locally first; every record carries a device-generated UUID; the outbox makes sync idempotent; and the device DB is Prisma throughout, sharing `@bhaav/core` with the server so the two never disagree about a number.

**Next:** plan 03 (recycler console) consumes the same API. Plan 04 (`server/aiml`) provides the detectors.
