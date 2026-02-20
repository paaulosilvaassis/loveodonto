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
