// apps/mobile/app/(tabs)/settings.tsx
//
// The Settings screen: preferred split, activities, pains, goals,
// training frequency, diet, weight/birth date, location, and HealthKit.
// Loads user_profile + the 4 taxonomy tables once on mount; each
// dropdown-to-add section (split/activities/goals/pains-picker) and the
// HealthKit toggle save immediately on change, while the plain-field
// sections (added in app/(tabs)/settings.tsx's Task 9 follow-up within
// this same file) use an explicit per-section Save button. See
// docs/superpowers/specs/2026-06-24-settings-healthkit-design.md
// Decision 4 for the save-timing rationale.
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { sharedStyles, TYPE } from '../../lib/theme';
import DropdownAddSection, { type DropdownOption } from '../../components/DropdownAddSection';
import PainEntryRow, { type PainEntry } from '../../components/PainEntryRow';
import HealthKitSection from '../../components/HealthKitSection';

interface SplitTaxonomyRow {
  id: string;
  label: string;
  day_labels: string[];
}

interface ActivityTaxonomyRow {
  id: string;
  label: string;
  category: 'strength' | 'cardio' | 'recovery';
  warmup_focus_body_parts: string[];
}

interface GoalTaxonomyRow {
  id: string;
  label: string;
  description: string;
}

interface BodyPartTaxonomyRow {
  id: string;
  label: string;
}

interface UserProfileRow {
  id: string;
  owner_id: string;
  preferred_split: string;
  activities: string[];
  current_goals: string[];
  pains: PainEntry[];
  training_frequency_mode: 'manual' | 'auto';
  training_frequency_manual: { targets: Record<string, number> } | null;
  diet_preference: string | null;
  weight_kg: number | null;
  birth_date: string | null;
  location: { lat: number; lon: number; label: string; timezone: string } | null;
  healthkit_sync_enabled: boolean;
}

