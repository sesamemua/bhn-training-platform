import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  capWords,
  FourDigitDateInput,
  VentureConnectInstitutionSelect,
  normalizeFourDigitDate,
} from "../../src/components/equip/ConnectForm";
import {
  LiftDocumentTray,
  VENTURE_CONNECT_KINDS,
} from "../../src/components/equip/LiftDocumentTray";
import { INSTITUTIONS } from "../../src/lib/equip/institutions";
import { validateVentureConnect } from "../../src/lib/equip/submit-validation";
import type { EquipDocument, VentureConnectFormData } from "../../src/lib/equip/types";

const attachedDocument: EquipDocument = {
  key: "equip/test/pitch-deck.pdf",
  name: "pitch-deck.pdf",
  size: 1024,
  contentType: "application/pdf",
  kind: "pitch_deck",
  uploadedAt: "2026-08-31T12:00:00.000Z",
};

test("VentureConnect institution dropdown includes all 41 partners", () => {
  const html = renderToStaticMarkup(
    React.createElement(VentureConnectInstitutionSelect, { value: "", onChange: () => {} }),
  );
  assert.equal(INSTITUTIONS.length, 41);
  assert.equal((html.match(/<option/g) ?? []).length, 42, "41 institutions plus the prompt");
  assert.match(html, /University of British Columbia/);
  assert.match(html, /University of Toronto/);
  assert.match(html, /Memorial University/);
});

test("date controls constrain the browser to a four-digit year", () => {
  const html = renderToStaticMarkup(
    React.createElement(FourDigitDateInput, { value: "2026-08-31", onChange: () => {} }),
  );
  assert.match(html, /min="1000-01-01"/);
  assert.match(html, /max="9999-12-31"/);
  assert.equal(normalizeFourDigitDate("123456-08-31"), "1234-08-31");
  assert.equal(normalizeFourDigitDate("2026-08-31"), "2026-08-31");
});

test("server validation rejects an extended year", () => {
  const valid: VentureConnectFormData = {
    fullName: "Alex Chen",
    institutionAffiliation: "University of Toronto",
    departmentProgram: "Biochemistry",
    currentRole: "phd_student",
    graduationDate: "2027-06-30",
    institutionEmail: "alex@example.com",
    companyName: "Example Bio",
    companyRole: "Co-founder & CTO",
    hasBiomanufacturingOrHumanHealthApplication: true,
    ventureDescription: "A sufficiently detailed venture description for validation.",
    ip: {
      provisionalPatentChecked: true,
      provisionalPatentDate: "2026-08-31",
    },
    fundingJustification: "A sufficiently detailed funding justification for validation.",
    eventCategory: "conference",
    eventName: "Life Sciences Summit",
    eventLocation: "Toronto",
    eventDates: "14-16 October 2026",
    budgetRegistration: 500,
    supportingDocs: ["pitch_deck"],
    acknowledged: true,
    signaturePrintedName: "Alex Chen",
    signatureDate: "2026-08-31",
  };
  assert.deepEqual(validateVentureConnect(valid, [attachedDocument]), []);
  assert.match(
    validateVentureConnect(
      { ...valid, signatureDate: "123456-08-31" },
      [attachedDocument],
    ).join(" "),
    /four-digit year/,
  );
});

test("venture description input is capped at 500 words", () => {
  const overLimit = Array.from({ length: 501 }, (_, index) => `word${index}`).join(" ");
  const capped = capWords(overLimit, 500);
  assert.equal(capped.split(/\s+/).length, 500);
  assert.equal(capped.endsWith("word499"), true);
});

test("server validation requires the new VentureConnect fields and documents", () => {
  const incomplete: VentureConnectFormData = {
    fullName: "Alex Chen",
    institutionAffiliation: "University of Toronto",
    departmentProgram: "Biochemistry",
    currentRole: "phd_student",
    institutionEmail: "alex@example.com",
    companyName: "Example Bio",
    ventureDescription: Array.from({ length: 501 }, () => "venture").join(" "),
    eventCategory: "conference",
    eventName: "Life Sciences Summit",
    eventLocation: "Toronto",
    eventDates: "14-16 October 2026",
    budgetRegistration: 500,
    acknowledged: true,
    signaturePrintedName: "Alex Chen",
    signatureDate: "2026-08-31",
  };

  const errors = validateVentureConnect(incomplete, []).join("\n");
  assert.match(errors, /Graduation Date is required/);
  assert.match(errors, /Role with the Company is required/);
  assert.match(errors, /biomanufacturing \/ human health/);
  assert.match(errors, /500-word limit/);
  assert.match(errors, /Funding Request Justification is required/);
  assert.match(errors, /select at least one status/);
  assert.match(errors, /select at least one item/);
  assert.match(errors, /attach at least one file/);
});

test("each selected intellectual property status requires a date", () => {
  const errors = validateVentureConnect(
    {
      ip: { fullPatentChecked: true },
    },
    [attachedDocument],
  ).join("\n");
  assert.match(errors, /Full patent date is required/);
});

test("attachment slots visibly support drag and drop", () => {
  const html = renderToStaticMarkup(
    React.createElement(LiftDocumentTray, {
      applicationId: "draft-token",
      documents: [],
      onChange: () => {},
      endpointBase: "/api/public/equip",
    }),
  );
  assert.equal((html.match(/Drag and drop or click to browse/g) ?? []).length, 4);
});

test("VentureConnect has one clear supporting-document drop zone", () => {
  const html = renderToStaticMarkup(
    React.createElement(LiftDocumentTray, {
      applicationId: "draft-token",
      documents: [],
      onChange: () => {},
      endpointBase: "/api/public/equip",
      kinds: VENTURE_CONNECT_KINDS,
      title: "Upload supporting files",
      embedded: true,
    }),
  );
  assert.equal((html.match(/Drag and drop or click to browse/g) ?? []).length, 1);
  assert.match(html, /Upload supporting files/);
  assert.match(html, /PDF, Word, Excel, JPG or PNG/);
  assert.doesNotMatch(html, /Prototype photo|Video pitch|Recommendation/);
});
