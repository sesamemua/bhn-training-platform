import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SubmittedView } from "../../src/components/equip/SubmittedView";

test("submitted application values wrap unbroken text inside the card", () => {
  const unbroken = "a".repeat(500);
  const html = renderToStaticMarkup(
    React.createElement(SubmittedView, {
      application: {
        id: "application-id",
        stream: "venture_connect",
        status: "submitted",
        formData: {
          fullName: "Test Applicant",
          companyWebsite: unbroken,
          ventureDescription: unbroken,
          fundingJustification: unbroken,
        },
        requestedAmount: 1690,
        approvedAmount: null,
        reviewerNote: null,
        submittedAt: "2026-08-31T12:00:00.000Z",
        decidedAt: null,
        fundedAt: null,
        reviewer: null,
        userId: "user-id",
      },
    }),
  );

  assert.match(html, /\[overflow-wrap:anywhere\]/);
  assert.match(html, /whitespace-pre-wrap/);
  assert.match(html, /flex-1/);
  assert.ok(html.includes(unbroken));
});
