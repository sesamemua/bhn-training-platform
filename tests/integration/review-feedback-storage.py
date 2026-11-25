"""Real PostgreSQL regression. Creates/removes only its own temporary test database.
Run: python3 tests/integration/review-feedback-storage.py --socket /path/to/private/socket --port 55439 --schema /path/to/generated/prisma.sql
The unrelated vector columns in the generated test schema use TEXT when pgvector is unavailable.
"""
import argparse, hashlib, json, os, re, subprocess, uuid
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--socket',required=True);parser.add_argument('--port',default='55439');parser.add_argument('--schema',required=True);parser.add_argument('--user');args=parser.parse_args()
assert Path(args.socket).is_dir(), 'Use an isolated local PostgreSQL socket.'
database='bhn_feedback_test_'+uuid.uuid4().hex[:12]
registry=json.loads(Path('config/review-feedback-sources.json').read_text())
expected_sources=set(registry['sources'])
base=['psql','-X','-q','-v','ON_ERROR_STOP=1','-h',args.socket,'-p',args.port,'-tA']+(['-U',args.user] if args.user else [])
def run(sql,db=database):
 r=subprocess.run([*base,'-d',db],input=sql,text=True,capture_output=True)
 if r.returncode:raise RuntimeError(r.stderr)
 return r.stdout.strip()
def q(value):
 if value is None:return 'NULL'
 if isinstance(value,(dict,list)):value=json.dumps(value)
 if isinstance(value,bool):return 'true' if value else 'false'
 return "'"+str(value).replace("'","''")+"'"
def query(sql):return json.loads(run('SELECT coalesce(json_agg(t),\'[]\') FROM ('+sql+') t;'))
def seed(table,values):
 cols=query("SELECT column_name,data_type,udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name="+q(table)+" AND is_nullable='NO' AND column_default IS NULL")
 for c in cols:
  name=c['column_name']
  if name not in values:
   kind=c['data_type'];values[name]=('2026-11-24T20:00:00Z' if 'timestamp' in kind else [] if kind=='jsonb' else 0 if kind in ('integer','double precision','real','bigint') else False if kind=='boolean' else 'fixture-'+name)
 run('INSERT INTO "'+table+'" ('+','.join('"'+k+'"' for k in values)+') VALUES ('+','.join(q(v) for v in values.values())+');')
