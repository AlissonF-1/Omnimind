'use client'

import { Pause, Play, RotateCcw, Volume2 } from '@/components/icons'
import { useRef, useState } from 'react'

export function AcademyAudio({ src, label, compact = false }: { src: string; label: string; compact?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'error'>('idle')
  const [rate, setRate] = useState(1)
  const [started, setStarted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [duration, setDuration] = useState(0)
  async function toggle() {
    const player = audio.current
    if (!player) return
    if (!player.paused) {
      player.pause()
      return
    }
    for (const other of document.querySelectorAll<HTMLAudioElement>('.ac-audio audio')) {
      if (other !== player && !other.paused) other.pause()
    }
    player.playbackRate = rate
    setState('loading')
    try {
      await player.play()
      setStarted(true)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setState('error')
    }
  }
  return <div className={'ac-audio' + (compact ? ' ac-audio-compact' : '')} aria-label={label}>
    <audio ref={audio} src={src} preload="none" onPlaying={() => setState('playing')}
      onPause={() => setState('paused')} onEnded={() => setState('paused')}
      onWaiting={() => setState('loading')} onError={() => setState('error')}
      onLoadedMetadata={(event) => { if (!compact) setDuration(event.currentTarget.duration || 0) }}
      onTimeUpdate={(event) => { if (!compact) setElapsed(event.currentTarget.currentTime) }} />
    {!compact && <progress className="ac-audio-progress" value={elapsed} max={duration || 1} aria-label="Progresso da reprodução" />}
    <button type="button" className="ac-btn ac-audio-play" onClick={() => void toggle()}>
      {state === 'playing' ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
      {state === 'playing' ? 'Pausar' : state === 'loading' ? 'Carregando…' : 'Ouvir'}
      <span className="sr-only"> {label}</span>
    </button>
    {!compact && <>
      <button type="button" className="ac-btn ac-subtle" disabled={!started} onClick={() => {
        if (audio.current) audio.current.currentTime = 0
      }} aria-label="Voltar ao início do áudio"><RotateCcw size={16} aria-hidden="true" /> Repetir</button>
      <label className="ac-audio-rate"><Volume2 size={16} aria-hidden="true" /><span className="sr-only">Velocidade de reprodução</span>
        <select value={rate} onChange={(event) => {
          const speed = Number(event.target.value)
          if (audio.current) audio.current.playbackRate = speed
          setRate(speed)
        }}><option value={0.75}>0,75×</option><option value={1}>1×</option><option value={1.25}>1,25×</option></select>
      </label>
    </>}
    {state === 'error' && <span role="status" className="ac-error">Áudio indisponível. Tente novamente.</span>}
  </div>
}