const GOALS_CAP = 3;

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfileRow | null>(null);
  const [splits, setSplits] = useState<SplitTaxonomyRow[]>([]);
  const [activityOptions, setActivityOptions] = useState<ActivityTaxonomyRow[]>([]);
  const [goalOptions, setGoalOptions] = useState<GoalTaxonomyRow[]>([]);
  const [bodyParts, setBodyParts] = useState<BodyPartTaxonomyRow[]>([]);

  const [goalsWarning, setGoalsWarning] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [profileRes, splitsRes, activitiesRes, goalsRes, bodyPartsRes] = await Promise.all([
        supabase.from('user_profile').select('*').single(),
        supabase.from('split_taxonomy').select('*'),
        supabase.from('activity_taxonomy').select('*'),
        supabase.from('goal_taxonomy').select('*'),
        supabase.from('body_part_taxonomy').select('*'),
      ]);

      const firstError =
        profileRes.error ?? splitsRes.error ?? activitiesRes.error ?? goalsRes.error ?? bodyPartsRes.error;
      if (firstError) {
        setLoadError(firstError.message);
        setLoading(false);
        return;
      }

      setProfile(profileRes.data as UserProfileRow);
      setSplits((splitsRes.data ?? []) as SplitTaxonomyRow[]);
      setActivityOptions((activitiesRes.data ?? []) as ActivityTaxonomyRow[]);
      setGoalOptions((goalsRes.data ?? []) as GoalTaxonomyRow[]);
      setBodyParts((bodyPartsRes.data ?? []) as BodyPartTaxonomyRow[]);
      setLoading(false);
    }

    load();
  }, []);

  const saveProfileFields = useCallback(
    async (fields: Partial<UserProfileRow>) => {
      if (!profile) return;
      const { error } = await supabase
        .from('user_profile')
        .update(fields)
        .eq('id', profile.id);
      if (error) {
        setLoadError(error.message);
        return;
      }
      setProfile((prev) => (prev ? { ...prev, ...fields } : prev));
    },
    [profile]
  );

  function handleSplitChange(id: string) {
    saveProfileFields({ preferred_split: id });
  }

  function handleAddActivity(id: string) {
    if (!profile) return;
    saveProfileFields({ activities: [...profile.activities, id] });
  }

  function handleRemoveActivity(id: string) {
    if (!profile) return;
    saveProfileFields({ activities: profile.activities.filter((a) => a !== id) });
  }

  function handleAddGoal(id: string) {
    if (!profile) return;
    if (profile.current_goals.length >= GOALS_CAP) {
      setGoalsWarning(`You can select up to ${GOALS_CAP} goals — remove one to add another.`);
      return;
    }
    setGoalsWarning(null);
    saveProfileFields({ current_goals: [...profile.current_goals, id] });
  }

  function handleRemoveGoal(id: string) {
    if (!profile) return;
    setGoalsWarning(null);
    saveProfileFields({ current_goals: profile.current_goals.filter((g) => g !== id) });
  }

  function handleAddPain(bodyPartId: string) {
    if (!profile) return;
    const newEntry: PainEntry = { body_part: bodyPartId, severity: 5, note: '', since: null };
    saveProfileFields({ pains: [...profile.pains, newEntry] });
  }

  function handleChangePain(index: number, next: PainEntry) {
    if (!profile) return;
    const nextPains = profile.pains.slice();
    nextPains[index] = next;
    saveProfileFields({ pains: nextPains });
  }

  function handleRemovePain(index: number) {
    if (!profile) return;
    const nextPains = profile.pains.filter((_, i) => i !== index);
    saveProfileFields({ pains: nextPains });
  }

  function handleToggleHealthKit(next: boolean) {
    saveProfileFields({ healthkit_sync_enabled: next });
  }

  if (loading) {
    return (
      <View style={sharedStyles.screen}>
        <Text style={[TYPE.body, { padding: 16 }]}>Loading settings…</Text>
      </View>
    );
  }

  if (loadError || !profile) {
    return (
      <View style={sharedStyles.screen}>
        <Text style={[TYPE.body, { padding: 16 }]}>
          Couldn't load settings: {loadError ?? 'unknown error'}
        </Text>
      </View>
    );
  }

  const splitOptions: DropdownOption[] = splits.map((s) => ({ id: s.id, label: s.label }));
  const activityDropdownOptions: DropdownOption[] = activityOptions.map((a) => ({
    id: a.id,
    label: a.label,
    group: a.category.charAt(0).toUpperCase() + a.category.slice(1),
  }));
  const goalDropdownOptions: DropdownOption[] = goalOptions.map((g) => ({ id: g.id, label: g.label }));
  const bodyPartDropdownOptions: DropdownOption[] = bodyParts.map((b) => ({ id: b.id, label: b.label }));

  const bodyPartLabel = (id: string) => bodyParts.find((b) => b.id === id)?.label ?? id;

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
      <Text style={TYPE.screenTitle}>Settings</Text>

      <DropdownAddSection
        title="Preferred Split"
        options={splitOptions}
        selectedIds={[profile.preferred_split]}
        onAdd={handleSplitChange}
        onRemove={() => {}}
        singleSelect
      />

      <DropdownAddSection
        title="Activities"
        options={activityDropdownOptions}
        selectedIds={profile.activities}
        onAdd={handleAddActivity}
        onRemove={handleRemoveActivity}
      />

      <View style={sharedStyles.card}>
        <Text style={sharedStyles.sectionTitle}>Goals</Text>
        <Text style={sharedStyles.helperText}>Choose up to {GOALS_CAP}.</Text>
      </View>
      <DropdownAddSection
        title=""
        options={goalDropdownOptions}
        selectedIds={profile.current_goals}
        onAdd={handleAddGoal}
        onRemove={handleRemoveGoal}
        addDisabled={profile.current_goals.length >= GOALS_CAP}
        addDisabledMessage={goalsWarning ?? undefined}
      />

      <View style={sharedStyles.card}>
        <Text style={sharedStyles.sectionTitle}>Pains</Text>
        <DropdownAddSection
          title=""
          options={bodyPartDropdownOptions}
          selectedIds={[]}
          onAdd={handleAddPain}
          onRemove={() => {}}
        />
      </View>
      {profile.pains.map((pain, index) => (
        <PainEntryRow
          key={`${pain.body_part}-${index}`}
          label={bodyPartLabel(pain.body_part)}
          entry={pain}
          onChange={(next) => handleChangePain(index, next)}
          onRemove={() => handleRemovePain(index)}
        />
      ))}

      <HealthKitSection
        enabled={profile.healthkit_sync_enabled}
        onToggle={handleToggleHealthKit}
      />
    </ScrollView>
  );
}
