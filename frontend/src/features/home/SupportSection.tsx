import { Reveal } from '../../components/Reveal'
import { Container, Eyebrow } from './landingBits'
import { SUPPORT_EMAIL, SUPPORT_PHONE_HREF, SUPPORT_PHONE_LABEL } from './landingContent'

const SPONSOR_CARDS = [
  {
    title: 'Advertise with us',
    text: 'Put your business, course or service in front of students and graduates across Uganda.',
    subject: 'Advertising on DJMS',
  },
  {
    title: 'Partner with DJMS',
    text: 'Universities, institutes and organisations can support the platform and reach their own students.',
    subject: 'Partnering with DJMS',
  },
] as const

/**
 * Asks for support and offers sponsor spots. It lives only on the landing page, below the
 * vacancies, so people searching or applying are never interrupted by it (decision 026).
 * There is no payment on the site: people contact us.
 */
export function SupportSection() {
  return (
    <div className="bg-bg py-12 md:py-16">
      <Container>
        <Reveal>
          <section
            id="support"
            aria-labelledby="support-title"
            className="scroll-mt-6 space-y-8 rounded-card bg-linear-to-br from-hero-from to-hero-to p-6 text-white shadow-md md:p-10"
          >
            <div className="grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-center">
              <div className="space-y-3">
                <Eyebrow className="text-white">Support DJMS</Eyebrow>
                <h2 id="support-title" className="text-title-md font-bold">
                  Help keep DJMS free for job seekers
                </h2>
                <p>
                  DJMS costs nothing for students and graduates, but running it has real costs.
                  Support from donors, sponsors and partners pays for them. Adverts appear only on
                  this page, never while you search for jobs or apply.
                </p>
              </div>
              <div className="space-y-2 rounded-card bg-white/10 p-4">
                <p className="font-semibold">Donate or sponsor</p>
                <p className="text-sm">Call or write to us and we will tell you how to help.</p>
                <ul className="space-y-1">
                  <li>
                    <a href={SUPPORT_PHONE_HREF} className="font-semibold underline">
                      {SUPPORT_PHONE_LABEL}
                    </a>
                  </li>
                  <li>
                    <a
                      href={`mailto:${SUPPORT_EMAIL}?subject=Supporting%20DJMS`}
                      className="font-semibold underline"
                    >
                      {SUPPORT_EMAIL}
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            <ul className="grid gap-4 md:grid-cols-2">
              {SPONSOR_CARDS.map((card) => (
                <li
                  key={card.title}
                  className="flex flex-col gap-2 rounded-card border border-dashed border-white/60 bg-white/5 p-4"
                >
                  <span className="w-fit rounded-pill bg-white/20 px-2 py-0.5 text-xs font-semibold tracking-wide uppercase">
                    Sponsored
                  </span>
                  <h3 className="font-semibold">{card.title}</h3>
                  <p className="text-sm">{card.text}</p>
                  <a
                    href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(card.subject)}`}
                    className="mt-auto w-fit font-semibold underline"
                  >
                    Get in touch →
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      </Container>
    </div>
  )
}
