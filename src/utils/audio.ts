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

export function playLevelUpSound() {
  if (typeof window === 'undefined') return
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return
    
    const ctx = new AudioContextClass()
    const now = ctx.currentTime

    const playNote = (freq: number, startOffset: number, duration: number, vol = 0.2) => {
      const osc = ctx.createOscillator()
      const gainNode = ctx.createGain()

      osc.connect(gainNode)
      gainNode.connect(ctx.destination)

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + startOffset)

      gainNode.gain.setValueAtTime(0, now + startOffset)
      gainNode.gain.linearRampToValueAtTime(vol, now + startOffset + 0.05)
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration)

      osc.start(now + startOffset)
      osc.stop(now + startOffset + duration)
    }

    // Arpejo ascendente clássico de level up (C4 -> E4 -> G4 -> C5 -> E5 -> G5 -> C6)
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]
    notes.forEach((freq, idx) => {
      playNote(freq, idx * 0.08, 0.4, 0.15)
    })

    // Nota final festiva e harmônica sustentada: C6 com vibrato leve
    const finalFreq = 1046.50
    const finalOffset = notes.length * 0.08
    playNote(finalFreq, finalOffset, 1.2, 0.2)
    playNote(finalFreq * 1.5, finalOffset + 0.08, 1.0, 0.1) // Adiciona quinta justa (G6) para brilho

  } catch (err) {
    console.warn('Web Audio API level up error:', err)
  }
}

export function getBestVoice(voicePref: 'default' | 'male' | 'female'): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  
  // Filtra vozes em português
  const ptVoices = voices.filter(v => v.lang.toLowerCase().replace('_', '-').startsWith('pt'))
  if (ptVoices.length === 0) return null

  // Pontuação e ordenação para priorizar vozes neurais / de alta qualidade
  const getVoiceScore = (voice: SpeechSynthesisVoice) => {
    const name = voice.name.toLowerCase()
    let score = 0
    if (name.includes('neural')) score += 100
    if (name.includes('natural')) score += 90
    if (name.includes('online')) score += 80
    if (name.includes('google')) score += 70
    if (name.includes('microsoft')) score += 60
    if (voice.lang.toLowerCase().replace('_', '-').includes('pt-br')) score += 10
    return score
  }

  const sortedPtVoices = [...ptVoices].sort((a, b) => getVoiceScore(b) - getVoiceScore(a))

  if (voicePref === 'default') {
    return sortedPtVoices[0]
  }

  const maleKeywords = ['antonio', 'felipe', 'daniel', 'helder', 'rodrigo', 'ricardo', 'junior', 'male', 'homem', 'masculino', 'cosme']
  const femaleKeywords = ['francisca', 'maria', 'heloisa', 'luciana', 'joana', 'vitoria', 'fernanda', 'raquel', 'female', 'mulher', 'feminino', 'google português']

  if (voicePref === 'male') {
    const maleVoice = sortedPtVoices.find(v => 
      maleKeywords.some(kw => v.name.toLowerCase().includes(kw))
    )
    if (maleVoice) return maleVoice
    const fallbackMale = sortedPtVoices.find(v => 
      !femaleKeywords.some(kw => v.name.toLowerCase().includes(kw))
    )
    return fallbackMale || sortedPtVoices[0]
  }

  if (voicePref === 'female') {
    const femaleVoice = sortedPtVoices.find(v => 
      femaleKeywords.some(kw => v.name.toLowerCase().includes(kw))
    )
    if (femaleVoice) return femaleVoice
    const fallbackFemale = sortedPtVoices.find(v => 
      !maleKeywords.some(kw => v.name.toLowerCase().includes(kw))
    )
    return fallbackFemale || sortedPtVoices[0]
  }

  return sortedPtVoices[0]
}
