import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
// @ts-ignore
import pdfParse from 'pdf-parse'

async function callGeminiStructure(text: string, apiKey: string) {
  const prompt = `
Você é um extrator de dados altamente preciso. Analise o texto do PDF abaixo e retorne um JSON com a seguinte estrutura:
{
  "title": string | null,
  "authors": string[] | null,
  "sections": [{ "heading": string | null, "text": string }],
  "suggestedNoteTitle": string | null
}
Regras:
1. Trunque seções muito longas, mas preserve o significado principal.
2. Se uma informação não existir, use null.
3. Não adicione markdown na resposta, apenas o JSON puro.

Texto do PDF:
"""
${text.slice(0, 25000)}
"""
  `;

  // Endpoint correto da API atual (Gemini 2.5 Flash)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json" // Força a IA a devolver um JSON parseável
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Erro na API do Gemini: ${res.status} ${txt}`)
  }

  const data = await res.json()
  const respText = data?.candidates?.[0]?.content?.parts?.[0]?.text

  if (!respText) {
    throw new Error('Resposta vazia da IA')
  }

  return JSON.parse(respText)
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const body = await req.json()
    let pdfBuffer: Buffer

    if (body.signedUrl) {
      // Baixa o arquivo via URL assinada
      const fetched = await fetch(body.signedUrl)
      if (!fetched.ok) return NextResponse.json({ error: 'Falha ao baixar arquivo via signedUrl' }, { status: 500 })
      
      const arrayBuffer = await fetched.arrayBuffer()
      // CORREÇÃO: pdf-parse exige estritamente um Buffer do Node.js
      pdfBuffer = Buffer.from(arrayBuffer)
    } else {
      const { filePath } = body
      if (!filePath) return NextResponse.json({ error: 'filePath é obrigatório' }, { status: 400 })

      // Download direto do storage
      const { data: fileData, error: downloadError } = await supabase.storage.from('note_files').download(filePath)
      if (downloadError) {
        console.error('Erro ao baixar PDF:', downloadError)
        return NextResponse.json({ error: 'Falha ao baixar PDF' }, { status: 500 })
      }

      const arrayBuffer = await fileData.arrayBuffer()
      // CORREÇÃO: pdf-parse exige estritamente um Buffer do Node.js
      pdfBuffer = Buffer.from(arrayBuffer)
    }

    // Extrai o texto do PDF
    const parsed = await pdfParse(pdfBuffer)
    const fullText = parsed.text || ''

    if (!fullText.trim()) {
      return NextResponse.json({ error: 'Não foi possível extrair texto deste PDF (pode ser uma imagem escaneada).' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Chave da API do Gemini não configurada no servidor.' }, { status: 500 })
    }

    // Chama o Gemini para estruturar o texto extraído
    try {
      const structured = await callGeminiStructure(fullText, apiKey)
      return NextResponse.json({ success: true, structured })
    } catch (e: any) {
      console.error('Falha na estruturação do Gemini:', e)
      
      // Fallback seguro em caso de falha da IA
      return NextResponse.json({ 
        success: true, 
        structured: { 
          title: "Documento Importado", 
          authors: [], 
          sections: [{ heading: "Conteúdo Original", text: fullText.slice(0, 3000) }], 
          suggestedNoteTitle: "Nota do PDF" 
        } 
      })
    }
  } catch (error) {
    console.error('Erro fatal na extração:', error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}