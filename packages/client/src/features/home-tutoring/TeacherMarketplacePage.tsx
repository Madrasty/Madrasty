import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/Button';

const SUBJECTS = ['math', 'science', 'arabic', 'english'] as const;

const TUTORS = [
  { id: 'sarah', rating: '4.9', reviews: 124, price: 200, subjectClass: 'text-primary', accent: 'from-primary-container/20' },
  { id: 'ahmed', rating: '4.8', reviews: 89, price: 250, subjectClass: 'text-secondary', accent: 'from-secondary-container/20' },
  { id: 'mona', rating: '4.9', reviews: 76, price: 180, subjectClass: 'text-tertiary', accent: 'from-tertiary-container/20' },
] as const;

export function TeacherMarketplacePage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-unit-lg">
      <div>
        <h1 className="text-headline-lg font-semibold">{t('marketplace.title')}</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">{t('marketplace.subtitle')}</p>
      </div>

      <div className="flex flex-col gap-unit-lg lg:flex-row">
        {/* Filters */}
        <aside className="h-fit w-full shrink-0 rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-lg lg:w-72">
          <h2 className="mb-unit-md flex items-center gap-2 text-headline-md">
            <Icon name="tune" className="text-[1.25rem]" /> {t('marketplace.filters')}
          </h2>

          <div className="mb-6">
            <h4 className="mb-3 text-label-md uppercase tracking-wider text-on-surface-variant">
              {t('marketplace.subject')}
            </h4>
            <div className="space-y-2">
              {SUBJECTS.map((subject, index) => (
                <label key={subject} className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    defaultChecked={index === 0}
                    className="h-4 w-4 rounded border-outline-variant text-primary"
                  />
                  <span className="text-body-md">{t(`marketplace.subjects.${subject}`)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <h4 className="mb-3 text-label-md uppercase tracking-wider text-on-surface-variant">
              {t('marketplace.gradeLevel')}
            </h4>
            <select className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-md outline-none focus:border-primary">
              <option>{t('marketplace.subjects.math')}</option>
            </select>
          </div>

          <div>
            <h4 className="mb-3 text-label-md uppercase tracking-wider text-on-surface-variant">
              {t('marketplace.pricePerHour')}
            </h4>
            <input type="range" className="w-full accent-primary" />
            <div className="mt-2 flex justify-between text-label-sm text-on-surface-variant">
              <span>EGP 100</span>
              <span>EGP 800+</span>
            </div>
          </div>
        </aside>

        {/* Results */}
        <div className="min-w-0 flex-1">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-headline-md">
              {t('marketplace.available')}{' '}
              <span className="ms-2 text-body-md font-normal text-on-surface-variant">
                {t('marketplace.found', { count: 142 })}
              </span>
            </h3>
            <div className="flex items-center gap-2">
              <span className="hidden text-label-md text-on-surface-variant sm:inline">
                {t('marketplace.sortBy')}
              </span>
              <select className="cursor-pointer rounded border border-outline-variant bg-surface-container-lowest px-2 py-1 text-label-md outline-none focus:border-primary">
                <option>{t('marketplace.sort.recommended')}</option>
                <option>{t('marketplace.sort.topRated')}</option>
                <option>{t('marketplace.sort.priceLow')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {TUTORS.map((tutor) => (
              <article
                key={tutor.id}
                className={`flex flex-col gap-4 rounded-xl border border-outline-variant bg-gradient-to-br to-surface p-unit-md transition-transform hover:-translate-y-0.5 ${tutor.accent}`}
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-surface bg-surface-container-high text-primary">
                    <Icon name="person" className="text-[2rem]" />
                  </span>
                  <div>
                    <h4 className="text-lg font-semibold">{t(`marketplace.tutors.${tutor.id}Name`)}</h4>
                    <p className={`font-medium ${tutor.subjectClass}`}>
                      {t(`marketplace.tutors.${tutor.id}Subject`)}
                    </p>
                    <div className="mt-1 flex items-center gap-1">
                      <Icon name="star" filled className="text-[1rem] text-tertiary-fixed-dim" />
                      <span className="text-label-md font-bold">{tutor.rating}</span>
                      <span className="text-label-sm text-on-surface-variant">
                        {t('marketplace.reviews', { count: tutor.reviews })}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded border border-outline-variant bg-surface px-2 py-1 text-xs font-medium text-on-surface-variant">
                    {t(`marketplace.tutors.${tutor.id}Tag1`)}
                  </span>
                  <span className="rounded border border-outline-variant bg-surface px-2 py-1 text-xs font-medium text-on-surface-variant">
                    {t(`marketplace.tutors.${tutor.id}Tag2`)}
                  </span>
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-outline-variant/50 pt-4">
                  <span className="text-label-md font-bold text-on-surface">
                    {t('marketplace.perHour', { price: tutor.price })}
                  </span>
                  <Button variant="primary">{t('marketplace.bookNow')}</Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
