export type ReadingSection = { title: string; markdown: string }

export function splitLessonSections(markdown: string): ReadingSection[] {
  const sections: ReadingSection[] = []
  let title = 'Introdução'
  let lines: string[] = []
  let fence: string | undefined
  let headed = false
  function push() {
    const body = lines.join('\n').trim()
    if (body || headed) sections.push({ title, markdown: body })
  }
  for (const line of markdown.split(/\r?\n/)) {
    const mark = /^\s{0,3}([\x60~]{3,})(.*)$/.exec(line)
    if (mark) {
      const [, marker, suffix] = mark
      if ([...marker].every((character) => character === marker[0])) {
        if (!fence) fence = marker
        else if (marker[0] === fence[0] && marker.length >= fence.length && !suffix.trim()) fence = undefined
      }
      lines.push(line)
      continue
    }
    const heading = !fence && /^ {0,3}##\s+(.+)$/.exec(line)
    if (heading) {
      push()
      title = heading[1].replace(/\s+#+\s*$/, '').trim()
      lines = []
      headed = true
    } else lines.push(line)
  }
  push()
  return sections.length ? sections : [{ title, markdown }]
}
