import type { SocialProvider } from '../components/organisms/SocialLogin'

// Social sign-in options shared by the auth pages.
export const socialProviders: SocialProvider[] = [
  { id: 'github', name: 'Github', icon: '/icons/github.svg' },
  { id: 'google', name: 'Gmail', icon: '/icons/google.svg' },
]
