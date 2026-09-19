/** Human label for an id-like facet value ("white-oak" → "White oak"). */
export function facetLabel(id: string): string {
  const words = id.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : id;
}
