import json, os, sys, urllib.request, uuid
U=os.environ['SUPABASE_URL']; SR=os.environ['SUPABASE_SERVICE_ROLE_KEY']; AN=os.environ['SUPABASE_ANON_KEY']
def req(method, path, body=None, token=None, key=None, prefer='return=representation'):
    h={'apikey': key or AN, 'Content-Type':'application/json', 'Prefer':prefer}
    if token: h['Authorization']='Bearer '+token
    r=urllib.request.Request(U+path, data=json.dumps(body).encode() if body is not None else None, headers=h, method=method)
    try:
        with urllib.request.urlopen(r) as resp: t=resp.read().decode(); return resp.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read().decode() or 'null')
def mkuser():
    email=f"smoke-{uuid.uuid4().hex[:8]}@example.invalid"; pw=uuid.uuid4().hex
    s,u=req('POST','/auth/v1/admin/users',{'email':email,'password':pw,'email_confirm':True},token=SR,key=SR); assert s in (200,201),(s,u)
    s,t=req('POST','/auth/v1/token?grant_type=password',{'email':email,'password':pw}); assert s==200,(s,t)
    return u['id'], t['access_token']
ids=[]
ok=lambda c,m: print(('PASS ' if c else 'FAIL ')+m)
try:
    a_id,A=mkuser(); ids.append(a_id); b_id,B=mkuser(); ids.append(b_id)
    s,ex=req('GET','/rest/v1/exercises?select=id&exercise_type=eq.balance&limit=1',token=A); exid=ex[0]['id']
    s,w=req('POST','/rest/v1/workouts?select=id,owner_id',{'source':'empty','title':'Smoke'},token=A); ok(s==201 and w[0]['owner_id']==a_id,f"start workout owner default ({s})"); wid=w[0]['id']
    s,c=req('POST','/rest/v1/workouts',{'source':'empty','title':'Dup'},token=A); ok(s==409 and c.get('code')=='23505',f"second in-progress -> 23505 ({s} {c and c.get('code')})")
    s,we=req('POST','/rest/v1/workout_exercises?select=id',{'workout_id':wid,'exercise_id':exid,'position':1},token=A); ok(s==201,f"insert workout_exercise ({s})"); weid=we[0]['id']
    s,ss=req('POST','/rest/v1/workout_sets?select=id',[{'workout_exercise_id':weid,'set_number':1,'side':'left','duration_s':30},{'workout_exercise_id':weid,'set_number':1,'side':'right','duration_s':30}],token=A); ok(s==201 and len(ss)==2,f"insert sets ({s})")
    s,_=req('PATCH',f"/rest/v1/workout_sets?id=eq.{ss[0]['id']}",{'completed_at':'2026-11-07T12:00:00Z','duration_s':28},token=A); ok(s==200,f"complete set ({s})")
    s,r=req('GET',f"/rest/v1/workouts?select=id,workout_exercises(id,workout_sets(id))&id=eq.{wid}",token=B); ok(s==200 and r==[],f"user B cannot see A's workout ({r})")
    s,r=req('POST','/rest/v1/workout_sets',{'workout_exercise_id':weid,'set_number':2},token=B); ok(s in (401,403) or (s>=400),f"user B cannot insert into A's exercise ({s})")
    s,r=req('POST','/rest/v1/workout_exercises',{'workout_id':wid,'exercise_id':exid,'position':9},token=B); ok(s>=400,f"user B cannot attach exercise to A's workout ({s})")
    s,pp=req('GET','/rest/v1/pain_points?select=id&limit=1',token=A)
    s,sp=req('POST','/rest/v1/sprints?select=id',{'pain_point_id':pp[0]['id'],'cycle_number':1,'started_on':'2026-11-07','status':'active'},token=A); ok(s==201,f"A creates sprint ({s} {sp})")
    s,sd=req('POST','/rest/v1/sprint_days?select=id',{'sprint_id':sp[0]['id'],'day_number':1,'date':'2026-11-07'},token=A); ok(s==201,f"A creates sprint day ({s})")
    s,r=req('POST','/rest/v1/workouts',{'source':'sprint','title':'Hijack','sprint_day_id':sd[0]['id']},token=B); ok(s>=400,f"user B cannot claim A's sprint day ({s})")
    # switch_sprint RPC (2026-11-10): runs as the caller, abandon + start in one transaction.
    pp2=req('GET','/rest/v1/pain_points?select=id&order=sort_order&limit=2',token=A)[1][-1]['id']
    s,r=req('POST','/rest/v1/rpc/switch_sprint',{'p_old_sprint_id':sp[0]['id'],'p_pain_point_id':pp2,'p_started_on':'2026-11-10'},token=B); ok(s>=400,f"B cannot switch A's sprint ({s})")
    s,r=req('GET',f"/rest/v1/sprints?select=status&id=eq.{sp[0]['id']}",token=A); ok(r and r[0]['status']=='active',f"A's sprint still active after B's attempt ({r})")
    s,r=req('POST','/rest/v1/rpc/switch_sprint',{'p_old_sprint_id':str(uuid.uuid4()),'p_pain_point_id':pp2,'p_started_on':'2026-11-10'},token=A); ok(s>=400,f"switch with a bogus old sprint fails ({s})")
    s,r=req('GET','/rest/v1/sprints?select=id&status=eq.pending_baseline',token=A); ok(r==[],f"failed switch started nothing ({r})")
    s,ns=req('POST','/rest/v1/rpc/switch_sprint',{'p_old_sprint_id':sp[0]['id'],'p_pain_point_id':pp2,'p_started_on':'2026-11-10'},token=A); ok(s==200 and ns['owner_id']==a_id and ns['status']=='pending_baseline',f"A switches own sprint ({s})")
    s,r=req('GET',f"/rest/v1/sprints?select=status&id=eq.{sp[0]['id']}",token=A); ok(r and r[0]['status']=='abandoned',f"old sprint abandoned by switch ({r})")
    s,r=req('POST','/rest/v1/rpc/switch_sprint',{'p_old_sprint_id':sp[0]['id'],'p_pain_point_id':pp2,'p_started_on':'2026-11-10'},token=A); ok(s>=400,f"switching an already-ended sprint fails ({s})")
    s,r=req('DELETE',f"/rest/v1/sprints?id=eq.{ns['id']}",token=A); ok(s==200,f"cleanup switched sprint ({s})")
    s,r=req('DELETE',f"/rest/v1/sprints?id=eq.{sp[0]['id']}",token=A); ok(s==200,f"cleanup sprint ({s})")
    s,r=req('DELETE',f"/rest/v1/workout_sets?id=eq.{ss[1]['id']}",token=A); ok(s==200,f"delete uncompleted set ({s})")
    s,r=req('PATCH',f"/rest/v1/workouts?id=eq.{wid}",{'ended_at':'2026-11-07T12:30:00Z'},token=A); ok(s==200,f"finish workout ({s})")
    s,r=req('GET','/rest/v1/workouts?select=id&ended_at=is.null',token=A); ok(r==[],"no in-progress after finish")
    s,r=req('GET',f"/rest/v1/workout_exercises?select=id,workouts!inner(ended_at),workout_sets(id,completed_at)&exercise_id=eq.{exid}&workouts.ended_at=not.is.null",token=A); ok(len(r)==1 and len(r[0]['workout_sets'])==1,f"previous-sets query returns saved workout ({len(r)})")
    s,r=req('DELETE',f"/rest/v1/workouts?id=eq.{wid}",token=A); ok(s==200,f"delete workout ({s})")
    s,r=req('GET',f"/rest/v1/workout_sets?select=id&workout_exercise_id=eq.{weid}",token=SR,key=SR); ok(r==[],"cascade removed sets")
    # Stage 1: user_settings is owner-only.
    s,r=req('POST','/rest/v1/user_settings?on_conflict=owner_id',{'weekly_goal':4},token=A,prefer='resolution=merge-duplicates,return=representation'); ok(s in (200,201) and r[0]['owner_id']==a_id,f"A upserts own settings ({s})")
    s,r=req('GET','/rest/v1/user_settings?select=owner_id',token=B); ok(s==200 and r==[],f"B cannot read A's settings ({r})")
    s,r=req('PATCH',f"/rest/v1/user_settings?owner_id=eq.{a_id}",{'weekly_goal':9},token=B); ok(s==200 and r==[],f"B cannot update A's settings ({r})")
    s,r=req('POST','/rest/v1/user_settings',{'owner_id':a_id,'weekly_goal':9},token=B); ok(s>=400,f"B cannot insert settings as A ({s})")
    # Stage 2: custom exercises + routines. Written but not run by the builder.
    s,r=req('POST','/rest/v1/exercises?select=id,owner_id',{'name':'Smoke custom','movement_pattern':'mobility','exercise_type':'mobility_stretch','owner_id':a_id},token=A); ok(s==201,f"A creates custom exercise ({s} {r})"); cx=r[0]['id']
    s,r=req('GET',f"/rest/v1/exercises?select=id&id=eq.{cx}",token=B); ok(s==200 and r==[],f"B cannot read A's custom exercise ({r})")
    s,r=req('GET',f"/rest/v1/exercises?select=id&id=eq.{cx}"); ok(s==200 and r==[],f"anon cannot read custom exercise ({r})")
    s,r=req('POST','/rest/v1/exercises',{'name':'Smoke forged','movement_pattern':'mobility','owner_id':a_id},token=B); ok(s>=400,f"B cannot create exercise owned by A ({s})")
    s,r=req('POST','/rest/v1/exercises',{'name':'Smoke global','movement_pattern':'mobility'},token=A); ok(s>=400,f"A cannot create a global (owner-less) exercise ({s})")
    s,fo=req('POST','/rest/v1/routine_folders?select=id',{'name':'Smoke folder'},token=A); ok(s==201,f"A creates folder ({s})")
    s,ro=req('POST','/rest/v1/routines?select=id',{'title':'Smoke routine','folder_id':fo[0]['id']},token=A); ok(s==201,f"A creates routine in own folder ({s})")
    s,r=req('POST','/rest/v1/routines',{'title':'Sneaky','folder_id':fo[0]['id']},token=B); ok(s>=400,f"B cannot put a routine in A's folder ({s})")
    s,r=req('POST','/rest/v1/routine_exercises',{'routine_id':ro[0]['id'],'exercise_id':exid,'position':1},token=B); ok(s>=400,f"B cannot add routine_exercise to A's routine ({s})")
    s,r=req('POST','/rest/v1/routine_exercises',{'routine_id':ro[0]['id'],'exercise_id':cx,'position':1},token=A); ok(s==201,f"A adds own custom exercise to own routine ({s})")
    s,rb=req('POST','/rest/v1/routines?select=id',{'title':'B routine'},token=B); ok(s==201,f"B creates own routine ({s})")
    s,r=req('POST','/rest/v1/routine_exercises',{'routine_id':rb[0]['id'],'exercise_id':cx,'position':1},token=B); ok(s>=400,f"B cannot use A's custom exercise in a routine ({s})")
    s,r=req('POST','/rest/v1/workouts',{'source':'routine','title':'Hijack routine','routine_id':ro[0]['id']},token=B); ok(s>=400,f"B cannot start a workout with A's routine_id ({s})")
    s,wb=req('POST','/rest/v1/workouts?select=id',{'source':'routine','title':'B workout','routine_id':rb[0]['id']},token=B); ok(s==201,f"B starts workout from own routine ({s})")
    s,r=req('POST','/rest/v1/workout_exercises',{'workout_id':wb[0]['id'],'exercise_id':cx,'position':1},token=B); ok(s>=400,f"B cannot log A's custom exercise ({s})")
    s,r=req('DELETE',f"/rest/v1/workouts?id=eq.{wb[0]['id']}",token=B); ok(s==200,f"cleanup B workout ({s})")
    # replace_routine_exercises RPC runs as the caller: B can't wipe or fill A's routine.
    s,r=req('POST','/rest/v1/rpc/replace_routine_exercises',{'p_routine_id':ro[0]['id'],'p_rows':[{'exercise_id':exid,'position':1}]},token=B); ok(s>=400,f"B cannot replace A's routine exercises via RPC ({s})")
    s,r=req('GET',f"/rest/v1/routine_exercises?select=id&routine_id=eq.{ro[0]['id']}",token=A); ok(len(r)==1,f"A's routine untouched after B's RPC ({len(r)})")
    s,r=req('POST','/rest/v1/rpc/replace_routine_exercises',{'p_routine_id':ro[0]['id'],'p_rows':[{'exercise_id':cx,'position':1,'target_sets':2},{'exercise_id':exid,'position':2}]},token=A); ok(s in (200,204),f"A replaces own routine exercises ({s})")
    s,r=req('GET',f"/rest/v1/routine_exercises?select=id&routine_id=eq.{ro[0]['id']}",token=A); ok(len(r)==2,f"A's routine now has 2 exercises ({len(r)})")
    s,r=req('DELETE',f"/rest/v1/routine_folders?id=eq.{fo[0]['id']}",token=A); ok(s==200,f"delete folder ({s})")
    s,r=req('GET',f"/rest/v1/routines?select=id,folder_id&id=eq.{ro[0]['id']}",token=A); ok(s==200 and len(r)==1 and r[0]['folder_id'] is None,f"folder delete keeps routine, unfiled ({r})")
    s,r=req('DELETE',f"/rest/v1/exercises?id=eq.{cx}",token=A); ok(s==409 and r.get('code')=='23503',f"custom exercise in a routine cannot be deleted ({s})")
    s,r=req('DELETE',f"/rest/v1/routines?id=eq.{ro[0]['id']}",token=A); ok(s==200,f"delete routine ({s})")
    s,r=req('DELETE',f"/rest/v1/exercises?id=eq.{cx}",token=A); ok(s==200,f"delete unused custom exercise ({s})")
    # Adaptive engine schema (2026-11-12): slot state / AI adjustments / engine_calls are owner-only; continue_sprint.
    s,spA=req('POST','/rest/v1/sprints?select=id',{'pain_point_id':pp[0]['id'],'cycle_number':1,'started_on':'2026-11-12','status':'active'},token=A); ok(s==201,f"A creates sprint for engine checks ({s} {spA})"); spid=spA[0]['id']
    s,r=req('POST','/rest/v1/sprint_slot_state?select=sprint_id',{'sprint_id':spid,'slot_key':'smoke_slot','level':2,'last_done_on':'2026-11-11'},token=A); ok(s==201,f"A inserts own sprint_slot_state ({s} {r})")
    s,r=req('POST','/rest/v1/sprint_ai_adjustments?select=id',{'sprint_id':spid,'slot_key':'smoke_slot','kind':'start'},token=A); ok(s==201,f"A inserts own sprint_ai_adjustments ({s} {r})")
    s,r=req('POST','/rest/v1/engine_calls?select=id,owner_id',{'sprint_id':spid,'trigger':'start','model':'smoke','outcome':'ok'},token=A); ok(s==201 and r[0]['owner_id']==a_id,f"A inserts own engine_calls ({s} {r})")
    s,r=req('GET','/rest/v1/sprint_slot_state?select=slot_key',token=B); ok(s==200 and r==[],f"B cannot select A's sprint_slot_state ({r})")
    s,r=req('GET','/rest/v1/sprint_ai_adjustments?select=id',token=B); ok(s==200 and r==[],f"B cannot select A's sprint_ai_adjustments ({r})")
    s,r=req('GET','/rest/v1/engine_calls?select=id',token=B); ok(s==200 and r==[],f"B cannot select A's engine_calls ({r})")
    s,r=req('PATCH',f"/rest/v1/sprint_slot_state?sprint_id=eq.{spid}",{'level':9},token=B); ok(s==200 and r==[],f"B cannot update A's sprint_slot_state ({r})")
    s,r=req('PATCH',f"/rest/v1/sprint_ai_adjustments?sprint_id=eq.{spid}",{'note':'hijack'},token=B); ok(s==200 and r==[],f"B cannot update A's sprint_ai_adjustments ({r})")
    s,r=req('PATCH',f"/rest/v1/engine_calls?sprint_id=eq.{spid}",{'model':'hijack'},token=B); ok(s>=400 or r==[],f"B cannot update A's engine_calls ({s} {r})")
    s,r=req('POST','/rest/v1/sprint_slot_state',{'sprint_id':spid,'slot_key':'forged'},token=B); ok(s>=400,f"B cannot insert sprint_slot_state into A's sprint ({s})")
    s,r=req('POST','/rest/v1/sprint_ai_adjustments',{'sprint_id':spid,'slot_key':'forged','kind':'pain'},token=B); ok(s>=400,f"B cannot insert sprint_ai_adjustments into A's sprint ({s})")
    s,r=req('POST','/rest/v1/engine_calls',{'owner_id':a_id,'model':'forged'},token=B); ok(s>=400,f"B cannot insert engine_calls as A ({s})")
    s,r=req('POST','/rest/v1/engine_calls',{'sprint_id':spid,'model':'forged'},token=B); ok(s>=400,f"B cannot attach engine_calls to A's sprint ({s})")
    # continue_sprint needs a completed sprint with a reassessment + slot state.
    s,_=req('POST','/rest/v1/sprint_assessments',[{'sprint_id':spid,'phase':'baseline','completed_at':None},{'sprint_id':spid,'phase':'reassessment','completed_at':'2026-11-12T12:00:00Z'}],token=A); ok(s==201,f"A adds assessments ({s})")
    s,ra=req('GET',f"/rest/v1/sprint_assessments?select=id&sprint_id=eq.{spid}&phase=eq.reassessment",token=A)
    ok(s==200 and len(ra)==1,f"reassessment row found ({s} {ra})")
    if s==200 and len(ra)==1: s,_=req('POST','/rest/v1/sprint_assessment_results',{'sprint_assessment_id':ra[0]['id'],'test_key':'smoke_test','value_single':4.5},token=A); ok(s==201,f"A adds reassessment result ({s})")
    s,r=req('POST','/rest/v1/rpc/continue_sprint',{'p_old_sprint_id':spid,'p_started_on':'2026-12-01'},token=A); ok(s>=400,f"continue_sprint on a non-completed sprint fails ({s})")
    s,_=req('PATCH',f"/rest/v1/sprints?id=eq.{spid}",{'status':'completed'},token=A); ok(s==200,f"A completes sprint ({s})")
    s,r=req('POST','/rest/v1/rpc/continue_sprint',{'p_old_sprint_id':spid,'p_started_on':'2026-12-01'},token=B); ok(s>=400,f"B cannot continue A's sprint ({s})")
    s,nc=req('POST','/rest/v1/rpc/continue_sprint',{'p_old_sprint_id':spid,'p_started_on':'2026-12-01'},token=A); ok(s==200 and nc['status']=='active' and nc['owner_id']==a_id and nc['cycle_number']==2,f"A continues own completed sprint ({s} {nc})")
    if s==200:
        s,r=req('GET',f"/rest/v1/sprint_days?select=day_number,date,built_at&sprint_id=eq.{nc['id']}&order=day_number",token=A); ok(len(r)==14 and r[0]['date']=='2026-12-01' and r[13]['date']=='2026-12-14' and all(x['built_at'] is None for x in r),f"continued sprint has 14 unbuilt days ({len(r)})")
        s,r=req('GET',f"/rest/v1/sprint_slot_state?select=slot_key,level,last_done_on&sprint_id=eq.{nc['id']}",token=A); ok(len(r)==1 and r[0]['level']==2 and r[0]['last_done_on']=='2026-11-11',f"slot state copied with last_done_on ({r})")
        s,r=req('GET',f"/rest/v1/sprint_assessments?select=phase,completed_at,sprint_assessment_results(test_key,value_single)&sprint_id=eq.{nc['id']}",token=A); ok(len(r)==1 and r[0]['phase']=='baseline' and r[0]['sprint_assessment_results'][0]['value_single']==4.5,f"baseline copied from old reassessment ({r})")
        s,r=req('DELETE',f"/rest/v1/sprints?id=eq.{nc['id']}",token=A); ok(s==200,f"cleanup continued sprint ({s})")
    s,r=req('DELETE',f"/rest/v1/sprints?id=eq.{spid}",token=A); ok(s==200,f"cleanup engine-check sprint ({s})")
    s,r=req('GET',f"/rest/v1/engine_calls?select=sprint_id&owner_id=eq.{a_id}",token=A); ok(s==200 and len(r)==1 and r[0]['sprint_id'] is None,f"engine_calls survive sprint delete, sprint_id nulled ({r})")
finally:
    for i in ids:
        # Mirror delete-account: remove rows whose owner_id FK has no cascade before the auth user.
        for tbl in ('workouts','sprints','routine_exercises','routines','routine_folders','exercises'):
            try: s,_=req('DELETE',f"/rest/v1/{tbl}?owner_id=eq.{i}",token=SR,key=SR); print(f"cleanup {tbl} {s}")
            except Exception as e: print(f"cleanup {tbl} error {e}")
        s,_=req('DELETE',f"/auth/v1/admin/users/{i}",token=SR,key=SR); print(f"cleanup user {s}")
