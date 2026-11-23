import type { ReactNode } from 'react'

const keywords = new Set('SELECT FROM WHERE AND OR NOT IS NULL TRUE FALSE JOIN INNER LEFT RIGHT FULL OUTER CROSS ON AS USING DISTINCT ALL GROUP BY HAVING ORDER ASC DESC LIMIT OFFSET UNION INTERSECT EXCEPT WITH CASE WHEN THEN ELSE END IN BETWEEN LIKE ILIKE EXISTS COUNT SUM AVG MIN MAX COALESCE INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE OVER PARTITION FILTER NULLS FIRST LAST CURRENT_DATE'.split(' '))

const tokens = /--[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|'(?:''|[^'])*'|"(?:""|[^"])*"|\b\d+(?:\.\d+)?\b|\b[a-z_][\w$]*\b|<>|!=|>=|<=|::|[-+=<>*\/]/gi

export default function SqlCode({ children, className = '' }: { children: ReactNode; className?: string }) {
  if (typeof children !== 'string') return <code className={'q-sql ' + className}>{children}</code>

  const parts: ReactNode[] = []
  let end = 0
  for (const match of children.matchAll(tokens)) {
    const index = match.index
    const token = match[0]
    if (index > end) parts.push(children.slice(end, index))
    end = index + token.length

    let kind = ''
    if (token.startsWith('--') || token.startsWith('/*')) kind = 'comment'
    else if (token.startsWith("'")) kind = 'string'
    else if (/^\d/.test(token)) kind = 'number'
    else if (keywords.has(token.toUpperCase())) kind = 'keyword'
    else if (/^[-+=<>*\/:!]/.test(token)) kind = 'operator'
    parts.push(kind ? <span className={'q-sql-' + kind} key={index}>{token}</span> : token)
  }
  if (end < children.length) parts.push(children.slice(end))
  return <code className={'q-sql ' + className}>{parts}</code>
}
