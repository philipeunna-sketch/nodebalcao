# Portal de Classificados Balcão — Node.js

Aplicação full stack do Jornal Balcão para classificados, lojas virtuais, conteúdo editorial, atendimento por IA, pagamentos, newsletters e transmissões ao vivo.

Esta cópia roda como **servidor Node.js** com Next.js (App Router) e PostgreSQL/Supabase, sem depender do runtime Cloudflare. O acesso ao banco é feito pelo adaptador em `lib/vercel-runtime.ts`, selecionado pelo alias de `cloudflare:workers` em `next.config.ts`.

## Stack

- Next.js 16 (App Router), React 19 e TypeScript 5
- Tailwind CSS 4
- PostgreSQL (Supabase) via `postgres`
- Vercel Blob para imagens e arquivos
- Drizzle Kit para geração de schema
- Nodemailer para SMTP no runtime Node.js

## Requisitos

- Node.js `>=22.13.0`
- npm 10 ou superior
- PostgreSQL acessível (Supabase, pooler na porta 6543)
- Projeto Vercel Blob vinculado (para uploads)

## Desenvolvimento local

```bash
npm ci
cp .env.example .env.local
# preencha DATABASE_URL e demais variáveis em .env.local
npm run dev
```

Acesse `http://localhost:3000`. Nunca versionar `.env.local` ou credenciais reais.

## Build e execução

```bash
npm run build
npm run start
```

O build usa o Next.js oficial (`next build --webpack`) e o servidor usa `next start`. O alias de `cloudflare:workers` aponta para o adaptador PostgreSQL.

## Banco de dados

1. Configure `DATABASE_URL` com a conexão do Supabase.
2. Aplique o schema:

```bash
npm run db:migrate:postgres
```

3. Importe dados no formato `{ "portal_nome_da_tabela": [...] }` ou `{ "tables": { ... } }`:

```bash
npm run db:import:postgres -- caminho/exportacao.json
```

O importador aceita somente as tabelas conhecidas, ignora colunas desconhecidas, não sobrescreve registros existentes e reajusta as sequências numéricas. Faça backup antes da migração.

## Variáveis de ambiente

- `DATABASE_URL`: conexão PostgreSQL/Supabase.
- `DATABASE_SSL`: `prefer`, `require` ou `disable`.
- `BLOB_READ_WRITE_TOKEN`: token da integração Vercel Blob.
- `NEXT_PUBLIC_SITE_URL` e `SITE_URL`: URL canônica, sem barra final. Se vazias, a URL de produção da Vercel é usada.
- `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD`: opcionais, usados somente se `portal_admins` estiver vazia.
- `BOOTSTRAP_COMMERCIAL_ACCOUNTS_JSON`: bootstrap opcional de contas comerciais.

As demais integrações (OpenAI, Mercado Pago, Google Maps, SMTP, notícias/WordPress, imagens e verificação) são configuradas pelo dashboard administrativo e persistidas no banco.

## Validação

```bash
npm run typecheck
npm run lint
npm run build
```

## Deploy na Vercel

1. Conecte o repositório `philipeunna-sketch/nodebalcao` a um projeto Vercel.
2. Cadastre as variáveis acima para Production e Preview.
3. O `vercel.json` usa `npm ci` e `npm run build`.
4. Após o deploy, valide home, busca, categorias, detalhe do anúncio e login admin.
5. Se usar domínio próprio, atualize `SITE_URL` e `NEXT_PUBLIC_SITE_URL` e faça um novo deploy.

O deploy não executa migrações automaticamente; isso evita alterações acidentais de banco durante builds e rollbacks.

## Observação

Os arquivos `worker/`, `build/`, `.openai/`, `.vinext/` e `vite.config.ts` pertencem ao runtime Cloudflare e não são usados nesta cópia Node.js; eles permanecem ignorados pelo git.
