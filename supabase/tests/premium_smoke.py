"""Live checks for premium (2026-11-13). Run with the repo .env loaded:
    python supabase/tests/premium_smoke.py
Creates throwaway users and deletes them. Briefly sets app_config.founder_cutoff to test
non-founders and ALWAYS restores the value it found (in `finally`)."""
import json, os, sys, urllib.request, uuid
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
def mkuser():
    email=f"smoke-{uuid.uuid4().hex[:8]}@example.invalid"; pw=uuid.uuid4().hex
    s,u=req('POST','/auth/v1/admin/users',{'email':email,'password':pw,'email_confirm':True},token=SR,key=SR); assert s in (200,201),(s,u)
    s,t=req('POST','/auth/v1/token?grant_type=password',{'email':email,'password':pw}); assert s==200,(s,t)
    return u['id'], t['access_token']
ok=lambda c,m: print(('PASS ' if c else 'FAIL ')+m)
status=lambda tok: req('POST','/rest/v1/rpc/my_premium_status',{},token=tok)[1]['status']
ids=[]
s,cfg=req('GET','/rest/v1/app_config?key=eq.founder_cutoff&select=value',token=SR,key=SR); original=cfg[0]['value']
try:
    a_id,A=mkuser(); ids.append(a_id)
    ok(status(A)=='founder',f"beta account is a founder (cutoff {original})")
    s,r=req('POST','/rest/v1/rpc/premium_status',{'p_user':a_id},token=A); ok(s>=400,f"app users cannot call premium_status(uuid) ({s})")
    s,r=req('GET','/rest/v1/app_config?select=key',token=A); ok(s==200 and r==[],f"app users cannot read app_config ({r})")
    s,r=req('POST','/rest/v1/subscriptions',{'original_transaction_id':'fake','owner_id':a_id,'product_id':'x','expires_at':'2099-01-01T00:00:00Z','environment':'Sandbox'},token=A); ok(s>=400,f"app users cannot write subscriptions ({s})")
    s,r=req('POST','/rest/v1/premium_grants',{'owner_id':a_id,'reason':'self'},token=A); ok(s>=400,f"app users cannot grant themselves premium ({s})")

    # After launch: accounts created from now on are not founders.
    s,_=req('PATCH','/rest/v1/app_config?key=eq.founder_cutoff',{'value':'2000-01-01T00:00:00Z'},token=SR,key=SR)
    b_id,B=mkuser(); ids.append(b_id)
    ok(status(B)=='none',"post-launch account without a subscription has no premium")
    ok(status(A)=='none',"cutoff applies to created_at (A was made after 2000)")
    otx=f"smoke-{uuid.uuid4().hex[:10]}"
    s,_=req('POST','/rest/v1/subscriptions',{'original_transaction_id':otx,'owner_id':b_id,'product_id':'com.sohan.bulletproof.premium.monthly','expires_at':'2099-01-01T00:00:00Z','environment':'Sandbox','is_trial':True},token=SR,key=SR)
    ok(status(B)=='trial',"active trial subscription -> trial")
    s,r=req('GET','/rest/v1/subscriptions?select=original_transaction_id',token=A); ok(r==[],f"A cannot see B's subscription ({r})")
    req('PATCH',f"/rest/v1/subscriptions?original_transaction_id=eq.{otx}",{'is_trial':False},token=SR,key=SR)
    ok(status(B)=='subscribed',"paid subscription -> subscribed")
    req('PATCH',f"/rest/v1/subscriptions?original_transaction_id=eq.{otx}",{'revoked_at':'2026-11-13T00:00:00Z'},token=SR,key=SR)
    ok(status(B)=='none',"refunded/revoked subscription -> none")
    req('PATCH',f"/rest/v1/subscriptions?original_transaction_id=eq.{otx}",{'revoked_at':None,'expires_at':'2020-01-01T00:00:00Z'},token=SR,key=SR)
    ok(status(B)=='none',"expired subscription -> none")
    req('POST','/rest/v1/premium_grants',{'owner_id':b_id,'reason':'smoke test'},token=SR,key=SR)
    ok(status(B)=='founder',"a manual grant gives lifetime premium")

    # The Edge Function: junk is refused, and the caller's status comes back.
    s,r=req('POST','/functions/v1/verify-subscription',{'transactions':['not.a.jws']},token=B)
    ok(s==200 and r['results'][0]['ok'] is False and r['status']['status']=='founder',f"verify-subscription refuses junk, returns status ({s} {r})")
    s,r=req('POST','/functions/v1/verify-subscription',{'transactions':['x']})
    ok(s==401,f"verify-subscription needs a signed-in user ({s})")
finally:
    s,_=req('PATCH','/rest/v1/app_config?key=eq.founder_cutoff',{'value':original},token=SR,key=SR); print(f"restored founder_cutoff to {original} ({s})")
    for i in ids:
        s,_=req('DELETE',f"/auth/v1/admin/users/{i}",token=SR,key=SR); print(f"cleanup user {s}")
