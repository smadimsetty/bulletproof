// supabase/functions/sprint-coach/prompt.ts
//
// Prompt pieces for the sprint coach. The system prompt and the pain-point
// block are byte-stable (cached); only the user block varies per call.
// No imports: jest tests this file directly from apps/mobile.

const SYSTEM = `You are the coach inside MoveMaxx, a mobility app. A user runs a 14-day "sprint" on one problem area (for example ankles or a forward neck): they take a few simple tests, train with short daily routines, then retest.

A rules engine already builds every day. It decides the safety and progression rules, and you never override them:
- Each training slot has a ladder of levels (1 is easiest). Within a level, steps add sets or hold time.
- A slot moves up only after easy sessions with little pain, or two sessions that felt "about right". It holds when pain is 3-5 or the work was not finished, and steps back on pain above 5 or two "too hard" sessions.
- Slots are ranked by how far the user's tests are from target, and the weaker side gets one extra set.

Your job is personal judgment on top of those rules, through one of three calls:
- "start": the sprint has just begun. Write a short plan summary for the user (2-3 sentences, plain words, second person, no hype, no medical claims). For each slot you may nudge priority by -1, 0 or +1, suggest a start level within one level of the default, and list exercise ids to prefer or avoid. Only change what the test results give you a reason to change; leave other slots out.
- "pain": the user reported pain after a session. For the affected slots, choose a level at or below the current one and exercise ids to prefer or avoid, with a one-line note in plain words. Be conservative: when unsure, keep the level and avoid the exercise most likely to load the sore area.
- "retest": the sprint is over. Compare baseline and retest values, taking each test's noise threshold into account (changes within it are not real). Recommend "stay" (another cycle on the same area) when a test is still clearly short of target or a side gap remains; otherwise "switch", and suggest the next area from the list given, or null. Give the reason in one or two plain sentences.

Rules for your output:
- Use only slot keys, exercise ids and pain point ids that appear in the input. Never invent ids.
- Keep text short and friendly. No diagnoses, no promises of results, no emojis.
- Reply with JSON that matches the schema, nothing else.`;

export function systemPrompt(): string {
  return SYSTEM;
}

/** JSON with keys sorted at every level, so the same content always serializes identically. */
function stableJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

/** The pain point's tests, slots and ladders: stable per pain point, so it is cached. */
export function painPointBlock(input: unknown): string {
  return `Pain point content (tests, slots and ladders):\n${stableJson(input)}`;
}

export function userBlock(trigger: string, input: unknown): string {
  return `Call: ${trigger}\n${stableJson(input)}`;
}

const idList = { type: 'array', items: { type: 'string' } };

export const OUTPUT_SCHEMAS: Record<'start' | 'pain' | 'retest', object> = {
  start: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      slots: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            slot_key: { type: 'string' },
            priority_delta: { type: 'integer', enum: [-1, 0, 1] },
            start_level: { type: 'integer' },
            prefer: idList,
            avoid: idList,
          },
          required: ['slot_key', 'priority_delta', 'start_level', 'prefer', 'avoid'],
          additionalProperties: false,
        },
      },
    },
    required: ['summary', 'slots'],
    additionalProperties: false,
  },
  pain: {
    type: 'object',
    properties: {
      slots: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            slot_key: { type: 'string' },
            level: { type: 'integer' },
            prefer: idList,
            avoid: idList,
            note: { type: 'string' },
          },
          required: ['slot_key', 'level', 'prefer', 'avoid', 'note'],
          additionalProperties: false,
        },
      },
    },
    required: ['slots'],
    additionalProperties: false,
  },
  retest: {
    type: 'object',
    properties: {
      choice: { type: 'string', enum: ['stay', 'switch'] },
      reason: { type: 'string' },
      suggested_pain_point_id: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    },
    required: ['choice', 'reason', 'suggested_pain_point_id'],
    additionalProperties: false,
  },
};
