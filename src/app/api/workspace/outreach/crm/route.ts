/**
 * Marketing CRM actions (admin-only). One endpoint, one `action` per call:
 *
 *   person.update     { id, lifecycle?, leadStatus?, ownerId? }
 *   person.import     { rows: values[], listId? }      → upsert by e-mail
 *   list.smart        { id?, name, filter }            → create / update a smart list
 *   task.create       { title, dueAt?, personId?, dealId?, assigneeId?, notes? }
 *   task.toggle       { id }    task.delete { id }
 *   deal.save         { id?, name, org?, amount?, stage?, closeDate?, personId?, ownerId?, notes? }
 *   deal.delete       { id }
 *   sequence.save     { id?, name, steps }   sequence.archive { id }
 *   sequence.enroll   { sequenceId, personIds }
 *   enrollment.send   { id }    enrollment.skip { id }    enrollment.stop { id }
 *   link.create       { label, url, source, medium, campaign, content? }   link.delete { id }
 *   campaign.test     { campaignId }                   → sends the campaign to yourself
 *   forms.capture     { slug, on }                     → opt a form in/out of adding contacts
 *
 * Sequence steps are sent by a person pressing Send on a due step — nothing
 * here mails anyone on a timer.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { mailConfigured, sendMail } from "@/lib/mail";
import { captureFormSlugs, crmActor, crmOwners } from "@/lib/outreach/crm-server";
import { emailKey } from "@/lib/outreach/directory";
import {
  CRM_CAPTURE_SETTING, advance, buildUtmUrl, dueAfter, isDealStage, isLeadStatus, isLifecycle, sanitizeFilter, sanitizeSteps, slugify,
} from "@/lib/outreach/crm";
import { checkRecipient, composeBody, unsubscribeUrl } from "@/lib/outreach/send";
import { findTemplate, resolveOutreachTemplate, getOutreachTemplateOverrides, resolveTemplates } from "@/lib/outreach/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = Record<string, unknown>;
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const date = (v: unknown) => {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const asValues = (v: unknown): Record<string, string> =>
  typeof v === "object" && v !== null ? (v as Record<string, string>) : {};

async function ownerFields(ownerId: unknown) {
  if (ownerId === null || ownerId === "") return { ownerId: null, ownerName: "" };
  if (typeof ownerId !== "string") return undefined;
  const o = (await crmOwners()).find((x) => x.id === ownerId);
  return o ? { ownerId: o.id, ownerName: o.name } : undefined;
}

export async function POST(req: NextRequest) {
  const me = await crmActor();
  if (!me) return bad("Forbidden", 403);
  const b = (await req.json().catch(() => ({}))) as Body;
  const origin = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;

  switch (b.action) {
    case "person.update": {
      const data: Prisma.OutreachPersonUpdateInput = {};
      if (b.lifecycle !== undefined) { if (!isLifecycle(b.lifecycle)) return bad("Unknown lifecycle stage."); data.lifecycle = b.lifecycle; }
      if (b.leadStatus !== undefined) { if (!isLeadStatus(b.leadStatus)) return bad("Unknown lead status."); data.leadStatus = b.leadStatus; }
      if (b.ownerId !== undefined) {
        const o = await ownerFields(b.ownerId);
        if (!o) return bad("That owner isn't on the team.");
        Object.assign(data, o);
      }
      await prisma.outreachPerson.update({ where: { id: str(b.id, 64) }, data });
      return NextResponse.json({ ok: true });
    }

    case "person.import": {
      if (!Array.isArray(b.rows) || b.rows.length === 0) return bad("No rows to import.");
      if (b.rows.length > 2000) return bad("Import up to 2,000 rows at a time.");
      const listId = str(b.listId, 64) || null;
      if (listId && !(await prisma.outreachList.findUnique({ where: { id: listId }, select: { id: true } }))) return bad("No such list.");
      const existing = await prisma.outreachPerson.findMany({ select: { id: true, values: true } });
      const byEmail = new Map(existing.map((p) => [emailKey(asValues(p.values).email), p] as const).filter(([k]) => k));
      let created = 0, updated = 0, skipped = 0;
      for (const raw of b.rows) {
        const v: Record<string, string> = {};
        for (const [k, val] of Object.entries(asValues(raw))) {
          if (/^[a-z0-9_-]{1,40}$/i.test(k) && typeof val === "string" && val.trim()) v[k] = val.trim().slice(0, 1000);
        }
        if (!v.name && !v.email && !v.org) { skipped++; continue; }
        const key = emailKey(v.email);
        const hit = key ? byEmail.get(key) : undefined;
        let personId: string;
        if (hit) {
          // Fill blanks only — an import never overwrites what the team typed.
          const cur = asValues(hit.values);
          const merged = { ...cur };
          for (const [k, val] of Object.entries(v)) if (!merged[k]?.trim()) merged[k] = val;
          await prisma.outreachPerson.update({ where: { id: hit.id }, data: { values: merged } });
          personId = hit.id; updated++;
        } else {
          const p = await prisma.outreachPerson.create({
            data: { values: v, addedById: me.id, addedByName: me.name, source: "import" },
            select: { id: true, values: true },
          });
          if (key) byEmail.set(key, p);
          personId = p.id; created++;
        }
        if (listId) {
          await prisma.outreachMembership.create({
            data: { listId, personId, values: {}, addedById: me.id, addedByName: me.name },
          }).catch(() => {});
        }
      }
      return NextResponse.json({ ok: true, created, updated, skipped });
    }

    case "list.smart": {
      const name = str(b.name, 120);
      const filter = sanitizeFilter(b.filter);
      if (!name) return bad("Give the smart list a name.");
      if (!filter) return bad("Set at least one filter first.");
      if (b.id) {
        await prisma.outreachList.update({ where: { id: str(b.id, 64) }, data: { name, filter: filter as Prisma.InputJsonValue } });
        return NextResponse.json({ ok: true });
      }
      const list = await prisma.outreachList.create({
        data: {
          name, filter: filter as Prisma.InputJsonValue, columns: [],
          order: await prisma.outreachList.count(), createdById: me.id,
          description: "Smart list — updates itself as contacts change.",
        },
        select: { id: true },
      });
      return NextResponse.json({ ok: true, id: list.id });
    }

    case "task.create": {
      const title = str(b.title, 200);
      if (!title) return bad("A task needs a title.");
      const assignee = b.assigneeId ? (await crmOwners()).find((o) => o.id === b.assigneeId) : null;
      const task = await prisma.outreachTask.create({
        data: {
          title, notes: str(b.notes, 2000), dueAt: date(b.dueAt),
          personId: str(b.personId, 64) || null, dealId: str(b.dealId, 64) || null,
          assigneeId: assignee?.id ?? me.id, assigneeName: assignee?.name ?? me.name, byName: me.name,
        },
      });
      return NextResponse.json({ ok: true, task });
    }
    case "task.toggle": {
      const t = await prisma.outreachTask.findUnique({ where: { id: str(b.id, 64) } });
      if (!t) return bad("No such task.", 404);
      await prisma.outreachTask.update({ where: { id: t.id }, data: { doneAt: t.doneAt ? null : new Date() } });
      return NextResponse.json({ ok: true });
    }
    case "task.delete":
      await prisma.outreachTask.delete({ where: { id: str(b.id, 64) } }).catch(() => null);
      return NextResponse.json({ ok: true });

    case "deal.save": {
      const name = str(b.name, 160);
      if (!b.id && !name) return bad("A deal needs a name.");
      if (b.stage !== undefined && !isDealStage(b.stage)) return bad("Unknown stage.");
      const amount = b.amount === undefined ? undefined : Math.max(0, Math.min(100_000_000, Math.round(Number(b.amount) || 0)));
      const owner = b.ownerId !== undefined ? await ownerFields(b.ownerId) : undefined;
      const data = {
        ...(name ? { name } : {}),
        ...(b.org !== undefined ? { org: str(b.org, 160) } : {}),
        ...(amount !== undefined ? { amount } : {}),
        ...(b.stage !== undefined ? { stage: b.stage as string } : {}),
        ...(b.closeDate !== undefined ? { closeDate: date(b.closeDate) } : {}),
        ...(b.personId !== undefined ? { personId: str(b.personId, 64) || null } : {}),
        ...(b.notes !== undefined ? { notes: str(b.notes, 4000) } : {}),
        ...(b.order !== undefined ? { order: Number(b.order) || 0 } : {}),
        ...(owner ?? {}),
      };
      if (b.id) {
        await prisma.outreachDeal.update({ where: { id: str(b.id, 64) }, data });
        return NextResponse.json({ ok: true });
      }
      const deal = await prisma.outreachDeal.create({ data: { name, ...data, ...(owner ? {} : { ownerId: me.id, ownerName: me.name }) } });
      return NextResponse.json({ ok: true, deal });
    }
    case "deal.delete":
      await prisma.outreachDeal.delete({ where: { id: str(b.id, 64) } }).catch(() => null);
      return NextResponse.json({ ok: true });

    case "sequence.save": {
      const name = str(b.name, 120);
      const steps = sanitizeSteps(b.steps);
      if (!name) return bad("Name the sequence.");
      if (!steps) return bad("Each step needs a subject, a body and a delay of 0–365 days (up to 10 steps).");
      const data = { name, steps: steps as unknown as Prisma.InputJsonValue };
      if (b.id) await prisma.outreachSequence.update({ where: { id: str(b.id, 64) }, data });
      else await prisma.outreachSequence.create({ data: { ...data, byName: me.name } });
      return NextResponse.json({ ok: true });
    }
    case "sequence.archive":
      await prisma.outreachSequence.update({ where: { id: str(b.id, 64) }, data: { archived: true } });
      await prisma.outreachEnrollment.updateMany({ where: { sequenceId: str(b.id, 64), status: "active" }, data: { status: "stopped" } });
      return NextResponse.json({ ok: true });
    case "sequence.enroll": {
      const seq = await prisma.outreachSequence.findUnique({ where: { id: str(b.sequenceId, 64) } });
      const steps = seq ? sanitizeSteps(seq.steps) : null;
      if (!seq || !steps || seq.archived) return bad("No such sequence.", 404);
      const ids = Array.isArray(b.personIds) ? b.personIds.filter((x): x is string => typeof x === "string").slice(0, 500) : [];
      if (!ids.length) return bad("Pick at least one contact.");
      const now = new Date();
      const res = await prisma.outreachEnrollment.createMany({
        data: ids.map((personId) => ({ sequenceId: seq.id, personId, step: 0, nextDueAt: dueAfter(now, steps[0].delayDays), byName: me.name })),
        skipDuplicates: true,
      });
      return NextResponse.json({ ok: true, enrolled: res.count, already: ids.length - res.count });
    }

    case "enrollment.send":
    case "enrollment.skip": {
      const en = await prisma.outreachEnrollment.findUnique({
        where: { id: str(b.id, 64) },
        include: { sequence: true, person: { select: { id: true, values: true, unsubscribedAt: true } } },
      });
      const steps = en ? sanitizeSteps(en.sequence.steps) : null;
      if (!en || !steps || en.status !== "active" || en.step >= steps.length) return bad("Nothing due on this enrolment.", 409);
      const step = steps[en.step];
      const next = advance(steps, en.step, new Date());
      // Claim the step first (compare-and-set on `step`) so a double-click can't send twice.
      const claimed = await prisma.outreachEnrollment.updateMany({ where: { id: en.id, step: en.step, status: "active" }, data: next });
      if (claimed.count === 0) return bad("Someone already handled this step.", 409);
      if (b.action === "enrollment.skip") return NextResponse.json({ ok: true, skipped: true });

      const v = asValues(en.person.values);
      const check = checkRecipient({ email: v.email, unsubscribedAt: en.person.unsubscribedAt, alreadySent: false });
      const undo = () => prisma.outreachEnrollment.update({ where: { id: en.id }, data: { step: en.step, nextDueAt: en.nextDueAt, status: "active" } });
      if (!check.ok) {
        if (check.reason === "unsubscribed") await prisma.outreachEnrollment.update({ where: { id: en.id }, data: { status: "stopped" } });
        else await undo();
        return bad(check.detail ?? "Can't email this contact.", 422);
      }
      if (!mailConfigured()) { await undo(); return bad("Email isn't configured on this deployment.", 503); }
      const { subject, body } = resolveOutreachTemplate(
        { id: "sequence", label: "", when: "", subject: step.subject, body: step.body },
        { firstName: (v.name ?? "").split(" ")[0], contactName: v.name ?? "", org: v.org ?? "", senderName: me.name },
      );
      try {
        await sendMail({
          to: v.email.trim(), subject, text: composeBody(body, unsubscribeUrl(origin, en.person.id)),
          replyTo: me.email ?? undefined, log: { kind: "outreach.sequence", byName: me.name },
        });
      } catch (err) {
        await undo();
        return bad(err instanceof Error ? err.message : "Send failed.", 502);
      }
      await prisma.outreachTouch.create({
        data: { personId: en.person.id, kind: "email", note: `Sequence “${en.sequence.name}” step ${en.step + 1} — ${subject}`, byId: me.id, byName: me.name },
      });
      return NextResponse.json({ ok: true, sent: true });
    }
    case "enrollment.stop":
      await prisma.outreachEnrollment.update({ where: { id: str(b.id, 64) }, data: { status: "stopped", nextDueAt: null } });
      return NextResponse.json({ ok: true });

    case "link.create": {
      const url = buildUtmUrl({ url: str(b.url, 2000), source: str(b.source, 80), medium: str(b.medium, 80), campaign: str(b.campaign, 120), content: str(b.content, 80) });
      if (!url) return bad("Enter a full web address starting with https://.");
      if (!str(b.source) || !str(b.medium) || !str(b.campaign)) return bad("Source, medium and campaign are all needed for a UTM link.");
      const stem = slugify(str(b.campaign, 120)) || "link";
      const slug = `${stem}-${randomBytes(3).toString("hex")}`;
      const link = await prisma.outreachLink.create({ data: { slug, url, label: str(b.label, 120), byName: me.name } });
      return NextResponse.json({ ok: true, link });
    }
    case "link.delete":
      await prisma.outreachLink.delete({ where: { id: str(b.id, 64) } }).catch(() => null);
      return NextResponse.json({ ok: true });

    case "campaign.test": {
      if (!me.email) return bad("Your account has no e-mail address.");
      if (!mailConfigured()) return bad("Email isn't configured on this deployment.", 503);
      const c = await prisma.outreachCampaign.findUnique({ where: { id: str(b.campaignId, 64) } });
      if (!c || !findTemplate(c.templateId)) return bad("No such campaign.", 404);
      const tpl = resolveTemplates(await getOutreachTemplateOverrides()).find((t) => t.id === c.templateId)!;
      const vars = asValues(c.vars);
      const { subject, body } = resolveOutreachTemplate(tpl, {
        ...vars, firstName: me.name.split(" ")[0], contactName: me.name, org: "Example Org", senderName: vars.senderName || me.name,
      });
      await sendMail({ to: me.email, subject: `[TEST] ${subject}`, text: composeBody(body, `${origin}/outreach/unsubscribe/test`), signature: false });
      return NextResponse.json({ ok: true, to: me.email });
    }
    case "forms.capture": {
      const slug = str(b.slug, 120);
      if (!slug || !(await prisma.eventForm.findUnique({ where: { slug }, select: { id: true } }))) return bad("No such form.", 404);
      const cur = new Set(await captureFormSlugs());
      if (b.on) cur.add(slug); else cur.delete(slug);
      const value = JSON.stringify([...cur]);
      await prisma.platformSetting.upsert({ where: { key: CRM_CAPTURE_SETTING }, update: { value }, create: { key: CRM_CAPTURE_SETTING, value } });
      return NextResponse.json({ ok: true });
    }
  }
  return bad("Unknown action.");
}
