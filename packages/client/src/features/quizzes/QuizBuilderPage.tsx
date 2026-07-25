import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { AuthoredProgram, QuizQuestionView, QuizView } from '@madrasty/shared';
import { Icon } from '../../components/Icon';
import { programsApi } from '../teacher-authoring/programs.api';
import { quizzesApi } from './quizzes.api';

interface QuizLesson {
  id: string;
  title: string | null;
  chapterTitle: string | null;
}

// Teacher quiz builder (doc 12 §6): pick a quiz-type lesson from one of your
// programs, then author single-correct multiple-choice questions. The quiz is
// created on first open (find-or-create by lesson).
export function QuizBuilderPage() {
  const { t, i18n } = useTranslation();
  const [programs, setPrograms] = useState<AuthoredProgram[]>([]);
  const [programId, setProgramId] = useState('');
  const [quizLessons, setQuizLessons] = useState<QuizLesson[]>([]);
  const [lessonId, setLessonId] = useState('');
  const [quiz, setQuiz] = useState<QuizView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    programsApi
      .listMine()
      .then((res) => setPrograms(res.programs))
      .catch(() => setError(t('quiz.loadError')));
  }, [t]);

  // Load the selected program's quiz-type lessons.
  useEffect(() => {
    setQuizLessons([]);
    setLessonId('');
    setQuiz(null);
    if (!programId) return;
    programsApi
      .getProgram(programId)
      .then((program) => {
        const lessons: QuizLesson[] = [];
        program.chapters.forEach((ch) =>
          ch.lessons
            .filter((l) => l.lessonType === 'quiz')
            .forEach((l) => lessons.push({ id: l.id, title: l.title, chapterTitle: ch.title })),
        );
        setQuizLessons(lessons);
      })
      .catch(() => setError(t('quiz.loadError')));
  }, [programId, t]);

  // Resolve (or create) the quiz for the chosen lesson.
  const openLesson = async (id: string) => {
    setLessonId(id);
    setQuiz(null);
    setError(null);
    setLoading(true);
    try {
      const found = await quizzesApi.getByLesson(id);
      const view = found.quizId
        ? await quizzesApi.getQuiz(found.quizId, i18n.language)
        : await quizzesApi.createQuiz({ lessonId: id }, i18n.language);
      setQuiz(view);
    } catch {
      setError(t('quiz.loadError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-unit-lg">
      <div>
        <h1 className="text-headline-lg font-semibold">{t('quiz.builderTitle')}</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">{t('quiz.builderSubtitle')}</p>
      </div>

      <div className="grid grid-cols-1 gap-unit-md sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-label-md font-medium text-on-surface-variant">{t('quiz.program')}</span>
          <select
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-unit-md py-2 text-body-md outline-none focus:border-primary"
          >
            <option value="">{t('quiz.selectProgram')}</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title || p.id}
              </option>
            ))}
          </select>
        </label>

        {programId && (
          <label className="flex flex-col gap-1">
            <span className="text-label-md font-medium text-on-surface-variant">{t('quiz.quizLesson')}</span>
            <select
              value={lessonId}
              onChange={(e) => openLesson(e.target.value)}
              className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-unit-md py-2 text-body-md outline-none focus:border-primary"
            >
              <option value="">{t('quiz.selectLesson')}</option>
              {quizLessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {(l.chapterTitle ? `${l.chapterTitle} · ` : '') + (l.title || l.id)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {programId && quizLessons.length === 0 && (
        <p className="rounded-xl border border-dashed border-outline-variant p-unit-md text-body-sm text-on-surface-variant">
          {t('quiz.noQuizLessons')}
        </p>
      )}

      {error && <p className="text-body-md font-semibold text-error">{error}</p>}
      {loading && (
        <div className="flex justify-center py-unit-lg text-on-surface-variant">
          <Icon name="progress_activity" className="animate-spin text-[2rem]" />
        </div>
      )}

      {quiz && <QuizEditor quiz={quiz} onChange={setQuiz} />}
    </div>
  );
}

function QuizEditor({ quiz, onChange }: { quiz: QuizView; onChange: (q: QuizView) => void }) {
  const { t } = useTranslation();

  const removeQuestion = async (questionId: string) => {
    await quizzesApi.deleteQuestion(quiz.id, questionId);
    onChange({
      ...quiz,
      questions: quiz.questions.filter((q) => q.id !== questionId),
    });
  };

  return (
    <div className="flex flex-col gap-unit-md">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 p-unit-md">
        <div className="text-body-md">
          <span className="font-semibold">{t('quiz.passingScore')}: </span>
          {quiz.passingScore}% · {t('quiz.questionsCount', { count: quiz.questionCount })} ·{' '}
          {t('quiz.totalPoints', { points: quiz.totalPoints })}
        </div>
        <Link
          to={`/app/quiz/${quiz.id}`}
          className="inline-flex items-center gap-1 text-label-md text-primary hover:underline"
        >
          <Icon name="visibility" className="text-[1rem]" />
          {t('quiz.previewLink')}
        </Link>
      </div>

      <ul className="flex flex-col gap-2">
        {quiz.questions.map((q, i) => (
          <QuestionCard key={q.id} index={i} question={q} onDelete={() => removeQuestion(q.id)} />
        ))}
      </ul>

      <AddQuestionForm
        quizId={quiz.id}
        onAdded={(question) =>
          onChange({
            ...quiz,
            questions: [...quiz.questions, question],
            questionCount: quiz.questionCount + 1,
            totalPoints: quiz.totalPoints + question.points,
          })
        }
      />
    </div>
  );
}

function QuestionCard({
  index,
  question,
  onDelete,
}: {
  index: number;
  question: QuizQuestionView;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-md">
      <div className="flex items-start justify-between gap-2">
        <p className="text-body-md font-semibold text-on-surface">
          {index + 1}. {question.prompt || t('quiz.untitledQuestion')}
        </p>
        <button
          type="button"
          onClick={onDelete}
          className="text-on-surface-variant hover:text-error"
          aria-label={t('quiz.delete')}
        >
          <Icon name="delete" className="text-[1.2rem]" />
        </button>
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {question.options.map((o) => {
          const correct = o.id === question.correctOptionId;
          return (
            <li
              key={o.id}
              className={`flex items-center gap-2 rounded-lg px-unit-sm py-1 text-body-sm ${
                correct ? 'bg-green-500/10 font-medium text-green-700 dark:text-green-400' : 'text-on-surface-variant'
              }`}
            >
              <Icon
                name={correct ? 'check_circle' : 'radio_button_unchecked'}
                className="text-[1rem]"
              />
              {o.text}
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-label-sm text-on-surface-variant">
        {t('quiz.points', { points: question.points })}
      </p>
    </li>
  );
}

function AddQuestionForm({
  quizId,
  onAdded,
}: {
  quizId: string;
  onAdded: (question: QuizQuestionView) => void;
}) {
  const { t, i18n } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [correct, setCorrect] = useState(0);
  const [points, setPoints] = useState('1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setOption = (i: number, value: string) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = options.map((o) => o.trim());
    if (!prompt.trim()) return setError(t('quiz.promptRequired'));
    if (cleaned.filter(Boolean).length < 2) return setError(t('quiz.needTwoOptions'));
    if (!cleaned[correct]) return setError(t('quiz.correctEmpty'));

    const lang = i18n.language;
    const payloadOptions = cleaned
      .map((text, i) => ({ id: `o${i + 1}`, text, i }))
      .filter((o) => o.text);
    setSaving(true);
    setError(null);
    try {
      const question = await quizzesApi.addQuestion(
        quizId,
        {
          prompt: { [lang]: prompt.trim() },
          options: payloadOptions.map((o) => ({ id: o.id, text: { [lang]: o.text } })),
          correctOptionId: `o${correct + 1}`,
          points: Number(points) || 1,
        },
        lang,
      );
      onAdded(question);
      setPrompt('');
      setOptions(['', '']);
      setCorrect(0);
      setPoints('1');
    } catch {
      setError(t('quiz.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-unit-sm rounded-xl border border-dashed border-outline-variant p-unit-md">
      <p className="text-body-md font-semibold">{t('quiz.addQuestion')}</p>
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={t('quiz.promptPlaceholder')}
        className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-unit-md py-2 text-body-md outline-none focus:border-primary"
      />
      <div className="flex flex-col gap-2">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name="correct"
              checked={correct === i}
              onChange={() => setCorrect(i)}
              aria-label={t('quiz.markCorrect')}
              className="h-4 w-4 accent-primary"
            />
            <input
              value={opt}
              onChange={(e) => setOption(i, e.target.value)}
              placeholder={t('quiz.optionPlaceholder', { n: i + 1 })}
              className="flex-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-unit-sm py-1.5 text-body-sm outline-none focus:border-primary"
            />
            {options.length > 2 && (
              <button
                type="button"
                onClick={() => {
                  setOptions((prev) => prev.filter((_, idx) => idx !== i));
                  if (correct >= i && correct > 0) setCorrect((c) => c - 1);
                }}
                className="text-on-surface-variant hover:text-error"
                aria-label={t('quiz.delete')}
              >
                <Icon name="close" className="text-[1.1rem]" />
              </button>
            )}
          </div>
        ))}
        {options.length < 6 && (
          <button
            type="button"
            onClick={() => setOptions((prev) => [...prev, ''])}
            className="inline-flex items-center gap-1 self-start text-label-md text-primary hover:underline"
          >
            <Icon name="add" className="text-[1rem]" />
            {t('quiz.addOption')}
          </button>
        )}
      </div>
      <div className="flex items-center gap-unit-md">
        <label className="flex items-center gap-2 text-label-md text-on-surface-variant">
          {t('quiz.points', { points: '' })}
          <input
            type="number"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            className="w-16 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1 text-center text-body-sm outline-none focus:border-primary"
          />
        </label>
        <span className="text-label-sm text-on-surface-variant">{t('quiz.markCorrectHint')}</span>
      </div>
      {error && <p className="text-body-sm font-semibold text-error">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 self-start rounded-xl bg-primary px-unit-lg py-2 text-label-lg font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        <Icon name="add" className="text-[1.1rem]" />
        {saving ? t('quiz.saving') : t('quiz.addQuestion')}
      </button>
    </form>
  );
}
