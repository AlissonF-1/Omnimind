import { Fragment } from 'react'

export function InlineCode({ text }: { text: string }) {
  return text.split(/(`[^`\n]+`)/).map((part, index) => part.startsWith('`') ?
    <code key={index}>{part.slice(1, -1)}</code> : <Fragment key={index}>{part}</Fragment>)
}
