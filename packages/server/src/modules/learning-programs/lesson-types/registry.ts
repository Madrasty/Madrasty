import type { LessonDetailsStore } from '../learning-programs.repository';
import type { LessonHandlerRegistry } from './handler';
import { RecordedLessonHandler } from './recorded.handler';
import { LiveLessonHandler } from './live.handler';
import { PdfLessonHandler } from './pdf.handler';
import { AudioLessonHandler } from './audio.handler';
import { QuizLessonHandler } from './quiz.handler';
import { HomeworkLessonHandler } from './homework.handler';
import { ExamLessonHandler } from './exam.handler';
import { PrivateSessionLessonHandler } from './private-session.handler';

// Builds the lesson_type → handler map. Adding a future type (doc 12 §4) is one
// new handler + one line here — lessons.service never changes.
export function buildHandlerRegistry(store: LessonDetailsStore): LessonHandlerRegistry {
  return {
    recorded: new RecordedLessonHandler(store),
    live: new LiveLessonHandler(store),
    pdf: new PdfLessonHandler(store),
    audio: new AudioLessonHandler(store),
    quiz: new QuizLessonHandler(),
    homework: new HomeworkLessonHandler(),
    exam: new ExamLessonHandler(),
    private_session: new PrivateSessionLessonHandler(),
  };
}
