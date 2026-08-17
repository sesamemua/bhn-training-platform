-- Flow charts: hand-drawn process diagrams for the workspace.
--
-- Nodes and edges are one JSONB document rather than two tables. A chart is
-- edited as a whole — drag five boxes, redraw two arrows, save once — so
-- per-node rows would mean a write per drag and no cheap undo. The shape is
-- validated at the API boundary; the column itself stays opaque.

CREATE TABLE "FlowChart" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "data" JSONB NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowChart_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FlowChart_slug_key" ON "FlowChart"("slug");
CREATE INDEX "FlowChart_updatedAt_idx" ON "FlowChart"("updatedAt");
