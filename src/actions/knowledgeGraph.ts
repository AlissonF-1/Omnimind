'use server'

import { createClient } from '@/utils/supabase/server'
import { embedQuery } from '@/lib/embeddings'
import { callAIWithFallback } from '@/lib/ai-fallback'

export interface GraphNode {
  id: string
  label: string
  topic: string
  health?: number | null
  flashcardsCount?: number
  isGhost?: boolean
}

export interface GraphLink {
  source: string
  target: string
  value: number
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

export async function getWorkspaceGraph(workspaceId: string): Promise<GraphData> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    console.error('[getWorkspaceGraph] Usuário não autenticado.')
    return { nodes: [], links: [] }
  }

  // 1. Busca todas as notas deste workspace
  const { data: notes, error: notesError } = await supabase
    .from('notes')
    .select('id, title, topic')
    .eq('workspace_id', workspaceId)

  if (notesError || !notes) {
    console.error('[getWorkspaceGraph] Erro ao buscar notas:', notesError)
    return { nodes: [], links: [] }
  }

  // 2. Busca todos os flashcards do workspace
  const { data: flashcards } = await supabase
    .from('flashcards')
    .select('note_id, reps, lapses')
    .in('note_id', notes.map(n => n.id))

  // Agrupa os flashcards por nota e calcula a saúde média
  const noteHealth = new Map<string, { totalReviewed: number; sumCorrectness: number; totalCards: number }>()
  
  if (flashcards) {
    for (const card of flashcards) {
      const d = noteHealth.get(card.note_id) || { totalReviewed: 0, sumCorrectness: 0, totalCards: 0 }
      d.totalCards++
      if (card.reps > 0) {
        d.totalReviewed++
        const correctness = Math.max(0, Math.min(1, (card.reps - (card.lapses || 0)) / card.reps))
        d.sumCorrectness += correctness
      }
      noteHealth.set(card.note_id, d)
    }
  }

  // 3. Busca todas as relações de pré-requisitos estruturadas no banco
  const noteIds = notes.map(n => n.id)
  const { data: relations, error: relError } = await supabase
    .from('concept_relations')
    .select('id, source_note_id, target_note_id, ghost_concept_name')
    .in('target_note_id', noteIds)

  // Criar os nós do Grafo a partir das notas reais
  const realNodes: GraphNode[] = notes.map(n => {
    const stats = noteHealth.get(n.id)
    let health = null
    if (stats && stats.totalReviewed > 0) {
      health = stats.sumCorrectness / stats.totalReviewed
    }
    return {
      id: n.id,
      label: n.title,
      topic: n.topic || 'Geral',
      health: health,
      flashcardsCount: stats?.totalCards || 0,
      isGhost: false
    }
  })

  // Identifica nós fantasmas únicos e monta os links do grafo
  const ghostNodesMap = new Map<string, GraphNode>()
  const links: GraphLink[] = []

  if (relations && !relError) {
    for (const rel of relations) {
      let sourceId = ''

      if (rel.source_note_id) {
        sourceId = rel.source_note_id
      } else if (rel.ghost_concept_name) {
        const ghostId = `ghost:${rel.ghost_concept_name}`
        sourceId = ghostId
        if (!ghostNodesMap.has(ghostId)) {
          ghostNodesMap.set(ghostId, {
            id: ghostId,
            label: rel.ghost_concept_name,
            topic: 'Pré-requisito Ausente',
            health: null,
            flashcardsCount: 0,
            isGhost: true
          })
        }
      }

      links.push({
        source: sourceId,
        target: rel.target_note_id,
        value: 1.0
      })
    }
  }

  const allNodes = [...realNodes, ...Array.from(ghostNodesMap.values())]

  return { nodes: allNodes, links }
}

