Vou implementar 6 melhorias grandes no app. Como envolve mudanças de schema, novas páginas e lógica significativa, segue o plano antes de codar.

## 1. Metas financeiras (nova página `/goals`)
- Nova tabela `goals` (nome, valor alvo, valor atual, data alvo, cor/ícone, opcional categoria)
- Página de listagem com cards mostrando progresso (barra), porcentagem, e previsão de conclusão (calculada pelo ritmo médio dos últimos 90 dias de aportes)
- Modal para criar/editar/excluir meta
- Botão "adicionar aporte" que incrementa `current_amount`
- Link no menu lateral/topo

## 2. Filtros no histórico (`/transactions`)
- Barra de filtros acima da lista:
  - Busca por descrição (input com debounce)
  - Select de categoria
  - Toggle ganhos/gastos/todos
  - Período (30/90/180/ano/tudo + custom range)
- Estado dos filtros via search params (URL) — compartilhável e preserva ao voltar
- Contador de resultados + soma do período filtrado

## 3. Edição de transações
- Botão "editar" na lista de transações ao lado do excluir
- Modal/Sheet com formulário pré-preenchido (valor, categoria, descrição, data, tipo)
- Salva via `update` no Supabase

## 4. Dashboard inteligente — insights automáticos
- Novo bloco "Insights" no topo/meio do dashboard
- Cálculos client-side:
  - Variação % por categoria mês atual vs mês anterior ("Você gastou 23% mais em lazer")
  - Maior categoria do período ("Educação é sua maior categoria")
  - Tendência de saldo nos últimos 3 meses (subiu/caiu)
  - Dias até "estourar" o ritmo de gasto vs ganhos do mês
- Cards com ícone, cor por sentimento (positivo/alerta/negativo)

## 5. Contas e cartões
- Nova tabela `accounts` (nome, tipo: carteira/conta/crédito/débito, cor, ícone, saldo inicial)
- Adicionar `account_id` em `transactions` (nullable para retrocompat)
- No formulário de adicionar gasto/ganho: selecionar conta
- Nova página `/accounts` mostrando cards com saldo por conta (saldo inicial + soma de transações)
- Bloco no dashboard "Saldo por conta"

## 7. Recorrência automática
- Adicionar em `transactions`: `recurrence` (none/weekly/monthly/yearly), `recurrence_until` (data opcional)
- Ou tabela separada `recurring_transactions` (template) + geração on-demand quando o usuário abre o app (RPC ou client-side check: para cada template, criar instâncias faltantes até hoje)
- Vou usar a tabela separada — mais limpo
- Toggle "Recorrente" no formulário de adicionar
- Página `/recurring` para gerenciar templates

## Ordem de implementação
1. Migrações SQL (goals, accounts, recurring_transactions, account_id em transactions)
2. Edição de transações + filtros (melhorias rápidas no que já existe)
3. Metas financeiras (página + integração)
4. Contas/cartões (página + integração no add)
5. Recorrência (página + lógica de geração)
6. Insights no dashboard

## Detalhes técnicos
- Tudo client-side com Supabase (RLS por `auth.uid() = user_id`)
- Geração de transações recorrentes: função client `materializeRecurring()` rodando ao carregar app (em `_authenticated.tsx`)
- Search params nas transactions: `useSearch` do TanStack Router com zod validator
- Componentes reutilizáveis: Sheet (shadcn) para edição, Dialog para criar meta/conta

Posso prosseguir?