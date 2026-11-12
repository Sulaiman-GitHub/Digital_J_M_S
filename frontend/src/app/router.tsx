import { createBrowserRouter, type RouteObject } from 'react-router-dom'
import { AppLayout } from '../components/AppLayout'
import { HomePage } from '../features/home/HomePage'
import { NotFoundPage } from '../features/home/NotFoundPage'
import { RedirectIfAuthenticated, RequireAuth, RequireRole } from './guards'

// Dev-only routes. import.meta.env.DEV is false in production builds, so this code and the
// lazily imported page are removed from the bundle.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/styleguide',
        lazy: async () => {
          const { StyleguidePage } = await import('../features/styleguide/StyleguidePage')
          return { Component: StyleguidePage }
        },
      },
    ]
  : []

// Route modules are loaded on demand to keep the first download small.
export const authRoutes: RouteObject[] = [
  {
    element: <RedirectIfAuthenticated />,
    children: [
      {
        path: '/login',
        lazy: async () => ({
          Component: (await import('../features/auth/LoginPage')).LoginPage,
        }),
      },
      {
        path: '/register',
        lazy: async () => ({
          Component: (await import('../features/auth/RegisterPage')).RegisterPage,
        }),
      },
    ],
  },
  {
    path: '/forgot-password',
    lazy: async () => ({
      Component: (await import('../features/auth/ForgotPasswordPage')).ForgotPasswordPage,
    }),
  },
  {
    path: '/reset-password',
    lazy: async () => ({
      Component: (await import('../features/auth/ResetPasswordPage')).ResetPasswordPage,
    }),
  },
  {
    path: '/verify-email',
    lazy: async () => ({
      Component: (await import('../features/auth/VerifyEmailPage')).VerifyEmailPage,
    }),
  },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/account',
        lazy: async () => ({
          Component: (await import('../features/account/AccountPage')).AccountPage,
        }),
      },
      {
        // Job seekers only (the server enforces this too).
        element: <RequireRole roles={['job_seeker']} />,
        children: [
          {
            path: '/profile/:step?',
            lazy: async () => ({
              Component: (await import('../features/profile/ProfilePage')).ProfilePage,
            }),
          },
          {
            path: '/jobs/:id/apply',
            lazy: async () => ({
              Component: (await import('../features/applications/ApplyPage')).ApplyPage,
            }),
          },
          {
            path: '/saved',
            lazy: async () => ({
              Component: (await import('../features/saved/SavedJobsPage')).SavedJobsPage,
            }),
          },
          {
            path: '/applications',
            lazy: async () => ({
              Component: (await import('../features/applications/ApplicationsPage'))
                .ApplicationsPage,
            }),
          },
          {
            path: '/applications/:id',
            lazy: async () => ({
              Component: (await import('../features/applications/ApplicationDetailPage'))
                .ApplicationDetailPage,
            }),
          },
        ],
      },
      {
        // Employers only. The banner above every employer page shows the verification status.
        element: <RequireRole roles={['employer']} />,
        children: [
          {
            lazy: async () => ({
              Component: (await import('../features/employers/EmployerLayout')).EmployerLayout,
            }),
            children: [
              {
                path: '/employer',
                lazy: async () => ({
                  Component: (await import('../features/employers/EmployerDashboardPage'))
                    .EmployerDashboardPage,
                }),
              },
              {
                path: '/employer/vacancies/new',
                lazy: async () => ({
                  Component: (
                    await import('../features/employers/vacancies/EmployerVacancyFormPage')
                  ).EmployerVacancyFormPage,
                }),
              },
              {
                path: '/employer/vacancies/:id',
                lazy: async () => ({
                  Component: (
                    await import('../features/employers/vacancies/EmployerVacancyFormPage')
                  ).EmployerVacancyFormPage,
                }),
              },
              {
                path: '/employer/vacancies/:id/applicants',
                lazy: async () => ({
                  Component: (await import('../features/applications/ApplicantsPage'))
                    .ApplicantsPage,
                }),
              },
              {
                path: '/employer/applications/:id',
                lazy: async () => ({
                  Component: (await import('../features/applications/ApplicantDetailPage'))
                    .ApplicantDetailPage,
                }),
              },
              {
                path: '/employer/profile',
                lazy: async () => ({
                  Component: (await import('../features/employers/CompanyProfilePage'))
                    .CompanyProfilePage,
                }),
              },
            ],
          },
        ],
      },
      {
        // Admins only (the server enforces this too).
        element: <RequireRole roles={['admin']} />,
        children: [
          {
            path: '/admin/employers',
            lazy: async () => ({
              Component: (await import('../features/admin/EmployerQueuePage')).EmployerQueuePage,
            }),
          },
          {
            path: '/admin/reports',
            lazy: async () => ({
              Component: (await import('../features/admin/ReportsPage')).ReportsPage,
            }),
          },
          {
            path: '/admin/vacancies/new',
            lazy: async () => ({
              Component: (await import('../features/admin/AdminVacancyPage')).AdminVacancyPage,
            }),
          },
          {
            path: '/admin/employers/:id',
            lazy: async () => ({
              Component: (await import('../features/admin/EmployerDetailPage')).EmployerDetailPage,
            }),
          },
        ],
      },
    ],
  },
]

// Public pages: anyone can read them, including before registering.
const legalRoutes: RouteObject[] = [
  {
    path: '/terms',
    lazy: async () => ({ Component: (await import('../features/legal/TermsPage')).TermsPage }),
  },
  {
    path: '/privacy',
    lazy: async () => ({ Component: (await import('../features/legal/PrivacyPage')).PrivacyPage }),
  },
]

// Public pages: anyone can browse jobs without an account.
const jobRoutes: RouteObject[] = [
  {
    path: '/jobs',
    lazy: async () => ({ Component: (await import('../features/vacancies/JobsPage')).JobsPage }),
  },
  {
    path: '/jobs/:id',
    lazy: async () => ({
      Component: (await import('../features/vacancies/JobDetailPage')).JobDetailPage,
    }),
  },
]

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    // Shown only while the first lazy route module loads.
    HydrateFallback: () => null,
    children: [
      { path: '/', element: <HomePage /> },
      ...authRoutes,
      ...legalRoutes,
      ...jobRoutes,
      ...devRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
