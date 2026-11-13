"""Live checks for find_contacts() (2026-11-13). Run with the repo .env loaded:
    python supabase/tests/contacts_smoke.py
Throwaway users get phone numbers confirmed through the admin API (no SMS sent)."""
import json, os, random, sys, urllib.request, uuid
sys.stdout.reconfigure(encoding="utf-8")
U=os.environ['SUPABASE_URL']; SR=os.environ['SUPABASE_SERVICE_ROLE_KEY']; AN=os.environ['SUPABASE_ANON_KEY']
def req(method, path, body=None, token=None, key=None, prefer='return=representation'):
    h={'apikey': key or AN, 'Content-Type':'application/json', 'Prefer':prefer}
    if token: h['Authorization']='Bearer '+token
    r=urllib.request.Request(U+path, data=json.dumps(body).encode() if body is not None else None, headers=h, method=method)
    try:
        with urllib.request.urlopen(r) as resp: t=resp.read().decode(); return resp.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t=e.read().decode()
        try: return e.code, json.loads(t or 'null')
        except ValueError: return e.code, t
def mkuser(phone=None, confirm=True):
    email=f"smoke-{uuid.uuid4().hex[:8]}@example.invalid"; pw=uuid.uuid4().hex
    body={'email':email,'password':pw,'email_confirm':True}
    if phone: body.update({'phone':phone,'phone_confirm':confirm})
    s,u=req('POST','/auth/v1/admin/users',body,token=SR,key=SR); assert s in (200,201),(s,u)
    s,t=req('POST','/auth/v1/token?grant_type=password',{'email':email,'password':pw}); assert s==200,(s,t)
    tok=t['access_token']
    s,p=req('POST','/rest/v1/profiles',{'handle':'smk'+uuid.uuid4().hex[:8],'display_name':'Smoke','terms_accepted_at':'2026-11-13T00:00:00Z'},token=tok,prefer='return=minimal'); assert s==201,(s,p)
    return u['id'], tok
ok=lambda c,m: print(('PASS ' if c else 'FAIL ')+m)
find=lambda tok, nums: req('POST','/rest/v1/rpc/find_contacts',{'p_numbers':nums},token=tok)
ids=[]
pb=f"1555{random.randint(1000000,9999999)}"; pc=f"1555{random.randint(1000000,9999999)}"
try:
    a_id,A=mkuser(); ids.append(a_id)
    b_id,B=mkuser(pb); ids.append(b_id)
    c_id,C=mkuser(pc, confirm=False); ids.append(c_id)
    s,r=find(A,[f"+{pb}"]); ok(s==200 and [x['id'] for x in r]==[b_id],f"finds a friend by verified number ({s} {r})")
    s,r=find(A,[f"+{pb[0]} ({pb[1:4]}) {pb[4:7]}-{pb[7:]}"]); ok(s==200 and len(r)==1,f"formatting is ignored ({len(r) if isinstance(r,list) else r})")
    s,r=find(A,[f"+{pc}"]); ok(s==200 and r==[],f"an unconfirmed number is not findable ({r})")
    s,r=find(B,[f"+{pb}"]); ok(s==200 and r==[],f"you never find yourself ({r})")
    s,r=find(None,[f"+{pb}"]); ok(s>=400 or r==[],f"signed-out callers get nothing ({s})")
    s,r=find(A,[f"+1555{i:07d}" for i in range(2001)]); ok(s==200 and r==[],f"more than 2000 numbers returns nothing ({s})")
    req('POST','/rest/v1/user_settings?on_conflict=owner_id',{'discoverable_by_phone':False},token=B,prefer='resolution=merge-duplicates,return=representation')
    s,r=find(A,[f"+{pb}"]); ok(s==200 and r==[],f"discovery turned off hides you ({r})")
    req('PATCH',f"/rest/v1/user_settings?owner_id=eq.{b_id}",{'discoverable_by_phone':True},token=B)
    s,_=req('POST','/rest/v1/user_blocks',{'blocked_id':a_id},token=B); assert s==201,s
    s,r=find(A,[f"+{pb}"]); ok(s==200 and r==[],f"someone who blocked you is hidden ({r})")
    req('DELETE',f"/rest/v1/user_blocks?blocked_id=eq.{a_id}",token=B)
    s,_=req('POST','/rest/v1/user_blocks',{'blocked_id':b_id},token=A)
    s,r=find(A,[f"+{pb}"]); ok(s==200 and r==[],f"someone you blocked is hidden ({r})")
finally:
    for i in ids:
        s,_=req('DELETE',f"/auth/v1/admin/users/{i}",token=SR,key=SR); print(f"cleanup user {s}")
