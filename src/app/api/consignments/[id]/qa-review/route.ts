import { NextResponse } from "next/server";
import { query } from "@/lib/db";

interface QaReviewBody {
  reviewedBy: string;
}

// The paper form's "QA Review — By / Date" box: a lab QA sign-off on the
// whole consignment log, not a medic-signed custody event. Set once.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as QaReviewBody;

  if (!body.reviewedBy) {
    return NextResponse.json({ error: "Missing reviewedBy." }, { status: 400 });
  }

  const { rows } = await query<{ qa_reviewed_by: string | null }>(
    `SELECT qa_reviewed_by FROM consignments WHERE id = $1`,
    [id]
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "Consignment not found." }, { status: 404 });
  }
  if (rows[0].qa_reviewed_by) {
    return NextResponse.json({ error: "This consignment already has a QA review." }, { status: 409 });
  }

  await query(
    `UPDATE consignments SET qa_reviewed_by = $1, qa_reviewed_at = now() WHERE id = $2`,
    [body.reviewedBy, id]
  );

  return NextResponse.json({ ok: true });
}
