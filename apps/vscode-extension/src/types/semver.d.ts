declare module 'semver' {
  export interface SemVerLike {
    version: string;
  }

  export function valid(version: string): string | null;
  export function coerce(version: string): SemVerLike | null;
  export function satisfies(version: string, range: string): boolean;
}

declare module 'semver/functions/coerce' {
  interface SemVerLike {
    version: string;
  }

  export default function coerce(version: string): SemVerLike | null;
}

declare module 'semver/functions/satisfies' {
  export default function satisfies(version: string, range: string): boolean;
}

declare module 'semver/functions/valid' {
  export default function valid(version: string): string | null;
}
