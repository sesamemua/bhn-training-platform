/** Fail closed when new storage or review surfaces lack an explicit capture classification. */
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASELINE_HASH = '555c652062f5c5e803434c428e61b98e8f4cb530e68a3b65fa83608838f75164';
const reasoned = value => typeof value === 'string' && value.trim().length >= 20;
const quotedNames = value => [...value.matchAll(/'([A-Za-z][A-Za-z0-9_]*)'/g)].map(match=>match[1]);
export function isReviewSurface(path) {
  return /\/(?:page\.tsx|route\.(?:ts|js))$/.test(path) && path.split('/').some(segment=>segment.split(/[-_]/).some(word=>/^(?:review\w*|comment\w*|feedback\w*|approv\w*|notes?)$/i.test(word)));
}
export function validateReviewFeedbackCoverage({ schema, registry, migrations, fixture, surfaces }) {
  const errors = [];
  const models = new Set([...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map(match=>match[1]));
  const known = registry.knownNonContentModels ?? [];
  const sources = Object.keys(registry.sources ?? {});
  if (registry.version !== 1) errors.push('Unsupported review-feedback registry version.');
  if (createHash('sha256').update([...known].sort().join('\n')).digest('hex') !== BASELINE_HASH) errors.push('The non-content baseline is frozen. Classify future models with a source registration or a reasoned excludedModels entry.');
  if (sources.includes('ReviewFeedbackMemory')) errors.push('The feedback archive cannot capture itself recursively.');
  const installed = new Set();
  for (const migration of migrations) {
    for (const match of migration.matchAll(/FOREACH\s+source_name\s+IN\s+ARRAY\s+ARRAY\[([\s\S]*?)\]/gi)) for (const name of quotedNames(match[1])) installed.add(name);
    for (const match of migration.matchAll(/CREATE\s+TRIGGER\s+bhn_feedback_history\b[^;]*?\bON\s+"?([A-Za-z][A-Za-z0-9_]*)"?\s/gi)) installed.add(match[1]);
  }
  for (const model of models) {
    if (!(model in (registry.sources ?? {})) && !known.includes(model) && !reasoned(registry.excludedModels?.[model])) errors.push(`Unclassified model ${model}: register its content-review source or explain why it is outside this workflow.`);
  }
  for (const [model, reason] of Object.entries(registry.excludedModels ?? {})) {
    if (!models.has(model) || !reasoned(reason) || sources.includes(model)) errors.push(`Invalid or conflicting model exclusion: ${model}.`);
  }
  for (const model of sources) {
    if (!models.has(model)) errors.push(`Registered source ${model} is missing from the schema.`);
    if (!installed.has(model)) errors.push(`Registered source ${model} has no capture trigger in the listed capture migrations.`);
    if (!['comment','activity','mixed'].includes(registry.sources[model]?.evidence)) errors.push(`Source ${model} needs an evidence classification.`);
    const escaped = model.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if (!new RegExp(`seed\\(['"]${escaped}['"]`).test(fixture) || !new RegExp(`events\\(['"]${escaped}['"]`).test(fixture)) errors.push(`Source ${model} needs a seed and evidence assertion in the shared PostgreSQL fixture.`);
  }
  for (const model of installed) if (!sources.includes(model)) errors.push(`Capture trigger ${model} is not registered.`);
  for (const [name, workflow] of Object.entries(registry.workflows ?? {})) {
    if (!Array.isArray(workflow.sources) || (!workflow.sources.length && workflow.infrastructure !== true)) errors.push(`Workflow ${name} must declare its feedback sources.`);
    else for (const model of workflow.sources) if (!sources.includes(model)) errors.push(`Workflow ${name} uses unregistered feedback source ${model}.`);
  }
  for (const path of surfaces.filter(isReviewSurface)) {
    const surface = registry.surfaces?.[path];
    if (!surface) errors.push(`Unclassified review surface ${path}: bind it to a registered workflow or add a reasoned exclusion.`);
    else if (surface.workflow && !registry.workflows?.[surface.workflow]) errors.push(`Surface ${path} uses unknown workflow ${surface.workflow}.`);
    else if (!surface.workflow && !reasoned(surface.excluded)) errors.push(`Surface ${path} needs a workflow or a reasoned exclusion.`);
  }
  // Paused or retired surfaces may retain their historical classification; validate every current surface.
  return { ok: errors.length === 0, errors, models:models.size, sources:sources.length, reviewSurfaces:surfaces.filter(isReviewSurface).length };
}
/** Applied capture migrations remain immutable; future adapters belong in new migrations. */
export function validateAppliedCaptureMigrations(previousRegistry, previousMigrations, currentMigrations) {
  const errors=[];
  for(const path of previousRegistry.captureMigrations ?? []) {
    if(!(path in currentMigrations))errors.push(`Previously registered capture migration was removed: ${path}.`);
    else if(currentMigrations[path]!==previousMigrations[path])errors.push(`Applied capture migration changed: ${path}. Add a new capture migration instead.`);
  }
  return errors;
}
function appliedMigrationErrors(input, root, base) {
  if(!base||/^0+$/.test(base))return [];
  if(!/^[a-f0-9]{40}$/i.test(base))throw new Error('Feedback coverage base must be a commit SHA.');
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  git('cat-file','-e',base+'^{commit}');
  const path='config/review-feedback-sources.json';
  if(!git('ls-tree','--name-only',base,'--',path))return [];
  const previous=JSON.parse(git('show',base+':'+path));
  const before={},after=Object.fromEntries(input.registry.captureMigrations.map((file,index)=>[file,input.migrations[index]]));
  for(const file of previous.captureMigrations ?? []) {
    if(typeof file!=='string'||!/^prisma\/migrations\/[^/]+\/migration\.sql$/.test(file)||file.split('/').includes('..'))throw new Error('Invalid historical capture path.');
    before[file]=git('show',base+':'+file);
  }
  return validateAppliedCaptureMigrations(previous,before,after);
}
function files(directory, root) {
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const path=resolve(directory,entry.name);
    return entry.isDirectory()?files(path,root):entry.isFile()?[relative(root,path).split(sep).join('/')]:[];
  });
}
export function readReviewFeedbackInputs(root = process.cwd()) {
  const registry=JSON.parse(readFileSync(resolve(root,'config/review-feedback-sources.json'),'utf8'));
  function safeFile(path,pattern) {
    if(typeof path!=='string'||!pattern.test(path)||path.split('/').includes('..'))throw new Error('Invalid capture contract path.');
    return readFileSync(resolve(root,path),'utf8');
  }
  if (!Array.isArray(registry.captureMigrations) || !registry.captureMigrations.length) throw new Error('List the capture migrations.');
  return { schema:readFileSync(resolve(root,'prisma/schema.prisma'),'utf8'),registry,
    migrations:registry.captureMigrations.map(path=>safeFile(path,/^prisma\/migrations\/[^/]+\/migration\.sql$/)),
    fixture:safeFile(registry.integrationTest,/^tests\/integration\/[^/]+\.py$/),surfaces:files(resolve(root,'src/app'),root) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const input=readReviewFeedbackInputs();
    const result=validateReviewFeedbackCoverage(input);
    result.errors.push(...appliedMigrationErrors(input,process.cwd(),process.env.REVIEW_FEEDBACK_BASE_REF));result.ok=result.errors.length===0;
    if(!result.ok){for(const error of result.errors)process.stderr.write('Review feedback: '+error+'\n');process.exitCode=1;}
    else process.stdout.write(`Review feedback coverage OK: ${result.models} classified models, ${result.sources} capture sources, ${result.reviewSurfaces} classified review surfaces.\n`);
  } catch(error) {process.stderr.write('Review feedback coverage failed: '+error.message+'\n');process.exitCode=1;}
}
