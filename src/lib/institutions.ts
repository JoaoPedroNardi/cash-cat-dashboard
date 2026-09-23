export interface InstitutionStyle {
  background: string;
  color: string;
  initials: string;
}

// Cores de marca (iguais nos dois temas). Sem logos oficiais: só cor e iniciais.
const KNOWN: { match: RegExp; background: string; color?: string; initials: string }[] = [
  { match: /nubank|nu pagamentos|^nu\b/i, background: "#820ad1", initials: "Nu" },
  { match: /clear/i, background: "#1f4fd8", initials: "Cl" },
  { match: /^xp\b|xp banking|xp invest/i, background: "#111111", color: "#f5c518", initials: "XP" },
  { match: /ita[uú]/i, background: "#ec7000", initials: "It" },
  { match: /bradesco/i, background: "#cc092f", initials: "Br" },
  { match: /santander/i, background: "#ec0000", initials: "Sa" },
  { match: /banco do brasil|^bb\b/i, background: "#f9dd16", color: "#1f2937", initials: "BB" },
  { match: /caixa/i, background: "#0070af", initials: "Cx" },
  { match: /\binter\b/i, background: "#ff7a00", initials: "In" },
  { match: /\bc6\b/i, background: "#242424", initials: "C6" },
  { match: /btg/i, background: "#0b2545", initials: "BT" },
  { match: /mercado ?pago/i, background: "#00a1e4", initials: "MP" },
];

/** Cor e iniciais de uma instituição; nomes desconhecidos ganham uma cor estável derivada do texto. */
export function institutionStyle(name: string): InstitutionStyle {
  const known = KNOWN.find((k) => k.match.test(name));
  if (known) return { background: known.background, color: known.color ?? "#ffffff", initials: known.initials };

  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
  return { background: `hsl(${hash} 55% 42%)`, color: "#ffffff", initials: initials || "?" };
}
