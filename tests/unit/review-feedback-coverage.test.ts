import assert from 'node:assert/strict';
import test from 'node:test';
import { readReviewFeedbackInputs, validateReviewFeedbackCoverage, validateAppliedCaptureMigrations, isReviewSurface } from '../../scripts/check-review-feedback.mjs';
const baseline=readReviewFeedbackInputs(process.cwd());
const fixture=()=>structuredClone(baseline);
test('current schema, workflows, capture migrations and fixture coverage are registered',()=>{
 const result=validateReviewFeedbackCoverage(fixture());assert.equal(result.ok,true,result.errors.join('\n'));assert.equal(result.sources,12);
});
test('a future model cannot silently bypass feedback classification',()=>{
 const input=fixture();input.schema+='\nmodel FutureReviewNote {\n id String @id\n body String\n}\n';
 const result=validateReviewFeedbackCoverage(input);assert.equal(result.ok,false);assert(result.errors.some(e=>e.includes('Unclassified model FutureReviewNote')));
});
test('new storage must include a capture migration and real fixture declaration',()=>{
 const input=fixture();input.schema+='\nmodel FutureReviewNote {\n id String @id\n}\n';input.registry.sources.FutureReviewNote={evidence:'comment'};
 const result=validateReviewFeedbackCoverage(input);assert(result.errors.some(e=>e.includes('FutureReviewNote has no capture trigger')));assert(result.errors.some(e=>e.includes('FutureReviewNote needs a seed')));
});
test('a fully registered future source passes the static gate and joins the shared database-test source set',()=>{
 const input=fixture();input.schema+='\nmodel FutureReviewNote {\n id String @id\n}\n';input.registry.sources.FutureReviewNote={evidence:'comment'};
 input.migrations.push('CREATE TRIGGER bhn_feedback_history AFTER INSERT ON "FutureReviewNote" FOR EACH ROW EXECUTE FUNCTION bhn_capture_review_feedback();');
 input.fixture+="\nseed('FutureReviewNote', {});events('FutureReviewNote','fixture')\n";
 const result=validateReviewFeedbackCoverage(input);assert.equal(result.ok,true,result.errors.join('\n'));assert.equal(result.sources,13);
});
test('an unregistered future review interface fails even when it reuses existing storage',()=>{
 const input=fixture();const path='src/app/review/future/page.tsx';input.surfaces.push(path);
 assert(validateReviewFeedbackCoverage(input).errors.some(e=>e.includes('Unclassified review surface '+path)));
 input.registry.surfaces[path]={workflow:'page'};assert.equal(validateReviewFeedbackCoverage(input).ok,true);
});
test('new non-content models require an explicit reason and cannot be hidden in the frozen baseline',()=>{
 const input=fixture();input.schema+='\nmodel FutureInventoryItem {\n id String @id\n}\n';input.registry.knownNonContentModels.push('FutureInventoryItem');
 assert(validateReviewFeedbackCoverage(input).errors.some(e=>e.includes('baseline is frozen')));
 input.registry.knownNonContentModels.pop();input.registry.excludedModels.FutureInventoryItem='Inventory stock records; no reviewer comments or content-review decisions.';
 assert.equal(validateReviewFeedbackCoverage(input).ok,true);
 input.registry.excludedModels.FutureInventoryItem='skip';assert.equal(validateReviewFeedbackCoverage(input).ok,false);
});
test('missing registrations, unknown workflows, absent storage hooks and archive recursion fail closed',()=>{
 const missing=fixture();delete missing.registry.sources.DesignPin;assert.equal(validateReviewFeedbackCoverage(missing).ok,false);
 const unknown=fixture();unknown.registry.workflows.future={sources:['UnregisteredSource']};assert.equal(validateReviewFeedbackCoverage(unknown).ok,false);
 const hook=fixture();hook.migrations=hook.migrations.map(sql=>sql.replace("'CodeReviewNote','DesignPin','DesignAnswer'","'CodeReviewNote','DesignAnswer'"));assert(validateReviewFeedbackCoverage(hook).errors.some(e=>e.includes('DesignPin has no capture trigger')));
 const archive=fixture();archive.registry.sources.ReviewFeedbackMemory={evidence:'comment'};assert(validateReviewFeedbackCoverage(archive).errors.some(e=>e.includes('capture itself recursively')));
});
test('surface discovery catches review, comment, note and approval paths while leaving previews alone',()=>{
 for(const path of ['src/app/review/new/page.tsx','src/app/api/assets/comments/route.ts','src/app/api/assets/approval/route.ts','src/app/api/assets/notes/route.ts'])assert(isReviewSurface(path),path);
 assert.equal(isReviewSurface('src/app/api/assets/preview/route.ts'),false);
});

test('future adapters cannot rewrite or remove previously registered capture migrations',()=>{
 const previous={captureMigrations:['prisma/migrations/old/migration.sql']};const old={'prisma/migrations/old/migration.sql':'original SQL'};
 assert.deepEqual(validateAppliedCaptureMigrations(previous,old,{...old,'prisma/migrations/new/migration.sql':'new adapter'}),[]);
 assert.match(validateAppliedCaptureMigrations(previous,old,{'prisma/migrations/old/migration.sql':'rewritten SQL'})[0],/Applied capture migration changed/);
 assert.match(validateAppliedCaptureMigrations(previous,old,{})[0],/was removed/);
});