def events(model,id):return query('SELECT detail::jsonb AS detail FROM "ReviewFeedbackMemory" WHERE detail::jsonb->\'source\'->>\'model\'='+q(model)+' AND detail::jsonb->\'source\'->>\'id\'='+q(id)+' ORDER BY "recordedAt",id')
try:
 run('CREATE DATABASE '+database+';','postgres')
 schema=Path(args.schema).read_text();schema=re.sub(r'\bvector\(\d+\)', 'TEXT', schema)
 run(schema)
 seed('User',{'id':'u-one','email':'reviewer@example.test','name':'Reviewer One'})
 seed('PageReview',{'id':'r-page','title':'Page proof','url':'https://name:secret@example.test/review?token=hidden#hash','kind':'paste','pastedHtml':'<p>original page</p>'})
 seed('PageComment',{'id':'page-note','reviewId':'r-page','authorUserId':'u-one','authorName':'Reviewer One','authorKind':'user','body':'Use larger headings','round':1,'anchorQuote':'Original paragraph','anchorBlock':'Page 2'})
 legacy_id='review-feedback:page-note:v0:'+hashlib.sha256(b'Use larger headings').hexdigest()[:24]
 seed('ReviewFeedbackMemory',{'id':legacy_id,'reviewId':'r-page','event':'baseline','occurredAt':'2026-11-24T20:00:00Z','detail':'{"existing":"must survive"}'})
 seed('NewsletterIssue',{'id':'issue','title':'November newsletter','dateline':'November','renderedHtml':'<p>Newsletter proof</p>'})
 seed('NewsletterComment',{'id':'nl-note','issueId':'issue','body':'Keep the intro short','authorId':'u-one','authorName':'Reviewer One','anchorQuote':'Newsletter heading'})
 seed('VideoProject',{'id':'video','title':'Training video'})
 seed('Script',{'id':'script','projectId':'video','title':'Opening script','richContent':{'type':'doc'}})
 seed('ScriptSection',{'id':'section','scriptId':'script','order':0,'heading':'Intro','body':'Original narration'})
 seed('ScriptComment',{'id':'script-note','scriptId':'script','authorUserId':'u-one','authorName':'Reviewer One','authorKind':'user','body':'Shorten this narration','anchorSectionId':'section','anchorQuote':'Original narration','anchorFrom':0,'anchorTo':18})
 seed('CodeReview',{'id':'code','title':'Pasted draft','code':'<p>Pasted proof</p>'})
 seed('CodeReviewNote',{'id':'code-note','reviewId':'code','body':'Use a clear heading','authorId':'u-one','authorName':'Reviewer One'})
 seed('DesignProject',{'id':'project','name':'Symposium print assets','approverId':'u-one'})
 seed('DesignArtwork',{'id':'art','projectId':'project','title':'Poster','pages':[{'key':'poster-v1','w':1200,'h':800}],'sourceName':'poster.png'})
 seed('DesignPin',{'id':'pin','artworkId':'art','authorId':'u-one','authorName':'Reviewer One','body':'Use a group photo','page':0,'x':0.2,'y':0.7})
 seed('DesignQuestion',{'id':'question','artworkId':'art','text':'Which layout works best?','options':['Wide','Narrow']})
 seed('SocialPost',{'id':'social','stream':'equip','kind':'launch','deadlineId':'cycle','key':'fixture-social','body':'Public copy','assetSpec':{'title':'Social proof'},'scheduledFor':'2026-12-01T15:00:00Z'})
 seed('NewsletterCycle',{'id':'cycle','month':'2026-11-01','draftOpen':'2026-11-01','draftDue':'2026-11-02','buildStart':'2026-11-03','approvalDue':'2026-11-04','sendDate':'2026-11-05','issueId':'issue'})
 for migration_path in registry['captureMigrations']:run(Path(migration_path).read_text())
 installed={row['table_name'] for row in query("SELECT c.relname AS table_name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgname='bhn_feedback_history' AND NOT t.tgisinternal")}
 assert installed==expected_sources, 'Capture registry and installed triggers differ: '+str(installed^expected_sources)
 assert run('SELECT detail FROM "ReviewFeedbackMemory" WHERE id='+q(legacy_id))=='{"existing":"must survive"}'
 for model,id in [('DesignPin','pin'),('CodeReviewNote','code-note'),('NewsletterComment','nl-note'),('ScriptComment','script-note')]:assert len(events(model,id))==1,(model,events(model,id))
 assert events('ScriptComment','script-note')[0]['detail']['source']['context']['scriptTitle']=='Opening script'
 assert events('DesignQuestion','question')[0]['detail']['signal']=='activity'
 run('UPDATE "PageReview" SET status=\'exported\',"updatedAt"=now() WHERE id=\'r-page\';');assert events('PageReview','r-page')[-1]['detail']['signal']=='activity'
 seed('PageReview',{'id':'r-newsletter-draft','title':'Newsletter draft','url':'/review-paste/newsletter-fixture','kind':'paste','round':2,'status':'pending','pastedHtml':'<p>Saved draft</p>'})
 before=events('PageReview','r-newsletter-draft');assert before[-1]['detail']['signal']=='activity';assert 'pending' in before[-1]['detail']['comment']['body']
 run('UPDATE "PageReview" SET status=\'open\',"updatedAt"=now() WHERE id=\'r-newsletter-draft\' AND round=2 AND status=\'pending\';')
 opened=events('PageReview','r-newsletter-draft');assert len(opened)==len(before)+1;assert opened[-1]['detail']['signal']=='activity';assert 'open' in opened[-1]['detail']['comment']['body'];assert run('SELECT round FROM "PageReview" WHERE id=\'r-newsletter-draft\'')=='2'
 pin=events('DesignPin','pin')[0]['detail'];assert pin['source']['context']['x']==0.2;assert pin['source']['context']['artworkTitle']=='Poster';assert pin['writer']['verified']
 run('UPDATE "DesignPin" SET body=\'Use a wider group photo\',"updatedAt"=now() WHERE id=\'pin\';')
 es=events('DesignPin','pin');assert len(es)==2;assert es[-1]['detail']['writer']['verified'] is False;assert es[-1]['detail']['writer']['name']=='Editor not recorded'
 run('UPDATE "DesignPin" SET status=\'resolved\',"updatedAt"=now() WHERE id=\'pin\';')
 assert events('DesignPin','pin')[-1]['detail']['signal']=='activity'
 seed('DesignAnswer',{'id':'answer','questionId':'question','userId':'u-one','userName':'Reviewer One','choice':'Wide','text':'Use readable headings'})
 answer=events('DesignAnswer','answer')[0]['detail'];assert answer['source']['context']['question']=='Which layout works best?';assert 'Wide' in answer['comment']['body']
 run('UPDATE "DesignArtwork" SET approval=\'approved\',"approvalNote"=\'Great contrast\',"approvalById"=\'u-one\',"approvalAt"=now() WHERE id=\'art\';')
 assert events('DesignArtwork','art')[-1]['detail']['comment']['body']=='Great contrast'
 run('UPDATE "DesignArtwork" SET approval=\'pending\',"approvalNote"=\'\',"approvalById"=NULL,"approvalAt"=NULL WHERE id=\'art\';')
 assert events('DesignArtwork','art')[-1]['detail']['signal']=='activity'
 seed('DesignReview',{'id':'seen','artworkId':'art','userId':'u-one','userName':'Reviewer One','viewedAt':'2026-11-24T20:00:00Z'})
 count=len(events('DesignReview','seen'));run('UPDATE "DesignReview" SET "viewedAt"=now() WHERE id=\'seen\';');assert len(events('DesignReview','seen'))==count
 run('UPDATE "DesignReview" SET "okAt"=now() WHERE id=\'seen\';');assert events('DesignReview','seen')[-1]['detail']['signal']=='activity'
 run('UPDATE "SocialPost" SET status=\'approved\',"approvedById"=\'u-one\',"approvedAt"=now(),"updatedAt"=now() WHERE id=\'social\';');assert events('SocialPost','social')[-1]['detail']['signal']=='activity'
 count=len(events('SocialPost','social'));run('UPDATE "SocialPost" SET status=\'published\',"updatedAt"=now() WHERE id=\'social\';');assert len(events('SocialPost','social'))==count
 run('UPDATE "NewsletterCycle" SET status=\'approved\',"approvedById"=\'u-one\',"approvedByName"=\'Reviewer One\',"approvedAt"=now(),"approvalNote"=\'Keep the intro short\' WHERE id=\'cycle\';');assert events('NewsletterCycle','cycle')[-1]['detail']['signal']=='comment'
 run('UPDATE "NewsletterComment" SET body=\'Keep the intro shorter\',"editedById"=\'u-one\',"editedByName"=\'Reviewer One\',"editedAt"=now(),"updatedAt"=now() WHERE id=\'nl-note\';');assert events('NewsletterComment','nl-note')[-1]['detail']['writer']['verified']
 run('UPDATE "PageComment" SET body=\'Use consistent headings\',"editCount"=1,"editedById"=\'u-one\',"editedByName"=\'Reviewer One\',"editedAt"=now() WHERE id=\'page-note\';');pe=events('PageComment','page-note')[-1]['detail'];assert pe['review']['url']=='https://example.test/review';assert pe['comment']['anchorQuote']=='Original paragraph'
 direct_before=len(events('PageComment','page-note'))
 run('UPDATE "PageComment" SET body=\'Earlier wording returned\' WHERE id=\'page-note\';UPDATE "PageComment" SET body=\'Use consistent headings\' WHERE id=\'page-note\';')
 assert len(events('PageComment','page-note'))==direct_before+2
 options=query("SELECT DISTINCT ON (\"reviewId\") \"reviewId\" AS id,detail::jsonb->'review'->>'title' AS title FROM \"ReviewFeedbackMemory\" WHERE detail::jsonb->>'schema'='1' AND jsonb_typeof(detail::jsonb->'review'->'title')='string' ORDER BY \"reviewId\",\"recordedAt\" DESC,\"ReviewFeedbackMemory\".id DESC")
 assert {'r-page','design-project','code-code','video-video','newsletter-issue'} <= {row['id'] for row in options}
 before=int(run('SELECT count(*) FROM "ReviewFeedbackMemory";'));run('BEGIN;UPDATE "DesignPin" SET body=\'Never commit\',"updatedAt"=now() WHERE id=\'pin\';ROLLBACK;');assert int(run('SELECT count(*) FROM "ReviewFeedbackMemory";'))==before
 run('DELETE FROM "CodeReviewNote" WHERE id=\'code-note\';');assert events('CodeReviewNote','code-note')[-1]['detail']['event']=='deleted'
 run('DELETE FROM "DesignProject" WHERE id=\'project\';');deleted=events('DesignPin','pin')[-1]['detail'];assert deleted['event']=='deleted';assert deleted['review']['title']=='Symposium print assets';assert deleted['source']['context']['artworkTitle']=='Poster'
 for model in expected_sources:assert query("SELECT count(*)::int AS records FROM \"ReviewFeedbackMemory\" WHERE detail::jsonb->'source'->>'model'="+q(model))[0]['records']>0, 'Add a capture fixture/assertion for '+model
 print(json.dumps({'postgresql':'real','triggerSources':len(expected_sources),'baseline':True,'beforeAfter':True,'editorUncertainty':True,'artworkContext':True,'questionContext':True,'scriptContext':True,'roundActions':True,'decisionsSeparate':True,'viewsDeduplicated':True,'publishingExcluded':True,'legacyRowsPreserved':True,'rollbackAtomic':True,'cascadeContextPreserved':True,'urlSecretsRemoved':True,'directSqlReversionsPreserved':True}))
finally:
 run('DROP DATABASE IF EXISTS '+database+';','postgres')