export async function generateConceptPrerequisites(noteId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autenticado' }

    // 1. Busca a nota alvo
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('id, title, content, workspace_id')
      .eq('id', noteId)
      .eq('user_id', user.id)
      .single()

    if (noteError || !note) {
      return { error: 'Nota não encontrada' }
    }

    // 2. Chama a IA para listar pré-requisitos em formato JSON array
    const systemPrompt = `Você é um coordenador de curso universitário de computação e tecnologia.
Analise o conteúdo da nota fornecida pelo estudante.
Identifique de 3 a 5 conceitos acadêmicos fundamentais (pré-requisitos) que o estudante PRECISA saber para compreender este tema.
REGRAS RÍGIDAS:
- Retorne APENAS um array JSON de strings com os nomes dos conceitos (ex: ["Álgebra Linear", "Memória Cache"]).
- Não inclua nenhuma introdução, explicação ou formatação de código markdown que não seja o próprio objeto/array JSON.
- Foque em conceitos de nível acadêmico/técnico do mesmo curso.
- NÃO liste conhecimentos básicos ou bom senso implícito (NÃO inclua coisas triviais como "soma", "tabuada", "leitura", "lógica básica", "computador").`

    const userMessage = `Título da nota: ${note.title}\n\nConteúdo da nota:\n${note.content || 'Sem conteúdo.'}`

    const aiRes = await callAIWithFallback(systemPrompt, userMessage, 'simple', true)
    if (!aiRes.success || !aiRes.content) {
      return { error: aiRes.error || 'Falha ao chamar a IA' }
    }

    // 3. Faz o parse da resposta JSON
    let concepts: string[] = []
    try {
      const parsed = JSON.parse(aiRes.content)
      if (Array.isArray(parsed)) {
        concepts = parsed
      } else if (parsed.concepts && Array.isArray(parsed.concepts)) {
        concepts = parsed.concepts
      }
    } catch (parseErr) {
      const match = aiRes.content.match(/\[\s*"[\s\S]*?"\s*\]/)
      if (match) {
        try {
          concepts = JSON.parse(match[0])
        } catch (_) {}
      }
    }

    if (concepts.length === 0) {
      return { success: true, count: 0, message: 'Nenhum conceito identificado pela IA.' }
    }

    // Limpa relações anteriores desta nota como alvo
    await supabase
      .from('concept_relations')
      .delete()
      .eq('target_note_id', noteId)

    let createdCount = 0

    // 4. Resolve cada conceito (Busca Vetorial RAG)
    for (const conceptName of concepts) {
      if (!conceptName || conceptName.trim().toLowerCase() === note.title.toLowerCase()) continue

      const vector = await embedQuery(conceptName.trim())

      // Busca semântica no workspace
      const { data: matched } = await supabase.rpc('match_content_embeddings', {
        query_embedding: vector,
        match_threshold: 0.5,
        match_count: 1,
        p_user_id: user.id,
        p_workspace_id: note.workspace_id,
      })

      const matchedNoteId = matched && matched.length > 0
        ? (matched[0].note_id ?? (matched[0].source_type === 'note' ? matched[0].source_id : null))
        : null

      if (matchedNoteId && matchedNoteId !== noteId) {
        const { error: insErr } = await supabase
          .from('concept_relations')
          .insert({
            source_note_id: matchedNoteId,
            target_note_id: noteId,
            ghost_concept_name: null,
            relation_type: 'prerequisite'
          })
        if (!insErr) createdCount++
      } else {
        const { error: insErr } = await supabase
          .from('concept_relations')
          .insert({
            source_note_id: null,
            target_note_id: noteId,
            ghost_concept_name: conceptName.trim(),
            relation_type: 'prerequisite'
          })
        if (!insErr) createdCount++
      }
    }

    return { success: true, count: createdCount }
  } catch (err: any) {
    console.error('generateConceptPrerequisites error:', err)
    return { error: err.message || 'Erro interno no servidor' }
  }
}

export async function generateAllWorkspacePrerequisites(workspaceId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autenticado' }

    const { data: notes } = await supabase
      .from('notes')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)

    if (!notes || notes.length === 0) {
      return { success: true, message: 'Nenhuma nota para processar.' }
    }

    let processedCount = 0
    for (const note of notes) {
      await generateConceptPrerequisites(note.id)
      processedCount++
    }

    return { success: true, processedCount }
  } catch (err: any) {
    console.error('generateAllWorkspacePrerequisites error:', err)
    return { error: err.message || 'Erro interno no servidor' }
  }
}

export async function convertGhostToRealNote(workspaceId: string, ghostName: string, newNoteId: string) {
  try {
    const supabase = await createClient()
    
    const { error } = await supabase
      .from('concept_relations')
      .update({
        source_note_id: newNoteId,
        ghost_concept_name: null
      })
      .ilike('ghost_concept_name', ghostName)
      
    if (error) throw error
    return { success: true }
  } catch (err: any) {
    console.error('convertGhostToRealNote error:', err)
    return { error: err.message }
  }
}

export async function createManualPrerequisite(sourceNoteId: string | null, targetNoteId: string, ghostConceptName: string | null) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autenticado' }

    const { error } = await supabase
      .from('concept_relations')
      .insert({
        source_note_id: sourceNoteId,
        target_note_id: targetNoteId,
        ghost_concept_name: ghostConceptName,
        relation_type: 'prerequisite'
      })

    if (error) throw error
    return { success: true }
  } catch (err: any) {
    return { error: err.message || 'Erro ao criar relação' }
  }
}

export async function deletePrerequisite(relationId: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('concept_relations')
      .delete()
      .eq('id', relationId)

    if (error) throw error
    return { success: true }
  } catch (err: any) {
    return { error: err.message || 'Erro ao remover relação' }
  }
}

