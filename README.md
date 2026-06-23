# Finança — Controle Financeiro Pessoal

Dashboard para controle de gastos e ganhos pessoais, com metas, orçamentos, contas e transações recorrentes.

**Stack:** React 19 · TanStack Start (SSR) · TanStack Router · Supabase · Tailwind CSS v4 · Cloudflare Workers

---

## Pré-requisitos

| Ferramenta | Versão mínima | Instalação |
|---|---|---|
| Node.js | 20+ | https://nodejs.org |
| Bun | 1.x | `npm install -g bun` |
| Conta Supabase | — | https://supabase.com |

---

## 1. Configurar o Supabase

### 1.1 Criar o projeto

1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard) e clique em **New project**
2. Escolha um nome e uma senha forte para o banco
3. Aguarde o projeto inicializar (~2 min)

### 1.2 Rodar as migrations

No painel do Supabase, vá em **SQL Editor** e execute o schema completo:

```
supabase/migrations/20260623000000_schema.sql   ← cria todas as tabelas, enums, índices e RLS
```

O script é idempotente — pode rodar mais de uma vez sem problema.

Ou, se tiver o CLI do Supabase instalado (`npm install -g supabase`):

```bash
supabase login
supabase link --project-ref SEU_PROJECT_ID
supabase db push
```

### 1.3 Pegar as credenciais

Em **Settings → API** do seu projeto:

- **Project URL** → `SUPABASE_URL`
- **anon / public key** → `SUPABASE_PUBLISHABLE_KEY`

---

## 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite `.env` e preencha com suas credenciais:

```env
SUPABASE_URL=https://SEU_PROJECT_ID.supabase.co
SUPABASE_PUBLISHABLE_KEY=sua_anon_key

VITE_SUPABASE_URL=https://SEU_PROJECT_ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua_anon_key
VITE_SUPABASE_PROJECT_ID=SEU_PROJECT_ID
```

> **Importante:** o `.env` já está no `.gitignore`. Nunca comite esse arquivo.

---

## 3. Instalar dependências

```bash
bun install
```

---

## 4. Rodar localmente

```bash
bun dev
```

Acesse [http://localhost:3000](http://localhost:3000). Crie uma conta na tela de login e comece a usar.

---

## 5. Build de produção (teste local)

```bash
bun build
bun preview
```

---

## 6. Publicar online via GitHub + Cloudflare Pages

Este projeto usa **TanStack Start com Cloudflare Workers** como runtime. O deploy mais simples é pelo Cloudflare Pages conectado ao GitHub.

### 6.1 Criar o repositório no GitHub

```bash
git init
git add .
git commit -m "chore: initial commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/cash-cat-dashboard.git
git push -u origin main
```

> Lembre-se: o `.env` **não vai** para o GitHub (está no `.gitignore`). As variáveis de ambiente são configuradas diretamente no Cloudflare (passo 6.3).

### 6.2 Conectar ao Cloudflare Pages

1. Acesse [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create**
2. Escolha **Pages → Connect to Git**
3. Autorize o GitHub e selecione o repositório `cash-cat-dashboard`
4. Configure o build:

| Campo | Valor |
|---|---|
| Framework preset | `None` (configuração manual) |
| Build command | `bun run build` |
| Build output directory | `.output/public` |
| Node.js version | `20` |

### 6.3 Adicionar variáveis de ambiente no Cloudflare

Em **Settings → Environment variables** do seu Pages project, adicione:

```
SUPABASE_URL              = https://SEU_PROJECT_ID.supabase.co
SUPABASE_PUBLISHABLE_KEY  = sua_anon_key
VITE_SUPABASE_URL         = https://SEU_PROJECT_ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY = sua_anon_key
VITE_SUPABASE_PROJECT_ID  = SEU_PROJECT_ID
```

Adicione para os ambientes **Production** e **Preview**.

### 6.4 Deploy

Clique em **Save and Deploy**. O Cloudflare vai buildar e publicar automaticamente. A URL ficará no formato:

```
https://cash-cat-dashboard.pages.dev
```

A partir daí, todo `git push` na branch `main` dispara um novo deploy automático.

### 6.5 Domínio personalizado (opcional)

Em **Pages → seu projeto → Custom domains**, adicione seu domínio e siga as instruções de DNS.

---

## 7. Configurar autenticação no Supabase (produção)

Após ter a URL do Cloudflare, configure-a no Supabase:

1. **Authentication → URL Configuration**
2. **Site URL:** `https://cash-cat-dashboard.pages.dev`
3. **Redirect URLs:** adicione `https://cash-cat-dashboard.pages.dev/**`

Sem isso, o link de confirmação de e-mail vai redirecionar para `localhost`.

---

## Estrutura do projeto

```
src/
├── routes/
│   ├── __root.tsx              # Shell HTML + providers
│   ├── index.tsx               # Redireciona para /dashboard ou /auth
│   ├── auth.tsx                # Login e cadastro
│   └── _authenticated/        # Rotas protegidas (requer login)
│       ├── dashboard.tsx       # Visão geral e gráficos
│       ├── transactions.tsx    # Histórico com filtros
│       ├── add.tsx             # Adicionar transação / parcelado
│       ├── budgets.tsx         # Orçamentos mensais por categoria
│       ├── goals.tsx           # Metas financeiras
│       ├── accounts.tsx        # Contas e cartões
│       ├── recurring.tsx       # Transações recorrentes
│       ├── compare.tsx         # Comparação entre meses
│       └── import.tsx          # Importar CSV / OFX
├── lib/
│   ├── categories.ts           # Categorias de gastos e ganhos
│   ├── recurring.ts            # Lógica de materialização de recorrências
│   ├── palette.ts              # Paleta de cores compartilhada
│   └── tooltip-style.ts        # Estilo de tooltip dos gráficos
├── hooks/
│   └── use-auth.tsx            # Hook de autenticação Supabase
└── integrations/supabase/
    ├── client.ts               # Client-side Supabase client
    ├── client.server.ts        # Server-side admin client (bypass RLS)
    ├── auth-middleware.ts      # Middleware de autenticação SSR
    └── types.ts                # Tipos gerados do schema do banco
```

---

## Scripts disponíveis

```bash
bun dev          # Servidor de desenvolvimento com HMR
bun build        # Build de produção para Cloudflare Workers
bun preview      # Pré-visualizar o build localmente
bun lint         # Rodar ESLint
bun format       # Formatar com Prettier
```
