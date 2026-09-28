import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { canRenderSocialLogo, findCompanyLogo } from "../../src/lib/social/company-logo";

test("only graphic-compatible logo hosts are offered as automatic logos", () => {
  assert.equal(canRenderSocialLogo("https://brand.r2.dev/logo.png"), true);
  assert.equal(canRenderSocialLogo("https://logo.clearbit.com/example.com"), true);
  assert.equal(canRenderSocialLogo("https://private.example.com/logo.png"), false);
  assert.equal(canRenderSocialLogo("http://127.0.0.1/logo.png"), false);
});

test("an approved event sponsor logo is preferred over a company profile", async () => {
  let companyLookups = 0;
  const prisma = {
    sponsor: { findMany: async () => [
      { name: "Example Labs, Inc.", logoUrl: "https://brand.r2.dev/example.png" },
    ] },
    company: { findFirst: async () => { companyLookups++; return null; } },
  } as unknown as PrismaClient;
  assert.equal(await findCompanyLogo(prisma, "event-1", "Example Labs"), "https://brand.r2.dev/example.png");
  assert.equal(companyLookups, 0);
});

test("an unsupported sponsor image falls back to a renderable company logo", async () => {
  const prisma = {
    sponsor: { findMany: async () => [
      { name: "Example Labs", logoUrl: "https://private.example.com/logo.png" },
    ] },
    company: { findFirst: async () => ({ logo: "https://logo.clearbit.com/example.com" }) },
  } as unknown as PrismaClient;
  assert.equal(await findCompanyLogo(prisma, "event-1", "Example Labs"), "https://logo.clearbit.com/example.com");
});
