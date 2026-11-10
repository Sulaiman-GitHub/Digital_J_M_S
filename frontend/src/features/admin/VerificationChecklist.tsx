import type { AdminEmployerDetail } from '../../api/types'
import { Card } from '../../components/Card'
import { cn } from '../../lib/cn'
import { checklistItems } from './checklist'

export function VerificationChecklist({ employer }: { employer: AdminEmployerDetail }) {
  return (
    <Card aria-labelledby="checklist-title">
      <h2 id="checklist-title" className="text-lg font-semibold">
        Checklist
      </h2>
      <p className="mt-1 mb-2 text-sm text-text-secondary">
        What was provided. Check it is true before you approve.
      </p>
      <ul>
        {checklistItems(employer).map((item) => (
          <li
            key={item.label}
            className="flex gap-2.5 border-t border-border py-2.5 first:border-t-0"
          >
            <span
              aria-hidden="true"
              className={cn(
                'grid size-6 flex-none place-items-center rounded-pill text-sm font-bold text-on-solid',
                item.present ? 'bg-success' : 'bg-danger',
              )}
            >
              {item.present ? '✓' : '✕'}
            </span>
            <div>
              <p className="font-semibold">
                {item.label}
                <span className="sr-only">{item.present ? ': provided' : ': missing'}</span>
              </p>
              <p className="text-sm break-words text-text-secondary">{item.help}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
