// apps/mobile/lib/adhocSession.ts
//
// Backs the ad-hoc "+" workout flow: a session not tied to any
// recommendation_blocks row. Its picked catalog exercise ids live on
// sessions.ad_hoc_exercise_ids (migration
// 20260707100000_add_adhoc_session_support.sql) rather than as fake
// recommendation/recommendation_blocks rows, so the ad-hoc Logger screen
// can rebuild its exercise list standalone (deep link, app restart) the
// same way fetchLoggerBlock does for a real block.
import { supabase } from './supabase';
import type { SessionType } from './recommendations';

export interface AdhocSessionRow {
  readonly id: string;
  readonly type: SessionType;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly feltRating: number | null;
  readonly adHocExerciseIds: readonly string[];
}

interface RawAdhocSessionRow {
  id: string;
  type: SessionType;
  started_at: string | null;
  ended_at: string | null;
  felt_rating: number | null;
  ad_hoc_exercise_ids: string[] | null;
}

function toAdhocSessionRow(row: RawAdhocSessionRow): AdhocSessionRow {
  return {
    id: row.id,
    type: row.type,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    feltRating: row.felt_rating,
    adHocExerciseIds: row.ad_hoc_exercise_ids ?? [],
  };
}

const SELECT = 'id, type, started_at, ended_at, felt_rating, ad_hoc_exercise_ids';

export async function fetchSessionById(sessionId: string): Promise<AdhocSessionRow | null> {
  const { data, error } = await supabase.from('sessions').select(SELECT).eq('id', sessionId).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? toAdhocSessionRow(data as RawAdhocSessionRow) : null;
}

export async function setAdhocExerciseIds(sessionId: string, exerciseIds: readonly string[]): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ ad_hoc_exercise_ids: [...exerciseIds] })
    .eq('id', sessionId);

  if (error) {
    throw new Error(error.message);
  }
}
