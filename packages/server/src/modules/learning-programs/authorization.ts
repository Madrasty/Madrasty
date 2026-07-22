import { HttpError } from '../../lib/http-error';
import type { Actor, LessonVisibility, ProgramRecord, Viewer } from './types';

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

// Whether a viewer may see a lesson's full details (video/file URLs, etc.).
// Free lessons are open to everyone; the rest require a purchase (enrollment is
// not built yet, so hasPurchased is currently always false for the public).
export function canViewLessonDetails(
  visibility: LessonVisibility,
  opts: { ownerOrAdmin: boolean; hasPurchased: boolean },
): boolean {
  if (opts.ownerOrAdmin) return true;
  switch (visibility) {
    case 'free':
      return true;
    case 'paid':
    case 'locked':
    case 'prerequisite':
      return opts.hasPurchased;
    case 'invite_only':
      return false;
    default:
      return false;
  }
}
