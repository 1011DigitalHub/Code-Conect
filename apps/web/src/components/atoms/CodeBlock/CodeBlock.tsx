export type CodeBlockProps = {
  code: string
}

export function CodeBlock({ code }: CodeBlockProps) {
  return (
    <pre className="bg-surface overflow-x-auto rounded-lg p-4">
      <code className="font-mono text-sm text-offwhite whitespace-pre">{code}</code>
    </pre>
  )
}
