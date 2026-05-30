import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import FeedbackButton from '@/components/FeedbackButton'

export const metadata: Metadata = {
  title: 'commit — commit to learning. commit to code.',
  description: 'The free AP CSP platform that teaches Python, version control, and computational thinking.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
          <FeedbackButton />
        </AuthProvider>
      </body>
    </html>
  )
}
