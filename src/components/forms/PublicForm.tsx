"use client";

/**
 * The registrant-facing form, on the public page.
 *
 * A thin wrapper: everything is FormFillView, which is the same
 * component the coordinator previews in Admin. One implementation, so a
 * preview cannot be a different form from the real one.
 */
import { FormFillView } from "@/components/workspace/FormFillView";
import { submitPublicForm } from "@/app/apply/[slug]/actions";
import type { BuiltForm } from "@/lib/formbuilder/types";

export function PublicForm({ slug, title, doc, shut }: { slug: string; title: string; doc: BuiltForm; shut?: Record<string, { label: string; message: string }> }) {
  return (
    <FormFillView
      doc={doc}
      title={title}
      mode="live"
      shut={shut}
      submit={async (answers) => submitPublicForm(slug, answers as Record<string, unknown>)}
    />
  );
}