export async function generateStudyRoadmap(noteId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autenticado' }

    // 1. Busca a nota final (alvo)
    const { data: targetNote } = await supabase
      .from('notes')
      .select('id, title, content')
      .eq('id', noteId)
      .single()

    if (!targetNote) return { error: 'Nota não encontrada' }

    // 2. Traversal do grafo (BFS)
    const visited = new Set<string>()
    const queue: string[] = [noteId]
    
    interface PrereqSource {
      title: string
      content: string | null
      isGhost: boolean
      level: number
    }
    
    const collected = new Map<string, PrereqSource>()
    let currentLevel = 1
    
    while (queue.length > 0) {
      const currentId = queue.shift()!
      if (visited.has(currentId)) continue
      visited.add(currentId)
      
      const { data: relations } = await supabase
        .from('concept_relations')
        .select('id, source_note_id, ghost_concept_name')
        .eq('target_note_id', currentId)
        
      if (relations) {
        for (const rel of relations) {
          if (rel.source_note_id) {
            if (!visited.has(rel.source_note_id) && !collected.has(rel.source_note_id)) {
              const { data: sNote } = await supabase
                .from('notes')
                .select('id, title, content')
                .eq('id', rel.source_note_id)
                .single()
                
              if (sNote) {
                collected.set(rel.source_note_id, {
                  title: sNote.title,
                  content: sNote.content,
                  isGhost: false,
                  level: currentLevel
                })
                queue.push(rel.source_note_id)
              }
            }
          } else if (rel.ghost_concept_name) {
            const ghostKey = `ghost:${rel.ghost_concept_name}`
            if (!collected.has(ghostKey)) {
              collected.set(ghostKey, {
                title: rel.ghost_concept_name,
                content: null,
                isGhost: true,
                level: currentLevel
              })
            }
          }
        }
      }
      currentLevel++
    }

    const sourcesList = Array.from(collected.values())
      .sort((a, b) => b.level - a.level)

    let sourcesText = ''
    let totalChars = 0
    const CHAR_LIMIT = 12000

    for (let i = 0; i < sourcesList.length; i++) {
      const src = sourcesList[i]
      const label = src.isGhost 
        ? `[Pré-requisito Nível ${src.level} - SEM ANOTAÇÃO]: ${src.title}\n`
        : `[Pré-requisito Nível ${src.level} - COM ANOTAÇÃO]: ${src.title}\n`

      let contentBlock = ''
      if (!src.isGhost && src.content) {
        const cleanContent = src.content.replace(/Fonte:.*?\n\n---\n\n/, '').slice(0, 3000)
        contentBlock = `Conteúdo:\n${cleanContent}\n\n`
      } else {
        contentBlock = `(Nota em falta no banco de dados. IA externa: por favor, explique as bases deste conceito.)\n\n`
      }

      const blockLength = label.length + contentBlock.length
      if (totalChars + blockLength > CHAR_LIMIT) {
        sourcesText += `${label}(Conteúdo omitido devido ao limite de tamanho do roteiro)\n\n`
      } else {
        sourcesText += label + contentBlock
        totalChars += blockLength
      }
    }

    const targetLabel = `[Conceito Final Alvo]: ${targetNote.title}\n`
    const targetContentClean = (targetNote.content || '').replace(/Fonte:.*?\n\n---\n\n/, '').slice(0, 4000)
    const targetContentBlock = `Conteúdo:\n${targetContentClean}\n`
    
    sourcesText += targetLabel + targetContentBlock

    const finalPrompt = `Atue como um Tutor de Resumo Técnico Ultra-Rápido.
Você tem uma missão: explicar um conceito complexo (o conceito final) para um estudante de computação que está extremamente sem tempo. Ele precisa de uma Explicação Mínima Viável para entender o conceito e conseguir aplicar.

Você deve analisar a lista de fontes abaixo (organizadas em ordem de pré-requisito).

REGRAS DO RESULTADO:
1. Formato: Apenas tópicos curtos e linhas diretas. Sem introduções longas, sem "Olá", sem contextualização histórica.
2. Mecânica Central: Explique como funciona em, no máximo, 1 frase.
3. O 'Por quê': Diga o que aquele conceito permite fazer ou qual problema ele resolve.
4. Detalhe Crítico: Apenas 1 detalhe crucial que normalmente quebra a implementação (ex: 'se o pipeline parar, causa uma bolha/stall').
5. Não repita: Se um pré-requisito já foi explicado, NÃO o repita nos níveis seguintes.
6. O Final: Nas últimas 3 frases, conecte TODOS os conceitos da lista para explicar O CONCEITO FINAL em uma única frase que amarra tudo.

FONTES PARA ANÁLISE (em ordem de aprendizado):
${sourcesText}
`.trim()

    return { success: true, prompt: finalPrompt }
  } catch (err: any) {
    console.error('generateStudyRoadmap error:', err)
    return { error: err.message || 'Erro ao gerar roteiro' }
  }
}
