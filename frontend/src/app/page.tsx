'use client'
import Link from 'next/link'
import { useEffect, useRef } from 'react'

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const dots: { x: number; y: number; vx: number; vy: number; opacity: number }[] = []
    for (let i = 0; i < 60; i++) {
      dots.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        opacity: Math.random() * 0.4 + 0.1,
      })
    }

    let frame: number
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      dots.forEach(d => {
        d.x += d.vx
        d.y += d.vy
        if (d.x < 0 || d.x > canvas.width) d.vx *= -1
        if (d.y < 0 || d.y > canvas.height) d.vy *= -1
        ctx.beginPath()
        ctx.arc(d.x, d.y, 1.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(26, 86, 219, ${d.opacity})`
        ctx.fill()
      })
      dots.forEach((a, i) => {
        dots.slice(i + 1).forEach(b => {
          const dist = Math.hypot(a.x - b.x, a.y - b.y)
          if (dist < 120) {
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `rgba(26, 86, 219, ${0.08 * (1 - dist / 120)})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        })
      })
      frame = requestAnimationFrame(animate)
    }
    animate()

    const handleResize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', handleResize) }
  }, [])

  return (
    <main style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif", overflow: 'hidden' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,700;1,300&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, left: 0, pointerEvents: 'none', zIndex: 0 }} />

      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 2.5rem', height: '64px',
        background: 'rgba(248,247,245,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(26,86,219,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px', height: '36px', background: '#1A56DB', borderRadius: '9px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'DM Mono', monospace", fontSize: '14px', fontWeight: 500, color: 'white',
          }}>{'>'}_</div>
          <span style={{ fontWeight: 700, fontSize: '18px', color: '#0E2D6E', letterSpacing: '-0.02em' }}>commit</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <Link href="/login" style={{ fontSize: '14px', color: '#5F5E5A', textDecoration: 'none', fontWeight: 500 }}>sign in</Link>
          <Link href="/signup" style={{
            fontSize: '14px', fontWeight: 600, color: 'white', textDecoration: 'none',
            background: '#1A56DB', padding: '8px 20px', borderRadius: '8px',
            transition: 'background 0.15s',
          }}>apply as teacher</Link>
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        position: 'relative', zIndex: 1,
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '120px 2rem 80px',
        textAlign: 'center',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          background: '#EBF1FD', border: '1px solid rgba(26,86,219,0.2)',
          borderRadius: '99px', padding: '6px 16px', marginBottom: '2rem',
          fontSize: '13px', fontWeight: 500, color: '#1A56DB',
        }}>
          <span style={{ width: '6px', height: '6px', background: '#22C55E', borderRadius: '50%', display: 'inline-block' }} />
          free for teachers &amp; students
        </div>

        <h1 style={{
          fontSize: 'clamp(3rem, 8vw, 6rem)', fontWeight: 700, lineHeight: 1.0,
          color: '#0E2D6E', letterSpacing: '-0.04em', margin: '0 0 1.5rem',
          maxWidth: '800px',
        }}>
          commit to<br />
          <span style={{ color: '#1A56DB' }}>learning.</span><br />
          commit to <span style={{ color: '#1A56DB' }}>code.</span>
        </h1>

        <p style={{
          fontSize: '1.2rem', color: '#5F5E5A', maxWidth: '520px',
          lineHeight: 1.7, margin: '0 0 2.5rem', fontWeight: 400,
        }}>
          The free AP CSP platform that teaches Python, version control, and computational thinking — all in one place.
        </p>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/signup" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: '#1A56DB', color: 'white', textDecoration: 'none',
            padding: '14px 28px', borderRadius: '10px', fontWeight: 600, fontSize: '15px',
          }}>
            apply as teacher
            <span style={{ fontSize: '18px' }}>→</span>
          </Link>
          <Link href="/login" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'white', color: '#0E2D6E', textDecoration: 'none',
            padding: '14px 28px', borderRadius: '10px', fontWeight: 600, fontSize: '15px',
            border: '1.5px solid rgba(14,45,110,0.15)',
          }}>
            student sign in
          </Link>
        </div>

        {/* TERMINAL PREVIEW */}
        <div style={{
          marginTop: '5rem', width: '100%', maxWidth: '680px',
          background: '#1C1C1E', borderRadius: '14px',
          overflow: 'hidden', boxShadow: '0 32px 80px rgba(14,45,110,0.18)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{
            padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px',
            background: '#2A2A2C', borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#EF4444' }} />
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#F59E0B' }} />
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#22C55E' }} />
            <span style={{ marginLeft: '8px', fontSize: '12px', color: '#888780', fontFamily: "'DM Mono', monospace" }}>assignment_01.py</span>
          </div>
          <div style={{ padding: '1.5rem', fontFamily: "'DM Mono', monospace", fontSize: '13px', lineHeight: 2, textAlign: 'left' }}>
            <div><span style={{ color: '#7F77DD' }}>def</span> <span style={{ color: '#22C55E' }}>greet_user</span><span style={{ color: '#EBF1FD' }}>(name):</span></div>
            <div style={{ paddingLeft: '2rem' }}><span style={{ color: '#F59E0B' }}>"""</span><span style={{ color: '#888780' }}>Say hello to a user by name.</span><span style={{ color: '#F59E0B' }}>"""</span></div>
            <div style={{ paddingLeft: '2rem' }}><span style={{ color: '#7F77DD' }}>return</span> <span style={{ color: '#F59E0B' }}>f"Hello, </span><span style={{ color: '#22C55E' }}>{'{'}name{'}'}</span><span style={{ color: '#F59E0B' }}>!"</span></div>
            <div style={{ marginTop: '0.5rem' }}><span style={{ color: '#888780' }}># test it</span></div>
            <div><span style={{ color: '#EBF1FD' }}>print(</span><span style={{ color: '#22C55E' }}>greet_user</span><span style={{ color: '#EBF1FD' }}>(</span><span style={{ color: '#F59E0B' }}>"Alex"</span><span style={{ color: '#EBF1FD' }}>))</span></div>
            <div style={{ marginTop: '1rem', color: '#22C55E' }}>{'>'} Hello, Alex!</div>
            <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                background: '#1A56DB', color: 'white', padding: '4px 14px',
                borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              }}>commit changes</div>
              <span style={{ color: '#5F5E5A', fontSize: '12px' }}>3 / 3 commits required</span>
              <span style={{ color: '#22C55E', fontSize: '12px' }}>ready to submit</span>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{
        position: 'relative', zIndex: 1,
        padding: '6rem 2rem', background: 'white',
        borderTop: '1px solid rgba(14,45,110,0.06)',
      }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <p style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, letterSpacing: '0.1em', color: '#1A56DB', textTransform: 'uppercase', marginBottom: '1rem' }}>everything you need</p>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 700, color: '#0E2D6E', letterSpacing: '-0.03em', marginBottom: '3.5rem' }}>
            built for AP CSP.<br />designed for real classrooms.
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {[
              { icon: '⌨', title: 'Python from day one', desc: 'Scaffolded from block pseudocode all the way to typed Python. Every student moves at the right pace.' },
              { icon: '◎', title: 'Baby git built in', desc: 'Students commit their code, write messages, and see a visual timeline. Version control as a first-class lesson.' },
              { icon: '▦', title: 'Full AP CSP curriculum', desc: 'Every unit, lesson, and assignment — including Create PT mode and exam prep. Ready to use on day one.' },
              { icon: '⊹', title: 'Real classroom tools', desc: 'Assignments, due dates, grading, help requests, stand-ups, and discussion boards — all in one place.' },
              { icon: '◈', title: 'The Playground', desc: 'Freeform coding space for student projects with version history, collaboration, and class galleries.' },
              { icon: '◻', title: 'Free forever', desc: 'Ad-supported and free for all teachers and students. Pro and school tiers available for extra features.' },
            ].map((f, i) => (
              <div key={i} style={{
                padding: '1.75rem', borderRadius: '12px',
                border: '1px solid rgba(14,45,110,0.08)',
                background: '#FAFAF8',
                transition: 'border-color 0.15s, transform 0.15s',
              }}>
                <div style={{ fontSize: '24px', marginBottom: '1rem' }}>{f.icon}</div>
                <div style={{ fontWeight: 600, fontSize: '15px', color: '#0E2D6E', marginBottom: '0.5rem' }}>{f.title}</div>
                <div style={{ fontSize: '14px', color: '#5F5E5A', lineHeight: 1.7 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{
        position: 'relative', zIndex: 1,
        padding: '6rem 2rem', textAlign: 'center',
        background: '#0E2D6E',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle at 30% 50%, rgba(26,86,219,0.4) 0%, transparent 60%), radial-gradient(circle at 70% 50%, rgba(26,86,219,0.2) 0%, transparent 60%)',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 700, color: 'white', letterSpacing: '-0.03em', margin: '0 0 1rem' }}>
            ready to commit?
          </h2>
          <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.7)', marginBottom: '2.5rem' }}>
            Apply for a free teacher account and get your first classroom running today.
          </p>
          <Link href="/signup" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'white', color: '#0E2D6E', textDecoration: 'none',
            padding: '16px 36px', borderRadius: '10px', fontWeight: 700, fontSize: '16px',
          }}>
            apply as teacher →
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{
        position: 'relative', zIndex: 1,
        padding: '2rem 2.5rem', background: '#F8F7F5',
        borderTop: '1px solid rgba(14,45,110,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px', height: '28px', background: '#1A56DB', borderRadius: '7px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'white', fontWeight: 500,
          }}>{'>'}_</div>
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#0E2D6E' }}>commit</span>
        </div>
        <p style={{ fontSize: '13px', color: '#888780', margin: 0 }}>commit to learning. commit to code.</p>
      </footer>
    </main>
  )
}
