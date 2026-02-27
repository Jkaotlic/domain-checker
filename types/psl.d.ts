declare module 'psl' {
  interface ParsedDomain {
    tld: string | null;
    sld: string | null;
    domain: string | null;
    subdomain: string | null;
    listed: boolean;
    input: string;
    error?: { code: string; message: string };
  }
  const psl: {
    parse(domain: string): ParsedDomain;
    get(domain: string): string | null;
    isValid(domain: string): boolean;
  };
  export default psl;
}

declare module 'punycode/' {
  function toASCII(domain: string): string;
  function toUnicode(domain: string): string;
  function encode(input: string): string;
  function decode(input: string): string;
}
