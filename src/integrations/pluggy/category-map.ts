// Traduz a categoria da Pluggy para as categorias do app (ver src/lib/categories.ts).
// A Pluggy organiza em grupos: o categoryId tem 8 dígitos e os 2 primeiros identificam o grupo
// (ex: "18xxxxxx" = Healthcare). Mapeamos pelo grupo e só abrimos exceção para os itens do grupo
// "Services" (07), que mistura educação, academia, ingressos e telecom.

// Itens do grupo 07 (Services) que pertencem a outras categorias do app.
const SERVICES_EDUCATION = new Set(['Education', 'Online Courses', 'University', 'School', 'Kindergarten']);
const SERVICES_HEALTH = new Set(['Wellness and fitness', 'Gyms and fitness centers', 'Sports practice', 'Wellness']);
const SERVICES_LEISURE = new Set(['Tickets', 'Stadiums and arenas', 'Landmarks and museums', 'Cinema, theater and concerts']);

const EXPENSE_BY_GROUP: Record<string, string> = {
  '02': 'taxas', // empréstimos/financiamentos: juros e multas
  '05': 'transferencias',
  '04': 'transferencias',
  '07': 'servicos',
  '08': 'compras',
  '09': 'servicos', // serviços digitais: streaming, jogos
  '10': 'mercado',
  '11': 'alimentacao',
  '12': 'viagem',
  '14': 'apostas',
  '15': 'taxas',
  '16': 'taxas',
  '17': 'moradia',
  '18': 'saude',
  '19': 'transporte',
  '20': 'servicos', // seguros
  '21': 'lazer',
};

/** Devolve o id da categoria do app para uma transação da Pluggy. */
export function mapPluggyCategory(
  categoryId: string | null | undefined,
  categoryName: string | null | undefined,
  type: 'income' | 'expense'
): string {
  const group = (categoryId ?? '').slice(0, 2);
  const name = categoryName ?? '';

  if (type === 'income') {
    if (group === '03') return 'investimentos';
    if (group === '04' || group === '05') return 'transferencias';
    if (name === 'Salary') return 'salario';
    if (name === 'Entrepreneurial activities') return 'freelance';
    return 'outros'; // estornos, cashback, benefícios...
  }

  if (group === '07') {
    if (SERVICES_EDUCATION.has(name)) return 'educacao';
    if (SERVICES_HEALTH.has(name)) return 'saude';
    if (SERVICES_LEISURE.has(name)) return 'lazer';
  }
  return EXPENSE_BY_GROUP[group] ?? 'outros';
}
