/** Public support contact, shown on the landing page and in the footer (decision 026). */
export const SUPPORT_PHONE_HREF = 'tel:+256740994073'
export const SUPPORT_PHONE_LABEL = '+256 740 994 073'
export const SUPPORT_EMAIL = 'djm@gmail.com'

/** Landing images (free licence, see docs/decisions/026-landing-page-redesign.md). */
export const IMAGES = {
  hero: {
    src: '/images/landing/hero-1400.jpg',
    srcSet: '/images/landing/hero-800.jpg 800w, /images/landing/hero-1400.jpg 1400w',
  },
  graduates: '/images/landing/graduates.jpg',
  interview: '/images/landing/interview.jpg',
  handshake: '/images/landing/handshake.jpg',
} as const
