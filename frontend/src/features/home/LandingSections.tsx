import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { UserRole } from '../../api/types'
import { buttonClasses } from '../../components/buttonStyles'
import { Reveal } from '../../components/Reveal'

function Icon({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-11 flex-none place-items-center rounded-card bg-primary-tint text-primary">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="size-6"
      >
        {children}
      </svg>
    </span>
  )
}

const STEPS = [
  {
    title: 'Create your profile once',
    text: 'Add your course, institution, skills and experience. Upload your CV and choose who may see it.',
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
      </>
    ),
  },
  {
    title: 'Find roles that fit',
    text: 'Search by keyword, district, job type and qualification. Save the ones you like for later.',
    icon: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>
    ),
  },
  {
    title: 'Apply and follow up',
    text: 'Apply in a few taps, then watch your application move from submitted to shortlisted.',
    icon: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  },
] as const

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-6 space-y-5">
      <Reveal>
        <h2 id="how-title" className="text-title-md font-bold">
          How it works
        </h2>
        <p className="mt-1 text-text-secondary">From student to hired in three simple steps.</p>
      </Reveal>
      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <Reveal as="li" key={step.title} delay={index * 120}>
            <div className="h-full rounded-card border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <Icon>{step.icon}</Icon>
                <span aria-hidden="true" className="text-title-md font-extrabold text-border">
                  {index + 1}
                </span>
              </div>
              <h3 className="mt-3 font-semibold">{step.title}</h3>
              <p className="mt-1 text-text-secondary">{step.text}</p>
            </div>
          </Reveal>
        ))}
      </ol>
    </section>
  )
}

const FEATURES = [
  {
    title: 'Verified employers',
    text: 'Every company is checked by an administrator before it can publish a vacancy.',
    icon: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Zm-3 9 2 2 4-4" />,
  },
  {
    title: 'Built for tertiary students',
    text: 'Internships, graduate trainee roles and part-time work for every university and institute.',
    icon: <path d="m2 9 10-5 10 5-10 5L2 9Zm4 3v5c3 2 9 2 12 0v-5" />,
  },
  {
    title: 'Track every application',
    text: 'See when an employer has reviewed, shortlisted or answered your application.',
    icon: <path d="M3 12h4l3 8 4-16 3 8h4" />,
  },
  {
    title: 'Your data stays yours',
    text: 'Your date of birth is private, you control CV sharing, and you can download or delete your data.',
    icon: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>
    ),
  },
  {
    title: 'Works on your phone',
    text: 'Fast on small screens and installable like an app, with a dark mode for night time.',
    icon: (
      <>
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M11 18h2" />
      </>
    ),
  },
  {
    title: 'Free to apply',
    text: 'Creating an account and applying for jobs costs students and graduates nothing.',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
  },
] as const

export function Features() {
  return (
    <section aria-labelledby="why-title" className="space-y-5">
      <Reveal>
        <h2 id="why-title" className="text-title-md font-bold">
          Why use DJMS
        </h2>
      </Reveal>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <Reveal as="li" key={feature.title} delay={(index % 3) * 100}>
            <div className="flex h-full gap-3 rounded-card border border-border bg-card p-4 transition-transform hover:-translate-y-0.5 hover:shadow-md">
              <Icon>{feature.icon}</Icon>
              <div>
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="mt-0.5 text-text-secondary">{feature.text}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </ul>
    </section>
  )
}

export function ForEmployers({ role }: { role: UserRole | undefined }) {
  const to = role === 'employer' ? '/employer' : role === 'admin' ? '/admin/employers' : '/register'
  const label =
    role === 'employer'
      ? 'Go to my dashboard'
      : role === 'admin'
        ? 'Review employers'
        : 'Post a vacancy'
  return (
    <Reveal>
      <section
        id="for-employers"
        aria-labelledby="employers-title"
        className="grid scroll-mt-6 gap-6 overflow-hidden rounded-card bg-linear-to-br from-hero-from to-hero-to p-6 text-white shadow-md md:grid-cols-[1.3fr_1fr] md:p-10"
      >
        <div className="space-y-3">
          <h2 id="employers-title" className="text-title-md font-bold">
            Hiring? Reach students and graduates across Uganda
          </h2>
          <p>
            Publish a vacancy, receive complete applications with the applicant&apos;s profile and
            CV, and move candidates from review to offer in one place.
          </p>
          <Link
            to={to}
            className={buttonClasses({
              variant: 'secondary',
              className: 'border-white bg-white text-hero-to hover:bg-primary-tint',
            })}
          >
            {label}
          </Link>
        </div>
        <ul className="space-y-2 self-center">
          {[
            'Companies are verified before they go live',
            'Applicants arrive with a full profile and CV',
            'Shortlist, interview and offer from one screen',
          ].map((point) => (
            <li key={point} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-0.5 grid size-5 flex-none place-items-center rounded-pill bg-white/20 text-xs"
              >
                ✓
              </span>
              {point}
            </li>
          ))}
        </ul>
      </section>
    </Reveal>
  )
}

const FAQ = [
  {
    q: 'Who can use the system?',
    a: 'Students and graduates of any university or tertiary institution in Uganda can register as job seekers. Companies register as employers.',
  },
  {
    q: 'Does it cost anything?',
    a: 'Registering and applying as a student or graduate is free.',
  },
  {
    q: 'How do you know employers are real?',
    a: 'A new company must fill in its details and be approved by an administrator before it can publish any vacancy.',
  },
  {
    q: 'Who can see my CV and my details?',
    a: 'Only employers you apply to see your application. You decide whether your CV is shared, and your date of birth is never shown to employers.',
  },
  {
    q: 'Can I delete my account?',
    a: 'Yes. From My account you can download your data or delete it completely.',
  },
] as const

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-6 space-y-4">
      <Reveal>
        <h2 id="faq-title" className="text-title-md font-bold">
          Questions and answers
        </h2>
      </Reveal>
      <Reveal className="divide-y divide-border rounded-card border border-border bg-card">
        {FAQ.map((item) => (
          <details key={item.q} className="group p-4">
            <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 font-semibold">
              {item.q}
              <span
                aria-hidden="true"
                className="text-primary transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-2 text-text-secondary">{item.a}</p>
          </details>
        ))}
      </Reveal>
    </section>
  )
}
