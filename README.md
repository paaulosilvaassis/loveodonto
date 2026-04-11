# App Gestão Odonto

## Requisitos
- Node.js 18+
- npm

## Instalação
```bash
npm install
```

## Rodar em desenvolvimento
```bash
npm run dev
```

## Stack local SaaS
Para evitar conflito de portas entre app, Console e backend, use:

```bash
npm run stack:start
```

Esse comando sobe a stack local na ordem correta:

- backend SaaS: `http://localhost:3001`
- app principal: `http://localhost:5176`
- Console: `http://localhost:5177/login`

### Ordem manual recomendada
Se preferir subir manualmente, use sempre esta ordem em terminais separados:

```bash
npm run server:restart
npm run dev
npm run console:dev
```

### Troubleshooting de portas
- O app principal usa a porta fixa `5176` com `strictPort: true`.
- Se `5176` estiver ocupada, o app falha ao iniciar em vez de “roubar” a `5177`.
- A Console usa `5177`.
- Se aparecer `ERR_CONNECTION_REFUSED`, confirme se os três processos estão ativos.

## Banco DEV persistente (localStorage)
O ambiente de desenvolvimento usa um banco local persistente no navegador, separado por chave.

### Configuração (.env.development)
Crie um arquivo `.env.development` com:
```
VITE_DB_STORAGE_KEY=appgestaoodonto.dev.db
VITE_DATABASE_URL=localstorage://appgestaoodonto.dev.db
VITE_DB_RESET_TOKEN=dev-reset
VITE_DB_SEED_TOKEN=dev-seed
VITE_DB_MIGRATE_TOKEN=dev-migrate
VITE_DEV_SERVER_URL=http://localhost:5173
```

### Comandos DEV
```bash
npm run start:dev
npm run db:migrate:dev
npm run db:seed:dev
npm run db:reset:dev
```

### Observações
- O banco DEV **não é apagado automaticamente** ao iniciar o app.
- Reset é manual via `db:reset:dev`.
- Migrations são aplicadas automaticamente ao carregar o app (e podem ser disparadas manualmente via `db:migrate:dev`).
- `VITE_DATABASE_URL` é opcional e sobrescreve `VITE_DB_STORAGE_KEY` quando usa `localstorage://`.

## Build e preview
```bash
npm run build
npm run preview
```

## Lint e testes
```bash
npm run lint
npm run test
```

## Credenciais padrão (desenvolvimento)
No primeiro acesso, quando não existem credenciais no banco, o sistema cria automaticamente:

- **E-mail:** `admin@loveodonto.com`
- **Senha:** `admin123`

## Observações
- Persistência local via `localStorage`.
- Primeiro acesso cria o usuário `Administrador`.
