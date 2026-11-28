import type { AcademyLesson, AcademyResource, LessonRef } from '@/lib/academy/contracts'
import { AcademyAudio } from './AcademyAudio'
import { AcademyPanel } from './AcademyVisual'
import { DialoguePlayer } from './DialoguePlayer'
import { VocabularyExport } from './VocabularyExport'

type Resources = Map<string, AcademyResource>

export function LessonDialogue({ dialogue, resources }: { dialogue: NonNullable<AcademyLesson['dialogue']>; resources: Resources }) {
  const tracks = dialogue.map((line) => {
    const audio = line.audio ? resources.get(line.audio) : undefined
    return { speaker: line.speaker, text: line.text, translation: line.translation, audio: audio?.type === 'audio' ? audio.path : undefined }
  })
  return <AcademyPanel title="Escute, reconheça e repita" id="escutar">
    <p className="ac3-dialogue-intro">Ouça a fala antes de revelar a tradução.</p>
    <DialoguePlayer tracks={tracks} />
  </AcademyPanel>
}

export function LessonVocabulary({ words, resources, lesson }: {
  words: NonNullable<AcademyLesson['vocabulary']>; resources: Resources; lesson: LessonRef
}) {
  return <AcademyPanel title="Expressões da aula" id="vocabulario" action={<small>{words.length} expressões</small>}>
    <div className="ac3-vocabgrid">{words.map((word, index) => {
      const audio = word.audio ? resources.get(word.audio) : undefined
      return <article className="ac3-vocab" key={word.term + ':' + index}>
        <strong lang="en">{word.term}</strong><p>{word.translation}</p><p lang="en">{word.example}</p>
        {audio?.type === 'audio' && <AcademyAudio src={audio.path} label={word.term} compact />}
      </article>
    })}</div>
    <details className="ac3-vocab-export"><summary>Estudar estas palavras com flashcards</summary><VocabularyExport lesson={lesson} /></details>
  </AcademyPanel>
}
