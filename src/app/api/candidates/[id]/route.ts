import { NextRequest, NextResponse } from 'next/server';
import { deleteCandidate } from '@/db/helpers';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await deleteCandidate(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/candidates]', err);
    return NextResponse.json({ error: 'Failed to delete candidate' }, { status: 500 });
  }
}
