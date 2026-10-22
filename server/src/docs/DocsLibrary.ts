import { similarNames } from '../util/SimilarNames.js';
import { bbcodeToMarkdown, summarize } from './BbcodeMarkdown.js';
import type { ClassDoc, ConstantDoc, EnumDoc, MethodDoc, PropertyDoc, SignalDoc } from './ClassDoc.js';

export type MemberEntry =
  | { readonly kind: 'method'; readonly doc: MethodDoc }
  | { readonly kind: 'property'; readonly doc: PropertyDoc }
  | { readonly kind: 'signal'; readonly doc: SignalDoc }
  | { readonly kind: 'constant'; readonly doc: ConstantDoc }
  | { readonly kind: 'enum'; readonly doc: EnumDoc }
  | { readonly kind: 'enum value'; readonly doc: ConstantDoc; readonly enumName: string };

export interface MemberMatch {
  readonly owner: ClassDoc;
  readonly entry: MemberEntry;
}

export interface SearchHit {
  readonly owner: ClassDoc;
  readonly entry?: MemberEntry;
}

interface IndexedHit {
  readonly hit: SearchHit;
  readonly label: string;
  readonly name: string;
  readonly ownerName: string;
  readonly summary: string;
  readonly description: string;
}

const scores = {
  exactName: 100,
  className: 20,
  classSummary: 5,
  classDescription: 1,
  memberName: 15,
  memberOwner: 8,
  memberSummary: 4,
  allWords: 25,
};

export class DocsLibrary {
  private readonly classesByName = new Map<string, ClassDoc>();
  private searchIndex: IndexedHit[] | undefined;

  constructor(private readonly classes: readonly ClassDoc[]) {
    for (const classDoc of classes) {
      this.classesByName.set(classDoc.name.toLowerCase(), classDoc);
    }
  }

  find(name: string): ClassDoc | undefined {
    return this.classesByName.get(name.toLowerCase());
  }

  similarNames(name: string): string[] {
    return similarNames(
      name,
      this.classes.map((classDoc) => classDoc.name),
    );
  }

  ancestors(classDoc: ClassDoc): ClassDoc[] {
    const chain: ClassDoc[] = [];
    let parentName = classDoc.inherits;
    while (parentName !== undefined) {
      const parent = this.find(parentName);
      if (parent === undefined || chain.includes(parent)) {
        break;
      }
      chain.push(parent);
      parentName = parent.inherits;
    }
    return chain;
  }

  findMember(classDoc: ClassDoc, name: string): MemberMatch | undefined {
    const owners = [classDoc, ...this.ancestors(classDoc)];
    const lowercaseName = name.toLowerCase();
    for (const matches of [(entryName: string) => entryName === name, (entryName: string) => entryName.toLowerCase() === lowercaseName]) {
      for (const owner of owners) {
        const entry = memberEntries(owner).find((candidate) => matches(candidate.doc.name));
        if (entry !== undefined) {
          return { owner, entry };
        }
      }
    }
    return undefined;
  }

  similarMemberNames(classDoc: ClassDoc, name: string): string[] {
    const names = [classDoc, ...this.ancestors(classDoc)].flatMap((owner) => memberEntries(owner).map((entry) => entry.doc.name));
    return similarNames(name, [...new Set(names)]);
  }

  search(query: string, limit: number): SearchHit[] {
    const words = [...new Set(query.toLowerCase().split(/[^a-z0-9@]+/).filter((word) => word !== ''))];
    if (words.length === 0) {
      return [];
    }
    const compactQuery = words.join('');
    return this.index()
      .map((indexed) => ({ indexed, score: scoreOf(indexed, words, compactQuery) }))
      .filter((scored) => scored.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score || left.indexed.label.length - right.indexed.label.length || left.indexed.label.localeCompare(right.indexed.label),
      )
      .slice(0, limit)
      .map((scored) => scored.indexed.hit);
  }

  private index(): IndexedHit[] {
    this.searchIndex ??= this.classes.flatMap((owner) => [
      {
        hit: { owner },
        label: owner.name,
        name: owner.name.toLowerCase(),
        ownerName: '',
        summary: bbcodeToMarkdown(owner.brief).toLowerCase(),
        description: bbcodeToMarkdown(owner.description).toLowerCase(),
      },
      ...listedMemberEntries(owner).map((entry) => ({
        hit: { owner, entry },
        label: `${owner.name}.${entry.doc.name}`,
        name: entry.doc.name.toLowerCase(),
        ownerName: owner.name.toLowerCase(),
        summary: summarize(bbcodeToMarkdown(descriptionOf(entry))).toLowerCase(),
        description: '',
      })),
    ]);
    return this.searchIndex;
  }
}

export function memberEntries(owner: ClassDoc): MemberEntry[] {
  return [
    ...owner.methods.map((doc): MemberEntry => ({ kind: 'method', doc })),
    ...owner.properties.map((doc): MemberEntry => ({ kind: 'property', doc })),
    ...owner.signals.map((doc): MemberEntry => ({ kind: 'signal', doc })),
    ...owner.constants.map((doc): MemberEntry => ({ kind: 'constant', doc })),
    ...owner.enums.map((doc): MemberEntry => ({ kind: 'enum', doc })),
    ...owner.enums.flatMap((enumeration) => enumeration.values.map((doc): MemberEntry => ({ kind: 'enum value', doc, enumName: enumeration.name }))),
  ];
}

export function propertyAccessors(owner: ClassDoc): Set<string> {
  return new Set(owner.properties.flatMap((property) => [property.setter, property.getter]).filter((name) => name !== undefined));
}

export function listedMemberEntries(owner: ClassDoc): MemberEntry[] {
  const accessors = propertyAccessors(owner);
  return memberEntries(owner).filter((entry) => entry.kind !== 'method' || !accessors.has(entry.doc.name));
}

export function descriptionOf(entry: MemberEntry): string {
  return entry.kind === 'enum' ? '' : entry.doc.description;
}

function scoreOf(indexed: IndexedHit, words: readonly string[], compactQuery: string): number {
  const isClass = indexed.hit.entry === undefined;
  let score = 0;
  let matchedWords = 0;
  for (const word of words) {
    const wordScore = wordScoreOf(indexed, word, isClass);
    if (wordScore > 0) {
      matchedWords += 1;
      score += wordScore;
    }
  }
  if (matchedWords === 0) {
    return 0;
  }
  if (matchedWords === words.length) {
    score += scores.allWords;
  }
  if (indexed.name.replaceAll('_', '') === compactQuery) {
    score += scores.exactName;
  }
  return score;
}

function wordScoreOf(indexed: IndexedHit, word: string, isClass: boolean): number {
  if (indexed.name.includes(word)) {
    return isClass ? scores.className : scores.memberName;
  }
  if (!isClass && indexed.ownerName.includes(word)) {
    return scores.memberOwner;
  }
  if (indexed.summary.includes(word)) {
    return isClass ? scores.classSummary : scores.memberSummary;
  }
  return isClass && indexed.description.includes(word) ? scores.classDescription : 0;
}
