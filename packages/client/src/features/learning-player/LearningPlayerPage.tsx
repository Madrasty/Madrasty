import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { LanguageToggle } from '../../components/LanguageToggle';

const RESOURCES = [
  { id: 'slides', icon: 'picture_as_pdf', iconClass: 'bg-error/10 text-error', action: 'download' },
  { id: 'calculator', icon: 'link', iconClass: 'bg-primary/10 text-primary', action: 'open_in_new' },
] as const;

const LESSONS = [
  { id: 'limits', icon: 'check_circle', state: 'done' },
  { id: 'fundamentals', icon: 'play_circle', state: 'current' },
  { id: 'derivatives', icon: 'lock', state: 'locked' },
  { id: 'quiz', icon: 'lock', state: 'locked' },
] as const;

// Focused, sidebar-free layout for consuming a lesson (doc 12). The chevron in
// the back link flips direction with RTL automatically because it lives in a
// flex row; the icon itself is direction-neutral ("arrow_back" mirrors via CSS).
export function LearningPlayerPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col bg-background text-on-surface">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-outline-variant bg-surface px-unit-lg">
        <Link to="/" className="flex items-center gap-2 text-label-md text-on-surface-variant hover:text-primary">
          <Icon name="arrow_back" className="rtl:-scale-x-100" />
          {t('app.name')}
        </Link>
        <LanguageToggle />
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Main */}
        <main className="flex flex-1 flex-col gap-unit-lg p-unit-lg">
          <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-inverse-surface text-inverse-on-surface">
            <Icon name="play_circle" className="text-[4rem] opacity-80" />
          </div>

          {/* AI assistant */}
          <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low">
            <div className="flex items-center justify-between bg-surface px-4 py-2">
              <span className="flex items-center gap-2 text-label-md font-bold text-primary">
                <Icon name="smart_toy" /> {t('player.aiAssistant')}
              </span>
            </div>
            <div className="flex flex-col gap-3 p-4 text-sm">
              <div className="max-w-[85%] self-start rounded-lg rounded-ss-none border border-outline-variant bg-surface p-2">
                {t('player.aiPrompt')}
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-outline-variant bg-surface p-2">
              <input
                type="text"
                placeholder={t('player.aiPlaceholder')}
                className="flex-1 rounded-lg bg-surface-container-low px-3 py-2 text-sm outline-none"
              />
              <button className="text-primary" aria-label={t('actions.askQuestion')}>
                <Icon name="send" className="rtl:-scale-x-100" />
              </button>
            </div>
          </div>

          {/* Lesson info + tabs */}
          <div className="flex flex-col gap-unit-md rounded-xl border border-outline-variant bg-surface p-unit-lg">
            <h1 className="text-headline-lg">{t('player.lessonTitle')}</h1>
            <p className="max-w-3xl text-body-lg text-on-surface-variant">{t('player.lessonDescription')}</p>
            <div className="mt-4 flex gap-unit-lg border-b border-outline-variant">
              <button className="flex items-center gap-2 border-b-2 border-primary pb-2 text-label-md text-primary">
                <Icon name="description" className="text-[1.1rem]" /> {t('player.tabs.resources')}
              </button>
              <button className="flex items-center gap-2 pb-2 text-label-md text-on-surface-variant hover:text-primary">
                <Icon name="edit_note" className="text-[1.1rem]" /> {t('player.tabs.notes')}
              </button>
              <button className="flex items-center gap-2 pb-2 text-label-md text-on-surface-variant hover:text-primary">
                <Icon name="forum" className="text-[1.1rem]" /> {t('player.tabs.discussion')}
              </button>
            </div>
            <div className="flex flex-col gap-3 py-2">
              {RESOURCES.map((resource) => (
                <button
                  key={resource.id}
                  className="group flex items-center justify-between rounded-lg border border-outline-variant p-3 text-start transition-colors hover:bg-surface-container-low"
                >
                  <span className="flex items-center gap-3">
                    <span className={`flex h-10 w-10 items-center justify-center rounded ${resource.iconClass}`}>
                      <Icon name={resource.icon} />
                    </span>
                    <span>
                      <span className="block text-label-md font-bold">
                        {t(`player.resources.${resource.id}`)}
                      </span>
                      <span className="block text-sm text-on-surface-variant">
                        {t(`player.resources.${resource.id}Meta`)}
                      </span>
                    </span>
                  </span>
                  <Icon name={resource.action} className="text-on-surface-variant group-hover:text-primary" />
                </button>
              ))}
            </div>
          </div>
        </main>

        {/* Course content sidebar */}
        <aside className="w-full shrink-0 border-t border-outline-variant bg-surface lg:w-[320px] lg:border-s lg:border-t-0">
          <div className="flex flex-col gap-4 border-b border-outline-variant bg-surface-container-low p-unit-md">
            <h2 className="text-headline-md">{t('player.courseContent')}</h2>
            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-on-surface-variant">{t('player.overallProgress')}</span>
                <span className="font-bold text-primary">68%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-outline-variant/30">
                <div className="h-2 rounded-full bg-primary" style={{ width: '68%' }} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 p-2">
            <CollapsedChapter label={t('player.chapters.preCalc')} />
            <CollapsedChapter label={t('player.chapters.functions')} />
            <div className="overflow-hidden rounded-lg border border-primary bg-surface ring-1 ring-primary/20">
              <div className="flex items-center justify-between border-b border-outline-variant/50 bg-surface-container-low px-4 py-3">
                <span className="text-label-md font-bold text-primary">{t('player.chapters.calculus')}</span>
                <Icon name="expand_less" className="text-primary" />
              </div>
              <div className="flex flex-col py-1">
                {LESSONS.map((lesson) => (
                  <div
                    key={lesson.id}
                    className={`flex items-start gap-3 px-4 py-2.5 ${
                      lesson.state === 'current' ? 'border-s-2 border-primary bg-primary/5' : ''
                    } ${lesson.state === 'locked' ? 'opacity-60' : 'cursor-pointer'}`}
                  >
                    <Icon
                      name={lesson.icon}
                      filled={lesson.state !== 'locked'}
                      className={`mt-0.5 text-[1.25rem] ${
                        lesson.state === 'done'
                          ? 'text-secondary'
                          : lesson.state === 'current'
                            ? 'text-primary'
                            : 'text-on-surface-variant'
                      }`}
                    />
                    <div className="flex-1">
                      <div
                        className={`text-label-md ${
                          lesson.state === 'current' ? 'font-bold text-primary' : 'text-on-surface'
                        }`}
                      >
                        {t(`player.lessons.${lesson.id}`)}
                      </div>
                      <div className="text-xs text-on-surface-variant">
                        {t(`player.lessons.${lesson.id}Meta`)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CollapsedChapter({ label }: { label: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface">
      <button className="flex w-full items-center justify-between px-4 py-3 text-start transition-colors hover:bg-surface-container-low">
        <span className="text-label-md font-bold">{label}</span>
        <Icon name="expand_more" className="text-on-surface-variant" />
      </button>
    </div>
  );
}
