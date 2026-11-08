import { Link } from 'react-router-dom'
import { LegalPage, Section } from './LegalPage'

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <Section title="What we keep">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your email address and a protected form of your password.</li>
          <li>
            Your profile: name, phone number, district, studies, skills, experience and a short
            summary.
          </li>
          <li>The CV file you upload, and your profile photo if you add one.</li>
          <li>A record of what you agreed to, and when.</li>
          <li>Security logs, such as failed log-ins, to keep accounts safe.</li>
        </ul>
      </Section>
      <Section title="Why we keep it">
        <p>
          To run your account, match you with vacancies, and let you apply. We do not sell your
          information.
        </p>
      </Section>
      <Section title="Who can see it">
        <p>
          Only you can see your CV, photo and profile. Employers see them only for jobs you apply
          to, and only if you have allowed that on your profile page. You can withdraw that
          permission at any time. A company logo is public, because the company's vacancies are.
        </p>
      </Section>
      <Section title="How long we keep it">
        <p>
          While your account is open. You will be able to download your data and close your account.
          The exact retention periods will be added here before launch.
        </p>
      </Section>
      <Section title="Your rights">
        <p>
          You can see, correct and delete the information in your profile at any time. Contact
          details for other requests will be added here before launch.
        </p>
      </Section>
      <Section title="Related">
        <p>
          Read the{' '}
          <Link to="/terms" className="underline">
            Terms of Use
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  )
}
