/**
 * antlr4's CharStreams/FileStream import `fs` for its file-reading entrypoints,
 * which nothing in this app calls — only the string-based streams are used.
 * next.config.js neutralised it with `resolve.fallback = { fs: false }`; Vite has
 * no fallback option, and externalising it in a browser build would emit a bare
 * `import 'fs'` that dies at runtime, so alias it to this no-op instead.
 */
export default {};
