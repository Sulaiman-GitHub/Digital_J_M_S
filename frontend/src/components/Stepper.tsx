import { cn } from '../lib/cn'

export interface StepperStep {
  id: string
  label: string
}

export interface StepperProps {
  steps: readonly StepperStep[]
  currentId: string
  /** Steps whose answers are saved (shown with a tick). */
  completedIds: ReadonlySet<string>
  /** Steps that cannot be opened yet. */
  lockedIds: ReadonlySet<string>
  onSelect: (id: string) => void
  /** 0 to 100, shown as "N% saved". */
  percent: number
  label?: string
  className?: string
}

/**
 * Progress through a multi-step form: "Step 2 of 5", a progress bar and one button per step.
 * Locked steps are disabled. On phones the buttons scroll sideways; from md up they stack.
 */
export function Stepper({
  steps,
  currentId,
  completedIds,
  lockedIds,
  onSelect,
  percent,
  label = 'Progress',
  className,
}: StepperProps) {
  const currentIndex = Math.max(
    steps.findIndex((step) => step.id === currentId),
    0,
  )
  return (
    <div role="group" aria-label={label} className={className}>
      <div className="flex justify-between text-sm font-semibold">
        <span>
          Step {currentIndex + 1} of {steps.length}: {steps[currentIndex].label}
        </span>
        <span>{percent}% saved</span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label}, saved`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-2 h-2 overflow-hidden rounded-pill bg-surface"
      >
        <div
          className="h-full rounded-pill bg-primary transition-[width]"
          style={{ width: `${Math.max(percent, 4)}%` }}
        />
      </div>
      <ol className="mt-3 flex gap-1.5 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
        {steps.map((step, index) => {
          const current = step.id === currentId
          const done = completedIds.has(step.id)
          const locked = lockedIds.has(step.id)
          return (
            <li key={step.id} className="shrink-0 md:shrink">
              <button
                type="button"
                disabled={locked}
                aria-current={current ? 'step' : undefined}
                aria-label={`${step.label}${done ? ', saved' : ''}${locked ? ', locked until you save the earlier steps' : ''}`}
                onClick={() => onSelect(step.id)}
                className={cn(
                  'inline-flex min-h-11 w-full cursor-pointer items-center gap-1.5 rounded-pill border px-3 text-sm font-semibold md:rounded-card',
                  'disabled:cursor-not-allowed',
                  current
                    ? 'border-2 border-primary bg-primary-tint text-primary'
                    : done
                      ? 'border-success bg-success-tint text-success'
                      : locked
                        ? 'border-dashed border-text-secondary text-text-secondary opacity-75'
                        : 'border-text-secondary bg-card text-text',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-5.5 place-items-center rounded-pill text-xs',
                    current
                      ? 'bg-primary text-on-solid'
                      : done
                        ? 'bg-success text-on-solid'
                        : 'bg-surface',
                  )}
                >
                  {done && !current ? '✓' : index + 1}
                </span>
                {step.label}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
