import { AcademyAudio } from './AcademyAudio'

export type DialogueTrack = {
  speaker: string
  text: string
  translation: string
  audio?: string
}

export function DialoguePlayer({ tracks }: { tracks: DialogueTrack[] }) {
  return <div className="ac3-dialogue">
    {tracks.map((track, index) => <article className={'ac3-bubble' + (index % 2 ? ' ac3-other' : '')} key={index}>
      <span className="ac3-avatar" aria-hidden="true">{track.speaker.slice(0, 1)}</span>
      <div><small>{track.speaker} · fala {index + 1}</small>
        <details><summary>Revelar fala e tradução</summary>
          <p lang="en">{track.text}</p><span>{track.translation}</span>
        </details>
      </div>
      {track.audio && <AcademyAudio src={track.audio} label={'fala ' + (index + 1) + ' de ' + track.speaker} compact />}
    </article>)}
  </div>
}
