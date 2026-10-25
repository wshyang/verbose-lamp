// Pure helpers that read declarations out of our own GLSL sources. They back the
// uniform/attribute contract tests (ADDENDUM-025): a rename on either the GLSL or the TS
// side otherwise fails silently as a black or static effect.

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /\/\/.*$/gm;

function stripComments(source: string): string {
  return source.replace(BLOCK_COMMENT, '').replace(LINE_COMMENT, '');
}

function parseDeclaredNames(source: string, storage: 'uniform' | 'attribute'): string[] {
  const declaration = new RegExp(`^\\s*${storage}\\s+(?:\\w+\\s+)*?\\w+\\s+([\\w\\s,]+);`, 'gm');
  const names: string[] = [];
  for (const match of stripComments(source).matchAll(declaration)) {
    for (const piece of match[1].split(',')) names.push(piece.trim().split(/\s+/).at(-1) as string);
  }
  return names;
}

export function parseUniformNames(source: string): string[] {
  return parseDeclaredNames(source, 'uniform');
}

export function parseAttributeNames(source: string): string[] {
  return parseDeclaredNames(source, 'attribute');
}
