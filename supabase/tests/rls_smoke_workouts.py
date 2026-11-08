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
    s,r=req('DELETE',f"/rest/v1/sprints?id=eq.{sp[0]['id']}",token=A); ok(s==200,f"cleanup sprint ({s})")
    s,r=req('DELETE',f"/rest/v1/workout_sets?id=eq.{ss[1]['id']}",token=A); ok(s==200,f"delete uncompleted set ({s})")
    s,r=req('PATCH',f"/rest/v1/workouts?id=eq.{wid}",{'ended_at':'2026-11-07T12:30:00Z'},token=A); ok(s==200,f"finish workout ({s})")
    s,r=req('GET','/rest/v1/workouts?select=id&ended_at=is.null',token=A); ok(r==[],"no in-progress after finish")
    s,r=req('GET',f"/rest/v1/workout_exercises?select=id,workouts!inner(ended_at),workout_sets(id,completed_at)&exercise_id=eq.{exid}&workouts.ended_at=not.is.null",token=A); ok(len(r)==1 and len(r[0]['workout_sets'])==1,f"previous-sets query returns saved workout ({len(r)})")
    s,r=req('DELETE',f"/rest/v1/workouts?id=eq.{wid}",token=A); ok(s==200,f"delete workout ({s})")
    s,r=req('GET',f"/rest/v1/workout_sets?select=id&workout_exercise_id=eq.{weid}",token=SR,key=SR); ok(r==[],"cascade removed sets")
finally:
    for i in ids:
        s,_=req('DELETE',f"/auth/v1/admin/users/{i}",token=SR,key=SR); print(f"cleanup user {s}")
