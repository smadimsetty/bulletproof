// apps/mobile/components/DropdownAddSection.tsx
//
// Generic "pick from a list of {id, label} options not already selected,
// tap to add, tap an added entry's x to remove" control. Four Settings
// sections (preferred split, activities, goals, the pains body-part
// picker) share this exact interaction -- see
// docs/superpowers/specs/2026-06-24-settings-healthkit-design.md
// Decision 10 for why this is the one shared abstraction this phase
// introduces.
//
// Renders its own content only, no card chrome -- it used to wrap
// itself in sharedStyles.card unconditionally, which worked fine for
// Preferred Split/Activities (this was their only content) but produced
// a visibly broken layout for Goals and Pains, both of which need a
// title/helper line of their own ABOVE this control: Settings.tsx ended
// up rendering two separate sharedStyles.card views back to back (one
// for the title, one for this component's self-wrap, the second with an
// empty title), or for Pains, a card nested inside a card. Every call
// site now wraps this component in its own single sharedStyles.card
// together with whatever title/helper text it needs.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING, sharedStyles } from '../lib/theme';

export interface DropdownOption {
  readonly id: string;
  readonly label: string;
  readonly group?: string;
}

export interface DropdownAddSectionProps {
  readonly title: string;
  readonly options: readonly DropdownOption[];
  readonly selectedIds: readonly string[];
  readonly onAdd: (id: string) => void;
  readonly onRemove: (id: string) => void;
  /** Single-select mode: adding replaces the current selection instead of appending. */
  readonly singleSelect?: boolean;
  /** Disables the add affordance (e.g. goals at the 3-item cap) without hiding it. */
  readonly addDisabled?: boolean;
  readonly addDisabledMessage?: string;
}

function groupOptions(
  options: readonly DropdownOption[]
): { group: string | null; items: DropdownOption[] }[] {
  const order: (string | null)[] = [];
  const byGroup = new Map<string | null, DropdownOption[]>();
  for (const option of options) {
    const key = option.group ?? null;
    if (!byGroup.has(key)) {
      byGroup.set(key, []);
      order.push(key);
    }
    byGroup.get(key)!.push(option);
  }
  return order.map((group) => ({ group, items: byGroup.get(group)! }));
}

export default function DropdownAddSection({
  title,
  options,
  selectedIds,
  onAdd,
  onRemove,
  singleSelect = false,
  addDisabled = false,
  addDisabledMessage,
}: DropdownAddSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const selected = options.filter((option) => selectedIds.includes(option.id));
  const available = singleSelect
    ? options
    : options.filter((option) => !selectedIds.includes(option.id));
  const grouped = groupOptions(available);

  function handlePick(id: string) {
    onAdd(id);
    setPickerOpen(false);
  }

  return (
    <View style={styles.container}>
      {title !== '' && <Text style={sharedStyles.sectionTitle}>{title}</Text>}

      <View style={styles.chipRow}>
        {selected.map((option) => (
          <View key={option.id} style={sharedStyles.chip}>
            <Text style={sharedStyles.chipText}>{option.label}</Text>
            {!singleSelect && (
              <Pressable onPress={() => onRemove(option.id)} accessibilityLabel={`Remove ${option.label}`}>
                <Text style={sharedStyles.chipText}>{'×'}</Text>
              </Pressable>
            )}
          </View>
        ))}
        {selected.length === 0 && (
          <Text style={sharedStyles.helperText}>Nothing added yet.</Text>
        )}
      </View>

      <Pressable
        style={[styles.addButton, addDisabled && styles.addButtonDisabled]}
        onPress={() => !addDisabled && setPickerOpen(true)}
        disabled={addDisabled}
      >
        <Text style={styles.addButtonText}>
          {singleSelect ? 'Change' : '+ Add'}
        </Text>
      </Pressable>
      {addDisabled && addDisabledMessage && (
        <Text style={sharedStyles.warningText}>{addDisabledMessage}</Text>
      )}

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <View style={styles.modalSheet}>
            <ScrollView>
              {grouped.map(({ group, items }) => (
                <View key={group ?? '__ungrouped'}>
                  {group && <Text style={styles.groupLabel}>{group}</Text>}
                  {items.map((option) => (
                    <Pressable
                      key={option.id}
                      style={styles.optionRow}
                      onPress={() => handlePick(option.id)}
                    >
                      <Text>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
              {available.length === 0 && (
                <Text style={sharedStyles.helperText}>Everything has already been added.</Text>
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  addButton: {
    alignSelf: 'flex-start',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  addButtonDisabled: {
    borderColor: COLORS.border,
  },
  addButtonText: {
    color: COLORS.accent,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    padding: SPACING.md,
  },
  groupLabel: {
    color: COLORS.muted,
    fontWeight: '600',
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  optionRow: {
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
});
