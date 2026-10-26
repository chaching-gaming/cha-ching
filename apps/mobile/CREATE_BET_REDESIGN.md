# Create Bet Screen Redesign Plan

## Goal

Redesign the bet creation form to be compact (no scrolling) with:

1. Balance chips highlighted at top
2. Template cards with diagonal Yes/No split selection
3. Stake (1/3 width) + Expiry (30s, 1m, 2m) on same line
4. Custom question with same diagonal Yes/No pattern

---

## Key Files to Modify

| File                                                   | Changes                                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `apps/mobile/app/(tabs)/rooms/create-bet.tsx`          | Main screen restructure                                                       |
| `apps/mobile/lib/bet-create-ui.ts`                     | Update EXPIRY_PRESETS + add TEMPLATE_LABELS for contextual Hit/Miss vs Yes/No |
| `apps/mobile/components/form/diagonal-option-card.tsx` | **NEW** - Diagonal split selection component                                  |

---

## Implementation Details

### 1. New Component: DiagonalOptionCard

A reusable card with diagonal split for binary Yes/No selection:

```
┌─────────────────────┐
│  Icon + Label    ╱  │
│               ╱     │
│  HIT       ╱  MISS  │  ← Labels are contextual per template
│         ╱           │
└─────────────────────┘
```

**Technical approach:**

- Use `react-native-svg` (already installed) for the diagonal line
- Two `Pressable` areas positioned with `position: absolute`
- Touch detection via coordinate math (check if touch.x/touch.y is above/below the diagonal)
- Selected state highlights the chosen half with `bg-primary/15`

**Props:**

```typescript
type DiagonalOptionCardProps = {
  icon: ReactNode;
  label: string;
  sublabel?: string;
  value: string; // The template ID or 'custom'
  positiveLabel: string; // e.g., 'Yes', 'Hit', 'Make'
  negativeLabel: string; // e.g., 'No', 'Miss'
  selectedPick: string | null;
  onSelect: (value: string, pick: string) => void;
  disabled?: boolean;
  isActive: boolean; // Whether this template is the active one
};
```

### 1b. Contextual Option Labels (Hit/Miss vs Yes/No)

Labels should feel intuitive based on the bet context. Add label mapping in `bet-create-ui.ts`:

```typescript
// Map template slugs to contextual labels
export const TEMPLATE_LABELS: Record<string, { positive: string; negative: string }> = {
  fairway: { positive: 'Hit', negative: 'Miss' },
  green: { positive: 'Hit', negative: 'Miss' },
  putt: { positive: 'Make', negative: 'Miss' },
  three_putt: { positive: 'Yes', negative: 'No' },
  // Default for custom/unknown
  default: { positive: 'Yes', negative: 'No' },
};

export function getTemplateLabels(slug: string | null) {
  return TEMPLATE_LABELS[slug ?? 'default'] ?? TEMPLATE_LABELS.default;
}
```

**Usage:** Each template card displays its contextual labels (e.g., "Hit / Miss" instead of generic "Yes / No").

### 2. Balance Display at Top

Move balance from stake section to top of screen, styled prominently:

```tsx
<View className="mx-5 mb-4 flex-row items-center justify-center gap-2 rounded-2xl bg-surface py-3">
  <Coins size={24} color={colors.chipsIcon} weight="fill" />
  <Text className="text-2xl font-bold text-primary">{balance ?? 0}</Text>
  <Text className="text-base text-text-secondary">chips available</Text>
</View>
```

### 3. Update EXPIRY_PRESETS

In `bet-create-ui.ts`:

```typescript
export const EXPIRY_PRESETS = [
  { label: '30s', offsetMs: 30_000 },
  { label: '1m', offsetMs: 60_000 },
  { label: '2m', offsetMs: 120_000 },
] as const;
```

### 4. Compact Stake + Expiry Row

```tsx
<View className="flex-row items-end gap-3">
  {/* Stake - 1/3 width */}
  <View className="flex-1">
    <Text className="mb-1 text-sm font-medium text-text-secondary">Stake</Text>
    <field.TextField
      leftIcon={<Coins size={18} />}
      keyboardType="number-pad"
      inputClassName="text-lg font-bold"
    />
  </View>

  {/* Expiry - 2/3 width */}
  <View className="flex-[2]">
    <Text className="mb-1 text-sm font-medium text-text-secondary">Expires</Text>
    <field.OptionField layout="equal" options={EXPIRY_PRESETS} />
  </View>
</View>
```

### 5. Simplified Form Structure

```
┌──────────────────────────────────────┐
│  [Balance: 500 chips available]      │  ← Prominent at top
├──────────────────────────────────────┤
│  Who is this about? (optional)       │
│  [Avatar row - horizontal scroll]    │
├──────────────────────────────────────┤
│  Choose a bet                        │
│  ┌─────────┐ ┌─────────┐            │
│  │ Template│ │ Template│  ← 2x2 grid │
│  │ Y ╱ N  │ │ Y ╱ N  │    with      │
│  └─────────┘ └─────────┘    diagonal │
│  ┌─────────┐ ┌─────────┐    splits   │
│  │ Template│ │ Custom  │            │
│  │ Y ╱ N  │ │ Y ╱ N  │            │
│  └─────────┘ └─────────┘            │
│  [Write-in text field if custom]    │
├──────────────────────────────────────┤
│  Stake [___] chips  |  Expires [30s][60s][2m] │
├──────────────────────────────────────┤
│  [Review and Post Button]            │
└──────────────────────────────────────┘
```

### 6. Form State Changes

Merge `templateId` and `offeredPick` selection into single interaction:

- When user taps Yes/No on a template, both values are set
- Form schema validates that both template (or custom) AND pick are selected

---

## Verification

1. **Visual check:** No scrolling needed on standard phone screens
2. **Diagonal touch accuracy:** Test that Yes/No taps register correctly
3. **Form submission:** Verify bet creates with correct question, stake, expiry, and pick
4. **Custom question flow:** Write-in field appears, diagonal selection works
5. **Disabled state:** Non-active sessions show disabled UI

---

## Decisions Made

- **Expiry presets:** 30s, 1m, 2m
- **Player row:** Always visible (not collapsible)
- **Option labels:** Context-aware per template (Hit/Miss for fairway/green, Make/Miss for putt, Yes/No for others)
