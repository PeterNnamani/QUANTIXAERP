'use client'

import { useEffect, useState } from 'react'
import LoginPage from '@/components/auth/login-page'
import LandingPage from '@/components/landing-page'

export const ONBOARDING_COMPLETED_KEY = 'quantixa_onboarding_completed'

export default function EntryPage() {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(null)

  useEffect(() => {
    setHasCompletedOnboarding(window.localStorage.getItem(ONBOARDING_COMPLETED_KEY) === 'true')
  }, [])

  if (hasCompletedOnboarding === null) {
    return <div style={{ minHeight: '100vh', background: '#f0f4fc' }} aria-hidden="true" />
  }

  return hasCompletedOnboarding ? <LoginPage /> : <LandingPage />
}
