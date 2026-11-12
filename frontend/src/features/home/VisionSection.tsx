import { Link } from 'react-router-dom'
import { Reveal } from '../../components/Reveal'
import { Band, Eyebrow } from './landingBits'
import { IMAGES } from './landingContent'

/** Why DJMS exists: the vision, with two photos and a way in for each kind of visitor. */
export function VisionSection() {
  return (
    <Band>
      <section id="about" aria-labelledby="vision-title" className="scroll-mt-6 space-y-8">
        <Reveal className="grid gap-4 md:grid-cols-2 md:items-end md:gap-10">
          <div className="space-y-2">
            <Eyebrow>Our vision</Eyebrow>
            <h2 id="vision-title" className="text-title-md font-bold md:text-title-lg">
              Every graduate in Uganda, one step from the right job
            </h2>
          </div>
          <p className="text-text-secondary">
            Talent is found in every university and tertiary institution, but opportunities are
            scattered across notice boards and word of mouth. DJMS brings verified employers and
            students together in one free place, so a good profile is enough to be found.
          </p>
        </Reveal>

        <div className="grid gap-5 md:grid-cols-[1fr_1fr_1.1fr] md:items-center">
          {[
            {
              src: IMAGES.graduates,
              alt: 'Three graduates smiling in graduation sashes',
              position: 'object-center',
            },
            {
              src: IMAGES.interview,
              alt: 'A young woman answering questions in a job interview',
              position: 'object-[40%_center]',
            },
          ].map((photo, index) => (
            <Reveal key={photo.src} delay={index * 120}>
              <img
                src={photo.src}
                alt={photo.alt}
                width={900}
                height={1200}
                loading="lazy"
                className={`aspect-4/5 w-full rounded-card object-cover shadow-md ${photo.position}`}
              />
            </Reveal>
          ))}
          <Reveal delay={240} className="space-y-3">
            <Eyebrow>For students and graduates</Eyebrow>
            <h3 className="text-title-sm font-semibold">Build one profile, apply anywhere</h3>
            <p className="text-text-secondary">
              Add your course, skills and CV once, search internships, graduate trainee roles and
              part-time work, and follow every application until you hear back.
            </p>
            <ul className="space-y-1 text-text-secondary">
              {['Free to register and apply', 'You decide who sees your CV'].map((point) => (
                <li key={point} className="flex items-center gap-2">
                  <span aria-hidden="true" className="text-primary">
                    ✓
                  </span>
                  {point}
                </li>
              ))}
            </ul>
            <Link to="/jobs" className="inline-block font-semibold text-primary underline">
              Find jobs →
            </Link>
          </Reveal>
        </div>
      </section>
    </Band>
  )
}
