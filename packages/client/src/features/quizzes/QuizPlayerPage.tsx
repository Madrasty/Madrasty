import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import type { AttemptResultView, QuizView } from '@madrasty/shared';
import { ApiError } from '../../lib/api';
import { Icon } from '../../components/Icon';
import { quizzesApi } from './quizzes.api';

// Student quiz player (doc 12 §6): answer single-correct multiple-choice
// questions, submit for instant auto-grading, then review correct answers. A
// passing attempt completes the lesson server-side (unlocking gated lessons).
export function QuizPlayerPage() {
  const { t, i18n } = useTranslation();
  const { quizId = '' } = useParams();
  const [quiz, setQuiz] = useState<QuizView | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AttemptResultView | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setQuiz(null);
    setResult(null);
    setAnswers({});
    setErrorCode(null);
    quizzesApi
      .getQuiz(quizId, i18n.language)
      .then(setQuiz)
      .catch((e) => setErrorCode(e instanceof ApiError ? e.code : 'load_error'));
  };

  useEffect(load, [quizId, i18n.language]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await quizzesApi.submitAttempt(quizId, { answers }, i18n.language);
      setResult(res);
    } catch (e) {
      setErrorCode(e instanceof ApiError ? e.code : 'save_error');
    } finally {
      setSubmitting(false);
    }
  };

  if (errorCode) {
    const msg = errorCode === 'not_enrolled' ? t('quiz.notEnrolled') : t('quiz.loadError');
    return <Banner icon="lock" text={msg} tone="error" />;
  }
  if (!quiz) {
    return (
      <div className="flex justify-center py-unit-xl text-on-surface-variant">
        <Icon name="progress_activity" className="animate-spin text-[2rem]" />
      </div>
    );
  }

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === quiz.questions.length && quiz.questions.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-unit-lg">
      <div>
        <h1 className="text-headline-lg font-semibold">{t('quiz.playerTitle')}</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          {t('quiz.passingScore')}: {quiz.passingScore}% ·{' '}
          {t('quiz.questionsCount', { count: quiz.questionCount })}
        </p>
        {quiz.bestAttempt && !result && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-surface-container px-unit-md py-1 text-label-md text-on-surface-variant">
            <Icon name="history" className="text-[1rem]" />
            {t('quiz.bestSoFar', { percent: quiz.bestAttempt.percentage })}
          </p>
        )}
      </div>

      {result && <ResultBanner result={result} passing={quiz.passingScore} />}

      {quiz.questions.length === 0 && <Banner icon="quiz" text={t('quiz.emptyForStudent')} tone="muted" />}

      <ol className="flex flex-col gap-unit-md">
        {quiz.questions.map((q, i) => {
          const perQ = result?.perQuestion.find((p) => p.questionId === q.id);
          return (
            <li
              key={q.id}
              className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-unit-md"
            >
              <p className="text-body-lg font-semibold text-on-surface">
                {i + 1}. {q.prompt}
              </p>
              <div className="mt-unit-sm flex flex-col gap-2">
                {q.options.map((o) => {
                  const chosen = answers[q.id] === o.id;
                  // After grading: mark the correct option and a wrong choice.
                  let stateClass = 'border-outline-variant';
                  if (perQ) {
                    if (o.id === perQ.correctOptionId) stateClass = 'border-secondary bg-secondary-container';
                    else if (o.id === perQ.chosenOptionId) stateClass = 'border-error bg-error/10';
                  } else if (chosen) {
                    stateClass = 'border-primary bg-primary/5';
                  }
                  return (
                    <label
                      key={o.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-unit-md py-2 text-body-md transition-colors ${stateClass} ${
                        result ? 'cursor-default' : 'hover:bg-surface-container-low'
                      }`}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        checked={chosen}
                        disabled={!!result}
                        onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: o.id }))}
                        className="h-4 w-4 accent-primary"
                      />
                      {o.text}
                    </label>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>

      {result ? (
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 self-start rounded-full bg-primary px-unit-lg py-2 text-label-lg font-semibold text-on-primary transition-opacity hover:opacity-90"
        >
          <Icon name="refresh" className="text-[1.1rem]" />
          {t('quiz.retake')}
        </button>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={!allAnswered || submitting}
          className="inline-flex items-center gap-2 self-start rounded-full bg-primary px-unit-lg py-2 text-label-lg font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Icon name="task_alt" className="text-[1.1rem]" />
          {submitting
            ? t('quiz.submitting')
            : allAnswered
              ? t('quiz.submit')
              : t('quiz.answerAll', { answered: answeredCount, total: quiz.questions.length })}
        </button>
      )}
    </div>
  );
}

function ResultBanner({ result, passing }: { result: AttemptResultView; passing: number }) {
  const { t } = useTranslation();
  const tone = result.passed
    ? 'border-secondary/40 bg-secondary-container text-on-secondary-container'
    : 'border-error/40 bg-error-container text-on-error-container';
  return (
    <div className={`flex items-center justify-between gap-unit-md rounded-xl border p-unit-lg ${tone}`}>
      <div>
        <p className="text-headline-md font-bold">{result.percentage}%</p>
        <p className="text-body-md">
          {t('quiz.scoreOf', { score: result.score, max: result.maxScore })} ·{' '}
          {result.passed ? t('quiz.passed') : t('quiz.failedNeed', { passing })}
        </p>
      </div>
      <Icon name={result.passed ? 'verified' : 'cancel'} filled className="text-[2.5rem]" />
    </div>
  );
}

function Banner({ icon, text, tone }: { icon: string; text: string; tone: 'error' | 'muted' }) {
  const cls =
    tone === 'error'
      ? 'border-error/40 bg-error/5 text-error'
      : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant';
  return (
    <div className={`flex flex-col items-center gap-unit-sm rounded-xl border border-dashed p-unit-xl text-center ${cls}`}>
      <Icon name={icon} className="text-[2.5rem]" />
      <p className="text-body-lg font-semibold">{text}</p>
    </div>
  );
}
