import type { UserRole } from '../../api/types'

export interface BotLink {
  label: string
  to: string
}

export interface BotReply {
  text: string
  links?: BotLink[]
  /** Questions offered as one-tap buttons after this answer. */
  suggestions?: string[]
}

export interface Topic {
  id: string
  /** Words and phrases that point to this topic. Longer phrases count for more. */
  keywords: string[]
  /** Who the answer is written for; others still get it, but it is ranked lower. */
  roles?: UserRole[]
  reply: (role: UserRole | undefined) => BotReply
}

const STARTERS = [
  'How do I apply for a job?',
  'How do I create a profile?',
  'How do I post a vacancy?',
  'What do the application statuses mean?',
]

/**
 * Everything the assistant knows. It is a fixed script, not machine learning: the matcher in
 * `answer.ts` scores the question against these keywords. Keep each answer true to what the
 * system really does, and link to the page where the person can do it.
 */
export const TOPICS: Topic[] = [
  {
    id: 'greeting',
    keywords: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'help'],
    reply: () => ({
      text: 'Hello! I can answer basic questions about using the Digital Job Matching System. What would you like to know?',
      suggestions: STARTERS,
    }),
  },
  {
    id: 'thanks',
    keywords: ['thanks', 'thank you', 'thank', 'cheers', 'great', 'bye', 'goodbye'],
    reply: () => ({ text: 'You are welcome! Good luck, and ask me anything else any time.' }),
  },
  {
    id: 'what-is',
    keywords: [
      'what is this',
      'about',
      'what is djms',
      'who is it for',
      'purpose',
      'what does this do',
    ],
    reply: () => ({
      text: 'The Digital Job Matching System connects students and graduates of Ugandan universities and tertiary institutions with verified employers. Job seekers build one profile and apply to many vacancies. Employers publish vacancies and review applicants.',
      links: [{ label: 'Browse jobs', to: '/jobs' }],
      suggestions: ['How do I register?', 'How do I post a vacancy?'],
    }),
  },
  {
    id: 'register',
    keywords: [
      'register',
      'sign up',
      'signup',
      'create account',
      'new account',
      'join',
      'open an account',
    ],
    reply: (role) =>
      role
        ? {
            text: 'You already have an account and are signed in. You can manage it from My account.',
            links: [{ label: 'My account', to: '/account' }],
          }
        : {
            text: 'Choose Register, pick whether you are a job seeker or an employer, enter your email and a password, and accept the Terms and Privacy Policy. We then send you a link to verify your email.',
            links: [
              { label: 'Register', to: '/register' },
              { label: 'Log in', to: '/login' },
            ],
            suggestions: ['I did not get the verification email', 'How do I create a profile?'],
          },
  },
  {
    id: 'verify-email',
    keywords: [
      'verify',
      'verification email',
      'verification link',
      'confirm email',
      'did not get email',
      'resend',
      'not verified',
    ],
    reply: () => ({
      text: 'After you register we email you a link. Open it to verify your address. If it has not arrived, check your spam folder, then use the Resend button in the yellow banner at the top of the page once you are logged in. You need a verified email to apply for jobs.',
      links: [{ label: 'Log in', to: '/login' }],
    }),
  },
  {
    id: 'login',
    keywords: ['log in', 'login', 'sign in', 'cannot log in', 'cant login'],
    reply: (role) =>
      role
        ? { text: 'You are already logged in.', links: [{ label: 'My account', to: '/account' }] }
        : {
            text: 'Use the Log in button with the email and password you registered with. If you forgot your password you can reset it.',
            links: [
              { label: 'Log in', to: '/login' },
              { label: 'Forgot password', to: '/forgot-password' },
            ],
          },
  },
  {
    id: 'password',
    keywords: ['forgot password', 'reset password', 'lost password', 'change password', 'password'],
    reply: () => ({
      text: 'On the log in page choose "Forgot password", enter your email and we will send a reset link. The link works once and expires after a short time.',
      links: [{ label: 'Reset my password', to: '/forgot-password' }],
    }),
  },
  {
    id: 'profile',
    keywords: [
      'profile',
      'create profile',
      'complete profile',
      'education',
      'skills',
      'experience',
      'basics',
      'date of birth',
    ],
    roles: ['job_seeker'],
    reply: (role) => ({
      text: 'Your profile has sections for your basics, education, skills, experience and a summary, plus a CV and photo. Save the first two sections and the rest unlock. Your date of birth is optional and private: employers never see it.',
      links:
        role === 'job_seeker'
          ? [{ label: 'Open my profile', to: '/profile' }]
          : [{ label: 'Register as a job seeker', to: '/register' }],
      suggestions: ['How do I upload my CV?', 'How do I apply for a job?'],
    }),
  },
  {
    id: 'cv',
    keywords: [
      'cv',
      'resume',
      'curriculum vitae',
      'upload cv',
      'upload my cv',
      'consent',
      'share cv',
    ],
    roles: ['job_seeker'],
    reply: (role) => ({
      text: 'Upload your CV in the "CV and consent" section of your profile. It can be a PDF or Word file (.pdf, .doc, .docx) up to 5 MB. You choose whether employers you apply to may see it.',
      links:
        role === 'job_seeker' ? [{ label: 'Go to CV and consent', to: '/profile/cv' }] : undefined,
    }),
  },
  {
    id: 'apply',
    keywords: [
      'apply',
      'application',
      'how do i apply',
      'apply for job',
      'submit application',
      'cover note',
    ],
    roles: ['job_seeker'],
    reply: (role) => ({
      text: "Open a job and press Apply. You need a completed profile and a verified email first. You can add a short cover note, and employers see your profile and CV (if you allow it). Some jobs apply on the employer's own website instead.",
      links:
        role === 'job_seeker'
          ? [
              { label: 'Find jobs', to: '/jobs' },
              { label: 'My profile', to: '/profile' },
            ]
          : [
              { label: 'Find jobs', to: '/jobs' },
              { label: 'Register', to: '/register' },
            ],
      suggestions: ['What do the application statuses mean?', 'How do I save a job?'],
    }),
  },
  {
    id: 'statuses',
    keywords: [
      'status',
      'statuses',
      'shortlisted',
      'under review',
      'interview',
      'offered',
      'not selected',
      'track application',
      'withdraw',
      'application status',
    ],
    roles: ['job_seeker'],
    reply: (role) => ({
      text: 'Submitted: the employer has your application. Under review: they are reading it. Shortlisted: you are among the candidates they like. Interview: they want to meet you. Offered: they want to hire you. Not selected: they chose someone else. You can also withdraw an application yourself.',
      links:
        role === 'job_seeker' ? [{ label: 'My applications', to: '/applications' }] : undefined,
    }),
  },
  {
    id: 'search',
    keywords: [
      'search',
      'find job',
      'find jobs',
      'looking for job',
      'filter',
      'internship',
      'part time',
      'graduate trainee',
      'vacancies',
      'jobs',
    ],
    reply: () => ({
      text: 'Use the search box on the home page or the Jobs page. You can search by keyword and district, and filter by job type, where you work (on-site, hybrid, remote) and qualification.',
      links: [{ label: 'Browse jobs', to: '/jobs' }],
      suggestions: ['How do I save a job?', 'How do I apply for a job?'],
    }),
  },
  {
    id: 'saved',
    keywords: ['save job', 'saved jobs', 'bookmark', 'favourite', 'favorite', 'save a job'],
    reply: (role) => ({
      text: 'Press the bookmark on any job to save it, and find it later under Saved jobs. Saving needs a job seeker account.',
      links:
        role === 'job_seeker'
          ? [{ label: 'Saved jobs', to: '/saved' }]
          : [{ label: 'Browse jobs', to: '/jobs' }],
    }),
  },
  {
    id: 'employer-post',
    keywords: [
      'post vacancy',
      'post a vacancy',
      'post job',
      'post a job',
      'publish',
      'advertise',
      'hire',
      'hiring',
      'employer',
      'company',
      'vacancy',
    ],
    roles: ['employer'],
    reply: (role) => ({
      text: 'Register as an employer and fill in your company profile. An administrator reviews it, and once you are approved you can create and publish vacancies. Applications can come through this site, or you can point applicants to your own website.',
      links:
        role === 'employer'
          ? [
              { label: 'My company', to: '/employer' },
              { label: 'New vacancy', to: '/employer/vacancies/new' },
            ]
          : [{ label: 'Register as an employer', to: '/register' }],
      suggestions: ['How long does approval take?', 'How do I review applicants?'],
    }),
  },
  {
    id: 'approval',
    keywords: [
      'approval',
      'approved',
      'verify company',
      'company verification',
      'pending',
      'rejected company',
      'how long',
      'why cannot i publish',
      'cannot publish',
    ],
    roles: ['employer'],
    reply: (role) => ({
      text: 'Publishing is locked until an administrator approves your company. If your company is rejected you will see the reason on your dashboard; fix it and submit again. I cannot promise how long a review takes, but your status always shows on your dashboard.',
      links: role === 'employer' ? [{ label: 'My company', to: '/employer' }] : undefined,
    }),
  },
  {
    id: 'review-applicants',
    keywords: [
      'review applicants',
      'applicants',
      'shortlist',
      'candidates',
      'move candidate',
      'hire someone',
      'offer',
    ],
    roles: ['employer'],
    reply: (role) => ({
      text: 'Open one of your vacancies and choose Applicants. You can read each profile and CV, then move an applicant through Under review, Shortlisted, Interview and Offered, or mark them Not selected.',
      links: role === 'employer' ? [{ label: 'My vacancies', to: '/employer' }] : undefined,
    }),
  },
  {
    id: 'admin',
    keywords: [
      'admin',
      'administrator',
      'approve employer',
      'reports',
      'report a vacancy',
      'report job',
      'scam',
      'fake job',
    ],
    reply: (role) => ({
      text:
        role === 'admin'
          ? 'As an administrator you review new employers in the Employers queue and handle reported vacancies under Reports.'
          : 'If a vacancy looks fake or unsafe, open it and use the Report option. An administrator reviews every report and can close the vacancy.',
      links:
        role === 'admin'
          ? [
              { label: 'Employers', to: '/admin/employers' },
              { label: 'Reports', to: '/admin/reports' },
            ]
          : [{ label: 'Browse jobs', to: '/jobs' }],
    }),
  },
  {
    id: 'privacy',
    keywords: [
      'privacy',
      'my data',
      'delete account',
      'delete my account',
      'download data',
      'personal data',
      'safe',
      'security',
      'terms',
    ],
    reply: (role) => ({
      text: 'You control your data. Date of birth is private, CV sharing is your choice, and from My account you can download everything we hold about you or delete your account.',
      links: [
        ...(role ? [{ label: 'My account', to: '/account' }] : []),
        { label: 'Privacy Policy', to: '/privacy' },
        { label: 'Terms of Use', to: '/terms' },
      ],
    }),
  },
  {
    id: 'theme',
    keywords: ['dark mode', 'dark theme', 'light mode', 'night mode', 'theme', 'colour', 'color'],
    reply: () => ({
      text: 'Use the sun/moon button at the top right of any page to switch between light and dark mode. The system remembers your choice on this device.',
    }),
  },
  {
    id: 'install',
    keywords: ['install', 'app', 'phone', 'mobile', 'home screen', 'download app'],
    reply: () => ({
      text: 'You can install the site like an app. In Chrome or Edge use the install icon in the address bar; on Android or iPhone choose "Add to Home screen" in the browser menu.',
    }),
  },
  {
    id: 'cost',
    keywords: ['free', 'cost', 'price', 'pay', 'fee', 'charge', 'money'],
    reply: () => ({
      text: 'Registering and applying for jobs as a student or graduate is free. Be careful of any vacancy that asks you to pay money to apply, and report it.',
      links: [{ label: 'Browse jobs', to: '/jobs' }],
    }),
  },
  {
    id: 'contact',
    keywords: [
      'contact',
      'support',
      'phone number',
      'email address',
      'call',
      'speak to someone',
      'human',
      'complain',
    ],
    reply: () => ({
      text: 'I do not have a support phone number or inbox to give you yet. The Questions and answers section on the home page covers the most common problems.',
      links: [{ label: 'Questions and answers', to: '/#faq' }],
    }),
  },
]

export const STARTER_QUESTIONS = STARTERS

export const FALLBACK: BotReply = {
  text: 'Sorry, I did not understand that. I can help with registering, profiles, CVs, applying, application statuses, posting vacancies and your data. Try one of these:',
  suggestions: STARTERS,
}
