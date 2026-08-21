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

export function PublicForm({ slug, title, doc }: { slug: string; title: string; doc: BuiltForm }) {
  return (
    <FormFillView
      doc={doc}
      title={title}
      submit={async (answers) => submitPublicForm(slug, answers as Record<string, unknown>)}
    />
  );
}
