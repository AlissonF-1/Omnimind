export function playTrophySound() {
  if (typeof window === 'undefined') return
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return
    
    const ctx = new AudioContextClass()
    const now = ctx.currentTime

    // Função auxiliar para tocar uma nota com envelope
    const playNote = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator()
      const gainNode = ctx.createGain()

      osc.connect(gainNode)
      gainNode.connect(ctx.destination)

      osc.type = 'triangle' // Tom harmônico e suave (como sinos de console)
      osc.frequency.setValueAtTime(freq, now + startOffset)

      // Envelope de volume (Ataque curto, decaimento longo)
      gainNode.gain.setValueAtTime(0, now + startOffset)
      gainNode.gain.linearRampToValueAtTime(0.2, now + startOffset + 0.04)
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration)

      osc.start(now + startOffset)
      osc.stop(now + startOffset + duration)
    }

    // Nota 1: E5 (659.25Hz) - Primeira nota suave
    playNote(659.25, 0, 0.3)
    // Nota 2: A5 (880.00Hz) - Segunda nota mais alta e brilhante em sucessão rápida
    playNote(880.00, 0.1, 0.55)

  } catch (err) {
    console.warn('Web Audio API não pôde ser reproduzida (possível bloqueio de autoplay):', err)
  }
}
