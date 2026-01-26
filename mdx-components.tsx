import type { MDXComponents } from 'mdx/types';

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    // Custom styling for headings
    h1: ({ children }) => (
      <h1 className="text-3xl font-bold mt-8 mb-4 text-black">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-2xl font-semibold mt-6 mb-3 text-black border-b pb-2">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-xl font-semibold mt-4 mb-2 text-black">{children}</h3>
    ),
    // Paragraphs
    p: ({ children }) => (
      <p className="my-3 text-gray-700 leading-relaxed">{children}</p>
    ),
    // Links
    a: ({ href, children }) => (
      <a href={href} className="text-blue-600 hover:text-blue-800 underline">
        {children}
      </a>
    ),
    // Code blocks
    pre: ({ children }) => (
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 my-4 overflow-x-auto text-sm">
        {children}
      </pre>
    ),
    code: ({ children }) => (
      <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
        {children}
      </code>
    ),
    // Lists
    ul: ({ children }) => (
      <ul className="list-disc list-inside my-3 space-y-1 text-gray-700">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-inside my-3 space-y-1 text-gray-700">{children}</ol>
    ),
    li: ({ children }) => <li className="ml-4">{children}</li>,
    // Tables
    table: ({ children }) => (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full border-collapse border border-gray-300">
          {children}
        </table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border border-gray-300 bg-gray-100 px-4 py-2 text-left font-semibold">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border border-gray-300 px-4 py-2">{children}</td>
    ),
    // Blockquotes
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-blue-500 pl-4 my-4 italic text-gray-600">
        {children}
      </blockquote>
    ),
    // Horizontal rule
    hr: () => <hr className="my-8 border-gray-300" />,
    ...components,
  };
}
