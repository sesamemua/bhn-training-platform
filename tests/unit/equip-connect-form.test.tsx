import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  FourDigitDateInput,
  VentureConnectInstitutionSelect,
  normalizeFourDigitDate,
} from "../../src/components/equip/ConnectForm";
import { LiftDocumentTray } from "../../src/components/equip/LiftDocumentTray";
import { INSTITUTIONS } from "../../src/lib/equip/institutions";
import { validateVentureConnect } from "../../src/lib/equip/submit-validation";
import type { VentureConnectFormData } from "../../src/lib/equip/types";

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
    institutionEmail: "alex@example.com",
    companyName: "Example Bio",
    ventureDescription: "A sufficiently detailed venture description for validation.",
    fundingJustification: "A sufficiently detailed funding justification for validation.",
    eventCategory: "conference",
    eventName: "Life Sciences Summit",
    eventLocation: "Toronto",
    eventDates: "14-16 October 2026",
    budgetRegistration: 500,
    acknowledged: true,
    signaturePrintedName: "Alex Chen",
    signatureDate: "2026-08-31",
  };
  assert.deepEqual(validateVentureConnect(valid), []);
  assert.match(
    validateVentureConnect({ ...valid, signatureDate: "123456-08-31" }).join(" "),
    /four-digit year/,
  );
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
