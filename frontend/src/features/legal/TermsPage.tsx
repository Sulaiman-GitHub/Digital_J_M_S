import { Link } from 'react-router-dom'
import { LegalPage, Section } from './LegalPage'

export function TermsPage() {
  return (
    <LegalPage title="Terms of Use">
      <Section title="What this service is">
        <p>
          The Digital Job Matching System helps students and graduates of tertiary institutions in
          Uganda find jobs and internships, and helps employers find them. It is free to use during
          the pilot.
        </p>
      </Section>
      <Section title="Your account">
        <p>
          Give true information and keep your password to yourself. You are responsible for what
          happens in your account. Tell us if you think someone else is using it.
        </p>
      </Section>
      <Section title="What you may not do">
        <ul className="list-disc space-y-1 pl-5">
          <li>Post or send anything false, misleading or unlawful.</li>
          <li>Ask job seekers for money. A real job does not charge a fee to apply.</li>
          <li>Upload files that contain viruses, or try to break or overload the service.</li>
          <li>Use other people&apos;s details without their permission.</li>
        </ul>
      </Section>
      <Section title="Vacancies and applications">
        <p>
          Employers are responsible for the vacancies they post. We do not promise that you will get
          a job, an interview or a reply, and we may remove vacancies or accounts that break these
          terms.
        </p>
      </Section>
      <Section title="Your information">
        <p>
          How we collect and use your information is explained in the{' '}
          <Link to="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>
      <Section title="Changes and questions">
        <p>
          We may update these terms. When we do, we will ask you to agree again. Contact details
          will be added here before launch.
        </p>
      </Section>
    </LegalPage>
  )
}
