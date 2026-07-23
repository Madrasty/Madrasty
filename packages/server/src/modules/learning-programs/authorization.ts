import { HttpError } from '../../lib/http-error';
import type { Actor, ProgramRecord, Viewer } from './types';

// Only the owning teacher or an admin may edit a program (and, transitively, its
// chapters and lessons). RBAC is enforced here at the service layer, not the UI.
export function assertCanEditProgram(program: ProgramRecord, actor: Actor): void {
  if (actor.role === 'admin') return;
  if (actor.role === 'teacher' && program.teacherId === actor.id) return;
  throw HttpError.forbidden(
    'not_program_owner',
    'Only the owning teacher or an admin can edit this program.',
  );
}

export function isOwnerOrAdmin(program: ProgramRecord, viewer: Viewer): boolean {
  if (viewer.role === 'admin') return true;
  return viewer.role === 'teacher' && viewer.userId === program.teacherId;
}
