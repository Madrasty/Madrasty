import type { EnrollmentStore } from './learning-programs.repository';
import type { LessonRecord, Viewer } from './types';

export interface AccessContext {
  // The viewer is the owning teacher or an admin — sees everything.
  ownerOrAdmin: boolean;
  // The viewer has an active enrollment in the lesson's program.
  enrolled: boolean;
}

// Resolves whether a viewer may see a lesson's full details (video/file URLs).
// This replaces the old hardcoded hasPurchased=false: enrolment, prerequisite
// completion, and invite membership are now real per-student checks (doc 12 §5).
//
//   free          → open to everyone
//   paid          → requires an active enrollment
//   locked /
//   prerequisite  → enrolled AND the prerequisite lesson has a completed_at row
//                   for this student (doc 12 §5 "Locked until … / Prerequisite")
//   invite_only   → the student is on the lesson's explicit invite list
//
// A `locked`/`prerequisite` lesson with no prerequisite_lesson_id set can never
// unlock through completion, so it stays locked — that's a misconfiguration the
// authoring UI should prevent, not something we silently treat as `paid`.
export async function resolveLessonAccess(
  store: EnrollmentStore,
  lesson: LessonRecord,
  viewer: Viewer,
  ctx: AccessContext,
): Promise<boolean> {
  if (ctx.ownerOrAdmin) return true;

  switch (lesson.visibility) {
    case 'free':
      return true;
    case 'paid':
      return ctx.enrolled;
    case 'locked':
    case 'prerequisite': {
      if (!ctx.enrolled || !viewer.userId || !lesson.prerequisiteLessonId) return false;
      return store.isLessonCompleted(viewer.userId, lesson.prerequisiteLessonId);
    }
    case 'invite_only': {
      if (!viewer.userId) return false;
      return store.isLessonInvited(lesson.id, viewer.userId);
    }
    default:
      return false;
  }
}
