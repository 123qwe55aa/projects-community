import { NextRequest, NextResponse } from 'next/server';
import { deleteProject } from '@/db/helpers';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await deleteProject(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/projects]', err);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
