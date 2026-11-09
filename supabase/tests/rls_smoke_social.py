"""Stage 3 social RLS smoke suite (live, two/three/four throwaway users).

Run by the controller with SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY /
SUPABASE_ANON_KEY in the environment, after the stage 3 migrations are
applied. Modeled on rls_smoke_workouts.py. Creates users A, B, C (+ D as a
third reporter) and deletes everything it made in `finally`.
"""
import json, os, sys, urllib.request, urllib.error, uuid, datetime

U = os.environ['SUPABASE_URL']; SR = os.environ['SUPABASE_SERVICE_ROLE_KEY']; AN = os.environ['SUPABASE_ANON_KEY']
NOW = datetime.datetime.now(datetime.timezone.utc).isoformat()


def req(method, path, body=None, token=None, key=None, prefer='return=representation'):
    h = {'apikey': key or AN, 'Content-Type': 'application/json', 'Prefer': prefer}
    if token: h['Authorization'] = 'Bearer ' + token
    r = urllib.request.Request(U + path, data=json.dumps(body).encode() if body is not None else None, headers=h, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            t = resp.read().decode(); return resp.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: return e.code, json.loads(t or 'null')
        except Exception: return e.code, t


def raw(method, path, data=None, token=None, key=None, ctype='image/jpeg'):
    h = {'apikey': key or AN, 'Content-Type': ctype}
    if token: h['Authorization'] = 'Bearer ' + token
    r = urllib.request.Request(U + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r) as resp: return resp.status, resp.read()
    except urllib.error.HTTPError as e: return e.code, e.read()


def mkuser():
    email = f"smoke-{uuid.uuid4().hex[:8]}@example.invalid"; pw = uuid.uuid4().hex
    s, u = req('POST', '/auth/v1/admin/users', {'email': email, 'password': pw, 'email_confirm': True}, token=SR, key=SR); assert s in (200, 201), (s, u)
    s, t = req('POST', '/auth/v1/token?grant_type=password', {'email': email, 'password': pw}); assert s == 200, (s, t)
    return u['id'], t['access_token']


def mkprofile(tok, uid):
    s, r = req('POST', '/rest/v1/profiles?select=id', {'handle': 'sk' + uuid.uuid4().hex[:8], 'display_name': 'Smoke', 'terms_accepted_at': NOW}, token=tok)
    assert s == 201 and r[0]['id'] == uid, (s, r)


ids = []; photo_paths = []
ok = lambda c, m: print(('PASS ' if c else 'FAIL ') + m)
def rows(r): return isinstance(r, list) and len(r) or 0
def count(r): return len(r) if isinstance(r, list) else -1

try:
    a_id, A = mkuser(); ids.append(a_id); b_id, B = mkuser(); ids.append(b_id)
    c_id, C = mkuser(); ids.append(c_id); d_id, D = mkuser(); ids.append(d_id)
    for uid, tok in ((a_id, A), (b_id, B), (c_id, C), (d_id, D)): mkprofile(tok, uid)

    # ---- setup: A's custom exercise, followers workout W1 (with a set), private W2, public W3
    s, ex = req('POST', '/rest/v1/exercises?select=id,owner_id', {'name': 'Smoke social custom', 'movement_pattern': 'mobility', 'exercise_type': 'mobility_stretch', 'owner_id': a_id}, token=A); ok(s == 201, f"A creates custom exercise ({s} {ex})"); cx = ex[0]['id']
    def mkw(vis, title):
        s, w = req('POST', '/rest/v1/workouts?select=id', {'source': 'empty', 'title': title, 'visibility': vis, 'ended_at': NOW}, token=A); assert s == 201, (s, w); return w[0]['id']
    w1 = mkw('followers', 'Smoke followers'); w2 = mkw('private', 'Smoke private'); w3 = mkw('public', 'Smoke public')
    s, we = req('POST', '/rest/v1/workout_exercises?select=id', {'workout_id': w1, 'exercise_id': cx, 'position': 1}, token=A); ok(s == 201, f"A adds custom exercise to W1 ({s})"); we1 = we[0]['id']
    s, r = req('POST', '/rest/v1/workout_sets', {'workout_exercise_id': we1, 'set_number': 1, 'duration_s': 30}, token=A); ok(s == 201, f"A adds a set ({s})")
    path = f"{a_id}/{w1}/{uuid.uuid4().hex}.jpg"; photo_paths.append(path)
    s, _ = raw('POST', f"/storage/v1/object/workout-media/{path}", b'\xff\xd8\xff\xd9', token=A); ok(s in (200, 201), f"A uploads photo ({s})")
    s, r = req('POST', '/rest/v1/workout_media?select=id', {'workout_id': w1, 'path': path, 'position': 0}, token=A); ok(s == 201, f"A registers workout_media ({s} {r})")

    def b_reads_w1(): return req('GET', f"/rest/v1/workouts?select=id&id=eq.{w1}", token=B)[1]
    # The app only ever reads photos through signed URLs (1 h), so "can read"
    # = "can mint a signed URL". Direct authenticated GETs can be answered from
    # Supabase Storage's cache for a while after access is revoked, which is
    # why they aren't used as the signal here (or anywhere in the app).
    def b_reads_photo(): return req('POST', f"/storage/v1/object/sign/workout-media/{path}", {'expiresIn': 60}, token=B)[0]

    # ---- no follow yet
    ok(b_reads_w1() == [], "B cannot read A's followers workout before following")
    s, r = req('GET', f"/rest/v1/exercises?select=id&id=eq.{cx}", token=B); ok(s == 200 and r == [], "B cannot read A's custom exercise before following")
    ok(b_reads_photo() != 200, "B cannot read A's photo before following")
    s, r = req('POST', '/rest/v1/workout_likes', {'workout_id': w1}, token=B); ok(s >= 400, f"B cannot like what B can't read ({s})")
    s, r = req('POST', '/rest/v1/workout_comments', {'workout_id': w1, 'body': 'hi'}, token=B); ok(s >= 400, f"B cannot comment on what B can't read ({s})")
    s, r = req('POST', '/rest/v1/workout_media', {'workout_id': w1, 'path': path}, token=B); ok(s >= 400, f"B cannot register A's photo path in a workout ({s})")
    s, r = raw('POST', f"/storage/v1/object/workout-media/{a_id}/{w1}/evil.jpg", b'\xff\xd8\xff\xd9', token=B); ok(s >= 400, f"B cannot upload into A's storage folder ({s})")

    # ---- pending follow
    s, f = req('POST', '/rest/v1/follows?select=status', {'followee_id': a_id, 'status': 'accepted'}, token=B); ok(s == 201 and f[0]['status'] == 'pending', f"follow to a private profile is forced pending ({s} {f})")
    ok(b_reads_w1() == [], "B (pending follow) cannot read A's followers workout")
    ok(b_reads_photo() != 200, "B (pending follow) cannot read A's photo")
    s, r = req('GET', f"/rest/v1/profiles?select=id,handle&id=eq.{a_id}", token=B); ok(s == 200 and len(r) == 1, "B sees A's profile card (handle) while pending")
    s, r = req('POST', '/rest/v1/rpc/can_view_profile_details', {'p_id': a_id}, token=B); ok(s == 200 and r is False, f"pending follower cannot view A's profile details ({r})")
    s, r = req('PATCH', f"/rest/v1/profiles?id=eq.{a_id}", {'bio': 'Ankle rehab diary'}, token=A, prefer='return=minimal'); ok(s in (200, 204), f"A sets own bio ({s})")
    s, r = req('GET', f"/rest/v1/profiles?select=bio&id=eq.{a_id}", token=B); ok(s >= 400, f"bio column not directly selectable ({s})")
    s, r = req('POST', '/rest/v1/rpc/profile_bio', {'p_id': a_id}, token=B); ok(s == 200 and r is None, f"pending follower gets no bio ({r})")
    s, r = req('POST', '/rest/v1/rpc/profile_bio', {'p_id': a_id}, token=A); ok(r == 'Ankle rehab diary', f"A reads own bio via RPC ({r})")
    s, r = req('GET', f"/rest/v1/notifications?select=kind&actor_id=eq.{b_id}", token=A); ok(s == 200 and any(n['kind'] == 'follow_request' for n in r), f"A gets a follow_request notification ({r})")
    s, r = req('PATCH', f"/rest/v1/follows?follower_id=eq.{b_id}&followee_id=eq.{a_id}", {'status': 'accepted'}, token=B); ok(s == 200 and r == [], f"B cannot accept their own follow ({r})")

    # ---- accepted follow
    s, r = req('PATCH', f"/rest/v1/follows?follower_id=eq.{b_id}&followee_id=eq.{a_id}", {'status': 'accepted'}, token=A); ok(s == 200 and len(r) == 1, f"A accepts B ({s})")
    ok(rows(b_reads_w1()) == 1, "B (accepted) reads A's followers workout")
    s, r = req('GET', f"/rest/v1/workout_sets?select=id&workout_exercise_id=eq.{we1}", token=B); ok(rows(r) == 1, "B reads the workout's sets")
    s, r = req('GET', f"/rest/v1/exercises?select=id,name&id=eq.{cx}", token=B); ok(rows(r) == 1, "B reads A's custom exercise through a readable workout")
    ok(b_reads_photo() == 200, "B (accepted) reads A's photo")
    s, r = req('GET', f"/rest/v1/workouts?select=id&id=eq.{w2}", token=B); ok(r == [], "B can never read A's private workout")
    s, r = req('POST', '/rest/v1/rpc/can_view_profile_details', {'p_id': a_id}, token=B); ok(r is True, "accepted follower can view profile details")
    s, r = req('POST', '/rest/v1/rpc/profile_bio', {'p_id': a_id}, token=B); ok(r == 'Ankle rehab diary', f"accepted follower reads bio ({r})")
    s, r = req('GET', f"/rest/v1/notifications?select=kind&actor_id=eq.{a_id}", token=B); ok(any(n['kind'] == 'follow_accepted' for n in (r or [])), "B gets follow_accepted notification")
    s, r = req('POST', '/rest/v1/workout_likes', {'workout_id': w1}, token=B); ok(s == 201, f"B likes W1 ({s})")
    s, cm = req('POST', '/rest/v1/workout_comments?select=id', {'workout_id': w1, 'body': 'nice one'}, token=B); ok(s == 201, f"B comments on W1 ({s})"); cm_id = cm[0]['id']
    s, r = req('GET', f"/rest/v1/notifications?select=kind&actor_id=eq.{b_id}", token=A); ks = {n['kind'] for n in (r or [])}; ok({'like', 'comment'} <= ks, f"A gets like + comment notifications ({ks})")
    s, r = req('GET', f"/rest/v1/workout_comments?select=id&workout_id=eq.{w1}", token=A); ok(rows(r) == 1, "A sees B's comment")
    s, r = req('POST', '/rest/v1/rpc/profile_follow_counts', {'p_id': a_id}, token=B); ok(s == 200 and r[0]['follower_count'] == 1, f"follow counts visible to follower ({r})")
    s, r = req('POST', '/rest/v1/rpc/profile_follow_counts', {'p_id': a_id}, token=C); ok(s == 200 and r[0]['follower_count'] is None, f"follow counts hidden from stranger ({r})")

    # ---- word filter + moderator guard + hidden guard
    s, r = req('PATCH', f"/rest/v1/workouts?id=eq.{w1}", {'title': 'blowjob'}, token=A); ok(s >= 400 and isinstance(r, dict) and r.get('code') == 'P0001' and "isn't allowed" in r.get('message', ''), f"word filter rejects seeded term in followers title ({s} {r})")
    s, r = req('PATCH', f"/rest/v1/workouts?id=eq.{w2}", {'title': 'blowjob'}, token=A); ok(s == 200, f"word filter allows the same term in a private workout ({s})")
    s, r = req('POST', '/rest/v1/workout_comments', {'workout_id': w1, 'body': 'kill yourself'}, token=B); ok(s >= 400 and isinstance(r, dict) and r.get('code') == 'P0001', f"word filter rejects comment ({s})")
    s, r = req('PATCH', f"/rest/v1/profiles?id=eq.{a_id}", {'bio': 'send nudes'}, token=A, prefer='return=minimal'); ok(s >= 400, f"word filter rejects bio ({s})")
    s, r = req('PATCH', f"/rest/v1/profiles?id=eq.{a_id}", {'is_moderator': True}, token=A, prefer='return=minimal'); ok(s >= 400, f"A cannot self-set is_moderator ({s})")
    s, r = req('GET', f"/rest/v1/profiles?select=is_moderator&id=eq.{a_id}", token=SR, key=SR); ok(r and r[0]['is_moderator'] is False, "is_moderator still false")
    s, r = req('PATCH', f"/rest/v1/workouts?id=eq.{w1}", {'hidden_by_moderation': True}, token=A)
    s, r = req('GET', f"/rest/v1/workouts?select=hidden_by_moderation&id=eq.{w1}", token=SR, key=SR); ok(r and r[0]['hidden_by_moderation'] is False, "owner cannot change hidden_by_moderation")

    # ---- C (no follow): public workout only while A is_public
    s, r = req('GET', f"/rest/v1/workouts?select=id&id=eq.{w3}", token=C); ok(r == [], "C cannot read A's public workout while A is private")
    s, r = req('PATCH', f"/rest/v1/profiles?id=eq.{a_id}", {'is_public': True}, token=A, prefer='return=minimal'); ok(s in (200, 204), "A goes public")
    s, r = req('GET', f"/rest/v1/workouts?select=id&id=eq.{w3}", token=C); ok(rows(r) == 1, "C reads A's public workout while A is public")
    s, r = req('GET', f"/rest/v1/workouts?select=id&id=eq.{w1}", token=C); ok(r == [], "C still cannot read A's followers workout")

    # ---- 3 distinct reporters auto-hide W3 (still public, A public)
    s, r = req('POST', '/rest/v1/content_reports', {'target_type': 'workout', 'target_id': w3, 'reason': 'spam'}, token=B); ok(s == 201, f"B reports W3 ({s})")
    s, r = req('POST', '/rest/v1/content_reports', {'target_type': 'workout', 'target_id': w3, 'reason': 'spam'}, token=B); ok(s == 409, f"duplicate report -> 409 ({s})")
    s, r = req('POST', '/rest/v1/content_reports', {'target_type': 'workout', 'target_id': w3, 'reason': 'hate'}, token=C); ok(s == 201, f"C reports W3 ({s})")
    s, r = req('GET', f"/rest/v1/workouts?select=id&id=eq.{w3}", token=D); ok(rows(r) == 1, "W3 still visible after 2 reports")
    s, r = req('POST', '/rest/v1/content_reports', {'target_type': 'workout', 'target_id': w3, 'reason': 'other'}, token=D); ok(s == 201, f"D reports W3 ({s})")
    s, r = req('GET', f"/rest/v1/workouts?select=id,hidden_by_moderation&id=eq.{w3}", token=SR, key=SR); ok(r and r[0]['hidden_by_moderation'] is True, "W3 auto-hidden after 3 distinct reporters")
    for nm, tk in (('C', C), ('D', D)):
        s, r = req('GET', f"/rest/v1/workouts?select=id&id=eq.{w3}", token=tk); ok(r == [], f"{nm} cannot read the hidden workout")
    s, r = req('GET', f"/rest/v1/workouts?select=id&id=eq.{w3}", token=A); ok(rows(r) == 1, "owner still reads own hidden workout")
    s, r = req('GET', '/rest/v1/content_reports?select=id', token=C); ok(rows(r) == 1, "reporter sees only own reports")
    s, r = req('PATCH', f"/rest/v1/profiles?id=eq.{a_id}", {'is_public': False}, token=A, prefer='return=minimal')
    s, r = req('GET', f"/rest/v1/workouts?select=id&id=eq.{w3}", token=C); ok(r == [], "C loses A's public workouts when A flips private")

    # ---- block A <-> B
    s, r = req('POST', '/rest/v1/user_blocks', {'blocked_id': b_id}, token=A); ok(s == 201, f"A blocks B ({s})")
    s, r = req('GET', f"/rest/v1/follows?select=follower_id&follower_id=eq.{b_id}&followee_id=eq.{a_id}", token=SR, key=SR); ok(r == [], "block removed the follow")
    ok(b_reads_w1() == [], "B cannot read A's workout after block")
    ok(b_reads_photo() != 200, "B cannot read A's photo after block")
    s, r = req('GET', f"/rest/v1/exercises?select=id&id=eq.{cx}", token=B); ok(r == [], "B cannot read A's custom exercise after block")
    s, r = req('GET', f"/rest/v1/profiles?select=id&id=eq.{a_id}", token=B); ok(r == [], "B cannot see A's profile after block")
    s, r = req('GET', f"/rest/v1/profiles?select=id&id=eq.{b_id}", token=A); ok(r == [], "A cannot see B's profile after block")
    s, r = req('GET', f"/rest/v1/workout_comments?select=id&id=eq.{cm_id}", token=A); ok(r == [], "A no longer sees B's comment")
    s, r = req('GET', f"/rest/v1/workout_likes?select=user_id&workout_id=eq.{w1}", token=A); ok(r == [], "A no longer sees B's like")
    s, r = req('GET', f"/rest/v1/notifications?select=id&actor_id=eq.{b_id}", token=A); ok(r == [], "A's inbox hides B's notifications")
    s, r = req('POST', '/rest/v1/follows', {'followee_id': a_id}, token=B); ok(s >= 400, f"B cannot re-follow A ({s})")
    s, r = req('POST', '/rest/v1/follows', {'followee_id': b_id}, token=A); ok(s >= 400, f"A cannot follow blocked B ({s})")
    s, r = req('GET', '/rest/v1/user_blocks?select=blocker_id', token=B); ok(r == [], "B cannot see that A blocked them")
finally:
    # Workouts/exercises reference auth.users without cascade: remove them first.
    for p in photo_paths:
        raw('DELETE', f"/storage/v1/object/workout-media/{p}", token=SR, key=SR)
    for i in ids:
        req('DELETE', f"/rest/v1/workouts?owner_id=eq.{i}", token=SR, key=SR)
        req('DELETE', f"/rest/v1/exercises?owner_id=eq.{i}", token=SR, key=SR)
    for i in ids:
        s, _ = req('DELETE', f"/auth/v1/admin/users/{i}", token=SR, key=SR); print(f"cleanup user {s}")
