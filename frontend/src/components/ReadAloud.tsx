'use client'
import { useState, useEffect, useRef } from 'react'

interface Props {
  text: string
  isPro?: boolean
  className?: string
}

const ELEVENLABS_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL' // "Sarah" — warm, clear, professional

export default function ReadAloud({ text, isPro = false }: Props) {
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [supported, setSupported] = useState(false)
  const [rate, setRate] = useState(1.0)
  const [showControls, setShowControls] = useState(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    setSupported('speechSynthesis' in window)
    return () => {
      if (utteranceRef.current) window.speechSynthesis.cancel()
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    }
  }, [])

  const getBestVoice = (): SpeechSynthesisVoice | null => {
    const voices = window.speechSynthesis.getVoices()
    // Prefer high quality voices in order
    const preferred = [
      'Samantha', 'Karen', 'Daniel', 'Google US English',
      'Google UK English Female', 'Microsoft Zira', 'Microsoft David',
    ]
    for (const name of preferred) {
      const match = voices.find(v => v.name.includes(name))
      if (match) return match
    }
    // Fallback to any English voice
    return voices.find(v => v.lang.startsWith('en')) || voices[0] || null
  }

  const stopAll = () => {
    window.speechSynthesis.cancel()
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    setPlaying(false)
    setLoading(false)
  }

  const speakWithWebSpeech = () => {
    if (!supported) return
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = rate
    utterance.pitch = 1.0
    utterance.volume = 1.0

    // Wait for voices to load if needed
    const setVoice = () => {
      const voice = getBestVoice()
      if (voice) utterance.voice = voice
    }

    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = setVoice
    } else {
      setVoice()
    }

    utterance.onstart = () => setPlaying(true)
    utterance.onend = () => setPlaying(false)
    utterance.onerror = () => setPlaying(false)

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }

  const speakWithElevenLabs = async () => {
    const apiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY
    if (!apiKey) {
      // Fall back to Web Speech if no key
      speakWithWebSpeech()
      return
    }

    setLoading(true)
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_turbo_v2',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.3,
              use_speaker_boost: true,
            },
          }),
        }
      )

      if (!response.ok) throw new Error('ElevenLabs request failed')

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio

      audio.playbackRate = rate
      audio.onplay = () => { setPlaying(true); setLoading(false) }
      audio.onended = () => { setPlaying(false); URL.revokeObjectURL(url) }
      audio.onerror = () => { setPlaying(false); setLoading(false) }
      audio.play()
    } catch (e) {
      console.error('ElevenLabs TTS failed, falling back to Web Speech', e)
      setLoading(false)
      speakWithWebSpeech()
    }
  }

  const handleToggle = () => {
    if (playing || loading) {
      stopAll()
      return
    }
    if (isPro) {
      speakWithElevenLabs()
    } else {
      speakWithWebSpeech()
    }
  }

  if (!supported) return null

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', position: 'relative' }}>

      {/* MAIN BUTTON */}
      <button
        onClick={handleToggle}
        aria-label={playing ? 'stop reading' : 'read aloud'}
        title={playing ? 'stop' : `read aloud${isPro ? ' (ElevenLabs)' : ''}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '6px 12px', borderRadius: '99px',
          border: `1px solid ${playing ? 'rgba(26,86,219,0.4)' : 'rgba(14,45,110,0.15)'}`,
          background: playing ? '#EBF1FD' : 'white',
          color: playing ? '#1A56DB' : '#5F5E5A',
          fontSize: '12px', fontWeight: 600, cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif",
          transition: 'all 0.15s',
        }}
      >
        {loading ? (
          <span style={{ fontSize: '14px', animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span>
        ) : playing ? (
          <span style={{ fontSize: '14px' }}>⏹</span>
        ) : (
          <span style={{ fontSize: '14px' }}>▶</span>
        )}
        {loading ? 'loading...' : playing ? 'stop' : 'read aloud'}
        {isPro && !playing && !loading && (
          <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: '#EBF1FD', color: '#1A56DB', fontWeight: 700 }}>PRO</span>
        )}
      </button>

      {/* SPEED CONTROL */}
      <button
        onClick={() => setShowControls(c => !c)}
        aria-label="reading speed settings"
        style={{ padding: '6px 8px', borderRadius: '99px', border: '1px solid rgba(14,45,110,0.15)', background: 'white', color: '#888780', fontSize: '12px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
      >
        {rate}×
      </button>

      {/* SPEED DROPDOWN */}
      {showControls && (
        <div style={{ position: 'absolute', top: '110%', right: 0, background: 'white', borderRadius: '10px', border: '1px solid rgba(14,45,110,0.12)', boxShadow: '0 4px 20px rgba(14,45,110,0.12)', padding: '8px', zIndex: 100, minWidth: '120px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#888780', marginBottom: '6px', padding: '0 4px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>speed</div>
          {[0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map(r => (
            <button key={r} onClick={() => { setRate(r); setShowControls(false); if (playing) { stopAll() } }} style={{ display: 'block', width: '100%', padding: '6px 10px', textAlign: 'left', background: rate === r ? '#EBF1FD' : 'transparent', color: rate === r ? '#1A56DB' : '#5F5E5A', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: rate === r ? 600 : 400, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              {r}× {r === 1.0 ? '(normal)' : r < 1 ? '(slow)' : r >= 1.75 ? '(fast)' : ''}
            </button>
          ))}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}