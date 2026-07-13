import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo de áudio enviado.' }, { status: 400 })
    }

    const groqApiKey = process.env.GROQ_API_KEY
    if (!groqApiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY não configurada no servidor.' }, { status: 500 })
    }

    const apiFormData = new FormData()
    apiFormData.append('file', file)
    apiFormData.append('model', 'whisper-large-v3-turbo')
    apiFormData.append('language', 'pt')

    const whisperResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
      },
      body: apiFormData,
    })

    if (!whisperResponse.ok) {
      if (whisperResponse.status === 429) {
        return NextResponse.json(
          { error: 'Serviço de transcrição sobrecarregado. Aguarde e tente novamente.' },
          { status: 429 }
        )
      }
      const errorText = await whisperResponse.text()
      throw new Error(`Groq Whisper falhou: ${errorText}`)
    }

    const whisperData = await whisperResponse.json()
    return NextResponse.json({ text: whisperData.text || '' })
  } catch (error: any) {
    console.error('[Transcribe API] Erro:', error)
    return NextResponse.json({ error: error.message || 'Erro inesperado ao transcrever.' }, { status: 500 })
  }
}
