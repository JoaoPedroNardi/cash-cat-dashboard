export interface InstitutionStyle {
  background: string;
  color: string;
  initials: string;
  /** Caminho do logo oficial em /public/bank-logos, quando conhecido. */
  logo?: string;
}

// Cor/iniciais são o fallback quando não há logo (ou ele falha ao carregar).
const KNOWN: { match: RegExp; background: string; color?: string; initials: string; logo?: string }[] = [
  { match: /nubank|nu pagamentos|^nu\b/i, background: "#820ad1", initials: "Nu", logo: "nubank" },
  { match: /clear/i, background: "#1f4fd8", initials: "Cl", logo: "clear" },
  { match: /^xp\b|xp banking|xp invest/i, background: "#111111", color: "#f5c518", initials: "XP", logo: "xp" },
  { match: /ita[uú]/i, background: "#ec7000", initials: "It", logo: "itau" },
  { match: /bradesco/i, background: "#cc092f", initials: "Br", logo: "bradesco" },
  { match: /santander/i, background: "#ec0000", initials: "Sa", logo: "santander" },
  { match: /banco do brasil|^bb\b/i, background: "#f9dd16", color: "#1f2937", initials: "BB", logo: "bb" },
  { match: /caixa/i, background: "#0070af", initials: "Cx", logo: "caixa" },
  { match: /\binter\b/i, background: "#ff7a00", initials: "In", logo: "inter" },
  { match: /\bc6\b/i, background: "#242424", initials: "C6", logo: "c6" },
  { match: /btg/i, background: "#0b2545", initials: "BT", logo: "btg" },
  { match: /mercado ?pago/i, background: "#00a1e4", initials: "MP", logo: "mercadopago" },
  { match: /picpay/i, background: "#11c76f", initials: "Pi", logo: "picpay" },
  { match: /pagbank|pagseguro/i, background: "#2eb872", initials: "Pb", logo: "pagbank" },
  { match: /safra/i, background: "#0b2a4a", initials: "Sf", logo: "safra" },
  { match: /sicoob/i, background: "#00a859", initials: "Sc", logo: "sicoob" },
  { match: /sicredi/i, background: "#3fa535", initials: "Sc", logo: "sicredi" },
  { match: /\bneon\b/i, background: "#00d7e6", initials: "Ne", logo: "neon" },
  { match: /\bnext\b/i, background: "#00ff5f", color: "#111111", initials: "Nx", logo: "next" },
  { match: /\bpan\b/i, background: "#02afff", initials: "Pa", logo: "pan" },
  { match: /bmg/i, background: "#fa6300", initials: "Bm", logo: "bmg" },
  { match: /rico/i, background: "#ff6b00", initials: "Ri", logo: "rico" },
  { match: /toro/i, background: "#00c389", initials: "To", logo: "toro" },
  { match: /stone/i, background: "#00a868", initials: "St", logo: "stone" },
  { match: /[aá]gora/i, background: "#296fa7", initials: "Ag", logo: "agora" },
  { match: /avenue/i, background: "#111111", initials: "Av", logo: "avenue" },
  { match: /digio/i, background: "#0a57c2", initials: "Di", logo: "digio" },
  { match: /banrisul/i, background: "#0b45e4", initials: "Ba", logo: "banrisul" },
  { match: /\bbv\b|banco votorantim/i, background: "#223ad2", initials: "BV", logo: "bv" },
  { match: /\bcora\b/i, background: "#f51b81", initials: "Co", logo: "cora" },
  { match: /\bwise\b/i, background: "#9fe870", color: "#163300", initials: "Wi", logo: "wise" },
];

/** Cor, iniciais e logo de uma instituição; nomes desconhecidos ganham uma cor estável derivada do texto. */
export function institutionStyle(name: string): InstitutionStyle {
  const known = KNOWN.find((k) => k.match.test(name));
  if (known) {
    return {
      background: known.background,
      color: known.color ?? "#ffffff",
      initials: known.initials,
      logo: known.logo ? `/bank-logos/${known.logo}.svg` : undefined,
    };
  }

  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
  return { background: `hsl(${hash} 55% 42%)`, color: "#ffffff", initials: initials || "?" };
}
