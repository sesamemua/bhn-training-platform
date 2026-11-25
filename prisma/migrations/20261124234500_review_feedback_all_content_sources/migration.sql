BEGIN;

CREATE INDEX "ReviewFeedbackMemory_comment_context_idx" ON "ReviewFeedbackMemory" ((detail::jsonb->'comment'->>'id'));

-- Capture review evidence at the storage boundary, including writes outside the UI.
-- No source content is executed; URL credentials/query/fragment and document bytes are not retained.
CREATE FUNCTION bhn_review_feedback_snapshot(model_name TEXT, p JSONB, phase TEXT, action_name TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SET search_path = public, pg_temp SET TimeZone = 'UTC' AS $$
DECLARE
  ctx JSONB; old_extra JSONB; extra JSONB := '{}'::jsonb; parent JSONB; artwork JSONB; question JSONB;
  rid TEXT; title TEXT; link TEXT := ''; kind TEXT; doc TEXT; cid TEXT; body_text TEXT;
  author_id TEXT; author_name TEXT; writer_id TEXT; writer_name TEXT; verified BOOLEAN := false;
  round_no INTEGER := 1; signal_name TEXT := 'comment'; stamp TIMESTAMPTZ; recorded TIMESTAMPTZ := clock_timestamp();
  version_key TEXT; memory_id TEXT; saved JSONB; detail JSONB; source_id TEXT := p->>'id';
BEGIN
  IF source_id IS NULL THEN RETURN; END IF;
  cid := CASE WHEN model_name='PageComment' THEN source_id ELSE model_name||':'||source_id END;
  author_id := coalesce(p->>'authorUserId',p->>'authorId',p->>'userId',p->>'approvalById',p->>'approvedById');
  author_name := coalesce(p->>'authorName',p->>'userName',p->>'approvedByName');
  writer_id := coalesce(p->>'editedById',author_id);
  writer_name := coalesce(p->>'editedByName',author_name);
  stamp := coalesce((p->>'editedAt')::timestamptz,(p->>'approvalAt')::timestamptz,(p->>'approvedAt')::timestamptz,(p->>'updatedAt')::timestamptz,(p->>'okAt')::timestamptz,(p->>'viewedAt')::timestamptz,(p->>'requestedAt')::timestamptz,(p->>'createdAt')::timestamptz,recorded);
  round_no := coalesce((p->>'round')::integer,1);
  body_text := coalesce(p->>'body',p->>'text',p->>'approvalNote','');
  CASE model_name
  WHEN 'PageReview' THEN
    rid:=source_id;ctx:=jsonb_build_object('id',rid,'title',p->>'title','url',p->>'url','kind',p->>'kind','round',round_no);doc:=coalesce(p->>'pastedHtml',p->>'snapshotHtml');
    signal_name:='activity';body_text:='Review state: '||coalesce(p->>'status','open')||' · Round '||round_no::text;
    extra:=jsonb_build_object('status',p->>'status','round',round_no);writer_id:=NULL;writer_name:='Actor not recorded';
  WHEN 'ScriptComment' THEN
    SELECT to_jsonb(s) INTO artwork FROM "Script" s WHERE s.id=p->>'scriptId';
    SELECT to_jsonb(v) INTO parent FROM "VideoProject" v WHERE v.id=artwork->>'projectId';
    rid:='video-'||coalesce(artwork->>'projectId',p->>'scriptId');kind:='video-script';title:=coalesce(parent->>'title',artwork->>'title','Video script');link:='/admin/workspace/scripts/'||(p->>'scriptId');
    SELECT jsonb_build_object('script',artwork->'richContent','sections',jsonb_agg(jsonb_build_object('heading',s.heading,'body',s.body) ORDER BY s."order"))::text INTO doc FROM "ScriptSection" s WHERE s."scriptId"=p->>'scriptId';
    extra:=jsonb_build_object('scriptId',p->>'scriptId','scriptTitle',artwork->>'title','sectionId',p->>'anchorSectionId','from',p->'anchorFrom','to',p->'anchorTo');
  WHEN 'PageComment' THEN
    rid:=p->>'reviewId';
    SELECT jsonb_build_object('id',r.id,'title',r.title,'url',r.url,'kind',r.kind,'round',r.round),coalesce(r."pastedHtml",r."snapshotHtml") INTO ctx,doc FROM "PageReview" r WHERE r.id=rid;
  WHEN 'NewsletterComment' THEN
    rid:='newsletter-'||(p->>'issueId');kind:='newsletter';
    SELECT to_jsonb(n) INTO parent FROM "NewsletterIssue" n WHERE n.id=p->>'issueId';
    title:=coalesce(parent->>'title','Newsletter');doc:=parent->>'renderedHtml';link:='/admin/workspace/newsletter/'||(p->>'issueId');
    extra:=jsonb_build_object('pieceId',p->>'pieceId','anchorLabel',p->>'anchorLabel');
    SELECT r.round INTO round_no FROM "PageReview" r WHERE r.id=rid;round_no:=coalesce(round_no,1);
  WHEN 'CodeReviewNote' THEN
    rid:='code-'||(p->>'reviewId');kind:='pasted-content';
    SELECT to_jsonb(r) INTO parent FROM "CodeReview" r WHERE r.id=p->>'reviewId';
    title:=coalesce(parent->>'title','Pasted content');doc:=parent->>'code';link:='/admin/workspace/code-review';
    extra:=jsonb_build_object('anchorLabel',p->>'anchorLabel','contentKind',parent->>'kind');
  WHEN 'DesignPin','DesignAnswer','DesignArtwork','DesignReview','DesignQuestion' THEN
    IF model_name='DesignArtwork' THEN artwork:=p;
    ELSE
      IF model_name='DesignAnswer' THEN SELECT to_jsonb(q) INTO question FROM "DesignQuestion" q WHERE q.id=p->>'questionId'; END IF;
      SELECT to_jsonb(a) INTO artwork FROM "DesignArtwork" a WHERE a.id=coalesce(p->>'artworkId',question->>'artworkId');
    END IF;
    SELECT to_jsonb(d) INTO parent FROM "DesignProject" d WHERE d.id=artwork->>'projectId';
    rid:='design-'||coalesce(artwork->>'projectId',p->>'artworkId',source_id);kind:='design';title:=coalesce(parent->>'name',artwork->>'title','Design review');
    link:='/admin/workspace/design-review';round_no:=coalesce((p->>'round')::integer,(artwork->>'round')::integer,1);doc:=(artwork->'pages')::text;
    extra:=jsonb_build_object('artworkId',artwork->>'id','artworkTitle',artwork->>'title','sourceName',artwork->>'sourceName','page',p->'page','x',p->'x','y',p->'y');
    IF model_name='DesignQuestion' THEN
      signal_name:='activity';body_text:='Review question: '||coalesce(p->>'text','');writer_id:=NULL;writer_name:=coalesce(p->>'createdByName','Question author not recorded');
      extra:=extra||jsonb_build_object('question',p->>'text','options',p->'options');
    ELSIF model_name='DesignAnswer' THEN
      body_text:=concat_ws(E'\n',nullif(p->>'choice',''),nullif(p->>'text',''));
      extra:=extra||jsonb_build_object('questionId',p->>'questionId','question',question->>'text','choice',p->>'choice');
    ELSIF model_name='DesignArtwork' THEN
      IF coalesce(body_text,'')='' THEN
        IF coalesce(p->>'approval','pending')='pending' AND p->>'approvalAt' IS NULL AND action_name IS NULL THEN RETURN; END IF;
        signal_name:='activity';body_text:='Review decision: '||coalesce(p->>'approval','pending');
      END IF;
      extra:=extra||jsonb_build_object('approval',p->>'approval','approvalAt',p->>'approvalAt');
    ELSIF model_name='DesignReview' THEN
      IF p->>'okAt' IS NULL AND p->>'viewedAt' IS NULL AND p->>'requestedAt' IS NULL THEN RETURN; END IF;
      signal_name:='activity';
      body_text:='Review action: '||coalesce(action_name,CASE WHEN p->>'okAt' IS NOT NULL THEN 'marked OK' WHEN p->>'viewedAt' IS NOT NULL THEN 'viewed' ELSE 'review requested' END);
      extra:=extra||jsonb_build_object('viewedAt',p->>'viewedAt','okAt',p->>'okAt','requestedAt',p->>'requestedAt','requestedByName',p->>'requestedByName');
      IF action_name='requested' THEN writer_id:=NULL;writer_name:=coalesce(p->>'requestedByName','Requester not recorded'); END IF;
    END IF;
  WHEN 'SocialPost' THEN
    IF p->>'approvedAt' IS NULL AND action_name IS NULL THEN RETURN; END IF;
    rid:='social-copy-'||source_id;kind:='social';title:=coalesce(p->'assetSpec'->>'title','Social post');doc:=p->>'body';
    link:='/review/social/'||source_id;round_no:=coalesce((p->>'editVersion')::integer,0)+1;
    SELECT r.round INTO round_no FROM "PageReview" r WHERE r.id=rid;round_no:=coalesce(round_no,1);
    signal_name:='activity';body_text:='Review decision: '||coalesce(action_name,p->>'status');
    extra:=jsonb_build_object('stream',p->>'stream','status',p->>'status','approvedAt',p->>'approvedAt');
  WHEN 'NewsletterCycle' THEN
    IF p->>'approvedAt' IS NULL AND coalesce(body_text,'')='' AND action_name IS NULL THEN RETURN; END IF;
    rid:=CASE WHEN p->>'issueId' IS NOT NULL THEN 'newsletter-'||(p->>'issueId') ELSE 'newsletter-cycle-'||source_id END;kind:='newsletter';title:='Newsletter · '||coalesce(p->>'month','cycle');link:='/admin/workspace/newsletter';
    IF p->>'issueId' IS NOT NULL THEN SELECT to_jsonb(n) INTO parent FROM "NewsletterIssue" n WHERE n.id=p->>'issueId';title:=coalesce(parent->>'title',title);doc:=parent->>'renderedHtml'; END IF;
    IF coalesce(body_text,'')='' THEN signal_name:='activity';body_text:='Review decision: '||coalesce(p->>'status','approved'); END IF;
    extra:=jsonb_build_object('cycleId',source_id,'month',p->>'month','status',p->>'status','approvedAt',p->>'approvedAt');
  ELSE RAISE EXCEPTION 'Unsupported review feedback source: %',model_name;
  END CASE;
  IF body_text IS NULL OR btrim(body_text)='' THEN RETURN; END IF;
  -- Reuse copied context when a cascading parent deletion has already removed the source row.
  IF ctx IS NULL AND (title IS NULL OR parent IS NULL) THEN
    SELECT h.detail::jsonb->'review', h.detail::jsonb->'source'->'context' INTO ctx,old_extra FROM "ReviewFeedbackMemory" h
      WHERE h.detail::jsonb->'comment'->>'id'=cid ORDER BY h."recordedAt" DESC LIMIT 1;
  END IF;
  extra:=coalesce(old_extra,'{}'::jsonb)||jsonb_strip_nulls(extra)||jsonb_build_object('roundRecorded',p->>'round' IS NOT NULL OR artwork->>'round' IS NOT NULL);
  ctx:=coalesce(ctx,jsonb_build_object('id',rid,'title',coalesce(title,'Review'),'url',link,'kind',coalesce(kind,'review'),'round',round_no));
  rid:=coalesce(ctx->>'id',rid,model_name||':'||source_id);
  link:=coalesce(ctx->>'url',link,'');
  IF link~'^https?://' THEN link:=regexp_replace(regexp_replace(link,'[?#].*$',''),'^(https?://)[^/@]+@','\1'); ELSIF link!~'^/' THEN link:=''; END IF;
  ctx:=ctx||jsonb_build_object('id',rid,'url',link,'revision',CASE WHEN doc IS NOT NULL THEN encode(sha256(convert_to(doc,'UTF8')),'hex') ELSE ctx->>'revision' END);
  author_name:=coalesce(author_name,(SELECT name FROM "User" WHERE id=author_id),'Reviewer not recorded');
  writer_name:=coalesce(writer_name,(SELECT name FROM "User" WHERE id=writer_id),author_name);
  IF p->>'_editorUnknown'='true' THEN writer_id:=NULL;writer_name:='Editor not recorded'; END IF;
  SELECT EXISTS(SELECT 1 FROM "User" WHERE id=writer_id) INTO verified;
  IF model_name='PageComment' AND p->>'authorKind'<>'user' AND p->>'editedById' IS NULL THEN verified:=false; END IF;
  IF action_name IN ('resolved','reopened','not proceeding','target updated') THEN
    signal_name:='activity';body_text:='Review action: '||action_name;
    extra:=extra||jsonb_build_object('requestBody',coalesce(p->>'body',p->>'text'));
    writer_id:=p->>'resolvedById';writer_name:=coalesce((SELECT name FROM "User" WHERE id=writer_id),'Reviewer not recorded');verified:=EXISTS(SELECT 1 FROM "User" WHERE id=writer_id);
  END IF;
  saved:=jsonb_build_object('id',cid,'body',body_text,'round',round_no,'parentId',p->>'parentId','authorUserId',author_id,'authorName',author_name,'authorKind',CASE WHEN EXISTS(SELECT 1 FROM "User" WHERE id=author_id) THEN 'user' ELSE 'unverified' END,
    'createdAt',to_char(coalesce((p->>'createdAt')::timestamptz,stamp) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'editedAt',CASE WHEN p->>'editedAt' IS NOT NULL THEN to_char((p->>'editedAt')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') ELSE NULL END,
    'editedById',p->>'editedById','editedByName',p->>'editedByName','editCount',coalesce((p->>'editCount')::integer,0),'status',coalesce(p->>'status',p->>'approval','open'),
    'anchorQuote',coalesce(p->>'anchorQuote',question->>'text'),'anchorKey',coalesce(p->>'anchorKey',p->>'pieceId',p->>'artworkId'),'anchorPath',coalesce(p->>'anchorPath',p->>'cssPath'),
    'anchorBlock',coalesce(p->>'anchorBlock',p->>'anchorLabel',CASE WHEN p->>'page' IS NOT NULL THEN 'Artwork page '||((p->>'page')::integer+1)::text ELSE artwork->>'title' END));
  IF phase='edited' AND p->>'_observedAt' IS NOT NULL THEN stamp:=(p->>'_observedAt')::timestamptz; END IF;
  IF signal_name='activity' THEN stamp:=coalesce((p->>'_actionAt')::timestamptz,stamp); END IF;
  IF model_name='PageComment' AND signal_name='comment' THEN
    version_key:='v'||coalesce(p->>'editCount','0')||':'||substring(encode(sha256(convert_to(body_text,'UTF8')),'hex'),1,24);
    IF p->>'_revisionFallback' IS NOT NULL AND EXISTS(SELECT 1 FROM "ReviewFeedbackMemory" WHERE id='review-feedback:'||cid||':'||version_key) THEN version_key:=version_key||':observed:'||(p->>'_revisionFallback'); END IF;
  ELSIF signal_name='comment' THEN
    version_key:='v'||substring(encode(sha256(convert_to(concat_ws('|',body_text,p->>'updatedAt',p->>'editedAt',p->>'approvalAt',p->>'approvedAt',p->>'_revisionFallback'),'UTF8')),'hex'),1,24);
  ELSE
    version_key:='v'||substring(encode(sha256(convert_to(concat_ws('|',body_text,p->>'updatedAt',p->>'editedAt',p->>'okAt',p->>'viewedAt',p->>'requestedAt',p->>'approvalAt',p->>'approvedAt',action_name,p->>'_actionAt'),'UTF8')),'hex'),1,24);
  END IF;
  IF phase='baseline' AND EXISTS(SELECT 1 FROM "ReviewFeedbackMemory" h WHERE h.detail::jsonb->'comment'->>'id'=cid AND h.detail::jsonb->'comment'->>'body'=body_text AND h.detail::jsonb->'comment'->>'round'=round_no::text) THEN RETURN; END IF;
  memory_id:='review-feedback:'||cid||':'||version_key||CASE WHEN phase='deleted' THEN ':deleted' ELSE '' END;
  detail:=jsonb_build_object('schema',1,'event',phase,'signal',signal_name,
    'recordedAt',to_char(recorded AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'occurredAt',to_char((CASE WHEN phase='deleted' THEN recorded ELSE stamp END) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'review',ctx,'comment',saved,'writer',jsonb_build_object('id',writer_id,'name',writer_name,'verified',verified),
    'actor',CASE WHEN phase IN ('baseline','deleted') THEN jsonb_build_object('id',NULL,'name',CASE WHEN phase='baseline' THEN 'Source baseline capture' ELSE 'Deletion actor not recorded' END,'verified',false) ELSE jsonb_build_object('id',writer_id,'name',writer_name,'verified',verified) END,
    'source',jsonb_build_object('model',model_name,'id',source_id,'action',action_name,'context',extra));
  INSERT INTO "ReviewFeedbackMemory"(id,"reviewId",event,"occurredAt",detail)
    VALUES(memory_id,rid,phase,CASE WHEN phase='deleted' THEN recorded ELSE stamp END,detail::text) ON CONFLICT(id) DO NOTHING;
END;
$$;

CREATE FUNCTION bhn_capture_review_feedback() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp SET TimeZone = 'UTC' AS $$
DECLARE old_data JSONB; new_data JSONB; action_name TEXT; relevant BOOLEAN:=true;
BEGIN
  IF TG_OP<>'INSERT' THEN old_data:=to_jsonb(OLD); END IF;
  IF TG_OP<>'DELETE' THEN new_data:=to_jsonb(NEW); END IF;
  IF TG_TABLE_NAME='PageReview' THEN
    relevant:=TG_OP<>'UPDATE' OR (old_data->'status',old_data->'round') IS DISTINCT FROM (new_data->'status',new_data->'round');
  ELSIF TG_TABLE_NAME='DesignArtwork' THEN
    relevant:=TG_OP<>'UPDATE' OR (old_data->'approval',old_data->'approvalNote',old_data->'approvalById',old_data->'approvalAt') IS DISTINCT FROM (new_data->'approval',new_data->'approvalNote',new_data->'approvalById',new_data->'approvalAt');
    IF TG_OP='UPDATE' AND old_data->'approval' IS DISTINCT FROM new_data->'approval' THEN action_name:=CASE WHEN new_data->>'approval'='pending' THEN 'approval withdrawn' ELSE new_data->>'approval' END; END IF;
  ELSIF TG_TABLE_NAME='DesignReview' AND TG_OP='UPDATE' THEN
    IF old_data->'okAt' IS DISTINCT FROM new_data->'okAt' THEN action_name:=CASE WHEN new_data->>'okAt' IS NULL THEN 'OK withdrawn' ELSE 'marked OK' END;
    ELSIF old_data->'requestedAt' IS DISTINCT FROM new_data->'requestedAt' THEN action_name:='requested';
    ELSIF old_data->>'viewedAt' IS NULL AND new_data->>'viewedAt' IS NOT NULL THEN action_name:='viewed';
    ELSE relevant:=false; END IF;
  ELSIF TG_TABLE_NAME='SocialPost' THEN
    relevant:=TG_OP<>'UPDATE' OR (old_data->'approvedAt',old_data->'approvedById') IS DISTINCT FROM (new_data->'approvedAt',new_data->'approvedById') OR (old_data->>'status'='approved' AND new_data->>'status'='draft');
    IF TG_OP='UPDATE' AND old_data->>'approvedAt' IS NOT NULL AND new_data->>'approvedAt' IS NULL THEN action_name:='approval withdrawn'; END IF;
  ELSIF TG_TABLE_NAME='NewsletterCycle' THEN
    relevant:=TG_OP<>'UPDATE' OR (old_data->'approvedAt',old_data->'approvedById',old_data->'approvalNote') IS DISTINCT FROM (new_data->'approvedAt',new_data->'approvedById',new_data->'approvalNote');
  END IF;
  IF NOT relevant THEN RETURN NULL; END IF;
  IF TG_OP='INSERT' THEN PERFORM bhn_review_feedback_snapshot(TG_TABLE_NAME,new_data,'created');
  ELSIF TG_OP='DELETE' THEN
    PERFORM bhn_review_feedback_snapshot(TG_TABLE_NAME,old_data,'baseline');
    PERFORM bhn_review_feedback_snapshot(TG_TABLE_NAME,old_data,'deleted');
  ELSE
    IF (old_data-'updatedAt')=(new_data-'updatedAt') THEN RETURN NULL; END IF;
    PERFORM bhn_review_feedback_snapshot(TG_TABLE_NAME,old_data,'baseline');
    IF TG_TABLE_NAME IN ('PageComment','NewsletterComment','CodeReviewNote','DesignPin','ScriptComment') AND old_data->'body' IS NOT DISTINCT FROM new_data->'body' AND old_data->'status' IS DISTINCT FROM new_data->'status' THEN
      action_name:=CASE WHEN new_data->>'status'='open' THEN 'reopened' WHEN new_data->>'status'='resolved' THEN 'resolved' ELSE 'not proceeding' END;
    ELSIF TG_TABLE_NAME='PageComment' AND old_data->'body' IS NOT DISTINCT FROM new_data->'body' AND (old_data->'anchorQuote',old_data->'anchorKey',old_data->'anchorPath',old_data->'anchorBlock') IS DISTINCT FROM (new_data->'anchorQuote',new_data->'anchorKey',new_data->'anchorPath',new_data->'anchorBlock') THEN
      action_name:='target updated';
    ELSIF TG_TABLE_NAME IN ('CodeReviewNote','DesignPin','ScriptComment') OR (TG_TABLE_NAME IN ('PageComment','NewsletterComment') AND old_data->'body' IS DISTINCT FROM new_data->'body' AND old_data->'editedAt' IS NOT DISTINCT FROM new_data->'editedAt') THEN
      new_data:=new_data||'{"_editorUnknown":true}'::jsonb;
    END IF;
    new_data:=new_data||jsonb_build_object('_observedAt',clock_timestamp());
    IF (old_data->'body',old_data->'text',old_data->'choice') IS DISTINCT FROM (new_data->'body',new_data->'text',new_data->'choice') AND (old_data->'editedAt',old_data->'updatedAt',old_data->'editCount') IS NOT DISTINCT FROM (new_data->'editedAt',new_data->'updatedAt',new_data->'editCount') THEN new_data:=new_data||jsonb_build_object('_revisionFallback',md5(clock_timestamp()::text||random()::text)); END IF;
    IF action_name IS NOT NULL THEN new_data:=new_data||jsonb_build_object('_actionAt',clock_timestamp()); END IF;
    PERFORM bhn_review_feedback_snapshot(TG_TABLE_NAME,new_data,'edited',action_name);
  END IF;
  RETURN NULL;
END;
$$;

DO $$ DECLARE source_name TEXT; row_data JSONB; BEGIN
  FOREACH source_name IN ARRAY ARRAY['PageReview','PageComment','NewsletterComment','CodeReviewNote','DesignPin','DesignAnswer','DesignQuestion','DesignArtwork','DesignReview','SocialPost','NewsletterCycle','ScriptComment'] LOOP
    EXECUTE format('CREATE TRIGGER bhn_feedback_history AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION bhn_capture_review_feedback()',source_name);
    FOR row_data IN EXECUTE format('SELECT to_jsonb(s) FROM %I s',source_name) LOOP
      PERFORM bhn_review_feedback_snapshot(source_name,row_data,'baseline');
    END LOOP;
  END LOOP;
END; $$;

COMMIT;
